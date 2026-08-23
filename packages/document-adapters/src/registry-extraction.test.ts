import {
	computeSourceDocumentIdentity,
	DOCUMENT_ISSUE_CODES,
} from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildSyntheticPdf } from "./fixtures/pdf-fixture-builder";
import { createForm16SalaryPdfFixture } from "./testing";
import { createDocumentInspectionRegistry } from "./registry";

const copyBytes = (source: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(source.length));
	out.set(source);
	return out;
};

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

describe("registry extraction routing", () => {
	test("routes an identified Form 16 revision to its extraction", async () => {
		const bytes = createForm16SalaryPdfFixture();
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "form16.pdf",
			bytes: copyBytes(bytes),
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(outcome.observations).toHaveLength(3);
		}
	});

	test("rejects extraction for revisions without extraction support", async () => {
		const bytes = copyBytes(
			new TextEncoder().encode(
				JSON.stringify({ documentType: "AIS", schemaVersion: "2026-27" }),
			),
		);
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "ais.json",
			bytes,
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "extraction-unsupported",
			issue: { code: DOCUMENT_ISSUE_CODES.documentExtractionUnsupported },
		});
	});

	test("keeps fail-closed outcomes guarding extraction", async () => {
		const registry = createDocumentInspectionRegistry();
		const encrypted = buildSyntheticPdf({
			pages: [{ textLines: ["Encrypted salary certificate"] }],
			encryptionPassword: "openitr-synthetic-lock",
		});
		const damaged = buildSyntheticPdf({
			pages: [{ textLines: ["Healthy before damage"] }],
		}).slice(0, 120);

		const encryptedOutcome = await registry.extractDocument({
			identity: await identityOf(copyBytes(encrypted)),
			displayName: "locked.pdf",
			bytes: copyBytes(encrypted),
		});
		expect(encryptedOutcome).toMatchObject({
			kind: "rejected",
			rejection: "encrypted",
		});

		const damagedOutcome = await registry.extractDocument({
			identity: await identityOf(copyBytes(damaged)),
			displayName: "torn.pdf",
			bytes: copyBytes(damaged),
		});
		expect(damagedOutcome).toMatchObject({
			kind: "rejected",
			rejection: "damaged",
		});

		const imageOnly = buildSyntheticPdf({ pages: [{ imageOnly: true }] });
		const imageOutcome = await registry.extractDocument({
			identity: await identityOf(copyBytes(imageOnly)),
			displayName: "scan.pdf",
			bytes: copyBytes(imageOnly),
		});
		expect(imageOutcome).toMatchObject({
			kind: "rejected",
			rejection: "image-only",
		});
	});
});
