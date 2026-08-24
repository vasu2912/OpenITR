import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	AIS_BANK_INTEREST_DEPOSITS_RECORD,
	AIS_BANK_INTEREST_SAVINGS_RECORD,
	createAisJsonBankInterestFixture,
	utf8Bytes,
} from "../testing";
import { createAisJsonAdapter } from "./ais-json-adapter";

const identityOf = async (
	text: string,
): Promise<Sha256Digest> => {
	const bytes = utf8Bytes(text);
	return (await computeSourceDocumentIdentity({ bytes })).contentSha256;
};

const extractOf = async (text: string) => {
	const bytes = utf8Bytes(text);
	const { extract } = createAisJsonAdapter();
	if (extract === undefined) {
		throw new Error("the AIS JSON adapter must support extraction");
	}
	return extract({
		identity: await identityOf(text),
		displayName: "synthetic-ais.json",
		bytes,
	});
};

describe("AIS JSON bank-interest extraction", () => {
	test("extracts bank-interest records into canonical observations with identities, pointer evidence, and raw values", async () => {
		const text = createAisJsonBankInterestFixture();
		const outcome = await extractOf(text);

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations).toEqual([]);
		expect(outcome.pages).toEqual([]);

		const [deposits, savings] = outcome.bankInterestObservations;
		expect(savings).toMatchObject({
			factKey: "bank-interest.savings-account",
			sourceDocumentId: await identityOf(text),
			adapterId: "ais-json",
			adapterVersion: "1",
			originalValue: '"7,890.25"',
			normalizedValue: "7890.25",
			evidence: {
				kind: "json-pointer",
				pointer: "/interestInformation/bankInterest/0",
			},
		});
		expect(deposits).toMatchObject({
			factKey: "bank-interest.deposits",
			sourceDocumentId: await identityOf(text),
			adapterId: "ais-json",
			adapterVersion: "1",
			originalValue: '"45,678.90"',
			normalizedValue: "45678.9",
			evidence: {
				kind: "json-pointer",
				pointer: "/interestInformation/bankInterest/1",
			},
		});
		expect(savings?.transformationSteps.map((step) => step.operation)).toEqual([
			"trim-whitespace",
			"remove-indian-digit-grouping",
			"parse-exact-rupees",
		]);
	});

	test("collapses an exact repeated record into the first occurrence's observation", async () => {
		const outcome = await extractOf(
			createAisJsonBankInterestFixture({
				bankInterestRecords: [
					AIS_BANK_INTEREST_SAVINGS_RECORD,
					AIS_BANK_INTEREST_SAVINGS_RECORD,
					AIS_BANK_INTEREST_DEPOSITS_RECORD,
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(
			outcome.bankInterestObservations.filter(
				(observation) =>
					observation.factKey === "bank-interest.savings-account",
			),
		).toHaveLength(1);
		expect(outcome.bankInterestObservations).toHaveLength(2);
		expect(outcome.issues).toEqual([]);
	});

	test("reports a conflicting repeated record as ambiguous and emits no guessed amount", async () => {
		const outcome = await extractOf(
			createAisJsonBankInterestFixture({
				bankInterestRecords: [
					AIS_BANK_INTEREST_SAVINGS_RECORD,
					{
						...AIS_BANK_INTEREST_SAVINGS_RECORD,
						interestAmount: "7,890.26",
					},
					AIS_BANK_INTEREST_DEPOSITS_RECORD,
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(
			outcome.bankInterestObservations.map(
				(observation) => observation.factKey,
			),
		).toEqual(["bank-interest.deposits"]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_BANK_INTEREST_RECORD_AMBIGUOUS",
				severity: "review",
				affectedFactKeys: ["bank-interest.savings-account"],
			},
		]);
	});

	test.each([
		[
			"an amount that is not an exact rupee string",
			{ ...AIS_BANK_INTEREST_SAVINGS_RECORD, interestAmount: "1,00,000.5.6" },
		],
		[
			"a numeric amount node",
			{ ...AIS_BANK_INTEREST_SAVINGS_RECORD, interestAmount: 7890 },
		],
		[
			"a missing institution name",
			{
				...AIS_BANK_INTEREST_SAVINGS_RECORD,
				institutionName: undefined,
			},
		],
		["a blank masked account", { ...AIS_BANK_INTEREST_SAVINGS_RECORD, maskedAccountNumber: "   " }],
	] as const)(
		"reports %s as a malformed record without inventing facts",
		async (_label, malformedRecord) => {
			const outcome = await extractOf(
				createAisJsonBankInterestFixture({
					bankInterestRecords: [malformedRecord],
				}),
			);

			if (outcome.kind !== "extracted") {
				throw new Error("expected an extracted outcome");
			}
			expect(outcome.bankInterestObservations).toEqual([]);
			expect(outcome.issues).toMatchObject([
				{
					code: "DOCUMENT_BANK_INTEREST_RECORD_MALFORMED",
					severity: "review",
					affectedFactKeys: ["bank-interest.savings-account"],
				},
			]);
		},
	);

	test("reports records outside the reviewed categories as unknown without guessing their fact", async () => {
		const outcome = await extractOf(
			createAisJsonBankInterestFixture({
				bankInterestRecords: [
					AIS_BANK_INTEREST_DEPOSITS_RECORD,
					{
						recordCategory: "POST_OFFICE_INTEREST",
						institutionName: "OpenITR Synthetic Post Office",
						maskedAccountNumber: "XXXXXX0003",
						interestAmount: "500",
					},
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(
			outcome.bankInterestObservations.map(
				(observation) => observation.factKey,
			),
		).toEqual(["bank-interest.deposits"]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_BANK_INTEREST_CATEGORY_UNKNOWN",
				severity: "review",
				affectedFactKeys: [],
			},
		]);
	});

	test("reports a missing bank-interest section as a typed issue instead of empty success", async () => {
		const outcome = await extractOf(
			createAisJsonBankInterestFixture({ omitInterestSection: true }),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.bankInterestObservations).toEqual([]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_BANK_INTEREST_SECTION_MISSING",
				severity: "review",
				affectedFactKeys: expect.arrayContaining([
					"bank-interest.savings-account",
					"bank-interest.deposits",
				]),
			},
		]);
	});

	test.each([
		["a different schema revision", { schemaVersion: "2027-28" }],
		["a different document type", { documentType: "TIS" }],
	] as const)("rejects %s before extracting any fact", async (_label, override) => {
		const text = JSON.stringify({
			documentType: "AIS",
			schemaVersion: "2026-27",
			taxpayerInformation: {},
			transactionSummary: [],
			interestInformation: {
				bankInterest: [AIS_BANK_INTEREST_SAVINGS_RECORD],
			},
			...override,
		});
		const outcome = await extractOf(text);

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("unknown-format");
			expect(outcome.issue.code).toBe("DOCUMENT_UNKNOWN_FORMAT");
		}
	});

	test("rejects bytes that are not JSON at all", async () => {
		const outcome = await extractOf("definitely not json");

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});

	test("produces byte-for-byte identical observations when the same input is extracted twice", async () => {
		const text = createAisJsonBankInterestFixture();
		const firstOutcome = await extractOf(text);
		const secondOutcome = await extractOf(text);

		if (
			firstOutcome.kind !== "extracted" ||
			secondOutcome.kind !== "extracted"
		) {
			throw new Error("expected two extracted outcomes");
		}
		expect(
			JSON.stringify(secondOutcome.bankInterestObservations),
		).toBe(JSON.stringify(firstOutcome.bankInterestObservations));
	});

	test("keeps every canonical field stable across an equivalent reformatted input", async () => {
		const canonicalOutcome = await extractOf(
			createAisJsonBankInterestFixture(),
		);
		const reformattedText = JSON.stringify(
			{
				interestInformation: {
					bankInterest: [
						{
							recordCategory: AIS_BANK_INTEREST_SAVINGS_RECORD.recordCategory,
							institutionName:
								AIS_BANK_INTEREST_SAVINGS_RECORD.institutionName,
							maskedAccountNumber:
								AIS_BANK_INTEREST_SAVINGS_RECORD.maskedAccountNumber,
							interestAmount: AIS_BANK_INTEREST_SAVINGS_RECORD.interestAmount,
						},
						{
							recordCategory: AIS_BANK_INTEREST_DEPOSITS_RECORD.recordCategory,
							institutionName:
								AIS_BANK_INTEREST_DEPOSITS_RECORD.institutionName,
							maskedAccountNumber:
								AIS_BANK_INTEREST_DEPOSITS_RECORD.maskedAccountNumber,
							interestAmount: AIS_BANK_INTEREST_DEPOSITS_RECORD.interestAmount,
						},
					],
				},
				transactionSummary: [],
				taxpayerInformation: {},
				schemaVersion: "2026-27",
				documentType: "AIS",
			},
			null,
			2,
		);
		const reformattedOutcome = await extractOf(reformattedText);

		if (
			canonicalOutcome.kind !== "extracted" ||
			reformattedOutcome.kind !== "extracted"
		) {
			throw new Error("expected two extracted outcomes");
		}
		expect(reformattedOutcome.bankInterestObservations).toHaveLength(2);
		const [canonicalSavings] = canonicalOutcome.bankInterestObservations;
		const [reformattedSavings] =
			reformattedOutcome.bankInterestObservations;
		if (
			canonicalSavings === undefined ||
			reformattedSavings === undefined
		) {
			throw new Error("expected both inputs to yield observations");
		}
		expect(await identityOf(createAisJsonBankInterestFixture())).toBe(
			canonicalSavings.sourceDocumentId,
		);
		expect(await identityOf(reformattedText)).toBe(
			reformattedSavings.sourceDocumentId,
		);
		expect(reformattedSavings.sourceDocumentId).not.toBe(
			canonicalSavings.sourceDocumentId,
		);
		canonicalOutcome.bankInterestObservations.forEach(
			(observation, index) => {
				const counterpart = reformattedOutcome.bankInterestObservations[index];
				if (counterpart === undefined) {
					throw new Error("expected a counterpart observation");
				}
				const { sourceDocumentId: _s, observationId: _o, ...canonicalRest } =
					observation;
				const {
					sourceDocumentId: _cs,
					observationId: _co,
					...counterpartRest
				} = counterpart;
				expect(counterpartRest).toEqual(canonicalRest);
			},
		);
	});
});
