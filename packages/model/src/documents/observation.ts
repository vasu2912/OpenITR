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

export const OBSERVATION_TRANSFORMATION_OPERATIONS = [
	"trim-whitespace",
	"strip-currency-prefix",
	"remove-indian-digit-grouping",
	"parse-whole-rupees",
] as const;

export type ObservationTransformationOperation =
	(typeof OBSERVATION_TRANSFORMATION_OPERATIONS)[number];

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

// Deterministic per source document and fact key:
// `${factKey}@${sourceDocumentId}`.
export const parseObservationId = (value: string): string => {
	if (!/^[a-z0-9.-]+@[a-f0-9]{64}$/.test(value)) {
		throw new Error(`Invalid observation id: ${value}`);
	}
	return value;
};

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
