import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfTextLayerOutcome =
	| Readonly<{ outcome: "encrypted" }>
	| Readonly<{ outcome: "damaged" }>
	| Readonly<{ outcome: "not-a-pdf" }>
	| Readonly<{ outcome: "no-text-layer" }>
	| Readonly<{ outcome: "text"; pageTexts: readonly string[] }>;

const normalizeWhitespace = (text: string): string =>
	text.replace(/\s+/g, " ").trim();

const PDF_HEADER = "%PDF-";

// The PDF specification permits junk before the "%PDF-" signature, so detect
// the header anywhere in a small leading window instead of requiring offset
// zero. This is format detection, not a processing limit.
const PDF_HEADER_SCAN_WINDOW = 1024;

const hasPdfHeader = (bytes: Uint8Array): boolean => {
	const windowSize = Math.min(bytes.length, PDF_HEADER_SCAN_WINDOW);
	let headerIndex = 0;
	for (let index = 0; index < windowSize; index += 1) {
		const byte = bytes[index];
		if (byte === undefined) {
			return false;
		}
		if (byte === PDF_HEADER.charCodeAt(headerIndex)) {
			headerIndex += 1;
			if (headerIndex === PDF_HEADER.length) {
				return true;
			}
		} else {
			headerIndex =
				byte === PDF_HEADER.charCodeAt(0) && headerIndex > 0 ? 1 : 0;
		}
	}
	return false;
};

export const normalizedTextContainsAll = (
	haystack: string,
	requiredMarkers: readonly string[],
): boolean => {
	const normalizedHaystack = normalizeWhitespace(haystack);
	return requiredMarkers.every((marker) =>
		normalizedHaystack.includes(normalizeWhitespace(marker)),
	);
};

export type PdfLineGeometry = Readonly<{
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
}>;

export type PdfLinesOutcome =
	| Readonly<{
			outcome: "encrypted" | "damaged" | "not-a-pdf" | "no-text-layer";
	  }>
	| Readonly<{ outcome: "text"; pages: readonly (readonly PdfLineGeometry[])[] }>;

type OpenedPdf =
	| Readonly<{ kind: "encrypted" | "damaged" | "not-a-pdf" }>
	| Readonly<{ kind: "opened"; doc: PDFDocumentProxy; destroy: () => void }>;

// Opens the PDF with pdf.js running on the calling thread (the dedicated
// inspection worker in production). pdf.js would otherwise spawn a nested
// worker of its own, so the module's message handler is registered on
// globalThis and parsing happens on the same thread.
const openPdfForText = async (
	bytes: Uint8Array<ArrayBuffer>,
	signal?: AbortSignal,
): Promise<OpenedPdf> => {
	if (signal?.aborted) {
		throw new DOMException("Inspection cancelled", "AbortError");
	}
	if (!hasPdfHeader(bytes)) {
		return { kind: "not-a-pdf" };
	}

	const [pdfjs, pdfWorkerModule] = await Promise.all([
		import("pdfjs-dist/legacy/build/pdf.mjs"),
		// pdf.worker.mjs ships no type declarations; its namespace is only
		// forwarded to pdf.js itself.
		// @ts-expect-error
		import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
	]);
	(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorkerModule;

	// pdf.js assumes exclusive ownership of its input buffer and may detach it,
	// so every parse receives a private copy of the document bytes.
	const privateCopy = new Uint8Array(new ArrayBuffer(bytes.length));
	privateCopy.set(bytes);
	const loadingTask = pdfjs.getDocument({
		data: privateCopy,
		useSystemFonts: false,
	});
	const abortDuringLoad = (): void => {
		void loadingTask.destroy();
	};
	signal?.addEventListener("abort", abortDuringLoad, { once: true });
	try {
		const doc = await loadingTask.promise;
		return {
			kind: "opened",
			doc,
			destroy: (): void => {
				void loadingTask.destroy();
			},
		};
	} catch (loadError: unknown) {
		if (signal?.aborted) {
			throw new DOMException("Inspection cancelled", "AbortError");
		}
		if (
			loadError instanceof Error &&
			loadError.name === "PasswordException"
		) {
			return { kind: "encrypted" };
		}
		return { kind: "damaged" };
	} finally {
		signal?.removeEventListener("abort", abortDuringLoad);
	}
};

const collectPageTexts = async (
	doc: PDFDocumentProxy,
	signal?: AbortSignal,
): Promise<readonly string[]> => {
	const pageTexts: string[] = [];
	let sawAnyText = false;
	for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
		if (signal?.aborted) {
			throw new DOMException("Inspection cancelled", "AbortError");
		}
		const page = await doc.getPage(pageNumber);
		const content = await page.getTextContent();
		const text = content.items
			.map((item) => ("str" in item ? item.str : ""))
			.join(" ");
		if (text.trim().length > 0) {
			sawAnyText = true;
		}
		pageTexts.push(normalizeWhitespace(text));
	}
	if (!sawAnyText) {
		throw new NoTextLayerError();
	}
	return pageTexts;
};

class NoTextLayerError extends Error {
	constructor() {
		super("PDF has no extractable text layer");
		this.name = "NoTextLayerError";
	}
}

export const extractPdfTextLayer = async (
	bytes: Uint8Array<ArrayBuffer>,
	options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<PdfTextLayerOutcome> => {
	const opened = await openPdfForText(bytes, options.signal);
	if (opened.kind !== "opened") {
		return { outcome: opened.kind };
	}
	const { doc, destroy } = opened;
	try {
		const pageTexts = await collectPageTexts(doc, options.signal);
		return { outcome: "text", pageTexts };
	} catch (error: unknown) {
		if (error instanceof NoTextLayerError) {
			return { outcome: "no-text-layer" };
		}
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
		return { outcome: "damaged" };
	} finally {
		destroy();
	}
};

export const extractPdfLines = async (
	bytes: Uint8Array<ArrayBuffer>,
	options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<PdfLinesOutcome> => {
	const opened = await openPdfForText(bytes, options.signal);
	if (opened.kind !== "opened") {
		return { outcome: opened.kind };
	}
	const { doc, destroy } = opened;
	try {
		const pages: (readonly PdfLineGeometry[])[] = [];
		for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
			if (options.signal?.aborted) {
				throw new DOMException("Inspection cancelled", "AbortError");
			}
			const page = await doc.getPage(pageNumber);
			const content = await page.getTextContent();
			const lines: PdfLineGeometry[] = [];
			for (const item of content.items) {
				if (!("str" in item)) {
					continue;
				}
				lines.push({
					text: item.str,
					x: item.transform[4] ?? 0,
					y: item.transform[5] ?? 0,
					width: item.width,
					height: item.height,
				});
			}
			pages.push(lines);
		}
		return { outcome: "text", pages };
	} catch (error: unknown) {
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
		return { outcome: "damaged" };
	} finally {
		destroy();
	}
};
