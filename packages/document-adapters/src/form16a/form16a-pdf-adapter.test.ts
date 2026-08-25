import type { DocumentExtractionOutcome } from "@openitr/model";
import { parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildSyntheticPdf } from "../fixtures/pdf-fixture-builder";
import {
	createDamagedPdfFixture,
	createForm16APdfFixture,
	FORM16A_DEDUCTOR_NAME_LINE,
	FORM16A_DEDUCTOR_TAN_LINE,
	utf8Bytes,
} from "../testing";
import { createForm16APdfAdapter } from "./form16a-pdf-adapter";

const copyBytes = (pdfBytes: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(pdfBytes.length));
	out.set(pdfBytes);
	return out;
};

const identityOf = (tag: string) => parseSha256Digest(`${tag}`.padEnd(64, "0"));

const extractFixture = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<DocumentExtractionOutcome> => {
	const adapter = createForm16APdfAdapter();
	const extract = adapter.extract;
	if (extract === undefined) {
		throw new Error("the Form 16A adapter must support extraction");
	}
	return extract(
		{
			identity: identityOf("c"),
			displayName: "tds-certificate.pdf",
			bytes: copyBytes(bytes),
		},
	);
};

const extractedOrThrow = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Extract<DocumentExtractionOutcome, { kind: "extracted" }>> => {
	const outcome = await extractFixture(bytes);
	if (outcome.kind !== "extracted") {
		throw new Error(`expected extraction, got ${outcome.rejection}`);
	}
	return outcome;
};

describe("Form 16A PDF adapter inspection", () => {
	test("matches a Form 16A non-salary TDS certificate text layer exactly", async () => {
		const verdict = await createForm16APdfAdapter().inspect({
			identity: identityOf("c"),
			displayName: "tds-certificate.pdf",
			bytes: copyBytes(createForm16APdfFixture()),
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
			identity: identityOf("d"),
			displayName: "other.pdf",
			bytes,
		});

		expect(verdict.verdict).toBe("no-match");
	});
});

describe("Form 16A payment summary extraction", () => {
	test("preserves raw values, adapter identity, transformations, and page-region evidence", async () => {
		const outcome = await extractedOrThrow(createForm16APdfFixture());

		const interest = outcome.nonSalaryIncomeObservations.find(
			(observation) =>
				observation.factKey ===
				"non-salary-income.interest-other-than-securities",
		);
		expect(interest).toBeDefined();
		if (interest === undefined) {
			return;
		}
		expect(interest.adapterId).toBe("form16a-pdf");
		expect(interest.adapterVersion).toBe("1");
		expect(interest.originalText).toBe(
			"1 | 194A | Interest other than interest on securities | 1,20,000.00 | 12,000.00 | 12,000.00",
		);
		expect(String(interest.normalizedValue)).toBe("120000");
		expect(interest.transformationSteps).toEqual([
			{
				order: 1,
				operation: "trim-whitespace",
				input: "1,20,000.00",
				output: "1,20,000.00",
			},
			{
				order: 2,
				operation: "remove-indian-digit-grouping",
				input: "1,20,000.00",
				output: "120000.00",
			},
			{
				order: 3,
				operation: "parse-exact-rupees",
				input: "120000.00",
				output: "120000",
			},
		]);
		expect(interest.evidence).toEqual({
			kind: "pdf-page-region",
			page: 1,
			x: 72,
			y: 592,
			width: expect.any(Number),
			height: 12,
		});
		expect(interest.ruleCitation.ruleId).toBe(
			"FORM16A-INCOME-INTEREST-OTHER-THAN-SECURITIES",
		);
	});

	test("carries the printed record as the TDS source record with verbatim cells", async () => {
		const outcome = await extractedOrThrow(createForm16APdfFixture());

		const deposited = outcome.tdsObservations.find(
			(observation) => observation.factKey === "tds.tds-deposited",
		);
		expect(deposited).toBeDefined();
		if (deposited === undefined) {
			return;
		}
		expect(deposited.evidence.kind).toBe("pdf-page-region");
		expect(deposited.record).toEqual({
			medium: "pdf",
			page: 1,
			rowNumber: 1,
			serialNumber: "1",
			deductorName: "OpenITR Synthetic Payers Private Limited",
			deductorTan: "MUMA12345B",
			amountPaidCreditedRaw: "1,20,000.00",
			taxDeductedRaw: "12,000.00",
			tdsDepositedRaw: "12,000.00",
		});

		// The dividend row prints a blank TDS Deposited cell; a blank stays
		// unknown instead of becoming zero.
		expect(
			outcome.tdsObservations.filter(
				(observation) =>
					observation.factKey === "tds.tax-deducted" &&
					observation.record.serialNumber === "2",
			),
		).toHaveLength(1);
		expect(
			outcome.tdsObservations.filter(
				(observation) =>
					observation.factKey === "tds.tds-deposited" &&
					observation.record.serialNumber === "2",
			),
		).toHaveLength(0);
	});

	test("returns evidence pages beside the observations", async () => {
		const outcome = await extractedOrThrow(createForm16APdfFixture());

		expect(outcome.pages).toHaveLength(1);
		const lines = outcome.pages[0]?.lines ?? [];
		expect(lines.map((line) => line.text)).toContain(FORM16A_DEDUCTOR_NAME_LINE);
		expect(lines.map((line) => line.text)).toContain(FORM16A_DEDUCTOR_TAN_LINE);
	});

	test("is deterministic for byte-identical certificates", async () => {
		const bytes = createForm16APdfFixture();
		const first = await extractFixture(bytes);
		const second = await extractFixture(bytes);

		expect(second).toEqual(first);
	});
});

