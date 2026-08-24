import type {
	DocumentReviewIssue,
	FactKey,
	Sha256Digest,
	TdsObservation,
	TextTdsSourceRecord,
} from "@openitr/model";

import { compareByCodepoint } from "../extraction-support";
import type { AdapterIdentity } from "../extraction-support";
import type { GroupedRupeeAmount } from "../grouped-rupee-amount";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import type { Form26AsTextDocument } from "./form26as-text-revision";
import {
	AGGREGATE_ROW_LABEL,
	AMOUNT_CELL_DEFINITIONS,
	FORM26AS_COLUMN_HEADER_CELLS,
	FORM26AS_PART_ONE_TITLE,
	NEXT_PART_PATTERN,
	SERIAL_NUMBER_PATTERN,
	TAN_PATTERN,
	TDS_AMOUNT_COLUMNS,
	tdsColumnHeaderMalformedIssue,
	tdsRecordMalformedIssue,
	tdsSectionMissingIssue,
} from "./tds-part-one";

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
	facts: TextTdsSourceRecord;
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

	const facts: TextTdsSourceRecord = {
		medium: "text",
		serialNumber,
		deductorName,
		deductorTan,
		firstLine: lineNumber,
		lastLine: lineNumber,
		amountPaidCreditedRaw: cellAt(TDS_AMOUNT_COLUMNS.paidCredited.columnIndex),
		taxDeductedRaw: cellAt(TDS_AMOUNT_COLUMNS.taxDeducted.columnIndex),
		tdsDepositedRaw: cellAt(TDS_AMOUNT_COLUMNS.deposited.columnIndex),
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
		return { observations: [], issues: [tdsSectionMissingIssue()] };
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
		return { observations: [], issues: [tdsColumnHeaderMalformedIssue()] };
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
			issues.push(tdsRecordMalformedIssue());
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
