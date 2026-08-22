import type { DocumentAdapterManifest } from "../registry";
import type {
	AdapterVerdict,
	SourceDocumentAdapter,
} from "../registry";
import {
	extractPdfTextLayer,
	normalizedTextContainsAll,
} from "./pdf-text-layer";

// Shared inspection behavior for PDF adapters that identify their document
// through required text markers in the extracted text layer.
export const createPdfMarkerAdapter = (
	manifest: DocumentAdapterManifest,
	requiredMarkers: readonly string[],
): SourceDocumentAdapter => ({
	manifest,
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
				return normalizedTextContainsAll(fullText, requiredMarkers)
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
