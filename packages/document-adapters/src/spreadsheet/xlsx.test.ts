import { zipSync } from "fflate";
import { describe, expect, test } from "vitest";

import { parseXlsxGrid } from "./xlsx";

const WORKBOOK_CONTENT_TYPES = [
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
	'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
	'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
	'<Default Extension="xml" ContentType="application/xml"/>',
	'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
	'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
	"</Types>",
].join("");

const OFFICE_RELS = [
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
	'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
	'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
	"</Relationships>",
].join("");

const workbookXml = (sheetName: string): string =>
	[
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
		"<sheets>",
		`<sheet name="${sheetName}" sheetId="1" r:id="rId1"/>`,
		"</sheets>",
		"</workbook>",
	].join("");

const workbookRels = (): string =>
	[
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
		'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
		'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
		"</Relationships>",
	].join("");

const sharedStringsXml = (items: readonly string[]): string =>
	[
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
		...items.map((item) => `<si><t>${item}</t></si>`),
		"</sst>",
	].join("");

const sheetXml = (rows: readonly string[]): string =>
	[
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
		"<sheetData>",
		...rows,
		"</sheetData>",
		"</worksheet>",
	].join("");

const textCell = (reference: string, index: number): string =>
	`<c r="${reference}" t="s"><v>${index}</v></c>`;

const blankCell = (reference: string): string => `<c r="${reference}"/>`;

const buildWorkbook = (
	options: Readonly<{
		sheetName?: string;
		sharedStrings?: readonly string[];
		rows?: readonly string[];
		extraEntries?: Readonly<Record<string, Uint8Array>>;
		omitEntries?: readonly string[];
		contentTypes?: string;
		officeRels?: string;
		workbook?: string;
		workbookRels?: string;
		sharedStringsXml?: string;
		sheet?: string;
	}> = {},
): Uint8Array<ArrayBuffer> => {
	const entries: Record<string, Uint8Array> = {
		"[Content_Types].xml": new TextEncoder().encode(
			options.contentTypes ?? WORKBOOK_CONTENT_TYPES,
		),
		"_rels/.rels": new TextEncoder().encode(options.officeRels ?? OFFICE_RELS),
		"xl/workbook.xml": new TextEncoder().encode(
			options.workbook ?? workbookXml(options.sheetName ?? "Form 26AS"),
		),
		"xl/_rels/workbook.xml.rels": new TextEncoder().encode(
			options.workbookRels ?? workbookRels(),
		),
		"xl/sharedStrings.xml": new TextEncoder().encode(
			options.sharedStringsXml ??
				sharedStringsXml(options.sharedStrings ?? []),
		),
		"xl/worksheets/sheet1.xml": new TextEncoder().encode(
			options.sheet ?? sheetXml(options.rows ?? []),
		),
	};
	for (const omitted of options.omitEntries ?? []) {
		delete entries[omitted];
	}
	for (const [path, bytes] of Object.entries(options.extraEntries ?? {})) {
		entries[path] = bytes;
	}
	return zipSync(entries) as Uint8Array<ArrayBuffer>;
};

