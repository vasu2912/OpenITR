import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";
import type { DocumentExtractionOutcome } from "@openitr/model";
import { createExtractionRejectionOutcome } from "@openitr/model";

import type {
	AdapterVerdict,
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";
import { decodeUtf8Strict } from "../extraction-support";
import { extractTdsObservations } from "./tds-extraction";
import { parseForm26AsTextRevision } from "./form26as-text-revision";

export const FORM26AS_TEXT_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "form26as-text",
	adapterVersion: "1",
	documentKind: parseDocumentKind("form26as-text"),
	templateRevision: parseTemplateRevision("2026-27"),
});

const decodeOrUndefined = (bytes: Uint8Array): string | undefined => {
	try {
		return decodeUtf8Strict(bytes);
	} catch {
		return undefined;
	}
};

export const createForm26AsTextAdapter = (): SourceDocumentAdapter => ({
	manifest: FORM26AS_TEXT_MANIFEST,
	inspect: async (input): Promise<AdapterVerdict> => {
		const decoded = decodeOrUndefined(input.bytes);
		if (decoded === undefined) {
			return { verdict: "no-match" };
		}
		return parseForm26AsTextRevision(decoded).kind === "supported"
			? { verdict: "exact-match" }
			: { verdict: "no-match" };
	},
	extract: async (input): Promise<DocumentExtractionOutcome> => {
		const decoded = decodeOrUndefined(input.bytes);
		if (decoded === undefined) {
			return createExtractionRejectionOutcome(
				"unknown-format",
				input.identity,
			);
		}
		const revision = parseForm26AsTextRevision(decoded);
		if (revision.kind === "unsupported") {
			return createExtractionRejectionOutcome(
				"unknown-format",
				input.identity,
			);
		}

		const { observations, issues } = extractTdsObservations({
			document: revision.document,
			sourceDocumentId: input.identity,
			adapter: FORM26AS_TEXT_MANIFEST,
		});
		return {
			kind: "extracted",
			observations: [],
			bankInterestObservations: [],
			tdsObservations: observations,
			issues,
			pages: [],
		};
	},
});
