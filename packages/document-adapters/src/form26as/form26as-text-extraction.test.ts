import {
	computeSourceDocumentIdentity,
	parseSha256Digest,
} from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createForm26AsTextFixture,
	FORM26AS_COLUMN_HEADER_CELLS,
	FORM26AS_PART_ONE_TITLE,
	FORM26AS_TDS_RECORD_ONE_CELLS,
	utf8Bytes,
} from "../testing";
import { createForm26AsTextAdapter } from "./form26as-text-adapter";

const identityOf = async (text: string): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes: utf8Bytes(text) }))
		.contentSha256;

const extractOf = async (text: string) => {
	const adapter = createForm26AsTextAdapter();
	if (adapter.extract === undefined) {
		throw new Error("the Form 26AS text adapter must support extraction");
	}
	return adapter.extract({
		identity: await identityOf(text),
		displayName: "synthetic-form26as.txt",
		bytes: utf8Bytes(text),
	});
};

describe("Form 26AS text TDS extraction", () => {
	test("extracts each Part I record into canonical tax-paid observations with line-range evidence and raw values", async () => {
		const text = createForm26AsTextFixture();
		const outcome = await extractOf(text);

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations).toEqual([]);
		expect(outcome.bankInterestObservations).toEqual([]);
		expect(outcome.pages).toEqual([]);
		expect(outcome.issues).toEqual([]);

		const recordOneLine = 7;
		const recordTwoLine = 8;
		const sourceDocumentId = await identityOf(text);

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
			expect(observation.adapterId).toBe("form26as-text");
			expect(observation.adapterVersion).toBe("1");
		}
		for (const observation of outcome.tdsObservations.slice(0, 3)) {
			expect(observation.record).toEqual({
				serialNumber: "1",
				deductorName: "OpenITR Synthetic Employer Private Limited",
				deductorTan: "MUMA12345B",
				firstLine: recordOneLine,
				lastLine: recordOneLine,
				amountPaidCreditedRaw: "10,00,000.00",
				taxDeductedRaw: "50,000.00",
				tdsDepositedRaw: "48,750.00",
			});
		}
		for (const observation of outcome.tdsObservations.slice(3)) {
			expect(observation.record).toEqual({
				serialNumber: "2",
				deductorName: "OpenITR Synthetic Contractor",
				deductorTan: "PUNE23456C",
				firstLine: recordTwoLine,
				lastLine: recordTwoLine,
				amountPaidCreditedRaw: "2,50,000.00",
				taxDeductedRaw: "",
				tdsDepositedRaw: "12,500.00",
			});
		}

		const [first] = outcome.tdsObservations;
		expect(first?.evidence).toEqual({
			kind: "text-line-range",
			firstLine: recordOneLine,
			lastLine: recordOneLine,
		});
		expect(first?.observationId).toBe(
			`tds.amount-paid-credited@${sourceDocumentId}:${recordOneLine}-${recordOneLine}`,
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
		["a blank deductor name", ["1", "   ", "MUMA12345B", "10", "1", "1"]],
		["a non-numeric serial number", ["x", "Name", "MUMA12345B", "10", "1", "1"]],
		[
			"a row with more cells than the reviewed column header",
			["1", "Name", "MUMA12345B", "10", "1", "1", "extra"],
		],
	] as const)(
		"reports %s as one malformed record without inventing facts",
		async (_label, rowCells) => {
			const text = createForm26AsTextFixture({
				partOneRows: [rowCells.join("\t")],
			});
			const outcome = await extractOf(text);

			if (outcome.kind !== "extracted") {
				throw new Error("expected an extracted outcome");
			}
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
		const text = createForm26AsTextFixture({
			partOneRows: [
				["x", "Name", "MUMA12345B", "10", "1", "1"].join("\t"),
				FORM26AS_TDS_RECORD_ONE_CELLS.join("\t"),
			],
		});
		const outcome = await extractOf(text);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
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
		const text = createForm26AsTextFixture({
			partOneRows: [
				"particulars of some unrelated narrative line",
				FORM26AS_TDS_RECORD_ONE_CELLS.join("\t"),
			],
		});
		const outcome = await extractOf(text);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
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

	test("skips a bare aggregate label line without treating it as a record", async () => {
		const text = createForm26AsTextFixture({
			partOneRows: ["Total", FORM26AS_TDS_RECORD_ONE_CELLS.join("\t")],
		});
		const outcome = await extractOf(text);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.issues).toEqual([]);
		expect(outcome.tdsObservations).toHaveLength(3);
	});

	test("stops Part I scanning at the next part title without reporting its rows as records", async () => {
		const text = [
			"FORM 26AS",
			"Annual Tax Statement under Section 203AA of the Income Tax Act, 1961",
			"Permanent Account Number (PAN)\tPANXXXX9999X",
			"Assessment Year\t2026-27",
			FORM26AS_PART_ONE_TITLE,
			FORM26AS_COLUMN_HEADER_CELLS.join("\t"),
			FORM26AS_TDS_RECORD_ONE_CELLS.join("\t"),
			"Part II - Detail of Tax Collected at Source",
			"Some Part II row that no TDS adapter may interpret\t1",
		].join("\r\n");
		const outcome = await extractOf(text);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.issues).toEqual([]);
		expect(outcome.tdsObservations).toHaveLength(3);
		expect(
			new Set(
				outcome.tdsObservations.map(
					(observation) => observation.evidence.firstLine,
				),
			),
		).toEqual(new Set([7]));
	});

	test("skips the aggregate Total row without treating it as a record or an issue", async () => {
		const text = createForm26AsTextFixture();
		const outcome = await extractOf(text);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.issues).toEqual([]);
		expect(
			outcome.tdsObservations.filter((observation) =>
				Object.values(observation.record).includes("Total"),
			),
		).toEqual([]);
	});

	test("keeps a printed zero amount as zero while blanks stay unknown", async () => {
		const text = createForm26AsTextFixture({
			partOneRows: [
				FORM26AS_TDS_RECORD_ONE_CELLS.map((cell, index) =>
					index === 5 ? "0" : cell,
				).join("\t"),
			],
		});
		const outcome = await extractOf(text);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.issues).toEqual([]);
		const deposited = outcome.tdsObservations.filter(
			(observation) => observation.factKey === "tds.tds-deposited",
		);
		expect(deposited.map((observation) => String(observation.normalizedValue))).toEqual([
			"0",
		]);
	});

	test("reports a missing Part I section as a typed review issue instead of empty success", async () => {
		const outcome = await extractOf(
			createForm26AsTextFixture({ omitPartOne: true }),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
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
		const outcome = await extractOf(
			createForm26AsTextFixture({ omitColumnHeader: true }),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_TDS_COLUMN_HEADER_MALFORMED",
				severity: "review",
			},
		]);
	});

	test.each([
		["an unsupported assessment year", { assessmentYear: "2027-28" }],
	] as const)(
		"rejects %s before extracting any fact",
		async (_label, options) => {
			const text = createForm26AsTextFixture(options);
			const outcome = await extractOf(text);

			expect(outcome.kind).toBe("rejected");
			if (outcome.kind === "rejected") {
				expect(outcome.rejection).toBe("unknown-format");
				expect(outcome.issue.code).toBe("DOCUMENT_UNKNOWN_FORMAT");
			}
		},
	);

	test("rejects bytes that are not a Form 26AS export at all", async () => {
		const outcome = await extractOf("A plain letter about taxes\n");

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});

	test("rejects bytes that are not valid UTF-8", async () => {
		const bytes = new Uint8Array(new ArrayBuffer(4));
		bytes.set([0xff, 0xfe, 0x46, 0x4f]);
		const adapter = createForm26AsTextAdapter();
		if (adapter.extract === undefined) {
			throw new Error("the Form 26AS text adapter must support extraction");
		}
		const outcome = await adapter.extract({
			identity: parseSha256Digest("a".repeat(64)),
			displayName: "form26as.txt",
			bytes,
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});

	test("produces byte-for-byte identical observations when the same input is extracted twice", async () => {
		const text = createForm26AsTextFixture();
		const firstOutcome = await extractOf(text);
		const secondOutcome = await extractOf(text);

		if (
			firstOutcome.kind !== "extracted" ||
			secondOutcome.kind !== "extracted"
		) {
			throw new Error("expected two extracted outcomes");
		}
		expect(JSON.stringify(secondOutcome.tdsObservations)).toBe(
			JSON.stringify(firstOutcome.tdsObservations),
		);
	});

	test("orders observations by document line and then fact key", async () => {
		const outcome = await extractOf(createForm26AsTextFixture());

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(
			outcome.tdsObservations.map((observation) => [
				observation.evidence.firstLine,
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

	test("keeps every canonical field stable across an equivalent reformatted input", async () => {
		const canonicalText = createForm26AsTextFixture();
		const canonicalOutcome = await extractOf(canonicalText);
		const reformattedText = createForm26AsTextFixture().replace(/\r\n/g, "\n");
		const reformattedOutcome = await extractOf(reformattedText);

		if (
			canonicalOutcome.kind !== "extracted" ||
			reformattedOutcome.kind !== "extracted"
		) {
			throw new Error("expected two extracted outcomes");
		}
		expect(reformattedOutcome.tdsObservations).toHaveLength(
			canonicalOutcome.tdsObservations.length,
		);
		const reformattedIdentity = await identityOf(reformattedText);
		canonicalOutcome.tdsObservations.forEach((observation, index) => {
			const counterpart = reformattedOutcome.tdsObservations[index];
			if (counterpart === undefined) {
				throw new Error("expected a counterpart observation");
			}
			expect(reformattedIdentity).toBe(counterpart.sourceDocumentId);
			const { sourceDocumentId: _s, observationId: _o, ...canonicalRest } =
				observation;
			const {
				sourceDocumentId: _cs,
				observationId: _co,
				...counterpartRest
			} = counterpart;
			expect(counterpartRest).toEqual(canonicalRest);
		});
	});
});
