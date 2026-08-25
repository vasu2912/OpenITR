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
import {
	parsePrefilledItr1JsonRevision,
} from "./prefilled-itr1-json-revision";
import { extractPrefilledItr1Observations } from "./prefilled-itr1-json-extraction";

export const PREFILLED_ITR1_JSON_MANIFEST: DocumentAdapterManifest =
	Object.freeze({
		adapterId: "prefilled-itr1-json",
		adapterVersion: "1",
		documentKind: parseDocumentKind("prefilled-itr1-json"),
		templateRevision: parseTemplateRevision("2026-27"),
	});

export const createPrefilledItr1JsonAdapter = (): SourceDocumentAdapter => ({
	manifest: PREFILLED_ITR1_JSON_MANIFEST,
	inspect: async (
		input: InspectableSourceDocument,
	): Promise<AdapterVerdict> => {
		let decoded: string;
		try {
			decoded = decodeUtf8Strict(input.bytes);
		} catch {
			return { verdict: "no-match" };
		}
		return parsePrefilledItr1JsonRevision(decoded).kind === "supported"
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
		const revision = parsePrefilledItr1JsonRevision(decoded);
		if (revision.kind === "unsupported") {
			return createExtractionRejectionOutcome(
				"unknown-format",
				input.identity,
			);
		}

		const { salaryObservations, tdsObservations, issues } =
			extractPrefilledItr1Observations({
				document: revision.document,
				sourceDocumentId: input.identity,
				adapter: PREFILLED_ITR1_JSON_MANIFEST,
			});
		return {
			kind: "extracted",
			observations: salaryObservations,
			bankInterestObservations: [],
			nonSalaryIncomeObservations: [],
			tdsObservations,
			issues,
			pages: [],
		};
	},
});
