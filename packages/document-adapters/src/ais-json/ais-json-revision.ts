export const AIS_JSON_SUPPORTED_DOCUMENT_TYPE = "AIS";
export const AIS_JSON_SUPPORTED_SCHEMA_VERSION = "2026-27";

export type AisJsonRevisionDocument = Readonly<Record<string, unknown>>;

export type AisJsonRevisionParseOutcome =
	| Readonly<{ kind: "supported"; document: AisJsonRevisionDocument }>
	| Readonly<{ kind: "unsupported" }>;

export const isRecordObject = (
	value: unknown,
): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const decodeUtf8Strict = (bytes: Uint8Array): string =>
	new TextDecoder("utf-8", { fatal: true }).decode(bytes);

export const parseAisJsonRevision = (
	text: string,
): AisJsonRevisionParseOutcome => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return { kind: "unsupported" };
	}
	if (!isRecordObject(parsed)) {
		return { kind: "unsupported" };
	}
	if (
		parsed.documentType !== AIS_JSON_SUPPORTED_DOCUMENT_TYPE ||
		parsed.schemaVersion !== AIS_JSON_SUPPORTED_SCHEMA_VERSION
	) {
		return { kind: "unsupported" };
	}
	return { kind: "supported", document: parsed };
};
