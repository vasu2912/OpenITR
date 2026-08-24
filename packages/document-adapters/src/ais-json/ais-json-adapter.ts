import type {
	DocumentExtractionOutcome,
	InspectableSourceDocument,
} from "@openitr/model";
import { createExtractionRejectionOutcome } from "@openitr/model";
import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type {
	AdapterVerdict,
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";
import { decodeUtf8Strict } from "../extraction-support";
import { parseAisJsonRevision } from "./ais-json-revision";
import { extractBankInterestObservations } from "./bank-interest-extraction";

export const AIS_JSON_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "ais-json",
	adapterVersion: "1",
	documentKind: parseDocumentKind("ais-json"),
	templateRevision: parseTemplateRevision("2026-27"),
});

export const createAisJsonAdapter = (): SourceDocumentAdapter => ({
	manifest: AIS_JSON_MANIFEST,
	inspect: async (
		input: InspectableSourceDocument,
	): Promise<AdapterVerdict> => {
		let decoded: string;
		try {
			decoded = decodeUtf8Strict(input.bytes);
		} catch {
			return { verdict: "no-match" };
		}
		return parseAisJsonRevision(decoded).kind === "supported"
			? { verdict: "exact-match" }
			: { verdict: "no-match" };
	},
	extract: async (input): Promise<DocumentExtractionOutcome> => {
		let decoded: string;
		try {
			decoded = decodeUtf8Strict(input.bytes);
		} catch {
			return createExtractionRejectionOutcome(
				"unknown-format",
				input.identity,
			);
		}
		const revision = parseAisJsonRevision(decoded);
		if (revision.kind === "unsupported") {
			return createExtractionRejectionOutcome(
				"unknown-format",
				input.identity,
			);
		}

		const { observations, issues } = extractBankInterestObservations({
			document: revision.document,
			sourceDocumentId: input.identity,
			adapter: AIS_JSON_MANIFEST,
		});
		return {
			kind: "extracted",
			observations: [],
			bankInterestObservations: observations,
			tdsObservations: [],
			issues,
			pages: [],
		};
	},
});
