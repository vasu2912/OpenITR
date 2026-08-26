import type {
	DocumentReviewIssue,
	EpayTaxReceiptSourceRecord,
	ExactMoney,
	ObservationTransformationStep,
	Sha256Digest,
	TaxPaymentObservation,
} from "@openitr/model";

import type { AdapterIdentity } from "../extraction-support";
import { compareByCodepoint } from "../extraction-support";
import type { GroupedRupeeAmount } from "../grouped-rupee-amount";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import type { PdfLineGeometry } from "../pdf/pdf-text-layer";
import {
	EPAY_FIELD_SEPARATOR,
	EPAY_PAYMENT_DATE_PATTERN,
	EPAY_PAN_PATTERN,
	EPAY_BSR_CODE_PATTERN,
	EPAY_CHALLAN_SERIAL_PATTERN,
	EPAY_STATUS_PAID,
	EPAY_SUPPORTED_ASSESSMENT_YEAR,
	epayRecordAmbiguousIssue,
	epayRecordMalformedIssue,
	epayStatusNotPaidIssue,
	epayTypeOfPaymentByPrintedValue,
	epayTypeOfPaymentUnknownIssue,
	isCalendarDay,
	isWellFormedTypeOfPayment,
} from "./receipt-layout";
import type { EpayTypeOfPaymentCategory } from "./receipt-layout";

type PageLine = PdfLineGeometry & { readonly page: number };

type ParsedFieldLine = Readonly<{
	label: string;
	value: string;
	line: PageLine;
}>;

// One reviewed field's parse state across every occurrence in the receipt.
// A field either appears with identical valid values (the first line travels
// in `first` and its parse in `parsed`), never appears, carries an invalid
// value, or carries conflicting valid values. Parsing happens exactly once
// per occurrence, here.
type FieldOutcome<T> =
	| Readonly<{
			kind: "ok";
			first: ParsedFieldLine;
			parsed: T;
	  }>
	| Readonly<{ kind: "missing" }>
	| Readonly<{ kind: "malformed"; occurrences: readonly ParsedFieldLine[] }>
	| Readonly<{ kind: "conflicting"; occurrences: readonly ParsedFieldLine[] }>;

const normalizeLabel = (label: string): string =>
	label.replace(/\s+/g, " ").trim();

const parseFieldLines = (
	lines: readonly PageLine[],
): readonly ParsedFieldLine[] => {
	const parsed: ParsedFieldLine[] = [];
	for (const line of lines) {
		const separatorIndex = line.text.indexOf(EPAY_FIELD_SEPARATOR);
		if (separatorIndex < 0) {
			continue;
		}
		parsed.push({
			label: normalizeLabel(line.text.slice(0, separatorIndex)),
			value: line.text
				.slice(separatorIndex + EPAY_FIELD_SEPARATOR.length)
				.trim(),
			line,
		});
	}
	return parsed;
};

// Groups parsed lines by their normalized label in one pass, so each
// reviewed field reads its occurrences straight from the index instead of
// rescanning the whole receipt.
const indexFieldLinesByLabel = (
	fields: readonly ParsedFieldLine[],
): ReadonlyMap<string, readonly ParsedFieldLine[]> => {
	const index = new Map<string, ParsedFieldLine[]>();
	for (const field of fields) {
		const group = index.get(field.label);
		if (group === undefined) {
			index.set(field.label, [field]);
			continue;
		}
		group.push(field);
	}
	return index;
};

// "ok" needs at least one occurrence whose values are all valid and
// verbatim-identical; repeated identical prints fold into one evidence set.
const outcomeForOccurrences = <T>(
	occurrences: readonly ParsedFieldLine[],
	parse: (value: string) => T | undefined,
): FieldOutcome<T> => {
	const [first] = occurrences;
	if (first === undefined) {
		return { kind: "missing" };
	}
	const parsedValues = occurrences.map((occurrence) =>
		parse(occurrence.value),
	);
	const [firstParsed] = parsedValues;
	if (
		firstParsed === undefined ||
		parsedValues.some((parsed) => parsed === undefined)
	) {
		return { kind: "malformed", occurrences };
	}
	if (!occurrences.every((occurrence) => occurrence.value === first.value)) {
		return { kind: "conflicting", occurrences };
	}
	return { kind: "ok", first, parsed: firstParsed };
};

const isAssessmentYear = (value: string): boolean => {
	const match = /^([0-9]{4})-([0-9]{2})$/.exec(value);
	if (match === null) {
		return false;
	}
	const startYear = Number(match[1]);
	const endYear = Number(match[2]);
	return (
		(startYear + 1) % 100 === endYear &&
		value === EPAY_SUPPORTED_ASSESSMENT_YEAR
	);
};

const isPaymentDate = (value: string): boolean => {
	const match = EPAY_PAYMENT_DATE_PATTERN.exec(value);
	if (match === null) {
		return false;
	}
	return isCalendarDay({
		day: Number(match[1]),
		month: Number(match[2]),
		year: Number(match[3]),
	});
};

