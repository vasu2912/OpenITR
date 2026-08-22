import type {
	DocumentInspectionIssue,
	DocumentKind,
	DocumentRejection,
	TemplateRevision,
} from "./inspection-outcome";
import type { Sha256Digest } from "../primitives";

export const CANDIDATE_DOCUMENT_STATUSES = [
	"queued",
	"inspecting",
	"identified",
	"rejected",
	"cancelled",
	"removed",
] as const;

export type CandidateDocumentStatus = (typeof CANDIDATE_DOCUMENT_STATUSES)[number];

export type CandidateDocumentIdentification = Readonly<{
	documentKind: DocumentKind;
	templateRevision: TemplateRevision;
	adapterId: string;
	adapterVersion: string;
}>;

export type CandidateDocument = Readonly<{
	candidateKey: number;
	documentId: Sha256Digest;
	displayName: string;
	status: CandidateDocumentStatus;
	identified?: CandidateDocumentIdentification;
	rejection?: DocumentRejection;
	issue?: DocumentInspectionIssue;
}>;

export type SelectedSourceFile = Readonly<{
	displayName: string;
	suppliedMediaType?: string;
	bytes: Uint8Array<ArrayBuffer>;
}>;
