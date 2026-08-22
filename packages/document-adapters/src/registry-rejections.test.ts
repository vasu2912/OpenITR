import { parseSha256Digest } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildSyntheticPdf } from "./fixtures/pdf-fixture-builder";
import { createDocumentInspectionRegistry } from "./registry";

const asciiBytesOf = (pdfBytes: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(pdfBytes.length));
	out.set(pdfBytes);
	return out;
};

const identityPlaceholder = (tag: string): Sha256Digest =>
	parseSha256Digest(
		`f${(tag.charCodeAt(0) % 16).toString(16)}${"e".repeat(62)}`,
	);

const inspectPdf = async (
	pdfBytes: Uint8Array,
	displayName: string,
	tag: string,
) =>
	createDocumentInspectionRegistry().inspect({
		identity: identityPlaceholder(tag),
		displayName,
		bytes: asciiBytesOf(pdfBytes),
	});

describe("registry fail-closed outcomes", () => {
	test("rejects an encrypted document as encrypted", async () => {
		const outcome = await inspectPdf(
			buildSyntheticPdf({
				pages: [{ textLines: ["Encrypted salary certificate"] }],
				encryptionPassword: "openitr-synthetic-lock",
			}),
			"locked-form16.pdf",
			"a",
		);

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("encrypted");
			expect(outcome.issue.code).toBe("FILE_ENCRYPTED");
			expect(outcome.issue.severity).toBe("blocking");
			expect(outcome.issue.recoveryAction).toContain("unlocked");
		}
	});

	test("rejects a damaged document as damaged", async () => {
		const { corruptSyntheticPdf } = await import(
			"./fixtures/pdf-fixture-builder"
		);
		const outcome = await inspectPdf(corruptSyntheticPdf(), "torn.pdf", "b");

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("damaged");
			expect(outcome.issue.code).toBe("DOCUMENT_DAMAGED");
		}
	});

	test("rejects a scanned image-only document without OCR", async () => {
		const outcome = await inspectPdf(
			buildSyntheticPdf({ pages: [{ imageOnly: true }] }),
			"scan.pdf",
			"c",
		);

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("image-only");
			expect(outcome.issue.code).toBe("DOCUMENT_IMAGE_ONLY");
		}
	});

	test("rejects a document matching two adapters as ambiguous", async () => {
		const outcome = await inspectPdf(
			buildSyntheticPdf({
				pages: [
					{
						textLines: [
							"PART A",
							"Certificate under section 203 of the Income-tax Act, 1961",
							"FORM 16A",
							"Certificate under section 203(2A) of the Income-tax Act, 1961",
						],
					},
				],
			}),
			"conflicting-certificate.pdf",
			"d",
		);

		expect(outcome).toEqual({
			kind: "rejected",
			rejection: "ambiguous",
			issue: {
				code: "DOCUMENT_AMBIGUOUS_MATCH",
				severity: "blocking",
				affectedDocumentIds: [identityPlaceholder("d")],
				recoveryAction:
					"Select the official download of the one document you want analysed.",
			},
		});
	});

	test("carries the affected document identity on every rejected outcome", async () => {
		const outcome = await inspectPdf(
			buildSyntheticPdf({ pages: [{ imageOnly: true }] }),
			"scan.pdf",
			"c",
		);

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.issue.affectedDocumentIds).toEqual([
				identityPlaceholder("c"),
			]);
		}
	});
});

describe("filename and media type never decide identity", () => {
	test("identifies AIS JSON content behind a PDF name and MIME type", async () => {
		const bytes = new TextEncoder().encode(
			JSON.stringify({
				documentType: "AIS",
				schemaVersion: "2026-27",
			}),
		);
		const buffer = new ArrayBuffer(bytes.length);
		new Uint8Array(buffer).set(bytes);

		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: identityPlaceholder("a"),
			displayName: "annual-information-statement.pdf",
			suppliedMediaType: "application/pdf",
			bytes: new Uint8Array(buffer),
		});

		expect(outcome.kind).toBe("identified");
		if (outcome.kind === "identified") {
			expect(outcome.document.documentKind).toBe("ais-json");
		}
	});

	test("identifies Form 16 content behind a JSON name and MIME type", async () => {
		const outcome = await inspectPdf(
			buildSyntheticPdf({
				pages: [
					{
						textLines: [
							"PART A",
							"Certificate under section 203 of the Income-tax Act, 1961",
						],
					},
				],
			}),
			"form16.json",
			"e",
		);

		expect(outcome.kind).toBe("identified");
		if (outcome.kind === "identified") {
			expect(outcome.document.documentKind).toBe("form16-pdf");
		}
	});
});
