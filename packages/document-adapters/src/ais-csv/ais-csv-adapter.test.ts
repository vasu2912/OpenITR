import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { createDocumentInspectionRegistry } from "../registry";
import {
	createAisCsvBankInterestFixture,
	createAisJsonBankInterestFixture,
	createPrivateStatementCsvFixture,
	utf8Bytes,
} from "../testing";
import { createAisCsvAdapter } from "./ais-csv-adapter";
import { createAisJsonAdapter } from "../ais-json/ais-json-adapter";

const identityOf = async (text: string): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes: utf8Bytes(text) }))
		.contentSha256;

const extractOf = async (text: string) => {
	const { extract } = createAisCsvAdapter();
	if (extract === undefined) {
		throw new Error("the AIS CSV adapter must support extraction");
	}
	return extract({
		identity: await identityOf(text),
		displayName: "synthetic-ais.csv",
		bytes: utf8Bytes(text),
	});
};

const expectUnsupportedLayout = async (
	label: string,
	text: string,
): Promise<void> => {
	const outcome = await extractOf(text);
	expect(outcome, label).toMatchObject({
		kind: "rejected",
		rejection: "unknown-format",
		issue: { code: "DOCUMENT_UNKNOWN_FORMAT" },
	});
};

describe("AIS CSV detection", () => {
	test("identifies a synthetic AIS CSV document exactly through the registry", async () => {
		const text = createAisCsvBankInterestFixture();
		const bytes = utf8Bytes(text);

		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(text),
			displayName: "synthetic-ais.csv",
			suppliedMediaType: "text/csv",
			bytes,
		});

		expect(outcome.kind).toBe("identified");
		if (outcome.kind === "identified") {
			expect(outcome.document.documentKind).toBe("ais-csv");
			expect(outcome.document.templateRevision).toBe("2026-27");
			expect(outcome.adapter.adapterId).toBe("ais-csv");
			expect(outcome.adapter.adapterVersion).toBe("1");
		}
	});
});

describe("AIS CSV bank-interest extraction", () => {
	test("maps reviewed rows into canonical observations with row, column, header, and raw-value evidence", async () => {
		const text = createAisCsvBankInterestFixture();
		const outcome = await extractOf(text);

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.observations).toEqual([]);
		expect(outcome.tdsObservations).toEqual([]);
		expect(outcome.pages).toEqual([]);

		const [deposits, savings] = outcome.bankInterestObservations;
		expect(savings).toMatchObject({
			factKey: "bank-interest.savings-account",
			sourceDocumentId: await identityOf(text),
			adapterId: "ais-csv",
			adapterVersion: "1",
			originalValue: '"7,890.25"',
			normalizedValue: "7890.25",
			evidence: {
				kind: "csv-record-column",
				line: 5,
				columnIndex: 3,
				columnHeader: "interestAmount",
				rawValue: '"7,890.25"',
			},
		});
		expect(deposits).toMatchObject({
			factKey: "bank-interest.deposits",
			sourceDocumentId: await identityOf(text),
			adapterId: "ais-csv",
			adapterVersion: "1",
			originalValue: '"45,678.90"',
			normalizedValue: "45678.9",
			evidence: {
				kind: "csv-record-column",
				line: 6,
				columnIndex: 3,
				columnHeader: "interestAmount",
				rawValue: '"45,678.90"',
			},
		});
		expect(savings?.transformationSteps.map((step) => step.operation)).toEqual([
			"trim-whitespace",
			"remove-indian-digit-grouping",
			"parse-exact-rupees",
		]);
	});
});

