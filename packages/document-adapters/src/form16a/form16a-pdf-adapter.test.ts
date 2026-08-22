import { parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildSyntheticPdf } from "../fixtures/pdf-fixture-builder";
import { createForm16APdfAdapter } from "./form16a-pdf-adapter";

const copyBytes = (pdfBytes: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(pdfBytes.length));
	out.set(pdfBytes);
	return out;
};

describe("Form 16A PDF adapter inspection", () => {
	test("matches a Form 16A non-salary TDS certificate text layer exactly", async () => {
		const bytes = copyBytes(
			buildSyntheticPdf({
				pages: [
					{
						textLines: [
							"FORM 16A",
							"Certificate under section 203(2A) of the Income-tax Act, 1961",
							"Name and address of the Deductor",
							"OpenITR Synthetic Payers Pvt Ltd",
							"PAN of the Deductee",
							"Total tax deducted: 54000",
						],
					},
				],
			}),
		);

		const verdict = await createForm16APdfAdapter().inspect({
			identity: parseSha256Digest("c".repeat(64)),
			displayName: "tds-certificate.pdf",
			bytes,
		});

		expect(verdict.verdict).toBe("exact-match");
	});

	test("does not match a plain text layer without the Form 16A markers", async () => {
		const bytes = copyBytes(
			buildSyntheticPdf({
				pages: [{ textLines: ["Nothing relevant here"] }],
			}),
		);

		const verdict = await createForm16APdfAdapter().inspect({
			identity: parseSha256Digest("d".repeat(64)),
			displayName: "other.pdf",
			bytes,
		});

		expect(verdict.verdict).toBe("no-match");
	});
});
