import type {
	InspectableSourceDocument,
} from "@openitr/model";
import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type {
	AdapterVerdict,
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";

export const AIS_JSON_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "ais-json",
	adapterVersion: "1",
	documentKind: parseDocumentKind("ais-json"),
	templateRevision: parseTemplateRevision("2026-27"),
});

const matchesAisJsonSignature = (value: unknown): boolean => {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return (
		"documentType" in value &&
		value.documentType === "AIS" &&
		"schemaVersion" in value &&
		value.schemaVersion === "2026-27"
	);
};

export const createAisJsonAdapter = (): SourceDocumentAdapter => ({
	manifest: AIS_JSON_MANIFEST,
	inspect: async (
		input: InspectableSourceDocument,
	): Promise<AdapterVerdict> => {
		let decoded: string;
		try {
			decoded = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
		} catch {
			return { verdict: "no-match" };
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(decoded) as unknown;
		} catch {
			return { verdict: "no-match" };
		}

		return matchesAisJsonSignature(parsed)
			? { verdict: "exact-match" }
			: { verdict: "no-match" };
	},
});

