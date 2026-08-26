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
import { extractEpayTaxPayment } from "./receipt-extraction";
import { EPAY_REQUIRED_MARKERS, EPAY_REVISION_MARKER } from "./receipt-layout";

const EPAY_PDF_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "epay-tax-receipt-pdf",
	adapterVersion: "1",
	documentKind: parseDocumentKind("epay-tax-receipt-pdf"),
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

// The supported-revision check runs at inspection exactly as Form 26AS runs
// its own: the assessment year is part of the template identity, so a
// receipt printed for another year is a changed template and fails
// identification instead of surfacing as an extraction-time review issue.
const isSupportedEpayRevision = (outcome: Extract<
	PdfLinesOutcome,
	{ outcome: "text" }
>): boolean =>
	normalizedTextContainsAll(
		outcome.pages.map((lines) => lines.map((line) => line.text).join("\n")).join("\n"),
		[...EPAY_REQUIRED_MARKERS, EPAY_REVISION_MARKER],
	);

export const createEpayTaxPdfAdapter = (): SourceDocumentAdapter => ({
	manifest: EPAY_PDF_MANIFEST,
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
				return isSupportedEpayRevision(linesOutcome)
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
		if (!isSupportedEpayRevision(linesOutcome)) {
			return createExtractionRejectionOutcome("unknown-format", input.identity);
		}

		const { taxPaymentObservations, issues } = extractEpayTaxPayment({
			pages: linesOutcome.pages,
			sourceDocumentId: input.identity,
			adapter: EPAY_PDF_MANIFEST,
		});
		return {
			kind: "extracted",
			observations: [],
			bankInterestObservations: [],
			nonSalaryIncomeObservations: [],
			tdsObservations: [],
			taxPaymentObservations,
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