describe("AIS CSV layout validation", () => {
	test.each([
		[
			"a changed schema revision",
			createAisCsvBankInterestFixture().replace(
				"schemaVersion,2026-27",
				"schemaVersion,2027-28",
			),
		],
		[
			"a changed document type",
			createAisCsvBankInterestFixture().replace(
				"documentType,AIS",
				"documentType,TIS",
			),
		],
		[
			"a missing column header row",
			[
				"documentType,AIS",
				"schemaVersion,2026-27",
				"section,bankInterest",
				'SAVINGS_ACCOUNT,OpenITR Synthetic Bank,XXXXXX0001,"7,890.25"',
			].join("\n"),
		],
		[
			"a renamed header cell",
			createAisCsvBankInterestFixture().replace(
				"interestAmount",
				"interestAmounts",
			),
		],
		[
			"a reordered header row",
			createAisCsvBankInterestFixture().replace(
				"recordCategory,institutionName,maskedAccountNumber,interestAmount",
				"institutionName,recordCategory,maskedAccountNumber,interestAmount",
			),
		],
		[
			"an extra header column",
			`${createAisCsvBankInterestFixture()},extra`,
		],
		[
			"a ragged record row",
			[
				"documentType,AIS",
				"schemaVersion,2026-27",
				"section,bankInterest",
				"recordCategory,institutionName,maskedAccountNumber,interestAmount",
				"SAVINGS_ACCOUNT,OpenITR Synthetic Bank,XXXXXX0001",
			].join("\n"),
		],
		[
			"a semicolon delimiter",
			createAisCsvBankInterestFixture().replace(/,/g, ";"),
		],
		[
			"an interior blank line",
			createAisCsvBankInterestFixture().replace(
				/(?=DEPOSITS)/,
				"\n",
			),
		],
		[
			"an unterminated quoted cell",
			[
				"documentType,AIS",
				"schemaVersion,2026-27",
				"section,bankInterest",
				"recordCategory,institutionName,maskedAccountNumber,interestAmount",
				'SAVINGS_ACCOUNT,OpenITR Synthetic Bank,XXXXXX0001,"7,890.25',
			].join("\n"),
		],
		[
			"text after a closing quote",
			createAisCsvBankInterestFixture().replace(
				'"7,890.25"',
				'"7,890.25"x',
			),
		],
		[
			"a section marker without its column header row",
			["documentType,AIS", "schemaVersion,2026-27", "section,bankInterest"].join(
				"\n",
			),
		],
	] as const)("rejects %s before extracting any fact", async (_label, text) => {
		await expectUnsupportedLayout(_label, text);
	});

	test("rejects bytes that are not valid UTF-8, including UTF-16 byte-order marks", async () => {
		const bytes = new Uint8Array(new ArrayBuffer(4));
		bytes.set([0xff, 0xfe, 0x22, 0x61]);
		const { extract } = createAisCsvAdapter();
		if (extract === undefined) {
			throw new Error("the AIS CSV adapter must support extraction");
		}
		const outcome = await extract({
			identity: await identityOf("unused"),
			displayName: "synthetic-ais.csv",
			bytes,
		});
		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});

	test("stops exact-matching a plausible next revision during inspection", async () => {
		const nextRevision = createAisCsvBankInterestFixture().replace(
			"schemaVersion,2026-27",
			"schemaVersion,2027-28",
		);
		const verdict = await createAisCsvAdapter().inspect({
			identity: await identityOf(nextRevision),
			displayName: "synthetic-ais.csv",
			bytes: utf8Bytes(nextRevision),
		});
		expect(verdict).toEqual({ verdict: "no-match" });
	});

	test("accepts a UTF-8 byte-order mark as the same revision", async () => {
		const bomPrefixed = `\uFEFF${createAisCsvBankInterestFixture()}`;
		const outcome = await extractOf(bomPrefixed);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(
			outcome.bankInterestObservations.map(
				(observation) => observation.factKey,
			),
		).toEqual(["bank-interest.deposits", "bank-interest.savings-account"]);
		expect(outcome.issues).toEqual([]);
	});

	test("accepts CRLF line endings as the same revision", async () => {
		const crlf = createAisCsvBankInterestFixture().replace(/\n/g, "\r\n");
		const outcome = await extractOf(crlf);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(
			outcome.bankInterestObservations.map((observation) => [
				observation.factKey,
				String(observation.normalizedValue),
				observation.evidence.kind === "csv-record-column"
					? observation.evidence.line
					: undefined,
			]),
		).toEqual([
			["bank-interest.deposits", "45678.9", 6],
			["bank-interest.savings-account", "7890.25", 5],
		]);
	});
});

