import { exactMoneyFromWholeRupees, parseFactKey } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260907 } from "../revisions/2026-09-07/rule-pack";
import {
	computeSection112aCapitalGain,
	type Section112aCapitalGainFact,
} from "./section112a-capital-gain";

const moneyFact = (
	key: string,
	value: number,
): Section112aCapitalGainFact => ({
	factKey: parseFactKey(key),
	value: exactMoneyFromWholeRupees(value),
});

const booleanFact = (
	key: string,
	value: boolean,
): Section112aCapitalGainFact => ({
	factKey: parseFactKey(key),
	value,
});

const supportedFacts = (
	reportedGain = 125000,
): readonly Section112aCapitalGainFact[] => [
	moneyFact("scope.section112a-ltcg", reportedGain),
	booleanFact("capital-gains.section112a-eligible-asset", true),
	booleanFact("capital-gains.section112a-long-term", true),
	booleanFact("capital-gains.section112a-stt-conditions-met", true),
	moneyFact("capital-gains.section112a-sale-consideration", 525000),
	moneyFact(
		"capital-gains.section112a-cost-of-acquisition",
		525000 - reportedGain,
	),
];

describe("computeSection112aCapitalGain", () => {
	test("derives an at-boundary gain and zero tax from the notified form facts", () => {
		const result = computeSection112aCapitalGain({
			rulePack: itr1Ay202627RulePack20260907,
			facts: supportedFacts(),
		});

		expect(result).toMatchObject({
			kind: "computed",
			saleConsideration: "525000",
			costOfAcquisition: "400000",
			gain: "125000",
			taxableGain: "0",
			tax: "0",
		});
		if (result.kind !== "computed") return;
		expect(result.trace.map((node) => node.ruleId)).toEqual([
			"ITR1-SECTION112A-CLASSIFICATION",
			"ITR1-SECTION112A-GAIN-NOTIFIED-FORM",
			"ITR1-SECTION112A-ITR1-LIMIT",
			"ITR1-SECTION112A-TAX",
		]);
		expect(result.trace.at(-1)?.rounding).toBe(
			"Round the exact tax component to the nearest whole rupee",
		);
	});

	test.each([
		[124999, "computed", undefined],
		[125000, "computed", undefined],
		[125001, "unsupported", "RULE_SECTION112A_ITR1_LIMIT_EXCEEDED"],
	] as const)(
		"handles gain %s at the ITR-1 boundary as %s",
		(reportedGain, kind, code) => {
			const result = computeSection112aCapitalGain({
				rulePack: itr1Ay202627RulePack20260907,
				facts: supportedFacts(reportedGain),
			});

			expect(result.kind).toBe(kind);
			if (code !== undefined && result.kind === "unsupported") {
				expect(result.issue.code).toBe(code);
			}
		},
	);

	test.each([
		[
			"capital-gains.section112a-eligible-asset",
			"FACT_SECTION112A_ASSET_CLASSIFICATION_MISSING",
		],
		[
			"capital-gains.section112a-long-term",
			"FACT_SECTION112A_HOLDING_CLASSIFICATION_MISSING",
		],
		[
			"capital-gains.section112a-stt-conditions-met",
			"FACT_SECTION112A_STT_CLASSIFICATION_MISSING",
		],
		[
			"capital-gains.section112a-sale-consideration",
			"FACT_SECTION112A_SALE_CONSIDERATION_MISSING",
		],
		[
			"capital-gains.section112a-cost-of-acquisition",
			"FACT_SECTION112A_COST_OF_ACQUISITION_MISSING",
		],
	] as const)("keeps missing fact %s unresolved", (factKey, code) => {
		const result = computeSection112aCapitalGain({
			rulePack: itr1Ay202627RulePack20260907,
			facts: supportedFacts().filter((fact) => fact.factKey !== factKey),
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issue: { code, affectedFacts: [factKey] },
		});
	});

	test.each([
		"capital-gains.section112a-eligible-asset",
		"capital-gains.section112a-long-term",
		"capital-gains.section112a-stt-conditions-met",
	] as const)("rejects unsupported classification %s", (factKey) => {
		const result = computeSection112aCapitalGain({
			rulePack: itr1Ay202627RulePack20260907,
			facts: supportedFacts().map((fact) =>
				fact.factKey === factKey ? { ...fact, value: false } : fact,
			),
		});

		expect(result).toMatchObject({
			kind: "unsupported",
			issue: {
				code: "RULE_SECTION112A_CLASSIFICATION_UNSUPPORTED",
				affectedFacts: [factKey],
			},
		});
	});

	test("blocks a reported gain that disagrees with sale consideration less cost", () => {
		const result = computeSection112aCapitalGain({
			rulePack: itr1Ay202627RulePack20260907,
			facts: supportedFacts().map((fact) =>
				fact.factKey === "capital-gains.section112a-cost-of-acquisition"
					? moneyFact(fact.factKey, 400001)
					: fact,
			),
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_SECTION112A_GAIN_MISMATCH" },
		});
	});

	test("rejects a capital loss from sale consideration below acquisition cost", () => {
		const result = computeSection112aCapitalGain({
			rulePack: itr1Ay202627RulePack20260907,
			facts: supportedFacts().map((fact) => {
				if (fact.factKey === "capital-gains.section112a-sale-consideration") {
					return moneyFact(fact.factKey, 399999);
				}
				return fact.factKey === "capital-gains.section112a-cost-of-acquisition"
					? moneyFact(fact.factKey, 400000)
					: fact;
			}),
		});

		expect(result).toMatchObject({
			kind: "unsupported",
			issue: { code: "RULE_SECTION112A_CAPITAL_LOSS_UNSUPPORTED" },
		});
	});

	test("does not request transaction facts when the scope gain is zero", () => {
		expect(
			computeSection112aCapitalGain({
				rulePack: itr1Ay202627RulePack20260907,
				facts: [moneyFact("scope.section112a-ltcg", 0)],
			}),
		).toEqual({ kind: "not-applicable" });
	});
});