const AMOUNT_PREFIX_PATTERN = /^Rs\s+/i;

type ParsedAmount = Readonly<{
	raw: string;
	amount: GroupedRupeeAmount;
	steps: readonly ObservationTransformationStep[];
}>;

// The receipt prints its amount as "Rs 45,670.00", so the currency prefix
// leaves an explicit transformation step instead of vanishing between steps.
const parseTotalTaxPaidValue = (value: string): ParsedAmount | undefined => {
	const trimmed = value.replace(/\s+/g, " ").trim();
	if (!AMOUNT_PREFIX_PATTERN.test(trimmed)) {
		return undefined;
	}
	const withoutPrefix = trimmed.replace(AMOUNT_PREFIX_PATTERN, "");
	const grouped = parseGroupedRupeeAmount(withoutPrefix);
	if (grouped === undefined) {
		return undefined;
	}
	return {
		raw: value,
		amount: grouped,
		steps: [
			{
				order: 1,
				operation: "trim-whitespace",
				input: value,
				output: trimmed,
			},
			{
				order: 2,
				operation: "strip-currency-prefix",
				input: trimmed,
				output: withoutPrefix,
			},
			{
				order: 3,
				operation: "remove-indian-digit-grouping",
				input: withoutPrefix,
				output: withoutPrefix.replace(/,/g, ""),
			},
			{
				order: 4,
				operation: "parse-exact-rupees",
				input: withoutPrefix.replace(/,/g, ""),
				output: String(grouped.value),
			},
		],
	};
};

type ReceiptFields = Readonly<{
	status: FieldOutcome<string>;
	assessmentYear: FieldOutcome<string>;
	taxpayerName: FieldOutcome<string>;
	taxpayerPan: FieldOutcome<string>;
	bsrCode: FieldOutcome<string>;
	paymentDate: FieldOutcome<string>;
	challanSerialNumber: FieldOutcome<string>;
	typeOfPayment: FieldOutcome<string>;
	bankReferenceNumber: FieldOutcome<string>;
	totalTaxPaid: FieldOutcome<ParsedAmount>;
}>;

const nonEmptyValue = (value: string): string | undefined =>
	value.trim() === "" ? undefined : value;

const matchingValue = (
	pattern: RegExp,
): ((value: string) => string | undefined) =>
	(value) => (pattern.test(value) ? value : undefined);

const buildReceiptFields = (
	fieldsByLabel: ReadonlyMap<string, readonly ParsedFieldLine[]>,
): ReceiptFields => {
	const occurrencesOf = (label: string): readonly ParsedFieldLine[] =>
		fieldsByLabel.get(label) ?? [];
	return {
		status: outcomeForOccurrences(occurrencesOf("Status of Payment"), nonEmptyValue),
		assessmentYear: outcomeForOccurrences(
			occurrencesOf("Assessment Year"),
			(value) => (isAssessmentYear(value) ? value : undefined),
		),
		taxpayerName: outcomeForOccurrences(
			occurrencesOf("Name of Taxpayer"),
			nonEmptyValue,
		),
		taxpayerPan: outcomeForOccurrences(
			occurrencesOf("Permanent Account Number (PAN)"),
			matchingValue(EPAY_PAN_PATTERN),
		),
		bsrCode: outcomeForOccurrences(
			occurrencesOf("BSR Code"),
			matchingValue(EPAY_BSR_CODE_PATTERN),
		),
		paymentDate: outcomeForOccurrences(occurrencesOf("Date of Receipt (CIN)"), (value) =>
			isPaymentDate(value) ? value : undefined,
		),
		challanSerialNumber: outcomeForOccurrences(
			occurrencesOf("Challan Serial Number"),
			matchingValue(EPAY_CHALLAN_SERIAL_PATTERN),
		),
		typeOfPayment: outcomeForOccurrences(
			occurrencesOf("Type of Payment"),
			(value) => (isWellFormedTypeOfPayment(value) ? value : undefined),
		),
		bankReferenceNumber: outcomeForOccurrences(
			occurrencesOf("Bank Reference Number"),
			nonEmptyValue,
		),
		totalTaxPaid: outcomeForOccurrences(
			occurrencesOf("Total Tax Paid"),
			parseTotalTaxPaidValue,
		),
	};
};

const RECEIPT_FIELDS: readonly (keyof ReceiptFields)[] = [
	"status",
	"assessmentYear",
	"taxpayerName",
	"taxpayerPan",
	"bsrCode",
	"paymentDate",
	"challanSerialNumber",
	"typeOfPayment",
	"bankReferenceNumber",
	"totalTaxPaid",
];

const issueOrderKey = (issue: DocumentReviewIssue): string =>
	[
		issue.code,
		issue.affectedFactKeys.join("\u0000"),
		issue.recoveryAction,
	].join("\u0001");

export type EpayReceiptExtraction = Readonly<{
	taxPaymentObservations: readonly TaxPaymentObservation[];
	issues: readonly DocumentReviewIssue[];
}>;

