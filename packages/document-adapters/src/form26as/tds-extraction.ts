import type {
	DocumentReviewIssue,
	FactKey,
	Sha256Digest,
	TdsObservation,
	TdsSourceRecord,
} from "@openitr/model";
import {
	DOCUMENT_REVIEW_ISSUE_CODES,
	TDS_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION,
	TDS_RECORD_MALFORMED_RECOVERY_ACTION,
	TDS_SECTION_MISSING_RECOVERY_ACTION,
	parseFactKey,
	parseRuleId,
} from "@openitr/model";

import { compareByCodepoint } from "../extraction-support";
import type { AdapterIdentity } from "../extraction-support";
import type { GroupedRupeeAmount } from "../grouped-rupee-amount";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import type { Form26AsTextDocument } from "./form26as-text-revision";

const FORM26AS_PART_ONE_TITLE = "Part I - Tax Deducted at Source";

const FORM26AS_COLUMN_HEADER_CELLS = Object.freeze([
	"Sr. No.",
	"Name of Deductor",
	"TAN of Deductor",
	"Total Amount Paid/Credited",
	"Total Tax Deducted",
	"Total TDS Deposited",
]);

type AmountCellDefinition = Readonly<{
	columnIndex: number;
	factKey: FactKey;
	ruleId: ReturnType<typeof parseRuleId>;
	description: string;
}>;

// One definition per amount column of the reviewed Part I layout. This table
// is the single source of truth for every amount cell's position, canonical
// fact, and rule citation.
const AMOUNT_COLUMNS = {
	paidCredited: Object.freeze({
		columnIndex: 3,
		factKey: parseFactKey("tds.amount-paid-credited"),
		ruleId: parseRuleId("FORM26AS-TDS-AMOUNT-PAID-CREDITED"),
		description:
			"Form 26AS Part I record fact for the total amount paid or credited.",
	}),
	taxDeducted: Object.freeze({
		columnIndex: 4,
		factKey: parseFactKey("tds.tax-deducted"),
		ruleId: parseRuleId("FORM26AS-TDS-TAX-DEDUCTED"),
		description:
			"Form 26AS Part I record fact for the total tax deducted at source.",
	}),
	deposited: Object.freeze({
		columnIndex: 5,
		factKey: parseFactKey("tds.tds-deposited"),
		ruleId: parseRuleId("FORM26AS-TDS-DEPOSITED"),
		description:
			"Form 26AS Part I record fact for the total tax deposited with the government.",
	}),
} as const satisfies Readonly<Record<string, AmountCellDefinition>>;

const AMOUNT_CELL_DEFINITIONS: readonly AmountCellDefinition[] =
	Object.values(AMOUNT_COLUMNS);

// A malformed or rejected Part I record affects every tax-paid fact the
// reviewed layout can extract from it.
const affectedFactKeys = (): readonly FactKey[] =>
	AMOUNT_CELL_DEFINITIONS.map((definition) => definition.factKey);

const SERIAL_NUMBER_PATTERN = /^[0-9]+$/;
const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
// A strict part-title boundary such as "Part II - ..." or "Part-II(A)" ends
// the section. Loose prose that merely starts with "part" does not match and
// therefore fails closed as a malformed record instead of hiding records.
const NEXT_PART_PATTERN = /^part[\s-]*[ivx]+\b/i;
const AGGREGATE_ROW_LABEL = "Total";

const sectionMissingIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.tdsSectionMissing,
	severity: "review",
	affectedFactKeys: affectedFactKeys(),
	recoveryAction: TDS_SECTION_MISSING_RECOVERY_ACTION,
});

const columnHeaderMalformedIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.tdsColumnHeaderMalformed,
	severity: "review",
	affectedFactKeys: affectedFactKeys(),
	recoveryAction: TDS_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION,
});

const recordMalformedIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.tdsRecordMalformed,
	severity: "review",
	affectedFactKeys: affectedFactKeys(),
	recoveryAction: TDS_RECORD_MALFORMED_RECOVERY_ACTION,
});

type ParsedAmountCell =
	| Readonly<{ kind: "unknown"; raw: string | undefined }>
	| Readonly<{ kind: "value"; raw: string; amount: GroupedRupeeAmount }>
	| Readonly<{ kind: "malformed" }>;

// An unknown amount is either a cell the export never printed (undefined)
// or a printed blank cell. Both stay unknown; only a printed value parses.
const parseAmountCell = (cell: string | undefined): ParsedAmountCell => {
	if (cell === undefined || cell.trim() === "") {
		return { kind: "unknown", raw: cell };
	}
	const amount = parseGroupedRupeeAmount(cell);
	if (amount === undefined) {
		return { kind: "malformed" };
	}
	return { kind: "value", raw: cell, amount };
};

type ParsedTdsRecord = Readonly<{
	facts: TdsSourceRecord;
	amounts: ReadonlyMap<
		FactKey,
		Readonly<{ amount: GroupedRupeeAmount; originalValue: string }>
	>;
	firstLine: number;
	lastLine: number;
}>;

type RecordParseOutcome =
	| Readonly<{ kind: "parsed"; record: ParsedTdsRecord }>
	| Readonly<{ kind: "malformed" }>;

