import { describe, expect, test } from "vitest";

import { computeSourceDocumentIdentity } from "./compute-source-document-id";

const asciiBytes = (text: string): Uint8Array<ArrayBuffer> => {
	const encoded = new TextEncoder().encode(text);
	const buffer = new ArrayBuffer(encoded.length);
	new Uint8Array(buffer).set(encoded);
	return new Uint8Array(buffer);
};

describe("source-document identity", () => {
	test("derives the SHA-256 content identity from the exact bytes", async () => {
		const bytes = asciiBytes("openitr-synthetic-identity-sentinel");

		const identity = await computeSourceDocumentIdentity({ bytes });

		expect(identity.contentSha256).toBe(
			"0b942f47d3da73e819205867bc013fefbfaf5e41216ec7411557a86bc0c82ea4",
		);
	});

	test("gives byte-identical documents the same identity", async () => {
		const first = await computeSourceDocumentIdentity({
			bytes: asciiBytes("same-bytes"),
		});
		const second = await computeSourceDocumentIdentity({
			bytes: asciiBytes("same-bytes"),
		});

		expect(second).toEqual(first);
	});

	test("gives different bytes different identities", async () => {
		const first = await computeSourceDocumentIdentity({
			bytes: asciiBytes("first document"),
		});
		const second = await computeSourceDocumentIdentity({
			bytes: asciiBytes("second document"),
		});

		expect(second.contentSha256).not.toBe(first.contentSha256);
	});

	test("accepts no display name or media type in the identity input", async () => {
		const bytes = asciiBytes("bytes only");

		const identity = await computeSourceDocumentIdentity({
			bytes,
			// @ts-expect-error -- display names never participate in document identity
			displayName: "misleading-name.pdf",
		});

		expect(typeof identity.contentSha256).toBe("string");
	});
});
