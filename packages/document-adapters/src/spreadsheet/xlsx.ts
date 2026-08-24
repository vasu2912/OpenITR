import { unzipSync } from "fflate";

import { decodeUtf8Strict } from "../extraction-support";
import {
	childElementsOf,
	elementChildrenOf,
	firstChildOf,
	hasSignificantText,
	parseXmlDocument,
	textOf,
	type XmlElementNode,
} from "./xml";

// The reviewed workbook carries exactly the parts a minimal OOXML
// spreadsheet needs. Every other part, such as styles, themes, calculation
// chains, VBA projects, external links, or embedded objects, is outside the
// supported revision and fails closed, so no macro, formula cache, external
// reference, or embedded content can ever reach extraction.
const REQUIRED_PARTS = Object.freeze([
	"[Content_Types].xml",
	"_rels/.rels",
	"xl/workbook.xml",
	"xl/_rels/workbook.xml.rels",
	"xl/sharedStrings.xml",
	"xl/worksheets/sheet1.xml",
] as const);

// Decompression caps enforced before any part inflates, so a crafted zip
// bomb cannot turn a few kilobytes of input into gigabytes of browser
// memory. Official statement exports stay orders of magnitude below these.
const MAX_PART_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

// Every zip container starts with the local file header signature
// "PK\u0003\u0004", so anything else can bail before decompression is even
// attempted.
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;

const startsWithZipSignature = (bytes: Uint8Array): boolean =>
	ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);

const OFFICE_DOCUMENT_REL_TYPE =
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const WORKSHEET_REL_TYPE =
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const SHARED_STRINGS_REL_TYPE =
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings";

export type SpreadsheetCell = Readonly<{
	reference: string;
	rowNumber: number;
	columnIndex: number;
	text: string | undefined;
}>;

export type SpreadsheetRow = Readonly<{
	rowNumber: number;
	cells: readonly SpreadsheetCell[];
}>;

export type SpreadsheetGrid = Readonly<{
	sheetName: string;
	rows: readonly SpreadsheetRow[];
}>;

export type XlsxParseOutcome =
	| Readonly<{ kind: "supported"; grid: SpreadsheetGrid }>
	| Readonly<{ kind: "unsupported" }>;

const parsePart = (
	parts: Readonly<Record<string, Uint8Array>>,
	partName: string,
): XmlElementNode | undefined => {
	const bytes = parts[partName];
	if (bytes === undefined) {
		return undefined;
	}
	let decoded: string;
	try {
		decoded = decodeUtf8Strict(bytes);
	} catch {
		return undefined;
	}
	const outcome = parseXmlDocument(decoded);
	return outcome.kind === "parsed" ? outcome.root : undefined;
};

const exactlyOneChild = (
	node: XmlElementNode,
	name: string,
): XmlElementNode | undefined => {
	const children = elementChildrenOf(node, name);
	if (children.length !== 1) {
		return undefined;
	}
	const child = children[0];
	return child === undefined ? undefined : child;
};

const attributeValueOrUndefined = (
	node: XmlElementNode,
	name: string,
): string | undefined => node.attributes[name];

const hasExactlyAttributes = (
	node: XmlElementNode,
	names: readonly string[],
): boolean =>
	Object.keys(node.attributes).length === names.length &&
	names.every((name) => node.attributes[name] !== undefined);

const parseContentTypes = (root: XmlElementNode): boolean => {
	if (root.name !== "Types" || hasSignificantText(root)) {
		return false;
	}
	const requiredDefaults = [
		{
			Extension: "rels",
			ContentType:
				"application/vnd.openxmlformats-package.relationships+xml",
		},
		{ Extension: "xml", ContentType: "application/xml" },
	];
	const requiredOverrides = [
		{
			PartName: "/xl/workbook.xml",
			ContentType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
		},
		{
			PartName: "/xl/worksheets/sheet1.xml",
			ContentType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
		},
	];
	const children = childElementsOf(root);
	if (children.length !== requiredDefaults.length + requiredOverrides.length) {
		return false;
	}
	for (const required of requiredDefaults) {
		const match = children.some(
			(child) =>
				child.name === "Default" &&
				child.attributes["Extension"] === required.Extension &&
				child.attributes["ContentType"] === required.ContentType &&
				hasExactlyAttributes(child, ["Extension", "ContentType"]),
		);
		if (!match) {
			return false;
		}
	}
	for (const required of requiredOverrides) {
		const match = children.some(
			(child) =>
				child.name === "Override" &&
				child.attributes["PartName"] === required.PartName &&
				child.attributes["ContentType"] === required.ContentType &&
				hasExactlyAttributes(child, ["PartName", "ContentType"]),
		);
		if (!match) {
			return false;
		}
	}
	return true;
};

