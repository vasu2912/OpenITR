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
	epaySectionMissingIssue,
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
// A field either appears with identical valid values (folded), never
// appears, carries an invalid value, or carries conflicting valid values.
type FieldOutcome =
	| Readonly<{ kind: "ok"; occurrences: readonly ParsedFieldLine[] }>
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

// "ok" needs at least one occurrence whose values are all valid and
// verbatim-identical; repeated identical prints fold into one evidence set.
const outcomeForOccurrences = (
	occurrences: readonly ParsedFieldLine[],
	isValid: (value: string) => boolean,
): FieldOutcome => {
	if (occurrences.length === 0) {
		return { kind: "missing" };
	}
	if (!occurrences.every((occurrence) => isValid(occurrence.value))) {
		return { kind: "malformed", occurrences };
	}
	const [first] = occurrences;
	if (
		first !== undefined &&
		!occurrences.every((occurrence) => occurrence.value === first.value)
	) {
		return { kind: "conflicting", occurrences };
	}
	return { kind: "ok", occurrences };
};

const isAssessmentYear = (value: string): boolean =>
	/^([0-9]{4})-([0-9]{2})$/.test(value) &&
	(() => {
		const match = /^([0-9]{4})-([0-9]{2})$/.exec(value);
		const startYear = Number(match?.[1]);
		const endYear = Number(match?.[2]);
		return (startYear + 1) % 100 === endYear;
	})() &&
	value === EPAY_SUPPORTED_ASSESSMENT_YEAR;

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
	status: FieldOutcome;
	assessmentYear: FieldOutcome;
	taxpayerName: FieldOutcome;
	taxpayerPan: FieldOutcome;
	bsrCode: FieldOutcome;
	paymentDate: FieldOutcome;
	challanSerialNumber: FieldOutcome;
	typeOfPayment: FieldOutcome;
	bankReferenceNumber: FieldOutcome;
	totalTaxPaid: FieldOutcome;
}>;

const buildReceiptFields = (
	fields: readonly ParsedFieldLine[],
): ReceiptFields => {
	const occurrencesOf = (label: string): readonly ParsedFieldLine[] =>
		fields.filter((field) => field.label === label);
	return {
		status: outcomeForOccurrences(occurrencesOf("Status of Payment"), (value) =>
			value === EPAY_STATUS_PAID,
		),
		assessmentYear: outcomeForOccurrences(
			occurrencesOf("Assessment Year"),
			isAssessmentYear,
		),
		taxpayerName: outcomeForOccurrences(
			occurrencesOf("Name of Taxpayer"),
			(value) => value.trim() !== "",
		),
		taxpayerPan: outcomeForOccurrences(
			occurrencesOf("Permanent Account Number (PAN)"),
			(value) => EPAY_PAN_PATTERN.test(value),
		),
		bsrCode: outcomeForOccurrences(
			occurrencesOf("BSR Code"),
			(value) => EPAY_BSR_CODE_PATTERN.test(value),
		),
		paymentDate: outcomeForOccurrences(
			occurrencesOf("Date of Receipt (CIN)"),
			isPaymentDate,
		),
		challanSerialNumber: outcomeForOccurrences(
			occurrencesOf("Challan Serial Number"),
			(value) => EPAY_CHALLAN_SERIAL_PATTERN.test(value),
		),
		typeOfPayment: outcomeForOccurrences(
			occurrencesOf("Type of Payment"),
			isWellFormedTypeOfPayment,
		),
		bankReferenceNumber: outcomeForOccurrences(
			occurrencesOf("Bank Reference Number"),
			(value) => value.trim() !== "",
		),
		totalTaxPaid: outcomeForOccurrences(
			occurrencesOf("Total Tax Paid"),
			(value) => parseTotalTaxPaidValue(value) !== undefined,
		),
	};
};

