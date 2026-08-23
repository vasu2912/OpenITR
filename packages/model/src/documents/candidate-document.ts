import type { Sha256Digest } from "../primitives";
import type {
	DocumentInspectionIssue,
	DocumentKind,
	DocumentRejection,
	TemplateRevision,
} from "./inspection-outcome";

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

type CandidateDocumentBase = Readonly<{
	candidateKey: number;
	documentId: Sha256Digest;
	displayName: string;
}>;

export type CandidateDocument =
	| Readonly<CandidateDocumentBase & { status: "queued" }>
	| Readonly<CandidateDocumentBase & { status: "inspecting" }>
	| Readonly<
			CandidateDocumentBase & {
				status: "identified";
				identification: CandidateDocumentIdentification;
			}
	  >
	| Readonly<
			CandidateDocumentBase & {
				status: "rejected";
				rejection: DocumentRejection;
				issue: DocumentInspectionIssue;
			}
	  >
	| Readonly<CandidateDocumentBase & { status: "cancelled" }>
	| Readonly<CandidateDocumentBase & { status: "removed" }>;

export type SelectedSourceFile = Readonly<{
	displayName: string;
	suppliedMediaType?: string;
	// Reads a fresh copy of the document bytes. The browser passes the
	// selected File's arrayBuffer reader so each worker stage can transfer its
	// own buffer without the session retaining one.
	readBytes: () => Promise<Uint8Array<ArrayBuffer>>;
}>;
