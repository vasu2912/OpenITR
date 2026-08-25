import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createPrefilledItr1JsonFixture,
	PREFILLED_ITR1_SALARY_INFORMATION,
	PREFILLED_ITR1_SENTINEL_EXEMPT_ALLOWANCES,
	PREFILLED_ITR1_SENTINEL_SECTION_17_1_SALARY,
	PREFILLED_ITR1_SENTINEL_TAXABLE_SALARY,
	PREFILLED_ITR1_TDS_RECORD_ONE,
	PREFILLED_ITR1_TDS_RECORD_TWO,
	utf8Bytes,
} from "../testing";
import { createPrefilledItr1JsonAdapter } from "./prefilled-itr1-json-adapter";

const identityOf = async (text: string): Promise<Sha256Digest> => {
	const bytes = utf8Bytes(text);
	return (await computeSourceDocumentIdentity({ bytes })).contentSha256;
};

const extractWithAdapter = async (
	bytes: Uint8Array<ArrayBuffer>,
	identity: Sha256Digest,
) => {
	const { extract } = createPrefilledItr1JsonAdapter();
	if (extract === undefined) {
		throw new Error(
			"the prefilled ITR-1 JSON adapter must support extraction",
		);
	}
	return extract({
		identity,
		displayName: "synthetic-prefilled-itr1.json",
		bytes,
	});
};

const extractOf = async (text: string) =>
	extractWithAdapter(utf8Bytes(text), await identityOf(text));

describe("prefilled ITR-1 JSON salary extraction", () => {
	test("extracts the three reviewed salary facts into observations with identities, pointer evidence, raw representations, and transformations", async () => {
		const text = createPrefilledItr1JsonFixture();
		const outcome = await extractOf(text);

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		// The default fixture also carries two TDS records; they are covered
		// by their own describe block.
		expect(outcome.tdsObservations).toHaveLength(5);
		expect(outcome.bankInterestObservations).toEqual([]);
		expect(outcome.pages).toEqual([]);
		expect(outcome.issues).toEqual([]);

		const [exemptAllowances, section17_1, taxableTotal] =
			outcome.observations;
		expect(exemptAllowances).toMatchObject({
			factKey: "salary.exempt-allowances-section-10",
			sourceDocumentId: await identityOf(text),
			adapterId: "prefilled-itr1-json",
			adapterVersion: "1",
			originalText: `"${PREFILLED_ITR1_SENTINEL_EXEMPT_ALLOWANCES}"`,
			normalizedValue: 150000,
			evidence: {
				kind: "json-pointer",
				pointer: "/salaryInformation/exemptAllowancesSection10",
			},
		});
		expect(section17_1).toMatchObject({
			factKey: "salary.section-17-1",
			sourceDocumentId: await identityOf(text),
			adapterId: "prefilled-itr1-json",
			adapterVersion: "1",
			originalText: `"${PREFILLED_ITR1_SENTINEL_SECTION_17_1_SALARY}"`,
			normalizedValue: 1200000,
			evidence: {
				kind: "json-pointer",
				pointer: "/salaryInformation/section17_1Salary",
			},
		});
		expect(taxableTotal).toMatchObject({
			factKey: "salary.taxable-total",
			sourceDocumentId: await identityOf(text),
			adapterId: "prefilled-itr1-json",
			adapterVersion: "1",
			originalText: `"${PREFILLED_ITR1_SENTINEL_TAXABLE_SALARY}"`,
			normalizedValue: 1050000,
			evidence: {
				kind: "json-pointer",
				pointer: "/salaryInformation/taxableSalaryTotal",
			},
		});
		for (const observation of outcome.observations) {
			expect(
				observation.transformationSteps.map((step) => step.operation),
			).toEqual([
				"trim-whitespace",
				"remove-indian-digit-grouping",
				"parse-whole-rupees",
			]);
		}
	});

	test("keeps an omitted salary section out of the facts without inventing issues", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({ omitSalaryInformation: true }),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations).toEqual([]);
		expect(outcome.issues).toEqual([]);
	});

	test("keeps absent salary properties out of the facts without inventing issues", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({
				salaryInformation: { section17_1Salary: "12,00,000" },
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations.map((o) => o.factKey)).toEqual([
			"salary.section-17-1",
		]);
		expect(outcome.issues).toEqual([]);
	});

	test.each([
		["an empty-string property", ""],
		["a whitespace-only property", "   "],
	])("keeps %s unknown instead of creating a fact", async (_label, blank) => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({
				salaryInformation: { section17_1Salary: blank },
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations).toEqual([]);
		expect(outcome.issues).toEqual([]);
	});

	test("keeps a JSON-null salary property out of the facts without inventing issues", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({
				salaryInformation: { section17_1Salary: null },
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations).toEqual([]);
		expect(outcome.issues).toEqual([]);
	});

	test("ignores unknown properties at the document root and inside reviewed sections", async () => {
		const text = JSON.stringify({
			documentType: "ITR1_PREFILLED",
			schemaVersion: "2026-27",
			someUnknownRootProperty: "99,99,999",
			salaryInformation: {
				section17_1Salary: "12,00,000",
				someUnknownNestedProperty: "88,88,888",
			},
			someUnknownSection: { amount: "77,77,777" },
		});
		const outcome = await extractOf(text);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations.map((o) => o.factKey)).toEqual([
			"salary.section-17-1",
		]);
		expect(outcome.issues).toEqual([]);
	});

	test.each([
		["a numeric node", 1200000],
		["an unparseable text node", "about twelve lakh"],
		["an amount with paise", "12,00,000.50"],
		] as const)(
		"reports %s as a malformed salary field without inventing facts",
		async (_label, malformed) => {
			const outcome = await extractOf(
				createPrefilledItr1JsonFixture({
					salaryInformation: { section17_1Salary: malformed },
				}),
			);

			if (outcome.kind !== "extracted") {
				throw new Error("expected an extracted outcome");
			}
			expect(outcome.observations).toEqual([]);
			expect(outcome.issues).toMatchObject([
				{
					code: "DOCUMENT_SALARY_FIELD_MALFORMED",
					severity: "review",
					affectedFactKeys: ["salary.section-17-1"],
				},
			]);
		},
	);
});