const RECEIPT_FIELDS: readonly {
	key: keyof ReceiptFields;
}[] = [
	{ key: "status" },
	{ key: "assessmentYear" },
	{ key: "taxpayerName" },
	{ key: "taxpayerPan" },
	{ key: "bsrCode" },
	{ key: "paymentDate" },
	{ key: "challanSerialNumber" },
	{ key: "typeOfPayment" },
	{ key: "bankReferenceNumber" },
	{ key: "totalTaxPaid" },
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

	const fields = buildReceiptFields(parseFieldLines(linesWithPages));

	// A receipt page that prints none of the reviewed challan labels has no
	// payment details section to extract; naming that separately keeps the
	// recovery action pointing at the right fix.
	const anyOccurrence = RECEIPT_FIELDS.some(
		({ key }) => fields[key].kind !== "missing",
	);
	if (!anyOccurrence) {
		return {
			taxPaymentObservations: [],
			issues: [epaySectionMissingIssue()],
		};
	}

	// One receipt carries one payment, so every broken field coalesces into
	// a single receipt-level issue instead of one alert per field. Any
	// malformed or ambiguous receipt creates the review issue and no
	// payment: a disputed challan must never move taxes paid.
	const hasMalformedField = RECEIPT_FIELDS.some(({ key }) => {
		const outcome = fields[key];
		return outcome.kind === "missing" || outcome.kind === "malformed";
	});
	const hasConflictingField = RECEIPT_FIELDS.some(
		({ key }) => fields[key].kind === "conflicting",
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

	const printedTypeOfPayment =
		fields.typeOfPayment.kind === "ok"
			? (fields.typeOfPayment.occurrences[0]?.value ?? "")
			: "";
	const category:
		| EpayTypeOfPaymentCategory
		| undefined = epayTypeOfPaymentByPrintedValue(printedTypeOfPayment);
	if (category === undefined) {
		return {
			taxPaymentObservations: [],
			issues: [epayTypeOfPaymentUnknownIssue()],
		};
	}

	const firstValueOf = (key: keyof ReceiptFields): ParsedFieldLine | undefined =>
		fields[key].kind === "ok"
			? fields[key].occurrences[0]
			: undefined;
	const bsrLine = firstValueOf("bsrCode");
	const serialLine = firstValueOf("challanSerialNumber");
	const dateLine = firstValueOf("paymentDate");
	const amountLine = firstValueOf("totalTaxPaid");
	if (
		bsrLine === undefined ||
		serialLine === undefined ||
		dateLine === undefined ||
		amountLine === undefined
	) {
		throw new Error(
			"e-Pay Tax receipt fields vanished between validation and observation construction",
		);
	}
	const parsedAmount = parseTotalTaxPaidValue(amountLine.value);
	if (parsedAmount === undefined) {
		throw new Error(
			"e-Pay Tax receipt amount failed to parse after validation",
		);
	}

	const record: EpayTaxReceiptSourceRecord = {
		medium: "pdf",
		page: amountLine.line.page,
		taxpayerName: firstValueOf("taxpayerName")?.value ?? "",
		taxpayerPan: firstValueOf("taxpayerPan")?.value ?? "",
		assessmentYear: firstValueOf("assessmentYear")?.value ?? "",
		bsrCode: bsrLine.value,
		challanSerialNumber: serialLine.value,
		paymentDateDayMonthYear: dateLine.value,
		typeOfPaymentCode: category.code,
		typeOfPaymentLabel: printedTypeOfPayment,
		bankReferenceNumber: firstValueOf("bankReferenceNumber")?.value ?? "",
		totalAmountRaw: parsedAmount.raw,
	};

	const observation: TaxPaymentObservation = {
		observationId: `${category.factKey}@${sourceDocumentId}:cin-${record.bsrCode}-${record.challanSerialNumber}`,
		factKey: category.factKey,
		sourceDocumentId,
		adapterId: adapter.adapterId,
		adapterVersion: adapter.adapterVersion,
		originalValue: parsedAmount.raw,
		normalizedValue: parsedAmount.amount.value satisfies ExactMoney,
		transformationSteps: parsedAmount.steps,
		evidence: {
			kind: "pdf-page-region",
			page: amountLine.line.page,
			x: amountLine.line.x,
			y: amountLine.line.y,
			width: amountLine.line.width,
			height: amountLine.line.height,
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
