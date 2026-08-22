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

export const extractPdfTextLayer = async (
	bytes: Uint8Array<ArrayBuffer>,
	options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<PdfTextLayerOutcome> => {
	const { signal } = options;
	if (signal?.aborted) {
		throw new DOMException("Inspection cancelled", "AbortError");
	}
	if (!hasPdfHeader(bytes)) {
		return { outcome: "not-a-pdf" };
	}

	// pdf.js assumes exclusive ownership of its input buffer and may detach it,
	// so every parse receives a private copy of the document bytes.
	const privateCopy = new Uint8Array(new ArrayBuffer(bytes.length));
	privateCopy.set(bytes);
	// pdf.js would otherwise spawn a nested worker of its own. Parsing already
	// runs inside this dedicated inspection worker, so hand pdf.js its message
	// handler and let it parse on the same thread.
	const [pdfjs, pdfWorkerModule] = await Promise.all([
		import("pdfjs-dist/legacy/build/pdf.mjs"),
		// pdf.worker.mjs ships no type declarations; its namespace is only
		// forwarded to pdf.js itself.
		// @ts-expect-error
		import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
	]);
	(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorkerModule;
	const loadingTask = pdfjs.getDocument({
		data: privateCopy,
		useSystemFonts: false,
	});
	// A cancel that arrives while pdf.js is still parsing must stop the parse.
	const abortDuringLoad = (): void => {
		void loadingTask.destroy();
	};
	signal?.addEventListener("abort", abortDuringLoad, { once: true });
	let doc: Awaited<typeof loadingTask.promise> | undefined;
	try {
		doc = await loadingTask.promise;
	} catch (loadError: unknown) {
		if (signal?.aborted) {
			throw new DOMException("Inspection cancelled", "AbortError");
		}
		if (
			loadError instanceof Error &&
			loadError.name === "PasswordException"
		) {
			return { outcome: "encrypted" };
		}
		return { outcome: "damaged" };
	} finally {
		signal?.removeEventListener("abort", abortDuringLoad);
	}

	try {
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
		return sawAnyText
			? { outcome: "text", pageTexts }
			: { outcome: "no-text-layer" };
	} catch (error: unknown) {
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
		return { outcome: "damaged" };
	} finally {
		void loadingTask.destroy();
	}
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