describe("prefilled ITR-1 JSON TDS-on-salary extraction", () => {
	test("extracts each reviewed TDS record into observations with pointer evidence and record-level provenance", async () => {
		const text = createPrefilledItr1JsonFixture();
		const outcome = await extractOf(text);

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.issues).toEqual([]);

		// Record one carries three amounts; record two omits taxDeducted, so
		// only two of its amounts exist.
		expect(outcome.tdsObservations).toHaveLength(5);
		const [firstPaidCredited] = outcome.tdsObservations;
		if (firstPaidCredited === undefined) {
			throw new Error("expected a TDS observation");
		}
		expect(firstPaidCredited).toMatchObject({
			factKey: "tds.amount-paid-credited",
			sourceDocumentId: await identityOf(text),
			adapterId: "prefilled-itr1-json",
			adapterVersion: "1",
			originalValue: '"10,00,000.00"',
			evidence: {
				kind: "json-pointer",
				pointer: "/tdsOnSalary/0/amountPaidCredited",
			},
			record: {
				medium: "json",
				pointer: "/tdsOnSalary/0",
				serialNumber: "1",
				deductorName: "OpenITR Synthetic Employer Private Limited",
				deductorTan: "MUMA12345B",
				amountPaidCreditedRaw: "10,00,000.00",
				taxDeductedRaw: "50,000.00",
				tdsDepositedRaw: "48,750.00",
			},
		});
		for (const observation of outcome.tdsObservations) {
			expect(observation.evidence.kind).toBe("json-pointer");
			expect(
				observation.transformationSteps.map((step) => step.operation),
			).toEqual([
				"trim-whitespace",
				"remove-indian-digit-grouping",
				"parse-exact-rupees",
			]);
		}
		const recordTwoObservations = outcome.tdsObservations.filter(
			(observation) =>
				observation.record.medium === "json" &&
				observation.record.pointer === "/tdsOnSalary/1",
		);
		expect(
			recordTwoObservations.map((observation) => observation.factKey),
		).toEqual(["tds.amount-paid-credited", "tds.tds-deposited"]);
		expect(
			recordTwoObservations[0]?.record.medium === "json"
				? recordTwoObservations[0].record.taxDeductedRaw
				: undefined,
		).toBeUndefined();
	});

	test("keeps an omitted TDS section out of the facts without inventing issues", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({ omitTdsOnSalary: true }),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues).toEqual([]);
	});

	test("extracts an empty TDS section cleanly without inventing issues", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({ tdsOnSalary: [] }),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues).toEqual([]);
	});

	test.each([
		[
			"a record whose serial number is not numeric",
			{ ...PREFILLED_ITR1_TDS_RECORD_ONE, serialNumber: "one" },
		],
		[
			"a record whose deductor TAN is not a TAN",
			{ ...PREFILLED_ITR1_TDS_RECORD_ONE, deductorTan: "MUMA-1234-B" },
		],
		[
			"a record without a deductor name",
			{
				...PREFILLED_ITR1_TDS_RECORD_ONE,
				deductorName: undefined,
			},
		],
		[
			"a record whose amount is unparseable text",
			{ ...PREFILLED_ITR1_TDS_RECORD_ONE, amountPaidCredited: "ten lakh" },
		],
		["a bare text node instead of a record object", "record"],
	] as const)(
		"reports %s as a malformed TDS record without inventing facts",
		async (_label, malformedRecord) => {
			const outcome = await extractOf(
				createPrefilledItr1JsonFixture({
					tdsOnSalary: [malformedRecord],
				}),
			);

			if (outcome.kind !== "extracted") {
				throw new Error("expected an extracted outcome");
			}
			expect(outcome.tdsObservations).toEqual([]);
			expect(outcome.issues).toMatchObject([
				{
					code: "DOCUMENT_TDS_RECORD_MALFORMED",
					severity: "review",
					affectedFactKeys: [
						"tds.amount-paid-credited",
						"tds.tax-deducted",
						"tds.tds-deposited",
					],
					recoveryAction:
						"Select an unmodified official prefilled ITR-1 JSON export so every TDS-on-salary record carries its serial number, deductor name, TAN, and amount properties.",
				},
			]);
		},
	);

	test("keeps one review issue per offending record even when codes repeat", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({
				tdsOnSalary: [
					{ serialNumber: "x", deductorTan: "MUMA12345B" },
					{ ...PREFILLED_ITR1_TDS_RECORD_ONE, taxDeducted: "nope" },
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues).toHaveLength(2);
	});

	test("treats a JSON-null amount property as absent instead of malformed", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({
				tdsOnSalary: [
					{
						...PREFILLED_ITR1_TDS_RECORD_ONE,
						taxDeducted: null,
					},
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.tdsObservations.map((o) => o.factKey)).toEqual([
			"tds.amount-paid-credited",
			"tds.tds-deposited",
		]);
		expect(outcome.issues).toEqual([]);
		const [first] = outcome.tdsObservations;
		if (first?.record.medium !== "json") {
			throw new Error("expected a JSON record");
		}
		expect(first.record.taxDeductedRaw).toBeUndefined();
	});

	test("reports an implausibly long digit amount as malformed instead of a fact", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({
				tdsOnSalary: [
					{
						...PREFILLED_ITR1_TDS_RECORD_ONE,
						amountPaidCredited: "9".repeat(400),
					},
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.issues).toHaveLength(1);
	});

	test("accepts padded identity properties and stores their trimmed values like the sibling adapters do", async () => {
		const outcome = await extractOf(
			createPrefilledItr1JsonFixture({
				tdsOnSalary: [
					{
						...PREFILLED_ITR1_TDS_RECORD_ONE,
						serialNumber: " 1 ",
						deductorName: "  OpenITR Synthetic Employer Private Limited  ",
						deductorTan: " MUMA12345B ",
					},
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.tdsObservations).toHaveLength(3);
		expect(outcome.issues).toEqual([]);
		const [first] = outcome.tdsObservations;
		if (first?.record.medium !== "json") {
			throw new Error("expected a JSON record");
		}
		expect(first.record.serialNumber).toBe("1");
		expect(first.record.deductorName).toBe(
			"OpenITR Synthetic Employer Private Limited",
		);
		expect(first.record.deductorTan).toBe("MUMA12345B");
	});

	test.each([
		["a numeric serial number node", { serialNumber: 1, deductorTan: "MUMA12345B" }],
		["a non-string deductor TAN node", { serialNumber: "1", deductorTan: true }],
	] as const)(
		"reports %s as a malformed TDS record without inventing facts",
		async (_label, partialRecord) => {
			const outcome = await extractOf(
				createPrefilledItr1JsonFixture({
					tdsOnSalary: [partialRecord],
				}),
			);

			if (outcome.kind !== "extracted") {
				throw new Error("expected an extracted outcome");
			}
			expect(outcome.tdsObservations).toEqual([]);
			expect(outcome.issues).toMatchObject([
				{ code: "DOCUMENT_TDS_RECORD_MALFORMED" },
			]);
		},
	);
});

describe("prefilled ITR-1 JSON determinism", () => {
	test("produces byte-for-byte identical observations when the same input is extracted twice", async () => {
		const text = createPrefilledItr1JsonFixture();
		const firstOutcome = await extractOf(text);
		const secondOutcome = await extractOf(text);

		if (
			firstOutcome.kind !== "extracted" ||
			secondOutcome.kind !== "extracted"
		) {
			throw new Error("expected two extracted outcomes");
		}
		expect(JSON.stringify(secondOutcome)).toBe(
			JSON.stringify(firstOutcome),
		);
	});

	test("keeps every canonical field stable when object properties arrive in a different order", async () => {
		const canonicalOutcome = await extractOf(
			createPrefilledItr1JsonFixture(),
		);
		const reorderedText = JSON.stringify({
			tdsOnSalary: [
				{
					tdsDeposited: PREFILLED_ITR1_TDS_RECORD_ONE.tdsDeposited,
					taxDeducted: PREFILLED_ITR1_TDS_RECORD_ONE.taxDeducted,
					amountPaidCredited:
						PREFILLED_ITR1_TDS_RECORD_ONE.amountPaidCredited,
					deductorTan: PREFILLED_ITR1_TDS_RECORD_ONE.deductorTan,
					deductorName: PREFILLED_ITR1_TDS_RECORD_ONE.deductorName,
					serialNumber: PREFILLED_ITR1_TDS_RECORD_ONE.serialNumber,
				},
				{
					tdsDeposited: PREFILLED_ITR1_TDS_RECORD_TWO.tdsDeposited,
					amountPaidCredited:
						PREFILLED_ITR1_TDS_RECORD_TWO.amountPaidCredited,
					deductorTan: PREFILLED_ITR1_TDS_RECORD_TWO.deductorTan,
					deductorName: PREFILLED_ITR1_TDS_RECORD_TWO.deductorName,
					serialNumber: PREFILLED_ITR1_TDS_RECORD_TWO.serialNumber,
				},
			],
			salaryInformation: {
				taxableSalaryTotal: PREFILLED_ITR1_SALARY_INFORMATION.taxableSalaryTotal,
				exemptAllowancesSection10:
					PREFILLED_ITR1_SALARY_INFORMATION.exemptAllowancesSection10,
				section17_1Salary:
					PREFILLED_ITR1_SALARY_INFORMATION.section17_1Salary,
			},
			schemaVersion: "2026-27",
			documentType: "ITR1_PREFILLED",
		} as Record<string, unknown>);
		const reorderedOutcome = await extractOf(reorderedText);

		if (
			canonicalOutcome.kind !== "extracted" ||
			reorderedOutcome.kind !== "extracted"
		) {
			throw new Error("expected two extracted outcomes");
		}
		expect(reorderedOutcome.observations).toHaveLength(3);
		expect(reorderedOutcome.tdsObservations).toHaveLength(5);
		const canonicalFields = {
			salary: canonicalOutcome.observations,
			tds: canonicalOutcome.tdsObservations,
		};
		const reorderedFields = {
			salary: reorderedOutcome.observations,
			tds: reorderedOutcome.tdsObservations,
		};
		const stripIdentity = <
			T extends { sourceDocumentId: string; observationId: string },
		>(
			observations: readonly T[],
		) =>
			observations.map((observation) => {
				const { sourceDocumentId: _id, observationId: _oid, ...rest } =
					observation;
				return rest;
			});
		expect(stripIdentity(reorderedFields.salary)).toEqual(
			stripIdentity(canonicalFields.salary),
		);
		expect(stripIdentity(reorderedFields.tds)).toEqual(
			stripIdentity(canonicalFields.tds),
		);
	});
});
