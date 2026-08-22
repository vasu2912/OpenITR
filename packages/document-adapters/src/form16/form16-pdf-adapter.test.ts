import { parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildSyntheticPdf } from "../fixtures/pdf-fixture-builder";
import { createForm16PdfAdapter } from "./form16-pdf-adapter";

const asciiBytesOf = (pdfBytes: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(pdfBytes.length));
	out.set(pdfBytes);
	return out;
};

describe("Form 16 PDF adapter inspection", () => {
	test("matches a Form 16 Part A text layer exactly", async () => {
		const bytes = asciiBytesOf(
			buildSyntheticPdf({
				pages: [
					{
						textLines: [
							"PART A",
							"Certificate under section 203 of the Income-tax Act, 1961",
							"Name and address of the Employer",
							"OpenITR Synthetic Employers Pvt Ltd",
							"TAN of the Deductor",
							"PAN of the Deductor",
							"Gross total income: 1200000",
						],
					},
				],
			}),
		);

		const verdict = await createForm16PdfAdapter().inspect({
			identity: parseSha256Digest("a".repeat(64)),
			displayName: "salary-certificate.pdf",
			bytes,
		});

		expect(verdict.verdict).toBe("exact-match");
	});

	test("does not match an unrelated PDF text layer", async () => {
		const bytes = asciiBytesOf(
			buildSyntheticPdf({
				pages: [{ textLines: ["A completely different document"] }],
			}),
		);

		const verdict = await createForm16PdfAdapter().inspect({
			identity: parseSha256Digest("b".repeat(64)),
			displayName: "other.pdf",
			bytes,
		});

		expect(verdict.verdict).toBe("no-match");
	});
});
