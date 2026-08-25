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

// Inspection reports a bare PDF as no-match; extraction reports it as an
// unknown-format rejection.
const INSPECTION_REJECTIONS = {
	encrypted: "encrypted",
	damaged: "damaged",
	"no-text-layer": "image-only",
} as const;

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
		if (linesOutcome.outcome === "not-a-pdf") {
			return { verdict: "no-match" };
		}
		if (linesOutcome.outcome !== "text") {
			return {
				verdict: "rejected",
				rejection:
					INSPECTION_REJECTIONS[
						linesOutcome.outcome as keyof typeof INSPECTION_REJECTIONS
					],
			};
		}
		return form16aMarkersPresent(linesOutcome)
			? { verdict: "exact-match" }
			: { verdict: "no-match" };
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
