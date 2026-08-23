import type { FactKey, RuleId, Sha256Digest } from "../primitives";

// Coordinates are PDF user-space points with the origin at the page's
// bottom-left corner, matching the values pdf.js reports for text items.
export type PdfEvidenceLocator = Readonly<{
	kind: "pdf-page-region";
	page: number;
	x: number;
	y: number;
	width: number;
	height: number;
}>;

export type EvidenceLocator = PdfEvidenceLocator;

export type ObservationTransformationOperation =
	| "trim-whitespace"
	| "strip-currency-prefix"
	| "remove-indian-digit-grouping"
	| "parse-whole-rupees";

export type ObservationTransformationStep = Readonly<{
	order: number;
	operation: ObservationTransformationOperation;
	input: string;
	output: string;
}>;

export type ExtractionRuleCitation = Readonly<{
	ruleId: RuleId;
	description: string;
}>;

export type SalaryObservation = Readonly<{
	observationId: string;
	factKey: FactKey;
	sourceDocumentId: Sha256Digest;
	adapterId: string;
	adapterVersion: string;
	originalText: string;
	normalizedValue: number;
	transformationSteps: readonly ObservationTransformationStep[];
	evidence: EvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
}>;