describe("AIS CSV record issues", () => {
	test("reports an unreviewed category as unknown without guessing its fact", async () => {
		const outcome = await extractOf(
			createAisCsvBankInterestFixture({
				bankInterestRows: [
					{
						recordCategory: "POST_OFFICE_INTEREST",
						institutionName: "OpenITR Synthetic Post Office",
						maskedAccountNumber: "XXXXXX0003",
						interestAmount: "500",
					},
					{
						recordCategory: "SAVINGS_ACCOUNT",
						institutionName: "OpenITR Synthetic Bank",
						maskedAccountNumber: "XXXXXX0001",
						interestAmount: "7,890.25",
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
		).toEqual(["bank-interest.savings-account"]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_BANK_INTEREST_CATEGORY_UNKNOWN",
				severity: "review",
				affectedFactKeys: [],
			},
		]);
	});

	test.each([
		[
			"an amount that is not an exact rupee string",
			{
				recordCategory: "SAVINGS_ACCOUNT",
				institutionName: "OpenITR Synthetic Bank",
				maskedAccountNumber: "XXXXXX0001",
				interestAmount: "not-an-amount",
			},
		],
		[
			"a blank institution name",
			{
				recordCategory: "SAVINGS_ACCOUNT",
				institutionName: "",
				maskedAccountNumber: "XXXXXX0001",
				interestAmount: "7,890.25",
			},
		],
		[
			"a blank masked account",
			{
				recordCategory: "SAVINGS_ACCOUNT",
				institutionName: "OpenITR Synthetic Bank",
				maskedAccountNumber: "   ",
				interestAmount: "7,890.25",
			},
		],
		[
			"a missing amount cell",
			{
				recordCategory: "SAVINGS_ACCOUNT",
				institutionName: "OpenITR Synthetic Bank",
				maskedAccountNumber: "XXXXXX0001",
				interestAmount: "",
			},
		],
	] as const)(
		"reports %s as a malformed record without inventing facts",
		async (_label, malformedRow) => {
			const outcome = await extractOf(
				createAisCsvBankInterestFixture({ bankInterestRows: [malformedRow] }),
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

	test("reports a conflicting repeated record as ambiguous and emits no guessed amount", async () => {
		const outcome = await extractOf(
			createAisCsvBankInterestFixture({
				bankInterestRows: [
					{
						recordCategory: "SAVINGS_ACCOUNT",
						institutionName: "OpenITR Synthetic Bank",
						maskedAccountNumber: "XXXXXX0001",
						interestAmount: "7,890.25",
					},
					{
						recordCategory: "SAVINGS_ACCOUNT",
						institutionName: "OpenITR Synthetic Bank",
						maskedAccountNumber: "XXXXXX0001",
						interestAmount: "7,890.26",
					},
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.bankInterestObservations).toEqual([]);
		expect(outcome.issues).toMatchObject([
			{
				code: "DOCUMENT_BANK_INTEREST_RECORD_AMBIGUOUS",
				severity: "review",
				affectedFactKeys: ["bank-interest.savings-account"],
			},
		]);
	});

	test("collapses an identical repeated record into the first occurrence's evidence", async () => {
		const repeatedSavings = {
			recordCategory: "SAVINGS_ACCOUNT",
			institutionName: "OpenITR Synthetic Bank",
			maskedAccountNumber: "XXXXXX0001",
			interestAmount: "7,890.25",
		};
		const outcome = await extractOf(
			createAisCsvBankInterestFixture({
				bankInterestRows: [repeatedSavings, repeatedSavings],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.bankInterestObservations).toHaveLength(1);
		expect(outcome.bankInterestObservations[0]?.evidence).toMatchObject({
			line: 5,
		});
		expect(outcome.issues).toEqual([]);
	});

	test("collapses a repeat whose institution differs only by surrounding whitespace", async () => {
		const outcome = await extractOf(
			createAisCsvBankInterestFixture({
				bankInterestRows: [
					{
						recordCategory: "SAVINGS_ACCOUNT",
						institutionName: "OpenITR Synthetic Bank",
						maskedAccountNumber: "XXXXXX0001",
						interestAmount: "7,890.25",
					},
					{
						recordCategory: "SAVINGS_ACCOUNT",
						institutionName: " OpenITR Synthetic Bank ",
						maskedAccountNumber: " XXXXXX0001 ",
						interestAmount: "7,890.25",
					},
				],
			}),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.bankInterestObservations).toHaveLength(1);
		expect(outcome.issues).toEqual([]);
	});

	test("extracts an empty bank-interest section cleanly without inventing issues", async () => {
		const outcome = await extractOf(
			createAisCsvBankInterestFixture({ bankInterestRows: [] }),
		);

		if (outcome.kind !== "extracted") {
			throw new Error("expected an extracted outcome");
		}
		expect(outcome.bankInterestObservations).toEqual([]);
		expect(outcome.issues).toEqual([]);
	});

	test("reports a missing bank-interest section as a typed issue instead of empty success", async () => {
		const outcome = await extractOf(
			createAisCsvBankInterestFixture({ omitBankInterestSection: true }),
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
});

describe("AIS CSV at the registry seam", () => {
	test("routes an identified AIS CSV revision to its bank-interest extraction", async () => {
		const bytes = utf8Bytes(createAisCsvBankInterestFixture());
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(createAisCsvBankInterestFixture()),
			displayName: "synthetic-ais.csv",
			suppliedMediaType: "text/csv",
			bytes,
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(outcome.bankInterestObservations).toHaveLength(2);
			expect(
				outcome.bankInterestObservations.map(
					(observation) => observation.adapterId,
				),
			).toEqual(["ais-csv", "ais-csv"]);
		}
	});

	test("never lets the AIS CSV and AIS JSON adapters claim each other's bytes", async () => {
		const csvAdapter = createAisCsvAdapter();
		const jsonAdapter = createAisJsonAdapter();
		const csvText = createAisCsvBankInterestFixture();
		const jsonText = createAisJsonBankInterestFixture();

		const csvInspectingJson = await csvAdapter.inspect({
			identity: await identityOf(jsonText),
			displayName: "synthetic-ais.json",
			bytes: utf8Bytes(jsonText),
		});
		const jsonInspectingCsv = await jsonAdapter.inspect({
			identity: await identityOf(csvText),
			displayName: "synthetic-ais.csv",
			bytes: utf8Bytes(csvText),
		});

		expect(csvInspectingJson).toEqual({ verdict: "no-match" });
		expect(jsonInspectingCsv).toEqual({ verdict: "no-match" });
	});

	test("keeps private-statement CSV bytes rejected while AIS CSV support is registered", async () => {
		const text = createPrivateStatementCsvFixture();
		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(text),
			displayName: "synthetic-private-statement.csv",
			suppliedMediaType: "text/csv",
			bytes: utf8Bytes(text),
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "private-institution",
		});
	});
});
