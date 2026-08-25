import type {
	DocumentReviewIssue,
	NonSalaryIncomeObservation,
	PdfTdsSourceRecord,
	Sha256Digest,
	TdsObservation,
} from "@openitr/model";

import type { AdapterIdentity } from "../extraction-support";
import { compareByCodepoint } from "../extraction-support";
import type { GroupedRupeeAmount } from "../grouped-rupee-amount";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import type { PdfLineGeometry } from "../pdf/pdf-text-layer";
import {
	FORM16A_AGGREGATE_ROW_LABEL,
	FORM16A_AMOUNT_COLUMNS,
	FORM16A_COLUMN_HEADER_CELLS,
	FORM16A_DEDUCTOR_NAME_PREFIX,
	FORM16A_DEDUCTOR_TAN_PREFIX,
	FORM16A_ROW_CELL_SEPARATOR,
	FORM16A_SERIAL_NUMBER_PATTERN,
	FORM16A_SUMMARY_SECTION_TITLE,
	FORM16A_TAN_PATTERN,
	form16aCategoryUnknownIssue,
	form16aColumnHeaderMalformedIssue,
	form16aRecordAmbiguousIssue,
	form16aRecordMalformedIssue,
	form16aSectionMissingIssue,
	form16APaymentCategoryByCells,
} from "./payment-summary";
import type { Form16APaymentCategoryDefinition } from "./payment-summary";

type ParsedAmountCell =
	| Readonly<{ kind: "unknown"; raw: string }>
	| Readonly<{ kind: "value"; raw: string; amount: GroupedRupeeAmount }>
	| Readonly<{ kind: "malformed" }>;

// A cell as it appears on a successfully parsed record: every printed value
// parsed or stayed explicitly blank. A malformed amount never becomes a
// record at all, so this shape carries no malformed variant.
type ReviewedAmountCell = Exclude<ParsedAmountCell, { kind: "malformed" }>;

// A blank cell prints as an empty or whitespace-only string and stays
// unknown; only a printed non-blank value parses.
const parseAmountCell = (cell: string): ParsedAmountCell => {
	if (cell.trim() === "") {
		return { kind: "unknown", raw: cell };
	}
	const amount = parseGroupedRupeeAmount(cell);
	if (amount === undefined) {
		return { kind: "malformed" };
	}
	return { kind: "value", raw: cell, amount };
};

type PageLine = PdfLineGeometry & { readonly page: number };

type ParsedSummaryRecord = Readonly<{
	line: PageLine;
	categoryDefinition: Form16APaymentCategoryDefinition | undefined;
	serialNumber: string;
	section: string;
	natureOfPayment: string;
	grossCell: ReviewedAmountCell;
	taxDeductedCell: ReviewedAmountCell;
	tdsDepositedCell: ReviewedAmountCell;
}>;

type RecordParseOutcome =
	| Readonly<{ kind: "parsed"; record: ParsedSummaryRecord }>
	| Readonly<{ kind: "malformed" }>;

const splitRowCells = (rowText: string): string[] =>
	rowText.split(FORM16A_ROW_CELL_SEPARATOR).map((cell) => cell.trim());

const parseSummaryRow = (line: PageLine): RecordParseOutcome => {
	const cells = splitRowCells(line.text);
	if (cells.length !== FORM16A_COLUMN_HEADER_CELLS.length) {
		return { kind: "malformed" };
	}
	const serialNumber = cells[0] ?? "";
	const section = cells[1] ?? "";
	const natureOfPayment = cells[2] ?? "";
	if (
		!FORM16A_SERIAL_NUMBER_PATTERN.test(serialNumber) ||
		section === "" ||
		natureOfPayment === ""
	) {
		return { kind: "malformed" };
	}
	const grossCell = parseAmountCell(cells[3] ?? "");
	const taxDeductedCell = parseAmountCell(cells[4] ?? "");
	const tdsDepositedCell = parseAmountCell(cells[5] ?? "");
	if (
		grossCell.kind === "malformed" ||
		taxDeductedCell.kind === "malformed" ||
		tdsDepositedCell.kind === "malformed"
	) {
		return { kind: "malformed" };
	}
	return {
		kind: "parsed",
		record: {
			line,
			categoryDefinition: form16APaymentCategoryByCells(
				section,
				natureOfPayment,
			),
			serialNumber,
			section,
			natureOfPayment,
			grossCell,
			taxDeductedCell,
			tdsDepositedCell,
		},
	};
};

