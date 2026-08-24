import type { DocumentAdapterManifest } from "./registry";

// The subset of a manifest that every observation records as its origin.
export type AdapterIdentity = Pick<
	DocumentAdapterManifest,
	"adapterId" | "adapterVersion"
>;

export const compareByCodepoint = (left: string, right: string): number => {
	if (left < right) {
		return -1;
	}
	return left > right ? 1 : 0;
};

// A single reusable decoder; decode() is stateless for non-streaming input.
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// Strict UTF-8 decoding for text-based source documents; throws on any
// byte sequence that is not valid UTF-8 so callers can fail closed.
export const decodeUtf8Strict = (bytes: Uint8Array): string =>
	utf8Decoder.decode(bytes);

export const isRecordObject = (
	value: unknown,
): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
