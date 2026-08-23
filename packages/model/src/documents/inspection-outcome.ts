import type { IssueCode, Sha256Digest } from "../primitives";
import { parseIssueCode } from "../primitives";
import type { DocumentExtractionOutcome } from "./extraction";

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
	documentExtractionUnsupported: parseIssueCode(
		"DOCUMENT_EXTRACTION_UNSUPPORTED",
	),
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
	| "extraction-unsupported"
	| "inspection-failed";

const DOCUMENT_REJECTION_RECOVERY_ACTIONS: Readonly<
	Record<DocumentRejection, string>
> = Object.freeze({
	encrypted:
		"Select an unlocked copy of the document without a password. OpenITR cannot prompt for or remove passwords.",
	damaged:
		"Select a readable copy of the document. OpenITR does not repair damaged files.",
	"image-only":
		"Select a text-based export of the same statement. OpenITR does not read scanned images.",
	ambiguous:
		"Select the official download of the one document you want analysed.",
	"private-institution":
		"Use a permitted official source such as AIS, Form 26AS, Form 16, or a challan receipt instead.",
	"unknown-format":
		"Select a supported source document, or continue with a permitted attested answer.",
	"extraction-unsupported":
		"This revision supports inspection only. Observation extraction is not available for it yet.",
	"inspection-failed": INSPECTION_FAILED_RECOVERY_ACTION,
});

const DOCUMENT_REJECTION_ISSUE_CODES: Readonly<
	Record<DocumentRejection, IssueCode>
> = Object.freeze({
	encrypted: DOCUMENT_ISSUE_CODES.fileEncrypted,
	damaged: DOCUMENT_ISSUE_CODES.documentDamaged,
	"image-only": DOCUMENT_ISSUE_CODES.documentImageOnly,
	ambiguous: DOCUMENT_ISSUE_CODES.documentAmbiguousMatch,
	"private-institution": DOCUMENT_ISSUE_CODES.documentPrivateInstitutionTemplate,
	"unknown-format": DOCUMENT_ISSUE_CODES.documentUnknownFormat,
	"extraction-unsupported": DOCUMENT_ISSUE_CODES.documentExtractionUnsupported,
	"inspection-failed": DOCUMENT_ISSUE_CODES.documentInspectionFailed,
});

export const createDocumentRejectionOutcome = (
	rejection: DocumentRejection,
	identity: Sha256Digest,
): DocumentInspectionOutcome => ({
	kind: "rejected",
	rejection,
	issue: {
		code: DOCUMENT_REJECTION_ISSUE_CODES[rejection],
		severity: "blocking",
		affectedDocumentIds: [identity],
		recoveryAction: DOCUMENT_REJECTION_RECOVERY_ACTIONS[rejection],
	},
});

export const createExtractionRejectionOutcome = (
	rejection: DocumentRejection,
	identity: Sha256Digest,
): DocumentExtractionOutcome => ({
	kind: "rejected",
	rejection,
	issue: {
		code: DOCUMENT_REJECTION_ISSUE_CODES[rejection],
		severity: "blocking",
		affectedDocumentIds: [identity],
		recoveryAction: DOCUMENT_REJECTION_RECOVERY_ACTIONS[rejection],
	},
});

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