describe("Form 16A fail-closed extraction", () => {
	test("reports a missing summary section and extracts nothing", async () => {
		const outcome = await extractedOrThrow(
			createForm16APdfFixture({ omitSummarySection: true }),
		);

		expect(outcome.nonSalaryIncomeObservations).toEqual([]);
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_FORM16A_SUMMARY_SECTION_MISSING",
		]);
		expect(outcome.issues[0]?.severity).toBe("review");
		expect(outcome.issues[0]?.recoveryAction.length).toBeGreaterThan(0);
	});

	test("reports a malformed column header row and extracts nothing", async () => {
		const outcome = await extractedOrThrow(
			createForm16APdfFixture({ omitColumnHeader: true }),
		);

		expect(outcome.nonSalaryIncomeObservations).toEqual([]);
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_FORM16A_SUMMARY_COLUMN_HEADER_MALFORMED",
		]);
	});

	test("reports a record with an unparseable amount as malformed", async () => {
		const outcome = await extractedOrThrow(
			createForm16APdfFixture({
				rows: [
					"1 | 194A | Interest other than interest on securities | 1.20.000 | 12,000.00 | 12,000.00",
				],
			}),
		);

		expect(outcome.nonSalaryIncomeObservations).toEqual([]);
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_FORM16A_RECORD_MALFORMED",
		]);
	});

	test("fails closed on an unrecognized section without losing its tax-paid facts", async () => {
		const outcome = await extractedOrThrow(
			createForm16APdfFixture({ addUnknownCategoryRow: true }),
		);

		// The unknown 194J professional-fees row produces no income fact.
		expect(
			outcome.nonSalaryIncomeObservations.map((observation) =>
				String(observation.factKey),
			),
		).toEqual([
			"non-salary-income.dividends",
			"non-salary-income.interest-other-than-securities",
		]);

		// Its reviewed tax-paid cells still become evidence.
		expect(
			outcome.tdsObservations.filter(
				(observation) => observation.record.serialNumber === "3",
			).map((observation) => observation.factKey),
		).toEqual(["tds.tax-deducted", "tds.tds-deposited"]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_FORM16A_CATEGORY_UNKNOWN",
		]);
		expect(outcome.issues[0]?.affectedFactKeys).toEqual([]);
	});

	test("collapses an identical reprinted row into one observation", async () => {
		const outcome = await extractedOrThrow(
			createForm16APdfFixture({ duplicateSerial: "identical" }),
		);

		expect(
			outcome.nonSalaryIncomeObservations.filter(
				(observation) =>
					observation.factKey ===
					"non-salary-income.interest-other-than-securities",
			),
		).toHaveLength(1);
		expect(outcome.issues).toEqual([]);
	});

	test("drops conflicting repeats of one serial as ambiguous evidence", async () => {
		const outcome = await extractedOrThrow(
			createForm16APdfFixture({ duplicateSerial: "conflicting" }),
		);

		expect(
			outcome.nonSalaryIncomeObservations.map((observation) =>
				String(observation.factKey),
			),
		).toEqual(["non-salary-income.dividends"]);
		expect(
			outcome.tdsObservations.filter(
				(observation) => observation.record.serialNumber === "1",
			),
		).toEqual([]);
		// Dropping the conflicted first record must not renumber the rows
		// printed after it: the dividend row stays row 2.
		const dividends = outcome.nonSalaryIncomeObservations[0];
		expect(dividends?.observationId.endsWith(":1:2")).toBe(true);
		expect(
			outcome.tdsObservations.every(
				(observation) =>
					observation.record.medium === "pdf" &&
					observation.record.rowNumber === 2,
			),
		).toBe(true);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_FORM16A_RECORD_AMBIGUOUS",
		]);
		expect(
			outcome.issues[0]?.affectedFactKeys.map(String),
		).toEqual([
			"non-salary-income.interest-other-than-securities",
			"tds.tax-deducted",
			"tds.tds-deposited",
		]);
	});
});

describe("Form 16A rejection classes stay closed at extraction", () => {
	test.each([
		{
			name: "encrypted",
			bytes: (): Uint8Array<ArrayBuffer> =>
				buildSyntheticPdf({
					pages: [
						{ textLines: ["FORM 16A", "Certificate under section 203(2A) of the Income-tax Act, 1961"] },
					],
					encryptionPassword: "openitr-synthetic-lock",
				}),
			rejection: "encrypted",
		},
		{
			name: "damaged",
			bytes: (): Uint8Array<ArrayBuffer> => createDamagedPdfFixture(),
			rejection: "damaged",
		},
		{
			name: "scanned image-only",
			bytes: (): Uint8Array<ArrayBuffer> =>
				buildSyntheticPdf({ pages: [{ imageOnly: true }] }),
			rejection: "image-only",
		},
	])("rejects a %s certificate before extracting any fact", async ({
		bytes,
		rejection,
	}) => {
		const outcome = await extractFixture(bytes());

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe(rejection);
		}
	});

	test("rejects non-PDF bytes that no adapter claims", async () => {
		const outcome = await extractFixture(utf8Bytes("not a pdf at all"));

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("unknown-format");
		}
	});
});
