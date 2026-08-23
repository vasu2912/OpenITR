import type {
	DocumentExtractionOutcome,
	DocumentReviewIssue,
	InspectableSourceDocument,
	ObservationTransformationStep,
	SalaryObservation,
} from "@openitr/model";
import {
	createExtractionRejectionOutcome,
	DOCUMENT_REVIEW_ISSUE_CODES,
	SALARY_FIELD_AMBIGUOUS_RECOVERY_ACTION,
	SALARY_FIELD_MISSING_RECOVERY_ACTION,
} from "@openitr/model";
import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type { PdfLineGeometry } from "../pdf/pdf-text-layer";
import {
	extractPdfLines,
	normalizedTextContainsAll,
} from "../pdf/pdf-text-layer";
import type {
	AdapterVerdict,
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";
import { FORM16_SALARY_FIELD_DEFINITIONS } from "./form16-field-definitions";

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

const normalizeWhitespace = (text: string): string =>
	text.replace(/\s+/g, " ").trim();

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

const form16MarkersPresent = (
	pages: readonly (readonly PdfLineGeometry[])[],
): boolean =>
	normalizedTextContainsAll(
		pages.map((lines) => lines.map((line) => line.text).join("\n")).join("\n"),
		FORM16_REQUIRED_MARKERS,
	);

// Every step of the rupee normalization is recorded in order. A step that
// changes nothing is still recorded so the review screen can show the whole
// pipeline without reverse-engineering it.
const RUPEE_CURRENCY_PREFIX = /^Rs\.?\s*/i;

const parseRupeeAmount = (
	raw: string,
): { steps: ObservationTransformationStep[]; value: number } | undefined => {
	const trimmed = normalizeWhitespace(raw);
	const withoutCurrency = trimmed.replace(RUPEE_CURRENCY_PREFIX, "");
	const digitsWithoutGrouping = withoutCurrency.replace(/,/g, "");
	if (!/^[0-9]+$/.test(digitsWithoutGrouping)) {
		return undefined;
	}
	const value = Number.parseInt(digitsWithoutGrouping, 10);
	if (!Number.isSafeInteger(value) || value < 0) {
		return undefined;
	}
	return {
		value,
		steps: [
			{
				order: 1,
				operation: "trim-whitespace",
				input: raw,
				output: trimmed,
			},
			{
				order: 2,
				operation: "strip-currency-prefix",
				input: trimmed,
				output: withoutCurrency,
			},
			{
				order: 3,
				operation: "remove-indian-digit-grouping",
				input: withoutCurrency,
				output: digitsWithoutGrouping,
			},
			{
				order: 4,
				operation: "parse-whole-rupees",
				input: digitsWithoutGrouping,
				output: String(value),
			},
		],
	};
};

const extractSalaryObservations = (
	pages: readonly (readonly PdfLineGeometry[])[],
	identity: InspectableSourceDocument["identity"],
): {
	observations: SalaryObservation[];
	issues: DocumentReviewIssue[];
} => {
	const linesWithPages = pages.flatMap((lines, pageIndex) =>
		lines.map((line) => ({ ...line, page: pageIndex + 1 })),
	);

	const observations: SalaryObservation[] = [];
	const issues: DocumentReviewIssue[] = [];

	for (const field of FORM16_SALARY_FIELD_DEFINITIONS) {
		const label = normalizeWhitespace(field.label);
		const matches = linesWithPages.filter((line) =>
			normalizeWhitespace(line.text).startsWith(label),
		);
		if (matches.length > 1) {
			issues.push({
				code: DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldAmbiguous,
				severity: "review",
				affectedFactKeys: [field.factKey],
				recoveryAction: SALARY_FIELD_AMBIGUOUS_RECOVERY_ACTION,
			});
			continue;
		}

		const line = matches[0];
		// The reviewed revision prints "label: Rs amount"; a row without the
		// separator carries no parseable amount and is reported missing.
		const amountSeparator = line?.text.lastIndexOf(":") ?? -1;
		const parsed =
			line !== undefined && amountSeparator >= 0
				? parseRupeeAmount(line.text.slice(amountSeparator + 1))
				: undefined;

		if (line === undefined || parsed === undefined) {
			issues.push({
				code: DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldMissing,
				severity: "review",
				affectedFactKeys: [field.factKey],
				recoveryAction: SALARY_FIELD_MISSING_RECOVERY_ACTION,
			});
			continue;
		}

		observations.push({
			observationId: `${field.factKey}@${identity}`,
			factKey: field.factKey,
			sourceDocumentId: identity,
			adapterId: FORM16_PDF_MANIFEST.adapterId,
			adapterVersion: FORM16_PDF_MANIFEST.adapterVersion,
			originalText: line.text,
			normalizedValue: parsed.value,
			transformationSteps: parsed.steps,
			evidence: {
				kind: "pdf-page-region",
				page: line.page,
				x: line.x,
				y: line.y,
				width: line.width,
				height: line.height,
			},
			ruleCitation: {
				ruleId: field.ruleId,
				description: field.description,
			},
		});
	}

	observations.sort((first, second) =>
		first.factKey.localeCompare(second.factKey),
	);
	return { observations, issues };
};

export const createForm16PdfAdapter = (): SourceDocumentAdapter => ({
	manifest: FORM16_PDF_MANIFEST,
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
		return form16MarkersPresent(linesOutcome.pages)
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
		if (!form16MarkersPresent(linesOutcome.pages)) {
			return createExtractionRejectionOutcome("unknown-format", input.identity);
		}

		const { observations, issues } = extractSalaryObservations(
			linesOutcome.pages,
			input.identity,
		);
		return {
			kind: "extracted",
			observations,
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