export const extractEpayTaxPayment = ({
	pages,
	sourceDocumentId,
	adapter,
}: Readonly<{
	pages: readonly (readonly PdfLineGeometry[])[];
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): EpayReceiptExtraction => {
	const linesWithPages: PageLine[] = pages.flatMap((lines, pageIndex) =>
		lines.map((line) => ({ ...line, page: pageIndex + 1 })),
	);

	const fields = buildReceiptFields(
		indexFieldLinesByLabel(parseFieldLines(linesWithPages)),
	);

	// The adapter's revision gate guarantees the assessment-year line is
	// present, so at least one reviewed label always exists here; a page
	// without any is a changed template and never reaches extraction.

	// One receipt carries one payment, so every broken field coalesces into
	// a single receipt-level issue instead of one alert per field. Any
	// malformed or ambiguous receipt creates the review issue and no
	// payment: a disputed challan must never move taxes paid.
	const hasMalformedField = RECEIPT_FIELDS.some((key) => {
		const outcome = fields[key];
		return outcome.kind === "missing" || outcome.kind === "malformed";
	});
	const hasConflictingField = RECEIPT_FIELDS.some(
		(key) => fields[key].kind === "conflicting",
	);
	if (hasMalformedField || hasConflictingField) {
		const issues: DocumentReviewIssue[] = [];
		if (hasMalformedField) {
			issues.push(epayRecordMalformedIssue());
		}
		if (hasConflictingField) {
			issues.push(epayRecordAmbiguousIssue());
		}
		return {
			taxPaymentObservations: [],
			issues: issues
				.map((issue) => ({ issue, key: issueOrderKey(issue) }))
				.sort((first, second) => compareByCodepoint(first.key, second.key))
				.map((entry) => entry.issue),
		};
	}

	// Every field is "ok" past the gate above, so this lookup is total; the
	// default arm only keeps the compiler convinced.
	const okFieldOf = <T>(outcome: FieldOutcome<T>) => {
		switch (outcome.kind) {
			case "ok":
				return outcome;
			case "missing":
			case "malformed":
			case "conflicting":
				throw new Error(
					"e-Pay Tax receipt field left unresolved after validation",
				);
			default: {
				const _exhaustive: never = outcome;
				return _exhaustive;
			}
		}
	};

	// A receipt whose status prints anything but Paid documents a
	// transaction that never completed; it keeps its own diagnosis instead
	// of sharing the torn-page wording, and never becomes a payment.
	if (okFieldOf(fields.status).parsed !== EPAY_STATUS_PAID) {
		return {
			taxPaymentObservations: [],
			issues: [epayStatusNotPaidIssue()],
		};
	}

	const printedTypeOfPayment = okFieldOf(fields.typeOfPayment).parsed;
	const category:
		| EpayTypeOfPaymentCategory
		| undefined = epayTypeOfPaymentByPrintedValue(printedTypeOfPayment);
	if (category === undefined) {
		return {
			taxPaymentObservations: [],
			issues: [epayTypeOfPaymentUnknownIssue()],
		};
	}

	// The amount's parse traveled through the field outcome, so no
	// construction-time re-parse or invariant throw remains.
	const amount = okFieldOf(fields.totalTaxPaid);

	const record: EpayTaxReceiptSourceRecord = {
		medium: "pdf",
		page: amount.first.line.page,
		taxpayerName: okFieldOf(fields.taxpayerName).parsed,
		taxpayerPan: okFieldOf(fields.taxpayerPan).parsed,
		assessmentYear: okFieldOf(fields.assessmentYear).parsed,
		bsrCode: okFieldOf(fields.bsrCode).parsed,
		challanSerialNumber: okFieldOf(fields.challanSerialNumber).parsed,
		paymentDateDayMonthYear: okFieldOf(fields.paymentDate).parsed,
		typeOfPaymentCode: category.code,
		typeOfPaymentLabel: printedTypeOfPayment,
		bankReferenceNumber: okFieldOf(fields.bankReferenceNumber).parsed,
		totalAmountRaw: amount.parsed.raw,
	};

	const observation: TaxPaymentObservation = {
		observationId: `${category.factKey}@${sourceDocumentId}:cin-${record.bsrCode}-${record.challanSerialNumber}`,
		factKey: category.factKey,
		sourceDocumentId,
		adapterId: adapter.adapterId,
		adapterVersion: adapter.adapterVersion,
		originalValue: amount.parsed.raw,
		normalizedValue: amount.parsed.amount.value satisfies ExactMoney,
		transformationSteps: amount.parsed.steps,
		evidence: {
			kind: "pdf-page-region",
			page: amount.first.line.page,
			x: amount.first.line.x,
			y: amount.first.line.y,
			width: amount.first.line.width,
			height: amount.first.line.height,
		},
		ruleCitation: {
			ruleId: category.ruleId,
			description: category.description,
		},
		record,
	};

	return {
		taxPaymentObservations: [observation],
		issues: [],
	};
};