// Two records with the same printed serial are equivalent only when every
// reviewed cell carries the identical verbatim value; anything else is a
// conflict between repeats rather than evidence to count twice.
const recordsEquivalent = (
	first: ParsedSummaryRecord,
	second: ParsedSummaryRecord,
): boolean =>
	first.section === second.section &&
	first.natureOfPayment === second.natureOfPayment &&
	first.grossCell.raw === second.grossCell.raw &&
	first.taxDeductedCell.raw === second.taxDeductedCell.raw &&
	first.tdsDepositedCell.raw === second.tdsDepositedCell.raw;

// A conflicting serial drops every occurrence and disputes both the
// record's income fact, when its category is reviewed, and its tax-paid
// facts.
const ambiguousFactKeysOf = (
	record: ParsedSummaryRecord,
): DocumentReviewIssue["affectedFactKeys"] => [
	...(record.categoryDefinition !== undefined
		? [record.categoryDefinition.factKey]
		: []),
	FORM16A_AMOUNT_COLUMNS.taxDeducted.factKey,
	FORM16A_AMOUNT_COLUMNS.deposited.factKey,
];

const issueOrderKey = (issue: DocumentReviewIssue): string =>
	[
		issue.code,
		issue.affectedFactKeys.join("\u0000"),
		issue.recoveryAction,
	].join("\u0001");

export type Form16APaymentSummaryExtraction = Readonly<{
	incomeObservations: readonly NonSalaryIncomeObservation[];
	tdsObservations: readonly TdsObservation[];
	issues: readonly DocumentReviewIssue[];
}>;

