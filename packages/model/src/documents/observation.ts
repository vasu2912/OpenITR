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

// A 1-based inclusive line range into a plain-text source document, so a
// text export can point at the exact record its values were read from.
export type TextLineRangeEvidenceLocator = Readonly<{
	kind: "text-line-range";
	firstLine: number;
	lastLine: number;
}>;

// A record row and column in a CSV source document, keeping the 1-based
// source line of the record, the zero-based column position with its
// reviewed header text, and the cell's exact characters including any
// quoting, so a CSV export can point back to the exact value it was read
// from.
export type CsvEvidenceLocator = Readonly<{
	kind: "csv-record-column";
	line: number;
	columnIndex: number;
	columnHeader: string;
	rawValue: string;
}>;

export type EvidenceLocator =
	| PdfEvidenceLocator
	| JsonPointerEvidenceLocator
	| TextLineRangeEvidenceLocator
	| CsvEvidenceLocator;

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
	evidence: JsonPointerEvidenceLocator | CsvEvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
}>;

// The source-record details of one Form 26AS Part I record, exactly as the
// export printed them. An undefined raw value means the export printed no
// cell; an empty string means it printed a blank one. Both states stay
// unknown and never become zero.
export type TdsSourceRecord = Readonly<{
	serialNumber: string;
	deductorName: string;
	deductorTan: string;
	firstLine: number;
	lastLine: number;
	amountPaidCreditedRaw: string | undefined;
	taxDeductedRaw: string | undefined;
	tdsDepositedRaw: string | undefined;
}>;

export type TdsObservation = Readonly<{
	observationId: string;
	factKey: FactKey;
	sourceDocumentId: Sha256Digest;
	adapterId: string;
	adapterVersion: string;
	originalValue: string;
	normalizedValue: ExactMoney;
	transformationSteps: readonly ObservationTransformationStep[];
	evidence: TextLineRangeEvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
	record: TdsSourceRecord;
}>;
