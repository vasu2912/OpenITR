import type { ExactMoney } from "../money/exact-money";
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

// An RFC 6901 JSON Pointer into the parsed source document, so a structured
// export can point at the exact node its value was read from.
export type JsonPointerEvidenceLocator = Readonly<{
	kind: "json-pointer";
	pointer: string;
}>;

export type EvidenceLocator =
	| PdfEvidenceLocator
	| JsonPointerEvidenceLocator;

export type ObservationTransformationOperation =
	| "trim-whitespace"
	| "strip-currency-prefix"
	| "remove-indian-digit-grouping"
	| "parse-whole-rupees"
	| "parse-exact-rupees";

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
	evidence: PdfEvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
}>;

export type BankInterestObservation = Readonly<{
	observationId: string;
	factKey: FactKey;
	sourceDocumentId: Sha256Digest;
	adapterId: string;
	adapterVersion: string;
	originalValue: string;
	normalizedValue: ExactMoney;
	transformationSteps: readonly ObservationTransformationStep[];
	evidence: JsonPointerEvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
}>;
