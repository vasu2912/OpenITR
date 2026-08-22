import type { Sha256Digest } from "../primitives";
import { parseSha256Digest } from "../primitives";

export type SourceDocumentIdentity = Readonly<{
	contentSha256: Sha256Digest;
}>;

const toHex = (buffer: ArrayBuffer): string =>
	[...new Uint8Array(buffer)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

export const computeSourceDocumentIdentity = async (
	input: Readonly<{ bytes: Uint8Array<ArrayBuffer> }>,
): Promise<SourceDocumentIdentity> => {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", input.bytes);
	return Object.freeze({ contentSha256: parseSha256Digest(toHex(digest)) });
};