// One reviewed Part I record occupies one line with exactly six tab-separated
// cells. Identity cells must print; amount cells may stay blank and remain
// unknown. Every stored value keeps its verbatim printed text.
const parseTdsRecord = (
	line: string,
	lineNumber: number,
): RecordParseOutcome => {
	const cells = line.split("\t");
	if (cells.length !== FORM26AS_COLUMN_HEADER_CELLS.length) {
		return { kind: "malformed" };
	}
	const cellAt = (columnIndex: number): string | undefined =>
		cells.at(columnIndex);

	const serialNumber = cellAt(0)?.trim();
	const deductorName = cellAt(1)?.trim();
	const deductorTan = cellAt(2)?.trim();
	if (
		serialNumber === undefined ||
		serialNumber === "" ||
		!SERIAL_NUMBER_PATTERN.test(serialNumber) ||
		deductorName === undefined ||
		deductorName === "" ||
		deductorTan === undefined ||
		deductorTan === "" ||
		!TAN_PATTERN.test(deductorTan)
	) {
		return { kind: "malformed" };
	}

	const parsedAmounts = AMOUNT_CELL_DEFINITIONS.map((definition) => ({
		definition,
		outcome: parseAmountCell(cellAt(definition.columnIndex)),
	}));
	if (parsedAmounts.some(({ outcome }) => outcome.kind === "malformed")) {
		return { kind: "malformed" };
	}

	const amounts = new Map<
		FactKey,
		{ amount: GroupedRupeeAmount; originalValue: string }
	>();
	for (const { definition, outcome } of parsedAmounts) {
		if (outcome.kind === "value") {
			amounts.set(definition.factKey, {
				amount: outcome.amount,
				originalValue: outcome.raw,
			});
		}
	}

	const facts: TdsSourceRecord = {
		serialNumber,
		deductorName,
		deductorTan,
		firstLine: lineNumber,
		lastLine: lineNumber,
		amountPaidCreditedRaw: cellAt(AMOUNT_COLUMNS.paidCredited.columnIndex),
		taxDeductedRaw: cellAt(AMOUNT_COLUMNS.taxDeducted.columnIndex),
		tdsDepositedRaw: cellAt(AMOUNT_COLUMNS.deposited.columnIndex),
	};
	return {
		kind: "parsed",
		record: {
			facts,
			amounts,
			firstLine: lineNumber,
			lastLine: lineNumber,
		},
	};
};

export type TdsExtraction = Readonly<{
	observations: readonly TdsObservation[];
	issues: readonly DocumentReviewIssue[];
}>;

export const extractTdsObservations = ({
	document,
	sourceDocumentId,
	adapter,
}: Readonly<{
	document: Form26AsTextDocument;
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): TdsExtraction => {
	const sectionStart = document.lines.findIndex(
		(line) => line.trim() === FORM26AS_PART_ONE_TITLE,
	);
	if (sectionStart < 0) {
		return { observations: [], issues: [sectionMissingIssue()] };
	}

	let columnHeaderLine = -1;
	for (let index = sectionStart + 1; index < document.lines.length; index += 1) {
		const candidate = document.lines[index];
		if (candidate === undefined || candidate.trim() === "") {
			continue;
		}
		columnHeaderLine = index;
		break;
	}
	const headerCells = document.lines[columnHeaderLine]
		?.split("\t")
		.map((cell) => cell.trim());
	const columnHeaderMatches =
		headerCells !== undefined &&
		headerCells.length === FORM26AS_COLUMN_HEADER_CELLS.length &&
		FORM26AS_COLUMN_HEADER_CELLS.every(
			(expected, columnIndex) => headerCells[columnIndex] === expected,
		);
	if (columnHeaderLine < 0 || !columnHeaderMatches) {
		return { observations: [], issues: [columnHeaderMalformedIssue()] };
	}

	const issues: DocumentReviewIssue[] = [];
	const records: ParsedTdsRecord[] = [];
	for (
		let index = columnHeaderLine + 1;
		index < document.lines.length;
		index += 1
	) {
		const line = document.lines[index];
		if (line === undefined) {
			continue;
		}
		const trimmedLine = line.trim();
		if (trimmedLine === "") {
			continue;
		}
		if (NEXT_PART_PATTERN.test(trimmedLine)) {
			break;
		}
		const firstCellEnd = line.indexOf("\t");
		const firstCell =
			firstCellEnd < 0 ? line : line.slice(0, firstCellEnd);
		if (firstCell.trim() === AGGREGATE_ROW_LABEL) {
			continue;
		}
		const outcome = parseTdsRecord(line, index + 1);
		if (outcome.kind === "malformed") {
			issues.push(recordMalformedIssue());
			continue;
		}
		records.push(outcome.record);
	}

	const observations = records.flatMap((record) =>
		AMOUNT_CELL_DEFINITIONS.flatMap((definition) => {
			const parsed = record.amounts.get(definition.factKey);
			if (parsed === undefined) {
				return [];
			}
			return [
				{
					observationId: `${definition.factKey}@${sourceDocumentId}:${record.firstLine}-${record.lastLine}`,
					factKey: definition.factKey,
					sourceDocumentId,
					adapterId: adapter.adapterId,
					adapterVersion: adapter.adapterVersion,
					originalValue: parsed.originalValue,
					normalizedValue: parsed.amount.value,
					transformationSteps: parsed.amount.steps,
					evidence: {
						kind: "text-line-range",
						firstLine: record.firstLine,
						lastLine: record.lastLine,
					},
					ruleCitation: {
						ruleId: definition.ruleId,
						description: definition.description,
					},
					record: record.facts,
				} satisfies TdsObservation,
			];
		}),
	);
	observations.sort(
		(first, second) =>
			first.evidence.firstLine - second.evidence.firstLine ||
			first.evidence.lastLine - second.evidence.lastLine ||
			compareByCodepoint(first.factKey, second.factKey),
	);
	return { observations, issues };
};
