import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type {
	AdapterVerdict,
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";
import {
	extractPdfTextLayer,
	normalizedTextContainsAll,
} from "../pdf/pdf-text-layer";

const FORM16_REQUIRED_MARKERS = [
	"PART A",
	"Certificate under section 203 of the Income-tax Act, 1961",
] as const;

export const FORM16_PDF_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "form16-pdf",
	adapterVersion: "1",
	documentKind: parseDocumentKind("form16-pdf"),
	templateRevision: parseTemplateRevision("2026-27"),
});

export const createForm16PdfAdapter = (): SourceDocumentAdapter => ({
	manifest: FORM16_PDF_MANIFEST,
	inspect: async (input, options): Promise<AdapterVerdict> => {
		const extraction = await extractPdfTextLayer(input.bytes, options);
		switch (extraction.outcome) {
			case "encrypted":
				return { verdict: "rejected", rejection: "encrypted" };
			case "not-a-pdf":
				return { verdict: "no-match" };
			case "damaged":
				return { verdict: "rejected", rejection: "damaged" };
			case "no-text-layer":
				return { verdict: "rejected", rejection: "image-only" };
			case "text": {
				const fullText = extraction.pageTexts.join("\n");
				return normalizedTextContainsAll(fullText, FORM16_REQUIRED_MARKERS)
					? { verdict: "exact-match" }
					: { verdict: "no-match" };
			}
			default: {
				const _exhaustive: never = extraction;
				return _exhaustive;
			}
		}
	},
});
