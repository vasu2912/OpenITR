import type { DocumentRejection } from "@openitr/model";
import {
	createDocumentRejectionOutcome,
	createExtractionRejectionOutcome,
	type DocumentExtractionOutcome,
	type DocumentInspectionOutcome,
	type DocumentKind,
	type InspectableSourceDocument,
	type TemplateRevision,
} from "@openitr/model";

import { createAisJsonAdapter } from "./ais-json/ais-json-adapter";
import { createAisCsvAdapter } from "./ais-csv/ais-csv-adapter";
import { createEpayTaxPdfAdapter } from "./epay-tax/epay-tax-pdf-adapter";
import { createForm16PdfAdapter } from "./form16/form16-pdf-adapter";
import { createForm26AsTextAdapter } from "./form26as/form26as-text-adapter";
import { createForm26AsExcelAdapter } from "./form26as/form26as-excel-adapter";
import { createForm16APdfAdapter } from "./form16a/form16a-pdf-adapter";
import { createPrefilledItr1JsonAdapter } from "./prefilled-itr1-json/prefilled-itr1-json-adapter";
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
	extract?(
		input: InspectableSourceDocument,
		options?: InspectionOptions,
	): Promise<DocumentExtractionOutcome>;
}

export type PrivateTemplateDetector = Readonly<{
	detectorId: string;
	match(input: InspectableSourceDocument): boolean;
}>;

type AdapterFailure = DocumentRejection;

const rejectedOutcome = createDocumentRejectionOutcome;

const FAILURE_PRIORITY = ["encrypted", "damaged", "image-only"] as const;

const defaultAdapters = (): readonly SourceDocumentAdapter[] => [
	createPrefilledItr1JsonAdapter(),
	createAisJsonAdapter(),
	createAisCsvAdapter(),
	createForm16PdfAdapter(),
	createForm16APdfAdapter(),
	createEpayTaxPdfAdapter(),
	createForm26AsTextAdapter(),
	createForm26AsExcelAdapter(),
];

const defaultPrivateTemplateDetectors = (): readonly PrivateTemplateDetector[] =>
	[createPrivateStatementDetector()];

export const createDocumentInspectionRegistry = (
	adapters: readonly SourceDocumentAdapter[] = defaultAdapters(),
	privateTemplateDetectors: readonly PrivateTemplateDetector[] =
		defaultPrivateTemplateDetectors(),
) => {
	type AdapterMatch =
		| Readonly<{ kind: "rejected"; rejection: AdapterFailure }>
		| Readonly<{ kind: "unique"; adapter: SourceDocumentAdapter }>
		| Readonly<{ kind: "ambiguous" }>
		| Readonly<{ kind: "unmatched" }>;

	const matchAdapters = async (
		input: InspectableSourceDocument,
		options: InspectionOptions,
	): Promise<AdapterMatch> => {
		const { signal } = options;
		if (privateTemplateDetectors.some((detector) => detector.match(input))) {
			return { kind: "rejected", rejection: "private-institution" };
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
			return { kind: "ambiguous" };
		}
		const adapter = exactMatches[0];
		if (adapter !== undefined) {
			return { kind: "unique", adapter };
		}
		for (const failure of FAILURE_PRIORITY) {
			if (failures.has(failure)) {
				return { kind: "rejected", rejection: failure };
			}
		}
		return { kind: "unmatched" };
	};

	const inspect = async (
		input: InspectableSourceDocument,
		options: InspectionOptions = {},
	): Promise<DocumentInspectionOutcome> => {
		const match = await matchAdapters(input, options);
		switch (match.kind) {
			case "rejected":
				return rejectedOutcome(match.rejection, input.identity);
			case "ambiguous":
				return rejectedOutcome("ambiguous", input.identity);
			case "unmatched":
				return rejectedOutcome("unknown-format", input.identity);
			case "unique":
				return {
					kind: "identified",
					document: {
						documentKind: match.adapter.manifest.documentKind,
						templateRevision: match.adapter.manifest.templateRevision,
					},
					adapter: {
						adapterId: match.adapter.manifest.adapterId,
						adapterVersion: match.adapter.manifest.adapterVersion,
					},
				};
			default: {
				const _exhaustive: never = match;
				return _exhaustive;
			}
		}
	};

	const extractDocument = async (
		input: InspectableSourceDocument,
		options: InspectionOptions = {},
	): Promise<DocumentExtractionOutcome> => {
		// Full matching runs first, so private-template, ambiguous, and
		// fail-closed classes guard extraction exactly as they guard
		// identification.
		const match = await matchAdapters(input, options);
		if (match.kind === "rejected") {
			return createExtractionRejectionOutcome(match.rejection, input.identity);
		}
		if (match.kind === "ambiguous") {
			return createExtractionRejectionOutcome("ambiguous", input.identity);
		}
		if (match.kind === "unmatched") {
			return createExtractionRejectionOutcome("unknown-format", input.identity);
		}
		if (match.adapter.extract === undefined) {
			return createExtractionRejectionOutcome(
				"extraction-unsupported",
				input.identity,
			);
		}
		return match.adapter.extract(input, options);
	};

	return Object.freeze({ inspect, extractDocument });
};
