import { parseAssessmentYear } from "@openitr/model";
import type { AssessmentYear } from "@openitr/model";

import {
	parseXlsxGrid,
	type SpreadsheetGrid,
	type SpreadsheetRow,
} from "../spreadsheet/xlsx";

export const FORM26AS_EXCEL_SHEET_NAME = "Form 26AS";
const FORM26AS_EXCEL_SUPPORTED_ASSESSMENT_YEAR = "2026-27";

const FORM26AS_EXCEL_TITLE = "FORM 26AS";
const FORM26AS_EXCEL_SUBTITLE =
	"Annual Tax Statement under Section 203AA of the Income Tax Act, 1961";
const FORM26AS_EXCEL_PAN_LABEL = "Permanent Account Number (PAN)";
const FORM26AS_EXCEL_ASSESSMENT_YEAR_LABEL = "Assessment Year";

// One reviewed header-block cell. `text` fixes the exact printed label; a
// missing `text` marks a value cell whose content the caller validates.
type HeaderCellExpectation = Readonly<{
	columnIndex: number;
	text?: string;
}>;

// The reviewed header block occupies fixed rows: the title in A1, the
// subtitle in A2, the PAN label and value in A3/B3, and the assessment-year
// label and value in A4/B4. No other cell may print in those rows.
const HEADER_BLOCK_ROWS: readonly (readonly HeaderCellExpectation[])[] =
	Object.freeze([
		Object.freeze([{ columnIndex: 0, text: FORM26AS_EXCEL_TITLE }]),
		Object.freeze([{ columnIndex: 0, text: FORM26AS_EXCEL_SUBTITLE }]),
		Object.freeze([
			{ columnIndex: 0, text: FORM26AS_EXCEL_PAN_LABEL },
			{ columnIndex: 1 },
		]),
		Object.freeze([
			{ columnIndex: 0, text: FORM26AS_EXCEL_ASSESSMENT_YEAR_LABEL },
			{ columnIndex: 1 },
		]),
	]);

export type Form26AsSpreadsheetDocument = Readonly<{
	grid: SpreadsheetGrid;
	permanentAccountNumber: string;
	assessmentYear: AssessmentYear;
}>;

export type Form26AsExcelRevisionParseOutcome =
	| Readonly<{ kind: "supported"; document: Form26AsSpreadsheetDocument }>
	| Readonly<{ kind: "unsupported" }>;

const rowNumberOf = (
	grid: SpreadsheetGrid,
	rowNumber: number,
): SpreadsheetRow | undefined =>
	grid.rows.find((candidate) => candidate.rowNumber === rowNumber);

const textAt = (
	grid: SpreadsheetGrid,
	rowNumber: number,
	columnIndex: number,
): string | undefined =>
	rowNumberOf(grid, rowNumber)?.cells.find(
		(cell) => cell.columnIndex === columnIndex,
	)?.text;

const headerRowMatches = (
	grid: SpreadsheetGrid,
	rowNumber: number,
	expectations: readonly HeaderCellExpectation[],
): boolean => {
	const row = rowNumberOf(grid, rowNumber);
	if (row === undefined) {
		return false;
	}
	const widestExpectedColumn = Math.max(
		...expectations.map((expectation) => expectation.columnIndex),
	);
	if (
		row.cells.some((cell) => cell.columnIndex > widestExpectedColumn)
	) {
		return false;
	}
	return expectations.every((expectation) => {
		const text = textAt(grid, rowNumber, expectation.columnIndex);
		return expectation.text === undefined ? text !== undefined : text === expectation.text;
	});
};

// The supported spreadsheet revision is the reviewed single-sheet workbook
// whose sheet carries the statement name and whose header block prints the
// exact reviewed labels for the one supported assessment year. Everything
// else, including other assessment years or extra header cells, is an
// unsupported revision and fails closed.
export const parseForm26AsExcelRevision = (
	bytes: Uint8Array<ArrayBuffer>,
): Form26AsExcelRevisionParseOutcome => {
	const parsed = parseXlsxGrid(bytes);
	if (parsed.kind === "unsupported") {
		return { kind: "unsupported" };
	}
	const grid = parsed.grid;
	if (grid.sheetName !== FORM26AS_EXCEL_SHEET_NAME) {
		return { kind: "unsupported" };
	}

	for (let index = 0; index < HEADER_BLOCK_ROWS.length; index += 1) {
		const expectations = HEADER_BLOCK_ROWS[index];
		if (
			expectations === undefined ||
			!headerRowMatches(grid, index + 1, expectations)
		) {
			return { kind: "unsupported" };
		}
	}

	const permanentAccountNumber = textAt(grid, 3, 1)?.trim();
	if (permanentAccountNumber === undefined || permanentAccountNumber === "") {
		return { kind: "unsupported" };
	}
	const assessmentYearText = textAt(grid, 4, 1)?.trim();
	if (assessmentYearText !== FORM26AS_EXCEL_SUPPORTED_ASSESSMENT_YEAR) {
		return { kind: "unsupported" };
	}

	return {
		kind: "supported",
		document: {
			grid,
			permanentAccountNumber,
			assessmentYear: parseAssessmentYear(assessmentYearText),
		},
	};
};
