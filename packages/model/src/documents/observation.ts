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

// One cell in a spreadsheet source document, keeping the reviewed sheet and
// column header names, the cell's A1-style address, its 1-based row, the
// zero-based column position, and the cell's exact stored text, so a
// workbook export can point back to the exact value it was read from.
export type SpreadsheetEvidenceLocator = Readonly<{
	kind: "spreadsheet-cell";
	sheet: string;
	cell: string;
	rowNumber: number;
	columnIndex: number;
	columnHeader: string;
	rawValue: string;
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
	evidence: PdfEvidenceLocator | JsonPointerEvidenceLocator;
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
export type TdsSourceRecord =
	| TextTdsSourceRecord
	| SpreadsheetTdsSourceRecord
	| JsonTdsSourceRecord
	| PdfTdsSourceRecord;

// A Part I record read from the plain-text export. The record occupies one
// line, so its location is that line's 1-based number.
export type TextTdsSourceRecord = Readonly<{
	medium: "text";
	serialNumber: string;
	deductorName: string;
	deductorTan: string;
	firstLine: number;
	lastLine: number;
	amountPaidCreditedRaw: string | undefined;
	taxDeductedRaw: string | undefined;
	tdsDepositedRaw: string | undefined;
}>;

// A Part I record read from a spreadsheet export. The record occupies one
// row of the reviewed sheet, so its location is that sheet and the row's
// 1-based number.
export type SpreadsheetTdsSourceRecord = Readonly<{
	medium: "spreadsheet";
	sheet: string;
	rowNumber: number;
	serialNumber: string;
	deductorName: string;
	deductorTan: string;
	amountPaidCreditedRaw: string | undefined;
	taxDeductedRaw: string | undefined;
	tdsDepositedRaw: string | undefined;
}>;

// A record read from a structured JSON source document. The record occupies
// one array node, so its location is the RFC 6901 pointer to that node. An
// undefined raw value means the property was absent; an empty string means
// it carried an empty value. Both states stay unknown and never become zero.
export type JsonTdsSourceRecord = Readonly<{
	medium: "json";
	pointer: string;
	serialNumber: string;
	deductorName: string;
	deductorTan: string;
	amountPaidCreditedRaw: string | undefined;
	taxDeductedRaw: string | undefined;
	tdsDepositedRaw: string | undefined;
}>;

// A summary-table record read from a machine-generated TDS-certificate PDF.
// The record occupies one printed table row, so its location is that row's
// page and its 1-based row number within the certificate's summary table.
export type PdfTdsSourceRecord = Readonly<{
	medium: "pdf";
	page: number;
	rowNumber: number;
	serialNumber: string;
	deductorName: string;
	deductorTan: string;
	amountPaidCreditedRaw: string | undefined;
	taxDeductedRaw: string | undefined;
	tdsDepositedRaw: string | undefined;
}>;

export type NonSalaryIncomeObservation = Readonly<{
	observationId: string;
	factKey: FactKey;
	sourceDocumentId: Sha256Digest;
	adapterId: string;
	adapterVersion: string;
	originalText: string;
	normalizedValue: ExactMoney;
	transformationSteps: readonly ObservationTransformationStep[];
	evidence: PdfEvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
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
	evidence:
		| PdfEvidenceLocator
		| TextLineRangeEvidenceLocator
		| SpreadsheetEvidenceLocator
		| JsonPointerEvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
	record: TdsSourceRecord;
}>;

// The receipt-level details of one e-Pay Tax challan payment, exactly as the
// official receipt printed them. The challan identity (BSR code, serial
// number, and receipt date) is what distinguishes one government payment
// from another, so a later duplicate check can compare receipts by it.
export type EpayTaxReceiptSourceRecord = Readonly<{
	medium: "pdf";
	page: number;
	taxpayerName: string;
	taxpayerPan: string;
	assessmentYear: string;
	bsrCode: string;
	challanSerialNumber: string;
	paymentDateDayMonthYear: string;
	typeOfPaymentCode: string;
	typeOfPaymentLabel: string;
	bankReferenceNumber: string;
	totalAmountRaw: string;
}>;

export type TaxPaymentObservation = Readonly<{
	observationId: string;
	factKey: FactKey;
	sourceDocumentId: Sha256Digest;
	adapterId: string;
	adapterVersion: string;
	originalValue: string;
	normalizedValue: ExactMoney;
	transformationSteps: readonly ObservationTransformationStep[];
	evidence: PdfEvidenceLocator;
	ruleCitation: ExtractionRuleCitation;
	record: EpayTaxReceiptSourceRecord;
}>;

// One canonical phrase naming a paid challan, so the estimate result and the
// review UI cannot drift apart when describing the same receipt.
export const epayChallanReferenceOf = (
	record: EpayTaxReceiptSourceRecord,
): string =>
	`BSR ${record.bsrCode} · Serial ${record.challanSerialNumber} · dated ${record.paymentDateDayMonthYear}`;
