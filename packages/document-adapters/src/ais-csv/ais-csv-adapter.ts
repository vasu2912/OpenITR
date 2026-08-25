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
import { parseAisCsvRevision } from "./ais-csv-revision";
import { extractAisCsvBankInterestObservations } from "./ais-csv-extraction";

export const AIS_CSV_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "ais-csv",
	adapterVersion: "1",
	documentKind: parseDocumentKind("ais-csv"),
	templateRevision: parseTemplateRevision("2026-27"),
});

export const createAisCsvAdapter = (): SourceDocumentAdapter => ({
	manifest: AIS_CSV_MANIFEST,
	inspect: async (
		input: InspectableSourceDocument,
	): Promise<AdapterVerdict> => {
		let decoded: string;
		try {
			decoded = decodeUtf8Strict(input.bytes);
		} catch {
			return { verdict: "no-match" };
		}
		return parseAisCsvRevision(decoded).kind === "supported"
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
		const revision = parseAisCsvRevision(decoded);
		if (revision.kind === "unsupported") {
			return createExtractionRejectionOutcome(
				"unknown-format",
				input.identity,
			);
		}

		const { observations, issues } =
			extractAisCsvBankInterestObservations({
				document: revision.document,
				sourceDocumentId: input.identity,
				adapter: AIS_CSV_MANIFEST,
			});
		return {
			kind: "extracted",
			taxPaymentObservations: [],
			observations: [],
			bankInterestObservations: observations,
			nonSalaryIncomeObservations: [],
			tdsObservations: [],
			issues,
			pages: [],
		};
	},
});
