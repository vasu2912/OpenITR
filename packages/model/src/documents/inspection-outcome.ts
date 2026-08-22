import type { IssueCode, Sha256Digest } from "../primitives";
import { parseIssueCode } from "../primitives";

export type DocumentKind = string & {
	readonly __brand: "DocumentKind";
};

export type TemplateRevision = string & {
	readonly __brand: "TemplateRevision";
};

const isDocumentKind = (value: string): value is DocumentKind =>
	/^[a-z][a-z0-9-]+$/.test(value);

const isTemplateRevision = (value: string): value is TemplateRevision =>
	/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(value);

export const parseDocumentKind = (value: string): DocumentKind => {
	if (!isDocumentKind(value)) {
		throw new Error(`Invalid document kind: ${value}`);
	}
	return value;
};

export const parseTemplateRevision = (value: string): TemplateRevision => {
	if (!isTemplateRevision(value)) {
		throw new Error(`Invalid template revision: ${value}`);
	}
	return value;
};

export const DOCUMENT_ISSUE_CODES = Object.freeze({
	fileEncrypted: parseIssueCode("FILE_ENCRYPTED"),
	documentDamaged: parseIssueCode("DOCUMENT_DAMAGED"),
	documentImageOnly: parseIssueCode("DOCUMENT_IMAGE_ONLY"),
	documentAmbiguousMatch: parseIssueCode("DOCUMENT_AMBIGUOUS_MATCH"),
	documentPrivateInstitutionTemplate: parseIssueCode(
		"DOCUMENT_PRIVATE_INSTITUTION_TEMPLATE",
	),
	documentUnknownFormat: parseIssueCode("DOCUMENT_UNKNOWN_FORMAT"),
	documentInspectionFailed: parseIssueCode("DOCUMENT_INSPECTION_FAILED"),
});

export const INSPECTION_FAILED_RECOVERY_ACTION =
	"Select the document again. If the same document fails every time, report the incident code shown with this message.";

export const createInspectionFailedOutcome = (
	identity: Sha256Digest,
): DocumentInspectionOutcome => ({
	kind: "rejected",
	rejection: "inspection-failed",
	issue: {
		code: DOCUMENT_ISSUE_CODES.documentInspectionFailed,
		severity: "blocking",
		affectedDocumentIds: [identity],
		recoveryAction: INSPECTION_FAILED_RECOVERY_ACTION,
	},
});

export type DocumentRejection =
	| "encrypted"
	| "damaged"
	| "image-only"
	| "ambiguous"
	| "private-institution"
	| "unknown-format"
	| "inspection-failed";

export type DocumentInspectionIssue = Readonly<{
	code: IssueCode;
	severity: "blocking" | "review" | "warning" | "information";
	affectedDocumentIds: readonly Sha256Digest[];
	recoveryAction: string;
}>;

export type DocumentInspectionOutcome =
	| Readonly<{
			kind: "identified";
			document: Readonly<{
				documentKind: DocumentKind;
				templateRevision: TemplateRevision;
			}>;
			adapter: Readonly<{
				adapterId: string;
				adapterVersion: string;
			}>;
	  }>
	| Readonly<{
			kind: "rejected";
			rejection: DocumentRejection;
			issue: DocumentInspectionIssue;
	  }>;

export type InspectableSourceDocument = Readonly<{
	identity: Sha256Digest;
	displayName: string;
	suppliedMediaType?: string;
	bytes: Uint8Array<ArrayBuffer>;
}>;
