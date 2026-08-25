import type { DocumentExtractionOutcome } from "@openitr/model";
import { createExtractionRejectionOutcome } from "@openitr/model";
import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type { PdfLinesOutcome } from "../pdf/pdf-text-layer";
import { extractPdfLines, normalizedTextContainsAll } from "../pdf/pdf-text-layer";
import type {
	AdapterVerdict,
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";
import { extractForm16APaymentSummary } from "./form16a-summary-extraction";

const FORM16A_REQUIRED_MARKERS = [
	"FORM 16A",
	"Certificate under section 203(2A) of the Income-tax Act, 1961",
] as const;

export const FORM16A_PDF_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "form16a-pdf",
	adapterVersion: "1",
	documentKind: parseDocumentKind("form16a-pdf"),
	templateRevision: parseTemplateRevision("2026-27"),
});

// Extraction reports a bare PDF as an unknown-format rejection; inspection
// reports it as no-match.
const EXTRACTION_REJECTIONS = {
	encrypted: "encrypted",
	damaged: "damaged",
	"not-a-pdf": "unknown-format",
	"no-text-layer": "image-only",
} as const;

const form16aMarkersPresent = (outcome: Extract<
	PdfLinesOutcome,
	{ outcome: "text" }
>): boolean =>
	normalizedTextContainsAll(
		outcome.pages.map((lines) => lines.map((line) => line.text).join("\n")).join("\n"),
		FORM16A_REQUIRED_MARKERS,
	);

export const createForm16APdfAdapter = (): SourceDocumentAdapter => ({
	manifest: FORM16A_PDF_MANIFEST,
	inspect: async (input, options = {}): Promise<AdapterVerdict> => {
		const linesOutcome = await extractPdfLines(input.bytes, options);
		switch (linesOutcome.outcome) {
			case "not-a-pdf":
				return { verdict: "no-match" };
			case "encrypted":
				return { verdict: "rejected", rejection: "encrypted" };
			case "damaged":
				return { verdict: "rejected", rejection: "damaged" };
			case "no-text-layer":
				return { verdict: "rejected", rejection: "image-only" };
			case "text":
				return form16aMarkersPresent(linesOutcome)
					? { verdict: "exact-match" }
					: { verdict: "no-match" };
			default: {
				const _exhaustive: never = linesOutcome;
				return _exhaustive;
			}
		}
	},
	extract: async (input, options = {}): Promise<DocumentExtractionOutcome> => {
		const linesOutcome = await extractPdfLines(input.bytes, options);
		if (linesOutcome.outcome !== "text") {
			return createExtractionRejectionOutcome(
				EXTRACTION_REJECTIONS[linesOutcome.outcome],
				input.identity,
			);
		}
		if (!form16aMarkersPresent(linesOutcome)) {
			return createExtractionRejectionOutcome("unknown-format", input.identity);
		}

		const { incomeObservations, tdsObservations, issues } =
			extractForm16APaymentSummary({
				pages: linesOutcome.pages,
				sourceDocumentId: input.identity,
				adapter: FORM16A_PDF_MANIFEST,
			});
		return {
			kind: "extracted",
			observations: [],
			bankInterestObservations: [],
			nonSalaryIncomeObservations: incomeObservations,
			tdsObservations,
			issues,
			pages: linesOutcome.pages.map((lines, pageIndex) => ({
				page: pageIndex + 1,
				lines: lines.map((line, lineNumber) => ({
					lineNumber: lineNumber + 1,
					text: line.text,
				})),
			})),
		};
	},
});
