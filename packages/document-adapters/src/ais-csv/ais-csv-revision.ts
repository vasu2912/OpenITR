export const AIS_CSV_SUPPORTED_DOCUMENT_TYPE = "AIS";
export const AIS_CSV_SUPPORTED_SCHEMA_VERSION = "2026-27";

// The reviewed layout is exactly two marker lines, then optionally one
// bank-interest block: a section marker line, one reviewed column header
// row, and zero or more four-cell record rows. Anything else, including
// interior blank lines, extra sections, reordered or renamed headers,
// ragged rows, and broken quoting, is an unsupported revision.
export const AIS_CSV_BANK_INTEREST_SECTION_KEY = "bankInterest";
export const AIS_CSV_BANK_INTEREST_SECTION_MARKER_LINE = `section,${AIS_CSV_BANK_INTEREST_SECTION_KEY}`;

export const AIS_CSV_BANK_INTEREST_COLUMN_HEADERS = Object.freeze([
	"recordCategory",
	"institutionName",
	"maskedAccountNumber",
	"interestAmount",
] as const);

// One CSV cell as printed in the file. `value` is the decoded cell content;
// `raw` keeps the exact characters including any surrounding quotes so
// evidence can quote the original representation.
export type AisCsvCell = Readonly<{
	value: string;
	raw: string;
}>;

export type AisCsvRecordRow = Readonly<{
	line: number;
	cells: readonly AisCsvCell[];
}>;

export type AisCsvRevisionDocument = Readonly<{
	hasBankInterestSection: boolean;
	bankInterestRows: readonly AisCsvRecordRow[];
}>;

export type AisCsvRevisionParseOutcome =
	| Readonly<{ kind: "supported"; document: AisCsvRevisionDocument }>
	| Readonly<{ kind: "unsupported" }>;

const splitPhysicalLines = (text: string): string[] =>
	text.split(/\r\n|\r|\n/);

type CsvLineParseOutcome = readonly AisCsvCell[] | undefined;

// Parses one physical line into cells. Quoted cells may carry commas and
// doubled quotes; anything else that RFC 4180 would reject on a single line,
// such as an unterminated quote or text after a closing quote, returns
// undefined so the caller can fail closed.
const parseCsvLine = (line: string): CsvLineParseOutcome => {
	const cells: AisCsvCell[] = [];
	let index = 0;
	for (;;) {
		const cellStart = index;
		let value = "";
		if (line[index] === '"') {
			index += 1;
			let closed = false;
			while (index < line.length) {
				const character = line[index];
				if (character === '"') {
					if (line[index + 1] === '"') {
						value += '"';
						index += 2;
						continue;
					}
					index += 1;
					closed = true;
					break;
				}
				if (character !== undefined) {
					value += character;
				}
				index += 1;
			}
			if (!closed) {
				return undefined;
			}
			if (index < line.length && line[index] !== ",") {
				return undefined;
			}
			cells.push({ value, raw: line.slice(cellStart, index) });
		} else {
			while (index < line.length && line[index] !== ",") {
				const character = line[index];
				if (character !== undefined) {
					value += character;
				}
				index += 1;
			}
			cells.push({ value, raw: line.slice(cellStart, index) });
		}
		if (index >= line.length) {
			return cells;
		}
		index += 1;
	}
};

const markerRowMatches = (
	row: AisCsvRecordRow | undefined,
	name: string,
	value: string,
): boolean =>
	row !== undefined &&
	row.cells.length === 2 &&
	row.cells[0]?.value === name &&
	row.cells[1]?.value === value;

const headerRowMatches = (
	row: AisCsvRecordRow | undefined,
): boolean => {
	if (row === undefined) {
		return false;
	}
	if (row.cells.length !== AIS_CSV_BANK_INTEREST_COLUMN_HEADERS.length) {
		return false;
	}
	return AIS_CSV_BANK_INTEREST_COLUMN_HEADERS.every(
		(header, index) => row.cells[index]?.value === header,
	);
};

export const parseAisCsvRevision = (
	text: string,
): AisCsvRevisionParseOutcome => {
	const lines = splitPhysicalLines(text);
	while (lines.at(-1) === "") {
		lines.pop();
	}

	const rows: AisCsvRecordRow[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const lineText = lines[index];
		if (lineText === "" || lineText === undefined) {
			return { kind: "unsupported" };
		}
		const cells = parseCsvLine(lineText);
		if (cells === undefined) {
			return { kind: "unsupported" };
		}
		rows.push({ line: index + 1, cells });
	}

	if (!markerRowMatches(rows[0], "documentType", AIS_CSV_SUPPORTED_DOCUMENT_TYPE)) {
		return { kind: "unsupported" };
	}
	if (
		!markerRowMatches(
			rows[1],
			"schemaVersion",
			AIS_CSV_SUPPORTED_SCHEMA_VERSION,
		)
	) {
		return { kind: "unsupported" };
	}

	let cursor = 2;
	const bankInterestRows: AisCsvRecordRow[] = [];
	const sectionRow: AisCsvRecordRow | undefined = rows[cursor];
	if (sectionRow !== undefined) {
		if (
			!markerRowMatches(
				sectionRow,
				"section",
				AIS_CSV_BANK_INTEREST_SECTION_KEY,
			)
		) {
			return { kind: "unsupported" };
		}
		cursor += 1;
		const headerRow: AisCsvRecordRow | undefined = rows[cursor];
		if (!headerRowMatches(headerRow)) {
			return { kind: "unsupported" };
		}
		cursor += 1;
		while (cursor < rows.length) {
			const row: AisCsvRecordRow | undefined = rows[cursor];
			if (
				row === undefined ||
				row.cells.length !== AIS_CSV_BANK_INTEREST_COLUMN_HEADERS.length
			) {
				return { kind: "unsupported" };
			}
			bankInterestRows.push(row);
			cursor += 1;
		}
	}

	return {
		kind: "supported",
		document: {
			hasBankInterestSection: sectionRow !== undefined,
			bankInterestRows,
		},
	};
};
