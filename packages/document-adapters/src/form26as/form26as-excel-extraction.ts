import type {
	DocumentReviewIssue,
	FactKey,
	Sha256Digest,
	SpreadsheetTdsSourceRecord,
	TdsObservation,
} from "@openitr/model";

import type { AdapterIdentity } from "../extraction-support";
import type { GroupedRupeeAmount } from "../grouped-rupee-amount";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import {
	spreadsheetCellReference,
	type SpreadsheetRow,
} from "../spreadsheet/xlsx";
import type { Form26AsSpreadsheetDocument } from "./form26as-excel-revision";
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

// One row's reviewed columns as a presence-aware snapshot: indexes 0-5
// hold each printed cell's verbatim text, where a printed blank cell is an
// empty string and a cell the workbook never printed stays undefined.
const columnSnapshotOf = (
	row: SpreadsheetRow,
): readonly (string | undefined)[] => {
	const width = FORM26AS_COLUMN_HEADER_CELLS.length;
	const snapshot: (string | undefined)[] = new Array(width).fill(undefined);
	for (const cell of row.cells) {
		if (cell.columnIndex < width && snapshot[cell.columnIndex] === undefined) {
			snapshot[cell.columnIndex] = cell.text ?? "";
		}
	}
	return snapshot;
};

const leftmostTextOf = (row: SpreadsheetRow): string | undefined =>
	row.cells.find((cell) => cell.columnIndex === 0)?.text?.trim();

const isBlankRow = (row: SpreadsheetRow): boolean =>
	row.cells.every((cell) => cell.text === undefined || cell.text.trim() === "");

type ParsedAmountCell =
	| Readonly<{ kind: "unknown" }>
	| Readonly<{ kind: "value"; amount: GroupedRupeeAmount; originalValue: string }>
	| Readonly<{ kind: "malformed" }>;

// An unknown amount is either a cell the export never printed or a printed
// blank cell. Both stay unknown; only a printed value parses, keeping its
// verbatim text as the raw value.
const parseAmountCell = (
	columnValue: string | undefined,
): ParsedAmountCell => {
	if (columnValue === undefined || columnValue.trim() === "") {
		return { kind: "unknown" };
	}
	const amount = parseGroupedRupeeAmount(columnValue);
	if (amount === undefined) {
		return { kind: "malformed" };
	}
	return { kind: "value", amount, originalValue: columnValue };
};

type ParsedTdsRecord = Readonly<{
	facts: SpreadsheetTdsSourceRecord;
	amounts: ReadonlyMap<
		FactKey,
		Readonly<{ amount: GroupedRupeeAmount; originalValue: string }>
	>;
}>;

type RecordParseOutcome =
	| Readonly<{ kind: "parsed"; record: ParsedTdsRecord }>
	| Readonly<{ kind: "malformed" }>;

// One reviewed Part I record occupies one row with six reviewed columns.
// Identity cells must print; amount cells may stay blank and remain
// unknown. Every stored value keeps its verbatim cell text.
const parseTdsRecord = (
	sheetName: string,
	row: SpreadsheetRow,
): RecordParseOutcome => {
	const columns = columnSnapshotOf(row);
	if (row.cells.some((cell) => cell.columnIndex >= columns.length)) {
		return { kind: "malformed" };
	}

	const identityTextAt = (index: number): string | undefined =>
		columns[index]?.trim();

	const serialNumber = identityTextAt(0);
	const deductorName = identityTextAt(1);
	const deductorTan = identityTextAt(2);
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
		outcome: parseAmountCell(columns[definition.columnIndex]),
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
				originalValue: outcome.originalValue,
			});
		}
	}

	const facts: SpreadsheetTdsSourceRecord = {
		medium: "spreadsheet",
		sheet: sheetName,
		rowNumber: row.rowNumber,
		serialNumber,
		deductorName,
		deductorTan,
		amountPaidCreditedRaw:
			columns[TDS_AMOUNT_COLUMNS.paidCredited.columnIndex],
		taxDeductedRaw: columns[TDS_AMOUNT_COLUMNS.taxDeducted.columnIndex],
		tdsDepositedRaw: columns[TDS_AMOUNT_COLUMNS.deposited.columnIndex],
	};
	return { kind: "parsed", record: { facts, amounts } };
};

