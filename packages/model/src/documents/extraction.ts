import type { FactKey } from "../primitives";
import { parseIssueCode } from "../primitives";
import type { IssueCode, Sha256Digest } from "../primitives";
import type {
	DocumentInspectionIssue,
	DocumentRejection,
} from "./inspection-outcome";
import type {
	BankInterestObservation,
	SalaryObservation,
} from "./observation";

export const DOCUMENT_REVIEW_ISSUE_CODES = Object.freeze({
	salaryFieldMissing: parseIssueCode("DOCUMENT_SALARY_FIELD_MISSING"),
	salaryFieldAmbiguous: parseIssueCode("DOCUMENT_SALARY_FIELD_AMBIGUOUS"),
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

export const BANK_INTEREST_SECTION_MISSING_RECOVERY_ACTION =
	"Select an AIS JSON export of the supported revision that includes the bank-interest section, or continue without bank-interest facts.";

export const BANK_INTEREST_RECORD_MALFORMED_RECOVERY_ACTION =
	"Select an unmodified official AIS JSON export so every bank-interest record carries its category, institution, account, and amount.";

export const BANK_INTEREST_RECORD_AMBIGUOUS_RECOVERY_ACTION =
	"Select the official AIS JSON export for the assessment year so each bank account appears once with one interest amount.";

export const BANK_INTEREST_CATEGORY_UNKNOWN_RECOVERY_ACTION =
	"Select an AIS JSON export whose bank-interest records use the categories this revision defines.";

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
			issues: readonly DocumentReviewIssue[];
			pages: readonly EvidencePage[];
	  }>
	| Readonly<{
			candidateKey: number;
			documentId: Sha256Digest;
			status: "failed";
			issue: DocumentInspectionIssue;
	  }>;
