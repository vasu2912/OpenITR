import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { createDocumentInspectionRegistry } from "../registry";
import { createAisCsvBankInterestFixture, utf8Bytes } from "../testing";
import { createAisCsvAdapter } from "./ais-csv-adapter";

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