describe("parseXlsxGrid", () => {
	test("parses a valid workbook into a grid with the sheet name and shared-string cell text", () => {
		const bytes = buildWorkbook({
			sheetName: "Form 26AS",
			sharedStrings: ["FORM 26AS", "Sr. No.", "MUMA12345B"],
			rows: [
				`<row r="1">${textCell("A1", 0)}</row>`,
				`<row r="2">${textCell("A2", 1)}${blankCell("B2")}</row>`,
				`<row r="3">${textCell("A3", 2)}</row>`,
			],
		});

		expect(parseXlsxGrid(bytes)).toEqual({
			kind: "supported",
			grid: {
				sheetName: "Form 26AS",
				rows: [
					{
						rowNumber: 1,
						cells: [
							{ reference: "A1", rowNumber: 1, columnIndex: 0, text: "FORM 26AS" },
						],
					},
					{
						rowNumber: 2,
						cells: [
							{ reference: "A2", rowNumber: 2, columnIndex: 0, text: "Sr. No." },
							{ reference: "B2", rowNumber: 2, columnIndex: 1, text: undefined },
						],
					},
					{
						rowNumber: 3,
						cells: [
							{
								reference: "A3",
								rowNumber: 3,
								columnIndex: 0,
								text: "MUMA12345B",
							},
						],
					},
				],
			},
		});
	});

	test("decodes the five predefined entities inside shared strings and cell references", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["Deductor &amp; Co", "less &lt;than&gt;", "&quot;q&quot; &apos;r&apos;"],
			rows: [`<row r="1">${textCell("A1", 0)}${textCell("B1", 1)}${textCell("C1", 2)}</row>`],
		});

		const outcome = parseXlsxGrid(bytes);
		if (outcome.kind !== "supported") {
			throw new Error("expected a supported workbook");
		}
		expect(outcome.grid.rows[0]?.cells.map((cell) => cell.text)).toEqual([
			"Deductor & Co",
			"less <than>",
			'"q" \'r\'',
		]);
	});

	test("rejects bytes that are not a zip container at all", () => {
		const bytes = new TextEncoder().encode("a plain letter about taxes");
		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a workbook carrying an embedded object or macro part", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			extraEntries: {
				"xl/embeddings/oleObject1.bin": new Uint8Array([0x01, 0x02]),
				"xl/vbaProject.bin": new Uint8Array([0xde, 0xad]),
			},
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a workbook missing a required part", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			omitEntries: ["xl/sharedStrings.xml"],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a workbook whose declared content types do not cover the reviewed parts", () => {
		const bytes = buildWorkbook({
			contentTypes: [
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
				'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
				'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
				"</Types>",
			].join(""),
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a workbook whose package relationship does not point at the reviewed workbook part", () => {
		const bytes = buildWorkbook({
			officeRels: [
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
				'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
				"</Relationships>",
			].join(""),
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a workbook declaring a second sheet", () => {
		const bytes = buildWorkbook({
			workbook: [
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
				'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
				"<sheets>",
				'<sheet name="Form 26AS" sheetId="1" r:id="rId1"/>',
				'<sheet name="Part II" sheetId="2" r:id="rId9"/>',
				"</sheets>",
				"</workbook>",
			].join(""),
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a numeric amount cell", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows: ['<row r="1"><c r="A1"><v>1000000</v></c></row>'],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a formula cell", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows: ['<row r="1"><c r="A1" t="s"><f>SUM(A2:A3)</f><v>0</v></c></row>'],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("keeps absent cells as gaps so record-level completeness stays an extraction decision", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows: [`<row r="7">${textCell("A7", 0)}${textCell("C7", 0)}</row>`],
		});

		const outcome = parseXlsxGrid(bytes);
		if (outcome.kind !== "supported") {
			throw new Error("expected a supported workbook");
		}
		expect(outcome.grid.rows[0]?.cells.map((cell) => cell.reference)).toEqual([
			"A7",
			"C7",
		]);
	});

	test("rejects a cell whose reference does not match its row", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows: [`<row r="4">${textCell("A4", 0)}${textCell("B5", 0)}</row>`],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects two cells claiming the same column of one row", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows: [
				`<row r="8">${textCell("A8", 0)}${textCell("C8", 0)}${textCell("C8", 0)}</row>`,
			],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects rows whose numbers repeat or regress", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows: [`<row r="5">${textCell("A5", 0)}</row>`, `<row r="5">${textCell("A5", 0)}</row>`],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a shared string stored as a rich-text run", () => {
		const bytes = buildWorkbook({
			sharedStringsXml: [
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
				'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
				"<si><r><t>FORM</t></r><r><t> 26AS</t></r></si>",
				"</sst>",
			].join(""),
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects malformed XML such as an unknown entity", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["PAN&nbsp;XXXX9999X"],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test.each([
		["a code point beyond Unicode", "&#x110000;"],
		["a lone surrogate code point", "&#xd800;"],
		["a control character", "&#x1;"],
	])("rejects %s without throwing instead of failing closed", (_label, entity) => {
		const bytes = buildWorkbook({
			sharedStrings: [`PAN ${entity} XXXX9999X`],
		});

		expect(() => parseXlsxGrid(bytes)).not.toThrow();
		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects content before the root element", () => {
		const bytes = buildWorkbook({
			sharedStringsXml:
				'<?xml version="1.0" encoding="UTF-8"?>stray text<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></sst>',
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test.each([
		["a DTD section", '<!DOCTYPE sst [<!ENTITY x "y">]>'],
		["a CDATA section", "<![CDATA[raw]]>"],
		["a processing instruction", "<?php echo $x; ?>"],
	] as const)("rejects %s ahead of the root element", (_label, prolog) => {
		const bytes = buildWorkbook({
			sharedStringsXml: `<?xml version="1.0" encoding="UTF-8"?>${prolog}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></sst>`,
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects duplicate attribute names on one element", () => {
		const bytes = buildWorkbook({
			rows: [
				'<row r="7"><c r="A7" t="s" t="s"><v>0</v></c></row>',
			],
			sharedStrings: ["FORM 26AS"],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test.each([
		["a row carrying only a foreign element", [`<row r="9"><bogus/></row>`]],
		[
			"a row mixing cells with a foreign element",
			[`<row r="9">${textCell("A9", 0)}<bogus/></row>`],
		],
	] as const)("rejects %s", (_label, rows) => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows,
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects an oversized part before inflating the workbook", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["x".repeat(4 * 1024 * 1024 + 1)],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a blank cell that still declares a type", () => {
		const bytes = buildWorkbook({
			sharedStrings: ["FORM 26AS"],
			rows: ['<row r="8"><c r="A8" t="s"/></row>'],
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});

	test("rejects a shared string split across two text elements", () => {
		const bytes = buildWorkbook({
			sharedStringsXml: [
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
				'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
				"<si><t>FOR</t><t>M 26AS</t></si>",
				"</sst>",
			].join(""),
		});

		expect(parseXlsxGrid(bytes)).toEqual({ kind: "unsupported" });
	});
});