export const extractForm16APaymentSummary = ({
	pages,
	sourceDocumentId,
	adapter,
}: Readonly<{
	pages: readonly (readonly PdfLineGeometry[])[];
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): Form16APaymentSummaryExtraction => {
	const linesWithPages: PageLine[] = pages.flatMap((lines, pageIndex) =>
		lines.map((line) => ({ ...line, page: pageIndex + 1 })),
	);

	const sectionStartIndex = linesWithPages.findIndex(
		(line) => line.text.trim() === FORM16A_SUMMARY_SECTION_TITLE,
	);
	if (sectionStartIndex < 0) {
		return {
			incomeObservations: [],
			tdsObservations: [],
			issues: [form16aSectionMissingIssue()],
		};
	}

	let columnHeaderIndex = -1;
	for (
		let index = sectionStartIndex + 1;
		index < linesWithPages.length;
		index += 1
	) {
		const candidate = linesWithPages[index];
		if (candidate === undefined || candidate.text.trim() === "") {
			continue;
		}
		columnHeaderIndex = index;
		break;
	}
	const headerCells =
		linesWithPages[columnHeaderIndex] === undefined
			? []
			: splitRowCells(linesWithPages[columnHeaderIndex]?.text ?? "");
	const columnHeaderMatches =
		columnHeaderIndex >= 0 &&
		headerCells.length === FORM16A_COLUMN_HEADER_CELLS.length &&
		FORM16A_COLUMN_HEADER_CELLS.every(
			(expected, columnIndex) => headerCells[columnIndex] === expected,
		);
	if (!columnHeaderMatches) {
		return {
			incomeObservations: [],
			tdsObservations: [],
			issues: [form16aColumnHeaderMalformedIssue()],
		};
	}

	const deductorNameLine = linesWithPages.find((line) =>
		line.text.startsWith(FORM16A_DEDUCTOR_NAME_PREFIX),
	);
	const deductorTanLine = linesWithPages.find((line) =>
		line.text.startsWith(FORM16A_DEDUCTOR_TAN_PREFIX),
	);
	const deductorName = deductorNameLine
		?.text.slice(FORM16A_DEDUCTOR_NAME_PREFIX.length)
		.replace(/\s+/g, " ")
		.trim();
	const deductorTan = deductorTanLine
		?.text.slice(FORM16A_DEDUCTOR_TAN_PREFIX.length)
		.replace(/\s+/g, " ")
		.trim();
	if (
		deductorName === undefined ||
		deductorName === "" ||
		deductorTan === undefined ||
		!FORM16A_TAN_PATTERN.test(deductorTan)
	) {
		return {
			incomeObservations: [],
			tdsObservations: [],
			issues: [form16aRecordMalformedIssue()],
		};
	}

	const issues: DocumentReviewIssue[] = [];
	const parsedRecords: ParsedSummaryRecord[] = [];
	for (let index = columnHeaderIndex + 1; index < linesWithPages.length; index += 1) {
		const line = linesWithPages[index];
		if (line === undefined || line.text.trim() === "") {
			continue;
		}
		const separatorIndex = line.text.indexOf(FORM16A_ROW_CELL_SEPARATOR);
		const firstCell =
			separatorIndex < 0 ? line.text : line.text.slice(0, separatorIndex);
		if (firstCell.trim() === FORM16A_AGGREGATE_ROW_LABEL) {
			break;
		}
		const outcome = parseSummaryRow(line);
		if (outcome.kind === "malformed") {
			issues.push(form16aRecordMalformedIssue());
			continue;
		}
		if (outcome.record.categoryDefinition === undefined) {
			issues.push(form16aCategoryUnknownIssue());
		}
		parsedRecords.push(outcome.record);
	}

	// Duplicate printed serial numbers collapse when every reviewed cell is
	// identical (the certificate reprinted a row); conflicting repeats are
	// ambiguous and drop every occurrence instead of picking one silently.
	type FoldState = Readonly<{
		kept: ParsedSummaryRecord | undefined;
		conflicted: boolean;
	}>;
	const foldBySerial = new Map<string, FoldState>();
	for (const record of parsedRecords) {
		const existing = foldBySerial.get(record.serialNumber);
		if (existing === undefined) {
			foldBySerial.set(record.serialNumber, {
				kept: record,
				conflicted: false,
			});
			continue;
		}
		if (
			existing.conflicted ||
			existing.kept === undefined ||
			!recordsEquivalent(existing.kept, record)
		) {
			foldBySerial.set(record.serialNumber, {
				kept: existing.kept,
				conflicted: true,
			});
		}
	}
	for (const state of foldBySerial.values()) {
		if (state.conflicted && state.kept !== undefined) {
			issues.push(form16aRecordAmbiguousIssue(ambiguousFactKeysOf(state.kept)));
		}
	}
	const survivingRecords = parsedRecords.filter((record) => {
		const state = foldBySerial.get(record.serialNumber);
		return state?.conflicted !== true && state?.kept === record;
	});

	const pdfEvidenceOf = (record: ParsedSummaryRecord) => ({
		kind: "pdf-page-region",
		page: record.line.page,
		x: record.line.x,
		y: record.line.y,
		width: record.line.width,
		height: record.line.height,
	} as const);

	const incomeObservations: NonSalaryIncomeObservation[] = [];
	const tdsObservations: TdsObservation[] = [];
	survivingRecords.forEach((record, recordIndex) => {
		const rowNumber = recordIndex + 1;
		const locatorKey = `${record.line.page}:${rowNumber}`;
		if (
			record.categoryDefinition !== undefined &&
			record.grossCell.kind === "value"
		) {
			incomeObservations.push({
				observationId: `${record.categoryDefinition.factKey}@${sourceDocumentId}:${locatorKey}`,
				factKey: record.categoryDefinition.factKey,
				sourceDocumentId,
				adapterId: adapter.adapterId,
				adapterVersion: adapter.adapterVersion,
				originalText: record.line.text,
				normalizedValue: record.grossCell.amount.value,
				transformationSteps: record.grossCell.amount.steps,
				evidence: pdfEvidenceOf(record),
				ruleCitation: {
					ruleId: record.categoryDefinition.ruleId,
					description: record.categoryDefinition.description,
				},
			});
		}
		const facts: PdfTdsSourceRecord = {
			medium: "pdf",
			page: record.line.page,
			rowNumber,
			serialNumber: record.serialNumber,
			deductorName,
			deductorTan,
			amountPaidCreditedRaw: record.grossCell.raw,
			taxDeductedRaw: record.taxDeductedCell.raw,
			tdsDepositedRaw: record.tdsDepositedCell.raw,
		};
		const tdsCells = [
			{
				definition: FORM16A_AMOUNT_COLUMNS.taxDeducted,
				cell: record.taxDeductedCell,
			},
			{
				definition: FORM16A_AMOUNT_COLUMNS.deposited,
				cell: record.tdsDepositedCell,
			},
		];
		for (const { definition, cell } of tdsCells) {
			if (cell.kind !== "value") {
				continue;
			}
			tdsObservations.push({
				observationId: `${definition.factKey}@${sourceDocumentId}:${locatorKey}`,
				factKey: definition.factKey,
				sourceDocumentId,
				adapterId: adapter.adapterId,
				adapterVersion: adapter.adapterVersion,
				originalValue: cell.raw,
				normalizedValue: cell.amount.value,
				transformationSteps: cell.amount.steps,
				evidence: pdfEvidenceOf(record),
				ruleCitation: {
					ruleId: definition.ruleId,
					description: definition.description,
				},
				record: facts,
			});
		}
	});

	// Surviving records leave in printed-row order, so both observation lists
	// inherit the certificate's own sequence; income additionally orders by
	// canonical fact key so equivalent certificates agree on canonical order.
	incomeObservations.sort((first, second) =>
		compareByCodepoint(first.factKey, second.factKey),
	);

	return {
		incomeObservations,
		tdsObservations,
		issues: issues
			.map((issue) => ({ issue, key: issueOrderKey(issue) }))
			.sort((first, second) => compareByCodepoint(first.key, second.key))
			.map((entry) => entry.issue),
	};
};
