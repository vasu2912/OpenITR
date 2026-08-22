import { parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { createForm26AsTextAdapter } from "./form26as-text-adapter";

const asciiBytes = (text: string): Uint8Array<ArrayBuffer> => {
	const encoded = new TextEncoder().encode(text);
	const buffer = new ArrayBuffer(encoded.length);
	new Uint8Array(buffer).set(encoded);
	return new Uint8Array(buffer);
};

const verdictFor = async (
	text: string,
	displayName = "form26as.txt",
): Promise<string> => {
	const bytes = asciiBytes(text);
	const verdict = await createForm26AsTextAdapter().inspect({
		identity: parseSha256Digest("a".repeat(64)),
		displayName,
		bytes,
	});
	return verdict.verdict;
};

describe("Form 26AS text adapter inspection", () => {
	test("matches the Annual Tax Statement header block exactly", async () => {
		const text = [
			"FORM 26AS",
			"Annual Tax Statement under Section 203AA of the Income Tax Act, 1961",
			"Permanent Account Number (PAN)",
			"PANXXXX9999X",
			"Assessment Year",
			"2026-27",
			"Part I - Tax Deducted at Source",
			"",
		].join("\r\n");

		expect(await verdictFor(text)).toBe("exact-match");
	});

	test("does not match unrelated text files", async () => {
		expect(await verdictFor("A plain letter about taxes\n")).toBe(
			"no-match",
		);
	});

	test("does not match a partial header that omits required lines", async () => {
		expect(await verdictFor("FORM 26AS\nsome content\n")).toBe(
			"no-match",
		);
	});
});
