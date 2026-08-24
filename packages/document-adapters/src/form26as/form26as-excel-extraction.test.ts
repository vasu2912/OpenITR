import {
	computeSourceDocumentIdentity,
} from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createForm26AsExcelFixture,
	FORM26AS_TDS_RECORD_ONE_CELLS,
} from "../testing";
import { createForm26AsExcelAdapter } from "./form26as-excel-adapter";

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

const extractOf = async (bytes: Uint8Array<ArrayBuffer>) => {
	const adapter = createForm26AsExcelAdapter();
	if (adapter.extract === undefined) {
		throw new Error("the Form 26AS Excel adapter must support extraction");
	}
	return adapter.extract({
		identity: await identityOf(bytes),
		displayName: "synthetic-form26as.xlsx",
		bytes,
	});
};

const extractedOf = async (
	options?: Parameters<typeof createForm26AsExcelFixture>[0],
) => {
	const bytes = createForm26AsExcelFixture(options);
	const outcome = await extractOf(bytes);
	if (outcome.kind !== "extracted") {
		throw new Error("expected an extracted outcome");
	}
	return { outcome, sourceDocumentId: await identityOf(bytes) };
};

describe("Form 26AS spreadsheet TDS extraction", () => {
	test("extracts each Part I record into canonical tax-paid observations with cell evidence and raw values", async () => {
		const { outcome, sourceDocumentId } = await extractedOf();

		expect(outcome.observations).toEqual([]);
		expect(outcome.bankInterestObservations).toEqual([]);
		expect(outcome.pages).toEqual([]);
		expect(outcome.issues).toEqual([]);

		expect(
			outcome.tdsObservations.map((observation) => [
				observation.factKey,
				String(observation.normalizedValue),
				observation.originalValue,
			]),
		).toEqual([
			["tds.amount-paid-credited", "1000000", "10,00,000.00"],
			["tds.tax-deducted", "50000", "50,000.00"],
			["tds.tds-deposited", "48750", "48,750.00"],
			["tds.amount-paid-credited", "250000", "2,50,000.00"],
			["tds.tds-deposited", "12500", "12,500.00"],
		]);

		for (const observation of outcome.tdsObservations) {
			expect(observation.sourceDocumentId).toBe(sourceDocumentId);
			expect(observation.adapterId).toBe("form26as-excel");
			expect(observation.adapterVersion).toBe("1");
		}
		for (const observation of outcome.tdsObservations.slice(0, 3)) {
			expect(observation.record).toEqual({
				medium: "spreadsheet",
				sheet: "Form 26AS",
				rowNumber: 7,
				serialNumber: "1",
				deductorName: "OpenITR Synthetic Employer Private Limited",
				deductorTan: "MUMA12345B",
				amountPaidCreditedRaw: "10,00,000.00",
				taxDeductedRaw: "50,000.00",
				tdsDepositedRaw: "48,750.00",
			});
		}
		for (const observation of outcome.tdsObservations.slice(3)) {
			expect(observation.record).toEqual({
				medium: "spreadsheet",
				sheet: "Form 26AS",
				rowNumber: 8,
				serialNumber: "2",
				deductorName: "OpenITR Synthetic Contractor",
				deductorTan: "PUNE23456C",
				amountPaidCreditedRaw: "2,50,000.00",
				taxDeductedRaw: "",
				tdsDepositedRaw: "12,500.00",
			});
		}

		const [first] = outcome.tdsObservations;
		expect(first?.evidence).toEqual({
			kind: "spreadsheet-cell",
			sheet: "Form 26AS",
			cell: "D7",
			rowNumber: 7,
			columnIndex: 3,
			columnHeader: "Total Amount Paid/Credited",
			rawValue: "10,00,000.00",
		});
		expect(first?.observationId).toBe(
			`tds.amount-paid-credited@${sourceDocumentId}:D7`,
		);
		expect(first?.transformationSteps.map((step) => step.operation)).toEqual([
			"trim-whitespace",
			"remove-indian-digit-grouping",
			"parse-exact-rupees",
		]);
	});

	test.each([
		[
			"a TAN that is not a valid deductor identification",
			[
				"1",
				"OpenITR Synthetic Employer Private Limited",
				"not-a-tan",
				"10,00,000.00",
				"50,000.00",
				"48,750.00",
			],
		],
		[
			"a printed amount that is not an exact rupee string",
			[
				"1",
				"OpenITR Synthetic Employer Private Limited",
				"MUMA12345B",
				"10,00,000.5.6",
				"50,000.00",
				"48,750.00",
			],
		],
		[
			"a negative amount cell",
			[
				"1",
				"OpenITR Synthetic Employer Private Limited",
				"MUMA12345B",
				"-500",
				"0",
				"0",
			],
		],
		["a blank deductor name", ["1", "", "MUMA12345B", "10", "1", "1"]],
		["a missing serial number cell", ["", "Name", "MUMA12345B", "10", "1", "1"]],
		["a non-numeric serial number", ["x", "Name", "MUMA12345B", "10", "1", "1"]],
		[
			"a row with more cells than the reviewed column header",
			["1", "Name", "MUMA12345B", "10", "1", "1", "extra"],
		],
	] as const)(
		"reports %s as one malformed record without inventing facts",
		async (_label, rowCells) => {
			const { outcome } = await extractedOf({ partOneRows: [rowCells] });

			expect(outcome.tdsObservations).toEqual([]);
			expect(outcome.issues).toMatchObject([
				{
					code: "DOCUMENT_TDS_RECORD_MALFORMED",
					severity: "review",
					recoveryAction: expect.any(String),
				},
			]);
			expect(outcome.issues[0]?.affectedFactKeys).toEqual([
				"tds.amount-paid-credited",
				"tds.tax-deducted",
				"tds.tds-deposited",
			]);
		},
	);

	test("keeps every well-formed sibling record when one Part I record is malformed", async () => {
		const { outcome } = await extractedOf({
			partOneRows: [
				["x", "Name", "MUMA12345B", "10", "1", "1"],
				[...FORM26AS_TDS_RECORD_ONE_CELLS],
			],
		});

		expect(
			outcome.tdsObservations.map((observation) => observation.factKey),
		).toEqual([
			"tds.amount-paid-credited",
			"tds.tax-deducted",
			"tds.tds-deposited",
		]);
		expect(outcome.issues).toMatchObject([
			{ code: "DOCUMENT_TDS_RECORD_MALFORMED" },
		]);
	});

	test("reports stray prose inside Part I as malformed instead of silently hiding later records", async () => {
		const { outcome } = await extractedOf({
			partOneRows: [
				["particulars of some unrelated narrative line"],
				[...FORM26AS_TDS_RECORD_ONE_CELLS],
			],
		});

		expect(
			outcome.tdsObservations.map((observation) => observation.factKey),
		).toEqual([
			"tds.amount-paid-credited",
			"tds.tax-deducted",
			"tds.tds-deposited",
		]);
		expect(outcome.issues).toMatchObject([
			{ code: "DOCUMENT_TDS_RECORD_MALFORMED" },
		]);
	});

	test("skips a bare aggregate label row without treating it as a record", async () => {
		const { outcome } = await extractedOf({
			partOneRows: [["Total"], [...FORM26AS_TDS_RECORD_ONE_CELLS]],
		});

		expect(outcome.issues).toEqual([]);
		expect(outcome.tdsObservations).toHaveLength(3);
	});

	test("stops Part I scanning at a next-part title without reporting its rows as records", async () => {
		const bytes = createForm26AsExcelFixture({
			partOneRows: [
				[...FORM26AS_TDS_RECORD_ONE_CELLS],
				["Part II - Detail of Tax Collected at Source"],
				["Some Part II row no TDS adapter may interpret", "1"],
			],
		});
		const outcome = await extractOf(bytes);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.issues).toEqual([]);
		expect(outcome.tdsObservations).toHaveLength(3);
		expect(
			new Set(
				outcome.tdsObservations.map((observation) =>
					observation.evidence.kind === "spreadsheet-cell"
						? observation.evidence.rowNumber
						: undefined,
				),
			),
		).toEqual(new Set([7]));
	});

	test("keeps a printed zero amount as zero while blanks stay unknown", async () => {
		const { outcome } = await extractedOf({
			partOneRows: [
				FORM26AS_TDS_RECORD_ONE_CELLS.map((cell, index) =>
					index === 5 ? "0" : cell,
				),
			],
		});

		expect(outcome.issues).toEqual([]);
		const deposited = outcome.tdsObservations.filter(
			(observation) => observation.factKey === "tds.tds-deposited",
		);
		expect(
			deposited.map((observation) =>
				String(observation.normalizedValue),
			),
		).toEqual(["0"]);
	});

	test("treats a never-printed amount cell exactly like a printed blank one", async () => {
		const blankPrinted = await extractedOf({
			partOneRows: [
				[
					"1",
					"OpenITR Synthetic Contractor",
					"PUNE23456C",
					"2,50,000.00",
					"",
					"12,500.00",
				],
			],
		});
		const neverPrinted = await extractedOf({
			partOneRows: [
				[
					"1",
					"OpenITR Synthetic Contractor",
					"PUNE23456C",
					"2,50,000.00",
					undefined,
					"12,500.00",
				],
			],
		});

		expect(neverPrinted.outcome.issues).toEqual(blankPrinted.outcome.issues);
		expect(
			neverPrinted.outcome.tdsObservations.map((observation) => [
				observation.factKey,
				String(observation.normalizedValue),
			]),
		).toEqual(
			blankPrinted.outcome.tdsObservations.map((observation) => [
				observation.factKey,
				String(observation.normalizedValue),
			]),
		);
		const deducted = neverPrinted.outcome.tdsObservations.filter(
			(observation) => observation.factKey === "tds.tax-deducted",
		);
		expect(deducted).toEqual([]);
		expect(
			neverPrinted.outcome.tdsObservations.every(
				(observation) => observation.record.medium === "spreadsheet",
			),
		).toBe(true);
	});

	test("reports a missing Part I section as a typed review issue instead of empty success", async () => {
		const { outcome } = await extractedOf({ omitPartOne: true });

		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_TDS_SECTION_MISSING",
				severity: "review",
				affectedFactKeys: [
					"tds.amount-paid-credited",
					"tds.tax-deducted",
					"tds.tds-deposited",
				],
			},
		]);
	});

	test("reports a wrong Part I column header row as a typed review issue without scanning any record", async () => {
		const { outcome } = await extractedOf({ omitColumnHeader: true });

		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_TDS_COLUMN_HEADER_MALFORMED",
				severity: "review",
			},
		]);
	});

	test("orders observations by sheet row and then fact key", async () => {
		const { outcome } = await extractedOf();

		expect(
			outcome.tdsObservations.map((observation) => [
				observation.evidence.kind === "spreadsheet-cell"
					? observation.evidence.rowNumber
					: undefined,
				observation.factKey,
			]),
		).toEqual([
			[7, "tds.amount-paid-credited"],
			[7, "tds.tax-deducted"],
			[7, "tds.tds-deposited"],
			[8, "tds.amount-paid-credited"],
			[8, "tds.tds-deposited"],
		]);
	});
});
