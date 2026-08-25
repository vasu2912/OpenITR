import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildSyntheticPdf } from "./fixtures/pdf-fixture-builder";
import {
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm16APdfFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "./testing";
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

	test("routes an identified Form 16A revision to its non-salary income and TDS extraction", async () => {
		const bytes = createForm16APdfFixture();
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "form16a.pdf",
			bytes: copyBytes(bytes),
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(
				outcome.nonSalaryIncomeObservations.map((observation) => [
					observation.factKey,
					String(observation.normalizedValue),
					observation.adapterId,
					observation.evidence.kind,
				]),
			).toEqual([
				[
					"non-salary-income.dividends",
					"25000",
					"form16a-pdf",
					"pdf-page-region",
				],
				[
					"non-salary-income.interest-other-than-securities",
					"120000",
					"form16a-pdf",
					"pdf-page-region",
				],
			]);
			expect(
				outcome.tdsObservations.map((observation) => [
					observation.factKey,
					String(observation.normalizedValue),
					observation.adapterId,
				]),
			).toEqual([
				["tds.tax-deducted", "12000", "form16a-pdf"],
				["tds.tds-deposited", "12000", "form16a-pdf"],
				["tds.tax-deducted", "2500", "form16a-pdf"],
			]);
			expect(outcome.issues).toEqual([]);
		}
	});

	test("routes an identified AIS JSON revision to its bank-interest extraction", async () => {
		const bytes = utf8Bytes(createAisJsonBankInterestFixture());
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "synthetic-ais.json",
			bytes,
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(outcome.bankInterestObservations).toHaveLength(2);
			expect(
				outcome.bankInterestObservations.map(
					(observation) => observation.adapterId,
				),
			).toEqual(["ais-json", "ais-json"]);
		}
	});

	test("routes an identified Form 26AS revision to its TDS extraction", async () => {
		const bytes = utf8Bytes(createForm26AsTextFixture());
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "synthetic-form26as.txt",
			bytes,
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(outcome.tdsObservations).toHaveLength(5);
			expect(
				outcome.tdsObservations.map(
					(observation) => observation.adapterId,
				),
			).toEqual([
				"form26as-text",
				"form26as-text",
				"form26as-text",
				"form26as-text",
				"form26as-text",
			]);
			expect(outcome.issues).toEqual([]);
		}
	});

	test("rejects an unsupported Form 26AS revision before extracting any fact", async () => {
		const bytes = utf8Bytes(
			createForm26AsTextFixture({ assessmentYear: "2027-28" }),
		);
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "synthetic-form26as.txt",
			bytes,
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
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