export type TdsExtraction = Readonly<{
	observations: readonly TdsObservation[];
	issues: readonly DocumentReviewIssue[];
}>;

export const extractForm26AsSpreadsheetTdsObservations = ({
	document,
	sourceDocumentId,
	adapter,
}: Readonly<{
	document: Form26AsSpreadsheetDocument;
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): TdsExtraction => {
	const grid = document.grid;
	const sectionStart = grid.rows.find(
		(row) => leftmostTextOf(row) === FORM26AS_PART_ONE_TITLE,
	);
	if (sectionStart === undefined) {
		return { observations: [], issues: [tdsSectionMissingIssue()] };
	}

	const columnHeaderRow = grid.rows.find(
		(row) => row.rowNumber > sectionStart.rowNumber && !isBlankRow(row),
	);
	const headerColumns =
		columnHeaderRow === undefined ? undefined : columnSnapshotOf(columnHeaderRow);
	const headerCellsMatch =
		columnHeaderRow !== undefined &&
		headerColumns !== undefined &&
		FORM26AS_COLUMN_HEADER_CELLS.every(
			(expected, columnIndex) => headerColumns[columnIndex] === expected,
		) &&
		columnHeaderRow.cells.every(
			(cell) => cell.columnIndex < FORM26AS_COLUMN_HEADER_CELLS.length,
		);
	if (!headerCellsMatch) {
		return { observations: [], issues: [tdsColumnHeaderMalformedIssue()] };
	}

	const issues: DocumentReviewIssue[] = [];
	const records: ParsedTdsRecord[] = [];
	for (const row of grid.rows) {
		if (row.rowNumber <= columnHeaderRow.rowNumber) {
			continue;
		}
		if (isBlankRow(row)) {
			continue;
		}
		const firstCellText = leftmostTextOf(row);
		if (firstCellText !== undefined && NEXT_PART_PATTERN.test(firstCellText)) {
			break;
		}
		if (firstCellText === AGGREGATE_ROW_LABEL) {
			continue;
		}
		const outcome = parseTdsRecord(grid.sheetName, row);
		if (outcome.kind === "malformed") {
			issues.push(tdsRecordMalformedIssue());
			continue;
		}
		records.push(outcome.record);
	}

	// Records leave the grid in ascending sheet-row order, and the amount
	// column definitions enumerate a record's facts in fact-key order, so
	// flatMap yields observations ordered by sheet row and then fact key.
	const observations = records.flatMap((record) =>
		AMOUNT_CELL_DEFINITIONS.flatMap((definition) => {
			const parsed = record.amounts.get(definition.factKey);
			if (parsed === undefined) {
				return [];
			}
			const reference = spreadsheetCellReference(
				record.facts.rowNumber,
				definition.columnIndex,
			);
			return [
				{
					observationId: `${definition.factKey}@${sourceDocumentId}:${reference}`,
					factKey: definition.factKey,
					sourceDocumentId,
					adapterId: adapter.adapterId,
					adapterVersion: adapter.adapterVersion,
					originalValue: parsed.originalValue,
					normalizedValue: parsed.amount.value,
					transformationSteps: parsed.amount.steps,
					evidence: {
						kind: "spreadsheet-cell",
						sheet: record.facts.sheet,
						cell: reference,
						rowNumber: record.facts.rowNumber,
						columnIndex: definition.columnIndex,
						columnHeader: definition.columnHeader,
						rawValue: parsed.originalValue,
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
	return { observations, issues };
};
