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
import { extractForm26AsSpreadsheetTdsObservations } from "./form26as-excel-extraction";
import { parseForm26AsExcelRevision } from "./form26as-excel-revision";

export const FORM26AS_EXCEL_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "form26as-excel",
	adapterVersion: "1",
	documentKind: parseDocumentKind("form26as"),
	templateRevision: parseTemplateRevision("2026-27"),
});

export const createForm26AsExcelAdapter = (): SourceDocumentAdapter => ({
	manifest: FORM26AS_EXCEL_MANIFEST,
	inspect: async (
		input: InspectableSourceDocument,
	): Promise<AdapterVerdict> =>
		parseForm26AsExcelRevision(input.bytes).kind === "supported"
			? { verdict: "exact-match" }
			: { verdict: "no-match" },
	extract: async (input): Promise<DocumentExtractionOutcome> => {
		const revision = parseForm26AsExcelRevision(input.bytes);
		if (revision.kind === "unsupported") {
			return createExtractionRejectionOutcome(
				"unknown-format",
				input.identity,
			);
		}

		const { observations, issues } =
			extractForm26AsSpreadsheetTdsObservations({
				document: revision.document,
				sourceDocumentId: input.identity,
				adapter: FORM26AS_EXCEL_MANIFEST,
			});
		return {
			kind: "extracted",
			taxPaymentObservations: [],
			observations: [],
			bankInterestObservations: [],
			nonSalaryIncomeObservations: [],
			tdsObservations: observations,
			issues,
			pages: [],
		};
	},
});
