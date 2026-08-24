import type { BankInterestObservation } from "@openitr/model";
import { addExactMoney, parseExactMoney } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	AIS_BANK_INTEREST_DEPOSITS_RECORD,
	AIS_BANK_INTEREST_SAVINGS_RECORD,
	createAisCsvBankInterestFixture,
	createAisJsonBankInterestFixture,
	utf8Bytes,
} from "../testing";
import { createAisCsvAdapter } from "./ais-csv-adapter";
import { createAisJsonAdapter } from "../ais-json/ais-json-adapter";
import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";

const identityOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

const extractWith = async (
	text: string,
	format: "csv" | "json",
) => {
	const adapter = format === "csv" ? createAisCsvAdapter() : createAisJsonAdapter();
	const { extract } = adapter;
	if (extract === undefined) {
		throw new Error("the AIS adapters must support extraction");
	}
	const bytes = utf8Bytes(text);
	const outcome = await extract({
		identity: await identityOf(bytes),
		displayName:
			format === "csv" ? "synthetic-ais.csv" : "synthetic-ais.json",
		bytes,
	});
	if (outcome.kind !== "extracted") {
		throw new Error(`expected ${format} extraction to succeed`);
	}
	return outcome;
};

// The canonical fact fields both representations must agree on. Identity
// fields differ because the bytes differ; evidence differs because each
// representation locates its records in its own way.
const canonicalFactOf = (observation: BankInterestObservation) => {
	const {
		sourceDocumentId: _sourceDocumentId,
		observationId: _observationId,
		adapterId: _adapterId,
		adapterVersion: _adapterVersion,
		evidence: _evidence,
		...canonicalFact
	} = observation;
	return canonicalFact;
};

const csvLocatorSansLine = (observation: BankInterestObservation) => {
	const { evidence } = observation;
	if (evidence.kind !== "csv-record-column") {
		throw new Error("an AIS CSV observation must carry CSV evidence");
	}
	const { line: _line, ...locator } = evidence;
	return locator;
};

describe("equivalent AIS JSON and AIS CSV fixtures", () => {
	test("produce equivalent canonical bank-interest facts", async () => {
		const jsonOutcome = await extractWith(
			createAisJsonBankInterestFixture(),
			"json",
		);
		const csvOutcome = await extractWith(
			createAisCsvBankInterestFixture(),
			"csv",
		);

		expect(csvOutcome.bankInterestObservations).toHaveLength(
			jsonOutcome.bankInterestObservations.length,
		);
		expect(csvOutcome.bankInterestObservations.map(canonicalFactOf)).toEqual(
			jsonOutcome.bankInterestObservations.map(canonicalFactOf),
		);
		expect(
			csvOutcome.bankInterestObservations.map(
				(observation) => observation.adapterId,
			),
		).toEqual(["ais-csv", "ais-csv"]);
		expect(
			jsonOutcome.bankInterestObservations.map(
				(observation) => observation.adapterId,
			),
		).toEqual(["ais-json", "ais-json"]);
		expect(csvOutcome.issues).toEqual(jsonOutcome.issues);

		for (const observation of csvOutcome.bankInterestObservations) {
			expect(csvLocatorSansLine(observation)).toEqual({
				kind: "csv-record-column",
				columnIndex: 3,
				columnHeader: "interestAmount",
				rawValue: `"${observation.originalValue.replace(/^"|"$/g, "")}"`,
			});
		}
	});

	test("feed downstream totals that do not depend on the source representation", async () => {
		const jsonOutcome = await extractWith(
			createAisJsonBankInterestFixture(),
			"json",
		);
		const csvOutcome = await extractWith(
			createAisCsvBankInterestFixture(),
			"csv",
		);

		const totalOf = (observations: readonly BankInterestObservation[]) =>
			observations
				.map((observation) => observation.normalizedValue)
				.reduce((left, right) => addExactMoney(left, right), parseExactMoney("0"));

		expect(totalOf(csvOutcome.bankInterestObservations)).toBe(
			totalOf(jsonOutcome.bankInterestObservations),
		);
	});
});

describe("AIS CSV source ordering", () => {
	test("does not change canonical observation ordering or facts when record rows are reversed", async () => {
		const forwardOutcome = await extractWith(
			createAisCsvBankInterestFixture({
				bankInterestRows: [
					AIS_BANK_INTEREST_SAVINGS_RECORD,
					AIS_BANK_INTEREST_DEPOSITS_RECORD,
				],
			}),
			"csv",
		);
		const reversedOutcome = await extractWith(
			createAisCsvBankInterestFixture({
				bankInterestRows: [
					AIS_BANK_INTEREST_DEPOSITS_RECORD,
					AIS_BANK_INTEREST_SAVINGS_RECORD,
				],
			}),
			"csv",
		);

		const forwardFacts =
			forwardOutcome.bankInterestObservations.map(canonicalFactOf);
		const reversedFacts =
			reversedOutcome.bankInterestObservations.map(canonicalFactOf);
		expect(reversedFacts).toEqual(forwardFacts);

		expect(
			reversedOutcome.bankInterestObservations.map(csvLocatorSansLine),
		).toEqual(forwardOutcome.bankInterestObservations.map(csvLocatorSansLine));
		expect(
			forwardOutcome.bankInterestObservations.map(
				(observation) =>
					observation.evidence.kind === "csv-record-column"
						? observation.evidence.line
						: undefined,
			),
		).toEqual([6, 5]);
		expect(
			reversedOutcome.bankInterestObservations.map(
				(observation) =>
					observation.evidence.kind === "csv-record-column"
						? observation.evidence.line
						: undefined,
			),
		).toEqual([5, 6]);

		expect(reversedOutcome.issues).toEqual([]);
		expect(forwardOutcome.issues).toEqual([]);
	});

	test("produces byte-for-byte identical observations when the same input is extracted twice", async () => {
		const text = createAisCsvBankInterestFixture();
		const firstOutcome = await extractWith(text, "csv");
		const secondOutcome = await extractWith(text, "csv");

		expect(
			JSON.stringify(secondOutcome.bankInterestObservations),
		).toBe(JSON.stringify(firstOutcome.bankInterestObservations));
	});
});