type PackageRelationship = Readonly<{
	id: string | undefined;
	type: string | undefined;
	target: string | undefined;
}>;

const parseRelationships = (
	root: XmlElementNode,
): readonly PackageRelationship[] | undefined => {
	if (root.name !== "Relationships" || hasSignificantText(root)) {
		return undefined;
	}
	const relationships = elementChildrenOf(root, "Relationship");
	if (relationships.length !== childElementsOf(root).length) {
		return undefined;
	}
	return relationships.map((relationship) => ({
		id: attributeValueOrUndefined(relationship, "Id"),
		type: attributeValueOrUndefined(relationship, "Type"),
		target: attributeValueOrUndefined(relationship, "Target"),
	}));
};

const relationshipByType = (
	relationships: readonly PackageRelationship[],
	type: string,
): PackageRelationship | undefined => {
	const matches = relationships.filter(
		(relationship) => relationship.type === type,
	);
	const first = matches[0];
	return matches.length === 1 && first !== undefined ? first : undefined;
};

const COLUMN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Renders a 1-based row number and 0-based column index as the A1-style cell
// reference the reviewed worksheets print, so evidence locators and parsed
// references share one notation.
export const spreadsheetCellReference = (
	rowNumber: number,
	columnIndex: number,
): string => {
	let letters = "";
	let rest = columnIndex;
	for (;;) {
		const digit = rest % 26;
		const letter = COLUMN_LETTERS[digit];
		if (letter === undefined) {
			throw new Error(`Invalid column index: ${columnIndex}`);
		}
		letters = `${letter}${letters}`;
		rest = Math.floor(rest / 26) - 1;
		if (rest < 0) {
			break;
		}
	}
	return `${letters}${rowNumber}`;
};

const parseCellReference = (
	reference: string,
): { rowNumber: number; columnIndex: number } | undefined => {
	const match = /^([A-Z]+)([0-9]+)$/.exec(reference);
	if (match === null) {
		return undefined;
	}
	const letters = match[1] ?? "";
	const digits = match[2] ?? "";
	if (digits.startsWith("0")) {
		return undefined;
	}
	let columnIndex = 0;
	for (const letter of letters) {
		columnIndex = columnIndex * 26 + (COLUMN_LETTERS.indexOf(letter) + 1);
	}
	return { rowNumber: Number.parseInt(digits, 10), columnIndex: columnIndex - 1 };
};

const parseSharedStrings = (
	root: XmlElementNode,
): readonly string[] | undefined => {
	if (root.name !== "sst" || hasSignificantText(root)) {
		return undefined;
	}
	const items: string[] = [];
	for (const item of childElementsOf(root)) {
		if (item.name !== "si") {
			return undefined;
		}
		const textElements = elementChildrenOf(item, "t");
		if (
			textElements.length !== 1 ||
			childElementsOf(item).length !== 1 ||
			hasSignificantText(item)
		) {
			return undefined;
		}
		const textElement = textElements[0];
		if (textElement === undefined) {
			return undefined;
		}
		items.push(textOf(textElement));
	}
	return items;
};

type WorksheetCellParseOutcome =
	| Readonly<{ kind: "cell"; cell: SpreadsheetCell }>
	| Readonly<{ kind: "unsupported" }>;

