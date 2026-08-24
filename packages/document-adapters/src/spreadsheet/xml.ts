// A deliberately tiny strict XML reader for the reviewed spreadsheet parts.
// It accepts exactly the constructs those parts use: an optional declaration,
// elements with double-quoted attributes, and text content carrying the five
// predefined entities or numeric character references. Anything else, such
// as a DTD, comments, CDATA sections, processing instructions, unknown
// entities, single-quoted attributes, or namespace prefixes on element
// names, fails closed as invalid input.

export type XmlTextNode = Readonly<{ kind: "text"; value: string }>;

export type XmlElementNode = Readonly<{
	kind: "element";
	name: string;
	attributes: Readonly<Record<string, string>>;
	children: readonly XmlNode[];
}>;

export type XmlNode = XmlTextNode | XmlElementNode;

export type XmlParseOutcome =
	| Readonly<{ kind: "parsed"; root: XmlElementNode }>
	| Readonly<{ kind: "invalid" }>;

const decodeEntities = (raw: string): string | undefined => {
	if (!raw.includes("&")) {
		return raw;
	}
	let decoded = "";
	let index = 0;
	while (index < raw.length) {
		const ampersand = raw.indexOf("&", index);
		if (ampersand < 0) {
			decoded += raw.slice(index);
			break;
		}
		decoded += raw.slice(index, ampersand);
		const semicolon = raw.indexOf(";", ampersand + 1);
		if (semicolon < 0) {
			return undefined;
		}
		const entity = raw.slice(ampersand + 1, semicolon);
		if (entity === "amp") {
			decoded += "&";
		} else if (entity === "lt") {
			decoded += "<";
		} else if (entity === "gt") {
			decoded += ">";
		} else if (entity === "quot") {
			decoded += '"';
		} else if (entity === "apos") {
			decoded += "'";
		} else {
			const isHex = entity.startsWith("#x") || entity.startsWith("#X");
			const isDecimal = !isHex && entity.startsWith("#");
			if (!isHex && !isDecimal) {
				return undefined;
			}
			const codePoint = Number.parseInt(
				entity.slice(isHex ? 2 : 1),
				isHex ? 16 : 10,
			);
			if (!Number.isFinite(codePoint)) {
				return undefined;
			}
			decoded += String.fromCodePoint(codePoint);
		}
		index = semicolon + 1;
	}
	return decoded;
};

const withoutNamespaceDeclarations = (
	attributes: Record<string, string>,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(attributes).filter(([name]) => !name.startsWith("xmlns")),
	);

class Invalid extends Error {}

const readDeclarationAndMisc = (text: string): number => {
	let cursor = text.startsWith("\uFEFF") ? 1 : 0;
	for (;;) {
		const rest = text.slice(cursor);
		if (rest.startsWith("<?xml ")) {
			const end = rest.indexOf("?>");
			if (end < 0) {
				throw new Invalid();
			}
			cursor += end + 2;
			continue;
		}
		const trimmed = rest.trimStart();
		cursor = text.length - trimmed.length;
		break;
	}
	return cursor;
};

const expectName = (text: string, start: number): { name: string; next: number } => {
	const match = /^[A-Za-z_][A-Za-z0-9._-]*/.exec(text.slice(start));
	const name = match?.[0];
	if (name === undefined || name === "") {
		throw new Invalid();
	}
	return { name, next: start + name.length };
};

const ATTRIBUTE_NAME_PATTERN =
	/^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?$/;

const readAttributes = (
	text: string,
	start: number,
): { attributes: Record<string, string>; next: number } => {
	const attributes: Record<string, string> = {};
	let cursor = start;
	for (;;) {
		while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
			cursor += 1;
		}
		const character = text[cursor];
		if (character === ">" || character === "/" || character === undefined) {
			return { attributes, next: cursor };
		}
		const equals = text.indexOf("=", cursor);
		if (equals < 0) {
			throw new Invalid();
		}
		const name = text.slice(cursor, equals).trim();
		if (!ATTRIBUTE_NAME_PATTERN.test(name)) {
			throw new Invalid();
		}
		let valueStart = equals + 1;
		while (/\s/.test(text[valueStart] ?? "")) {
			valueStart += 1;
		}
		if (text[valueStart] !== '"') {
			throw new Invalid();
		}
		const closeQuote = text.indexOf('"', valueStart + 1);
		if (closeQuote < 0) {
			throw new Invalid();
		}
		const decoded = decodeEntities(text.slice(valueStart + 1, closeQuote));
		if (decoded === undefined) {
			throw new Invalid();
		}
		attributes[name] = decoded;
		cursor = closeQuote + 1;
	}
};

