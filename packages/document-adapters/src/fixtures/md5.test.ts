import { describe, expect, test } from "vitest";

import { md5OfText } from "./md5";

const toHex = (bytes: Uint8Array): string =>
	[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

describe("md5 fixture helper", () => {
	test("matches the published MD5 test vectors", () => {
		expect(toHex(md5OfText(""))).toBe(
			"d41d8cd98f00b204e9800998ecf8427e",
		);
		expect(toHex(md5OfText("abc"))).toBe(
			"900150983cd24fb0d6963f7d28e17f72",
		);
		expect(toHex(md5OfText("The quick brown fox jumps over the lazy dog"))).toBe(
			"9e107d9d372bb6826bd81d3542a419d6",
		);
	});

	test("handles messages that require length padding across blocks", () => {
		expect(toHex(md5OfText("a".repeat(56)))).toBe(
			"3b0c8ac703f828b04c6c197006d17218",
		);
		expect(toHex(md5OfText("a".repeat(119)))).toBe(
			"8a7bd0732ed6a28ce75f6dabc90e1613",
		);
	});
});
