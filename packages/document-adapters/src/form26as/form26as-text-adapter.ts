import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type {
	AdapterVerdict,
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";

const FORM26AS_REQUIRED_MARKERS = [
	"FORM 26AS",
	"Annual Tax Statement under Section 203AA of the Income Tax Act, 1961",
] as const;

export const FORM26AS_TEXT_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "form26as-text",
	adapterVersion: "1",
	documentKind: parseDocumentKind("form26as-text"),
	templateRevision: parseTemplateRevision("2026-27"),
});

const containsAllMarkers = (
	haystack: string,
	markers: readonly string[],
): boolean => markers.every((marker) => haystack.includes(marker));

export const createForm26AsTextAdapter = (): SourceDocumentAdapter => ({
	manifest: FORM26AS_TEXT_MANIFEST,
	inspect: async (input): Promise<AdapterVerdict> => {
		let decoded: string;
		try {
			decoded = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
		} catch {
			return { verdict: "no-match" };
		}

		return containsAllMarkers(decoded, FORM26AS_REQUIRED_MARKERS)
			? { verdict: "exact-match" }
			: { verdict: "no-match" };
	},
});
