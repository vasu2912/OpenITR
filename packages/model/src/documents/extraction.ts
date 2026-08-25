import type { FactKey } from "../primitives";
import { parseIssueCode } from "../primitives";
import type { IssueCode, Sha256Digest } from "../primitives";
import type {
	DocumentInspectionIssue,
	DocumentRejection,
} from "./inspection-outcome";
import type {
	BankInterestObservation,
	NonSalaryIncomeObservation,
	SalaryObservation,
	TdsObservation,
} from "./observation";

export const DOCUMENT_REVIEW_ISSUE_CODES = Object.freeze({
	salaryFieldMissing: parseIssueCode("DOCUMENT_SALARY_FIELD_MISSING"),
	salaryFieldAmbiguous: parseIssueCode("DOCUMENT_SALARY_FIELD_AMBIGUOUS"),
	salaryFieldMalformed: parseIssueCode("DOCUMENT_SALARY_FIELD_MALFORMED"),
	bankInterestSectionMissing: parseIssueCode(
		"DOCUMENT_BANK_INTEREST_SECTION_MISSING",
	),
	bankInterestRecordMalformed: parseIssueCode(
		"DOCUMENT_BANK_INTEREST_RECORD_MALFORMED",
	),
	bankInterestRecordAmbiguous: parseIssueCode(
		"DOCUMENT_BANK_INTEREST_RECORD_AMBIGUOUS",
	),
	bankInterestCategoryUnknown: parseIssueCode(
		"DOCUMENT_BANK_INTEREST_CATEGORY_UNKNOWN",
	),
	tdsSectionMissing: parseIssueCode("DOCUMENT_TDS_SECTION_MISSING"),
	tdsColumnHeaderMalformed: parseIssueCode(
		"DOCUMENT_TDS_COLUMN_HEADER_MALFORMED",
	),
	tdsRecordMalformed: parseIssueCode("DOCUMENT_TDS_RECORD_MALFORMED"),
	form16aSectionMissing: parseIssueCode(
		"DOCUMENT_FORM16A_SUMMARY_SECTION_MISSING",
	),
	form16aColumnHeaderMalformed: parseIssueCode(
		"DOCUMENT_FORM16A_SUMMARY_COLUMN_HEADER_MALFORMED",
	),
	form16aRecordMalformed: parseIssueCode("DOCUMENT_FORM16A_RECORD_MALFORMED"),
	form16aRecordAmbiguous: parseIssueCode("DOCUMENT_FORM16A_RECORD_AMBIGUOUS"),
	form16aCategoryUnknown: parseIssueCode("DOCUMENT_FORM16A_CATEGORY_UNKNOWN"),
});

export type DocumentReviewIssue = Readonly<{
	code: IssueCode;
	severity: "review";
	affectedFactKeys: readonly FactKey[];
	recoveryAction: string;
}>;

export const SALARY_FIELD_MISSING_RECOVERY_ACTION =
	"Select a Form 16 PDF of the supported revision that prints this field, or continue with an attested answer where the rule pack permits one.";

export const SALARY_FIELD_AMBIGUOUS_RECOVERY_ACTION =
	"Select the official Form 16 download for the assessment year so each salary field appears exactly once.";

export const SALARY_FIELD_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official export so every printed salary field carries its amount as the reviewed layout prints it.";

export const BANK_INTEREST_SECTION_MISSING_RECOVERY_ACTION =
	"Select an official AIS export of the supported revision that includes the bank-interest section, or continue without bank-interest facts.";

export const BANK_INTEREST_RECORD_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official AIS export so every bank-interest record carries its category, institution, account, and amount.";

export const BANK_INTEREST_RECORD_AMBIGUOUS_RECOVERY_ACTION =
	"Select the official AIS export for the assessment year so each bank account appears once with one interest amount.";

export const BANK_INTEREST_CATEGORY_UNKNOWN_RECOVERY_ACTION =
	"Select an official AIS export whose bank-interest records use the categories this revision defines.";

export const TDS_SECTION_MISSING_RECOVERY_ACTION =
	"Select a Form 26AS text export of the supported revision that includes Part I - Tax Deducted at Source, or continue without tax-deducted-at-source facts.";

export const TDS_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official Form 26AS text export so Part I prints the reviewed column header row.";

export const TDS_RECORD_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official Form 26AS text export so every Part I record carries its serial number, deductor name, TAN, and amount columns.";

export const PREFILLED_ITR1_TDS_RECORD_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official prefilled ITR-1 JSON export so every TDS-on-salary record carries its serial number, deductor name, TAN, and amount properties.";

export const FORM16A_SUMMARY_SECTION_MISSING_RECOVERY_ACTION =
	"Select a machine-generated Form 16A PDF of the supported revision that prints its Summary of Payment(s) table, or continue without non-salary facts.";

export const FORM16A_SUMMARY_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official Form 16A download so the Summary of Payment(s) table prints the reviewed column header row.";

export const FORM16A_RECORD_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official Form 16A download so every summary record carries its serial number, section, nature of payment, and amount columns.";

export const FORM16A_RECORD_AMBIGUOUS_RECOVERY_ACTION =
	"Select the official Form 16A certificate for the period so each payment appears once with one set of amounts.";

export const FORM16A_CATEGORY_UNKNOWN_RECOVERY_ACTION =
	"Select a Form 16A certificate whose summary records use the sections and natures of payment this revision defines.";

// One snapshot per PDF page, kept in browser memory only. The evidence viewer
// renders these lines beside the observation's locator.
export type EvidencePageLine = Readonly<{
	lineNumber: number;
	text: string;
}>;

export type EvidencePage = Readonly<{
	page: number;
	lines: readonly EvidencePageLine[];
}>;

export type DocumentExtractionOutcome =
	| Readonly<{
			kind: "extracted";
			observations: readonly SalaryObservation[];
			bankInterestObservations: readonly BankInterestObservation[];
			nonSalaryIncomeObservations: readonly NonSalaryIncomeObservation[];
			tdsObservations: readonly TdsObservation[];
			issues: readonly DocumentReviewIssue[];
			pages: readonly EvidencePage[];
	  }>
	| Readonly<{
			kind: "rejected";
			rejection: DocumentRejection;
			issue: DocumentInspectionIssue;
	  }>;

// Session-side record of one document's extraction run. Observations, review
// issues, and evidence pages stay in browser memory only.
export type DocumentExtractionRecord =
	| Readonly<{
			candidateKey: number;
			documentId: Sha256Digest;
			status: "extracting";
	  }>
	| Readonly<{
			candidateKey: number;
			documentId: Sha256Digest;
			status: "done";
			observations: readonly SalaryObservation[];
			bankInterestObservations: readonly BankInterestObservation[];
			nonSalaryIncomeObservations: readonly NonSalaryIncomeObservation[];
			tdsObservations: readonly TdsObservation[];
			issues: readonly DocumentReviewIssue[];
			pages: readonly EvidencePage[];
	  }>
	| Readonly<{
			candidateKey: number;
			documentId: Sha256Digest;
			status: "failed";
			issue: DocumentInspectionIssue;
	  }>;
