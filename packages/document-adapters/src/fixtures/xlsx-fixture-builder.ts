import { zipSync } from "fflate";

import { spreadsheetCellReference } from "../spreadsheet/xlsx";

// Machine-generated synthetic spreadsheet fixtures. The builder emits the one
// reviewed OOXML shape the adapters accept: exactly the six minimal parts, a
// single worksheet, and every reviewed value stored as a shared-string text
// cell. Numeric, boolean, error, and formula cells are outside every
// supported revision, so no adapter can ever meet one in a passing fixture.

const xmlDeclaration =
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const contentTypesXml = (): string =>
	[
		xmlDeclaration,
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
		'<Default Extension="xml" ContentType="application/xml"/>',
		'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
		'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
		"</Types>",
	].join("");

const officeRelsXml = (): string =>
	[
		xmlDeclaration,
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
		'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
		"</Relationships>",
	].join("");

const workbookXml = (sheetName: string): string =>
	[
		xmlDeclaration,
		'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
		"<sheets>",
		`<sheet name="${escapeAttributeValue(sheetName)}" sheetId="1" r:id="rId1"/>`,
		"</sheets>",
		"</workbook>",
	].join("");

const workbookRelsXml = (): string =>
	[
		xmlDeclaration,
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
		'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
		'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
		"</Relationships>",
	].join("");

const escapeTextContent = (text: string): string =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

const escapeAttributeValue = escapeTextContent;

const sharedStringsXmlOf = (items: readonly string[]): string =>
	[
		xmlDeclaration,
		'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
		...items.map((item) => `<si><t>${escapeTextContent(item)}</t></si>`),
		"</sst>",
	].join("");

const worksheetXmlOf = (rows: readonly string[]): string =>
	[
		xmlDeclaration,
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
		"<sheetData>",
		...rows,
		"</sheetData>",
		"</worksheet>",
	].join("");

// One reviewed cell as the grid prints it: either a text value carried by a
// shared string or a blank placeholder with no value at all.
export type FixtureCell =
	| Readonly<{ kind: "text"; text: string }>
	| Readonly<{ kind: "blank" }>;

export const textCell = (text: string): FixtureCell => ({
	kind: "text",
	text,
});

export const blankCell = (): FixtureCell => ({ kind: "blank" });

export class SharedStringTableBuilder {
	private readonly indexes = new Map<string, number>();
	readonly items: string[] = [];

	indexOf(text: string): number {
		const known = this.indexes.get(text);
		if (known !== undefined) {
			return known;
		}
		const index = this.items.length;
		this.items.push(text);
		this.indexes.set(text, index);
		return index;
	}
}

export const rowXmlOf = (
	rowNumber: number,
	cells: readonly (FixtureCell | undefined)[],
	table: SharedStringTableBuilder,
): string => {
	const cellXml: string[] = [];
	for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
		const cell = cells[columnIndex];
		if (cell === undefined) {
			continue;
		}
		const reference = spreadsheetCellReference(rowNumber, columnIndex);
		cellXml.push(
			cell.kind === "blank"
				? `<c r="${reference}"/>`
				: `<c r="${reference}" t="s"><v>${table.indexOf(cell.text)}</v></c>`,
		);
	}
	return `<row r="${rowNumber}">${cellXml.join("")}</row>`;
};

export type XlsxWorkbookFixtureOptions = Readonly<{
	sheetName: string;
	rows?: readonly string[];
	sharedStrings?: readonly string[];
	extraEntries?: Readonly<Record<string, string>>;
	omitParts?: readonly string[];
	workbookXml?: string;
	contentTypesXml?: string;
	sharedStringsXml?: string;
	worksheetXml?: string;
}>;

// Assembles the reviewed workbook shape. Callers may override individual XML
// parts or add zip entries to construct rejection classes; everything else
// stays fixed so positives prove the exact supported structure.
export const buildXlsxWorkbookFixture = (
	options: XlsxWorkbookFixtureOptions,
): Uint8Array<ArrayBuffer> => {
	const parts: Record<string, string> = {
		"[Content_Types].xml":
			options.contentTypesXml ?? contentTypesXml(),
		"_rels/.rels": officeRelsXml(),
		"xl/workbook.xml": options.workbookXml ?? workbookXml(options.sheetName),
		"xl/_rels/workbook.xml.rels": workbookRelsXml(),
		"xl/sharedStrings.xml":
			options.sharedStringsXml ??
			sharedStringsXmlOf(options.sharedStrings ?? []),
		"xl/worksheets/sheet1.xml":
			options.worksheetXml ?? worksheetXmlOf(options.rows ?? []),
	};
	for (const omitted of options.omitParts ?? []) {
		delete parts[omitted];
	}
	for (const [path, content] of Object.entries(options.extraEntries ?? {})) {
		parts[path] = content;
	}
	const entries: Record<string, Uint8Array> = {};
	for (const [path, content] of Object.entries(parts)) {
		entries[path] = new TextEncoder().encode(content);
	}
	return zipSync(entries) as Uint8Array<ArrayBuffer>;
};