const readOpenTag = (
	text: string,
	start: number,
): {
	name: string;
	attributes: Record<string, string>;
	selfClosing: boolean;
	next: number;
} => {
	if (text[start] !== "<") {
		throw new Invalid();
	}
	const { name, next: nameEnd } = expectName(text, start + 1);
	const { attributes, next } = readAttributes(text, nameEnd);
	const slashSelfClose = text[next] === "/";
	if (slashSelfClose && text[next + 1] !== ">") {
		throw new Invalid();
	}
	if (!slashSelfClose && text[next] !== ">") {
		throw new Invalid();
	}
	return {
		name,
		attributes: withoutNamespaceDeclarations(attributes),
		selfClosing: slashSelfClose,
		next: slashSelfClose ? next + 2 : next + 1,
	};
};

const readElement = (
	text: string,
	start: number,
): { element: XmlElementNode; next: number } => {
	const open = readOpenTag(text, start);
	if (open.selfClosing) {
		return {
			element: {
				kind: "element",
				name: open.name,
				attributes: open.attributes,
				children: [],
			},
			next: open.next,
		};
	}
	const children: XmlNode[] = [];
	let pendingText = "";
	let cursor = open.next;
	for (;;) {
		const openBracket = text.indexOf("<", cursor);
		if (openBracket < 0) {
			throw new Invalid();
		}
		if (openBracket > cursor) {
			const decoded = decodeEntities(text.slice(cursor, openBracket));
			if (decoded === undefined) {
				throw new Invalid();
			}
			pendingText += decoded;
		}
		const after = text[openBracket + 1];
		if (after === "/") {
			const closeEnd = text.indexOf(">", openBracket);
			if (closeEnd < 0) {
				throw new Invalid();
			}
			const closeName = text.slice(openBracket + 2, closeEnd).trim();
			if (closeName !== open.name) {
				throw new Invalid();
			}
			if (pendingText !== "") {
				children.push({ kind: "text", value: pendingText });
			}
			return {
				element: {
					kind: "element",
					name: open.name,
					attributes: open.attributes,
					children,
				},
				next: closeEnd + 1,
			};
		}
		if (after === "?" || after === "!") {
			throw new Invalid();
		}
		if (pendingText !== "") {
			children.push({ kind: "text", value: pendingText });
			pendingText = "";
		}
		const child = readElement(text, openBracket);
		children.push(child.element);
		cursor = child.next;
	}
};

export const parseXmlDocument = (text: string): XmlParseOutcome => {
	try {
		const contentStart = readDeclarationAndMisc(text);
		const rootBracket = text.indexOf("<", contentStart);
		if (rootBracket < 0 || text[rootBracket + 1] === "/" ) {
			return { kind: "invalid" };
		}
		const root = readElement(text, rootBracket);
		if (text.slice(root.next).trim() !== "") {
			return { kind: "invalid" };
		}
		return { kind: "parsed", root: root.element };
	} catch (error) {
		if (error instanceof Invalid) {
			return { kind: "invalid" };
		}
		throw error;
	}
};

export const elementChildrenOf = (
	node: XmlElementNode,
	name: string,
): readonly XmlElementNode[] =>
	node.children.filter(
		(child): child is XmlElementNode =>
			child.kind === "element" && child.name === name,
	);

export const firstChildOf = (
	node: XmlElementNode,
	name: string,
): XmlElementNode | undefined =>
	node.children.find(
		(child): child is XmlElementNode =>
			child.kind === "element" && child.name === name,
	);

export const textOf = (node: XmlElementNode): string =>
	node.children
		.map((child) => (child.kind === "text" ? child.value : ""))
		.join("");
