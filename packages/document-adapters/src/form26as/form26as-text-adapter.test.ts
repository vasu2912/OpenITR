import { parseSha256Digest } from "@openitr/model";

import {
	createForm26AsTextFixture,
	utf8Bytes,
} from "../testing";
import { describe, expect, test } from "vitest";

import { createForm26AsTextAdapter } from "./form26as-text-adapter";

const verdictFor = async (
	text: string,
	displayName = "form26as.txt",
): Promise<string> => {
	const bytes = utf8Bytes(text);
	const verdict = await createForm26AsTextAdapter().inspect({
		identity: parseSha256Digest("a".repeat(64)),
		displayName,
		bytes,
	});
	return verdict.verdict;
};

describe("Form 26AS text adapter inspection", () => {
	test("matches the supported revision's complete header block exactly", async () => {
		expect(await verdictFor(createForm26AsTextFixture())).toBe(
			"exact-match",
		);
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

	test.each([
		[
			"the assessment-year line is absent",
			["FORM 26AS", "Annual Tax Statement under Section 203AA of the Income Tax Act, 1961", "Permanent Account Number (PAN)\tPANXXXX9999X"],
		],
		[
			"the assessment year is an unsupported revision",
			["FORM 26AS", "Annual Tax Statement under Section 203AA of the Income Tax Act, 1961", "Permanent Account Number (PAN)\tPANXXXX9999X", "Assessment Year\t2027-28"],
		],
	] as const)("does not match when %s", async (_label, headerLines) => {
		expect(await verdictFor(headerLines.join("\r\n"))).toBe("no-match");
	});

	test("does not match a header block that repeats the PAN line", async () => {
		const text = createForm26AsTextFixture().replace(
			"Assessment Year\t2026-27",
			"Permanent Account Number (PAN)\tPANXXXX9999X\r\nAssessment Year\t2026-27",
		);
		expect(await verdictFor(text)).toBe("no-match");
	});

	test("does not match bytes that are not valid UTF-8", async () => {
		const bytes = new Uint8Array(new ArrayBuffer(4));
		bytes.set([0xff, 0xfe, 0x46, 0x4f]);
		const verdict = await createForm26AsTextAdapter().inspect({
			identity: parseSha256Digest("a".repeat(64)),
			displayName: "form26as.txt",
			bytes,
		});
		expect(verdict.verdict).toBe("no-match");
	});
});