const parseWorksheetCell = (
	node: XmlElementNode,
	rowNumber: number,
	sharedStrings: readonly string[],
): WorksheetCellParseOutcome => {
	const attributeNames =
		node.attributes["t"] === undefined
			? (["r"] as const)
			: (["r", "t"] as const);
	if (!hasExactlyAttributes(node, attributeNames)) {
		return { kind: "unsupported" };
	}
	const reference = node.attributes["r"];
	if (reference === undefined) {
		return { kind: "unsupported" };
	}
	const position = parseCellReference(reference);
	if (position === undefined || position.rowNumber !== rowNumber) {
		return { kind: "unsupported" };
	}

	const valueElement = firstChildOf(node, "v");
	const cellType = node.attributes["t"];
	if (valueElement === undefined) {
		// A printed blank cell carries neither a value nor a type attribute;
		// a type without a value is not a shape the reviewed revision prints.
		if (cellType !== undefined || node.children.length > 0) {
			return { kind: "unsupported" };
		}
		return {
			kind: "cell",
			cell: {
				reference,
				rowNumber,
				columnIndex: position.columnIndex,
				text: undefined,
			},
		};
	}
	if (cellType !== "s" || node.children.length !== 1) {
		return { kind: "unsupported" };
	}
	const rawIndex = textOf(valueElement);
	if (!/^[0-9]+$/.test(rawIndex)) {
		return { kind: "unsupported" };
	}
	const index = Number.parseInt(rawIndex, 10);
	const text = sharedStrings[index];
	if (index >= sharedStrings.length || text === undefined) {
		return { kind: "unsupported" };
	}
	return {
		kind: "cell",
		cell: { reference, rowNumber, columnIndex: position.columnIndex, text },
	};
};

const parseSheetData = (
	sheetData: XmlElementNode,
	sharedStrings: readonly string[],
): readonly SpreadsheetRow[] | undefined => {
	if (hasSignificantText(sheetData)) {
		return undefined;
	}
	const rows: SpreadsheetRow[] = [];
	for (const child of childElementsOf(sheetData)) {
		if (child.name !== "row") {
			return undefined;
		}
		if (!hasExactlyAttributes(child, ["r"])) {
			return undefined;
		}
		const rawRowNumber = child.attributes["r"];
		if (rawRowNumber === undefined || !/^[1-9][0-9]*$/.test(rawRowNumber)) {
			return undefined;
		}
		const rowNumber = Number.parseInt(rawRowNumber, 10);
		const previous = rows[rows.length - 1];
		if (previous !== undefined && rowNumber <= previous.rowNumber) {
			return undefined;
		}
		const cellNodes = childElementsOf(child);
		if (
			cellNodes.length !== elementChildrenOf(child, "c").length ||
			hasSignificantText(child)
		) {
			return undefined;
		}
		const cells: SpreadsheetCell[] = [];
		for (const cellNode of cellNodes) {
			const outcome = parseWorksheetCell(cellNode, rowNumber, sharedStrings);
			if (outcome.kind === "unsupported") {
				return undefined;
			}
			const lastCell = cells[cells.length - 1];
			if (
				lastCell !== undefined &&
				outcome.cell.columnIndex <= lastCell.columnIndex
			) {
				return undefined;
			}
			cells.push(outcome.cell);
		}
		rows.push({ rowNumber, cells });
	}
	return rows;
};

