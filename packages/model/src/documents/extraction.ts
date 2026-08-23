import type { FactKey } from "../primitives";
import { parseIssueCode } from "../primitives";
import type { IssueCode, Sha256Digest } from "../primitives";
import type {
	DocumentInspectionIssue,
	DocumentRejection,
} from "./inspection-outcome";
import type { SalaryObservation } from "./observation";

export const DOCUMENT_REVIEW_ISSUE_CODES = Object.freeze({
	salaryFieldMissing: parseIssueCode("DOCUMENT_SALARY_FIELD_MISSING"),
	salaryFieldAmbiguous: parseIssueCode("DOCUMENT_SALARY_FIELD_AMBIGUOUS"),
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
			issues: readonly DocumentReviewIssue[];
			pages: readonly EvidencePage[];
	  }>
	| Readonly<{
			candidateKey: number;
			documentId: Sha256Digest;
			status: "failed";
			issue: DocumentInspectionIssue;
	  }>;
