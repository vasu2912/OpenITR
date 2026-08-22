import { describe, expect, test } from "vitest";

import {
	buildSyntheticPdf,
	corruptSyntheticPdf,
} from "./pdf-fixture-builder";

describe("synthetic PDF fixture builder", () => {
	test("produces a PDF whose text layer extracts deterministically", async () => {
		const bytes = buildSyntheticPdf({
			pages: [
				{ textLines: ["OpenITR synthetic page one"] },
				{ textLines: ["OpenITR synthetic page two", "second line"] },
			],
		});

		const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
		const doc = await pdfjs.getDocument({
			data: new Uint8Array(bytes),
			useSystemFonts: false,
		}).promise;

		expect(doc.numPages).toBe(2);
		const firstPage = await doc.getPage(1);
		const textContent = await firstPage.getTextContent();
		const text = textContent.items
			.map((item) => ("str" in item ? item.str : ""))
			.join(" ");
		expect(text).toContain("OpenITR synthetic page one");
	});

	test("produces a password-protected PDF that pdf.js refuses to open", async () => {
		const bytes = buildSyntheticPdf({
			pages: [{ textLines: ["Encrypted synthetic content"] }],
			encryptionPassword: "openitr-synthetic-lock",
		});

		const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
		let failureName: string | undefined;
		try {
			await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
		} catch (error: unknown) {
			failureName = error instanceof Error ? error.name : undefined;
		}

		expect(failureName).toBe("PasswordException");
	});

	test("produces a damaged PDF that pdf.js fails to parse", async () => {
		const bytes = corruptSyntheticPdf();

		const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
		await expect(
			pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise,
		).rejects.toThrow();
	});

	test("produces an image-only PDF with no extractable text", async () => {
		const bytes = buildSyntheticPdf({
			pages: [{ imageOnly: true }],
		});

		const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
		const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) })
			.promise;
		const firstPage = await doc.getPage(1);
		const textContent = await firstPage.getTextContent();

		expect(textContent.items.length).toBe(0);
	});
});