// Parses one reviewed OOXML workbook into a grid. Every structural check,
// from the zip part whitelist through each XML part's exact shape to every
// cell's type and position, runs before any grid value exists, so an
// unsupported workbook never yields a partial result.
export const parseXlsxGrid = (
	bytes: Uint8Array<ArrayBuffer>,
): XlsxParseOutcome => {
	if (!startsWithZipSignature(bytes)) {
		return { kind: "unsupported" };
	}
	// The filter bounds decompression only; it must not hide disallowed
	// parts, because their presence is exactly what fails the workbook.
	// Oversized or over-numerous entries stay uninflated, so the required
	// parts go missing and the workbook fails closed under the memory cap.
	let totalBytes = 0;
	let parts: Record<string, Uint8Array>;
	try {
		parts = unzipSync(bytes, {
			filter: (file) => {
				if (file.originalSize > MAX_PART_BYTES) {
					return false;
				}
				totalBytes += file.originalSize;
				return totalBytes <= MAX_TOTAL_BYTES;
			},
		}) as Record<string, Uint8Array>;
	} catch {
		return { kind: "unsupported" };
	}
	for (const required of REQUIRED_PARTS) {
		if (parts[required] === undefined) {
			return { kind: "unsupported" };
		}
	}
	if (Object.keys(parts).length !== REQUIRED_PARTS.length) {
		return { kind: "unsupported" };
	}

	const contentTypes = parsePart(parts, "[Content_Types].xml");
	if (contentTypes === undefined || !parseContentTypes(contentTypes)) {
		return { kind: "unsupported" };
	}

	const officeRelsRoot = parsePart(parts, "_rels/.rels");
	if (officeRelsRoot === undefined) {
		return { kind: "unsupported" };
	}
	const officeRels = parseRelationships(officeRelsRoot);
	const officeDocumentRel =
		officeRels === undefined
			? undefined
			: relationshipByType(officeRels, OFFICE_DOCUMENT_REL_TYPE);
	if (
		officeRels?.length !== 1 ||
		officeDocumentRel === undefined ||
		officeDocumentRel.id !== "rId1" ||
		officeDocumentRel.target !== "xl/workbook.xml"
	) {
		return { kind: "unsupported" };
	}

	const workbookRoot = parsePart(parts, "xl/workbook.xml");
	if (
		workbookRoot === undefined ||
		workbookRoot.name !== "workbook" ||
		hasSignificantText(workbookRoot)
	) {
		return { kind: "unsupported" };
	}
	if (childElementsOf(workbookRoot).length !== 1) {
		return { kind: "unsupported" };
	}
	const sheets = exactlyOneChild(workbookRoot, "sheets");
	if (
		sheets === undefined ||
		hasSignificantText(sheets) ||
		childElementsOf(sheets).length !== 1
	) {
		return { kind: "unsupported" };
	}
	const sheet = exactlyOneChild(sheets, "sheet");
	if (sheet === undefined) {
		return { kind: "unsupported" };
	}
	if (!hasExactlyAttributes(sheet, ["name", "sheetId", "r:id"])) {
		return { kind: "unsupported" };
	}
	const sheetName = sheet.attributes["name"];
	if (sheetName === undefined || sheet.attributes["sheetId"] !== "1") {
		return { kind: "unsupported" };
	}

	const workbookRelsRoot = parsePart(parts, "xl/_rels/workbook.xml.rels");
	if (workbookRelsRoot === undefined) {
		return { kind: "unsupported" };
	}
	const workbookRels = parseRelationships(workbookRelsRoot);
	if (workbookRels === undefined || workbookRels.length !== 2) {
		return { kind: "unsupported" };
	}
	const worksheetRel = relationshipByType(workbookRels, WORKSHEET_REL_TYPE);
	const sharedStringsRel = relationshipByType(
		workbookRels,
		SHARED_STRINGS_REL_TYPE,
	);
	if (
		worksheetRel === undefined ||
		sharedStringsRel === undefined ||
		worksheetRel.target !== "worksheets/sheet1.xml" ||
		sharedStringsRel.target !== "sharedStrings.xml" ||
		worksheetRel.id !== sheet.attributes["r:id"]
	) {
		return { kind: "unsupported" };
	}

	const sharedStringsRoot = parsePart(parts, "xl/sharedStrings.xml");
	if (sharedStringsRoot === undefined) {
		return { kind: "unsupported" };
	}
	const sharedStrings = parseSharedStrings(sharedStringsRoot);
	if (sharedStrings === undefined) {
		return { kind: "unsupported" };
	}

	const worksheetRoot = parsePart(parts, "xl/worksheets/sheet1.xml");
	if (
		worksheetRoot === undefined ||
		worksheetRoot.name !== "worksheet" ||
		hasSignificantText(worksheetRoot)
	) {
		return { kind: "unsupported" };
	}
	if (childElementsOf(worksheetRoot).length !== 1) {
		return { kind: "unsupported" };
	}
	const sheetData = exactlyOneChild(worksheetRoot, "sheetData");
	if (sheetData === undefined) {
		return { kind: "unsupported" };
	}
	const rows = parseSheetData(sheetData, sharedStrings);
	if (rows === undefined) {
		return { kind: "unsupported" };
	}

	return {
		kind: "supported",
		grid: { sheetName, rows },
	};
};
