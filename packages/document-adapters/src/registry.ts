import {
	DOCUMENT_ISSUE_CODES,
	INSPECTION_FAILED_RECOVERY_ACTION,
	type DocumentInspectionOutcome,
	type DocumentKind,
	type DocumentRejection,
	type InspectableSourceDocument,
	type TemplateRevision,
} from "@openitr/model";

import { createAisJsonAdapter } from "./ais-json/ais-json-adapter";
import { createForm16PdfAdapter } from "./form16/form16-pdf-adapter";
import { createForm26AsTextAdapter } from "./form26as/form26as-text-adapter";
import { createForm16APdfAdapter } from "./form16a/form16a-pdf-adapter";
import { createPrivateStatementDetector } from "./private-statements/private-statement-detector";

export type AdapterVerdict =
	| Readonly<{ verdict: "exact-match" }>
	| Readonly<{
			verdict: "rejected";
			rejection: "encrypted" | "damaged" | "image-only";
	  }>
	| Readonly<{ verdict: "no-match" }>;

export type InspectionOptions = Readonly<{ signal?: AbortSignal }>;

const ensureNotAborted = (signal?: AbortSignal): void => {
	if (signal?.aborted === true) {
		throw new DOMException("Inspection cancelled", "AbortError");
	}
};

export type DocumentAdapterManifest = Readonly<{
	adapterId: string;
	adapterVersion: string;
	documentKind: DocumentKind;
	templateRevision: TemplateRevision;
}>;

export interface SourceDocumentAdapter {
	readonly manifest: DocumentAdapterManifest;
	inspect(
		input: InspectableSourceDocument,
		options?: InspectionOptions,
	): Promise<AdapterVerdict>;
}

export type PrivateTemplateDetector = Readonly<{
	detectorId: string;
	match(input: InspectableSourceDocument): boolean;
}>;

type RejectionClass = DocumentRejection;

type AdapterFailure = Extract<AdapterVerdict, { verdict: "rejected" }>["rejection"];

const RECOVERY_ACTIONS: Readonly<Record<RejectionClass, string>> =
	Object.freeze({
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
		"inspection-failed": INSPECTION_FAILED_RECOVERY_ACTION,
	});

const ISSUE_CODE_FOR_REJECTION: Readonly<
	Record<RejectionClass, (typeof DOCUMENT_ISSUE_CODES)[keyof typeof DOCUMENT_ISSUE_CODES]>
> = Object.freeze({
	encrypted: DOCUMENT_ISSUE_CODES.fileEncrypted,
	damaged: DOCUMENT_ISSUE_CODES.documentDamaged,
	"image-only": DOCUMENT_ISSUE_CODES.documentImageOnly,
	ambiguous: DOCUMENT_ISSUE_CODES.documentAmbiguousMatch,
	"private-institution": DOCUMENT_ISSUE_CODES.documentPrivateInstitutionTemplate,
	"unknown-format": DOCUMENT_ISSUE_CODES.documentUnknownFormat,
	"inspection-failed": DOCUMENT_ISSUE_CODES.documentInspectionFailed,
});

const rejectedOutcome = (
	rejection: RejectionClass,
	identity: InspectableSourceDocument["identity"],
): DocumentInspectionOutcome => ({
	kind: "rejected",
	rejection,
	issue: {
		code: ISSUE_CODE_FOR_REJECTION[rejection],
		severity: "blocking",
		affectedDocumentIds: [identity],
		recoveryAction: RECOVERY_ACTIONS[rejection],
	},
});

const FAILURE_PRIORITY = ["encrypted", "damaged", "image-only"] as const;

const defaultAdapters = (): readonly SourceDocumentAdapter[] => [
	createAisJsonAdapter(),
	createForm16PdfAdapter(),
	createForm16APdfAdapter(),
	createForm26AsTextAdapter(),
];

const defaultPrivateTemplateDetectors = (): readonly PrivateTemplateDetector[] =>
	[createPrivateStatementDetector()];

export const createDocumentInspectionRegistry = (
	adapters: readonly SourceDocumentAdapter[] = defaultAdapters(),
	privateTemplateDetectors: readonly PrivateTemplateDetector[] =
		defaultPrivateTemplateDetectors(),
) => {
	const inspect = async (
		input: InspectableSourceDocument,
		options: InspectionOptions = {},
	): Promise<DocumentInspectionOutcome> => {
		const { signal } = options;
		if (privateTemplateDetectors.some((detector) => detector.match(input))) {
			return rejectedOutcome("private-institution", input.identity);
		}

		const exactMatches: SourceDocumentAdapter[] = [];
		const failures = new Set<AdapterFailure>();
		for (const adapter of adapters) {
			ensureNotAborted(signal);
			const verdict = await adapter.inspect(input, options);
			if (verdict.verdict === "exact-match") {
				exactMatches.push(adapter);
			} else if (verdict.verdict === "rejected") {
				failures.add(verdict.rejection);
			}
		}

		if (exactMatches.length > 1) {
			return rejectedOutcome("ambiguous", input.identity);
		}
		if (exactMatches.length === 1) {
			const adapter = exactMatches[0];
			if (adapter === undefined) {
				return rejectedOutcome("unknown-format", input.identity);
			}
			return {
				kind: "identified",
				document: {
					documentKind: adapter.manifest.documentKind,
					templateRevision: adapter.manifest.templateRevision,
				},
				adapter: {
					adapterId: adapter.manifest.adapterId,
					adapterVersion: adapter.manifest.adapterVersion,
				},
			};
		}

		for (const failure of FAILURE_PRIORITY) {
			if (failures.has(failure)) {
				return rejectedOutcome(failure, input.identity);
			}
		}

		return rejectedOutcome("unknown-format", input.identity);
	};

	return Object.freeze({ inspect });
};
