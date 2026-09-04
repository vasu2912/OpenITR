import { exactMoneyFromWholeRupees, parseFactKey } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260906 } from "../revisions/2026-09-06/rule-pack";
import { computeOtherSources, type OtherSourceFact } from "./other-sources";

const fact = (key: string, value: number): OtherSourceFact => ({
	factKey: parseFactKey(key),
	value: exactMoneyFromWholeRupees(value),
});

const allCategories = (familyPension = 90000): readonly OtherSourceFact[] => [
	fact("non-salary-income.dividends", 25000),
	fact("non-salary-income.interest-other-than-securities", 120000),
	fact("non-salary-income.family-pension", familyPension),
];

describe("computeOtherSources", () => {
	test("keeps every permitted category separate before deriving each regime total", () => {
		const result = computeOtherSources({
			rulePack: itr1Ay202627RulePack20260906,
			applicable: true,
			facts: allCategories(),
		});

		expect(result).toMatchObject({
			kind: "computed",
			grossTotal: "235000",
			oldRegime: {
				familyPensionDeduction: "15000",
				total: "220000",
			},
			newRegime: {
				familyPensionDeduction: "25000",
				total: "210000",
			},
			categories: [
				{ kind: "dividends", amount: "25000" },
				{ kind: "other-interest", amount: "120000" },
				{ kind: "family-pension", amount: "90000" },
			],
		});
		if (result.kind !== "computed") return;
		expect(result.trace.map((node) => node.ruleId)).toEqual([
			"ITR1-OTHER-SOURCES-DIVIDENDS-SECTION-56",
			"ITR1-OTHER-SOURCES-INTEREST-SECTION-56",
			"ITR1-OTHER-SOURCES-FAMILY-PENSION-SECTION-56",
			"ITR1-OR-FAMILY-PENSION-DEDUCTION-SECTION-57-IIA",
			"ITR1-NR-FAMILY-PENSION-DEDUCTION-SECTION-57-IIA",
			"ITR1-OTHER-SOURCES-TOTAL-SECTION-56",
		]);
	});

	test("uses one-third when it is below each family-pension cap", () => {
		const result = computeOtherSources({
			rulePack: itr1Ay202627RulePack20260906,
			applicable: true,
			facts: allCategories(30000),
		});

		expect(result.kind === "computed" ? result.oldRegime : undefined).toEqual({
			familyPensionDeduction: "10000",
			total: "165000",
		});
		expect(result.kind === "computed" ? result.newRegime : undefined).toEqual({
			familyPensionDeduction: "10000",
			total: "165000",
		});
	});

	test("leaves a missing permitted category unknown", () => {
		const result = computeOtherSources({
			rulePack: itr1Ay202627RulePack20260906,
			applicable: true,
			facts: allCategories().slice(0, 2),
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issue: {
				code: "FACT_OTHER_SOURCES_FAMILY_PENSION_MISSING",
				affectedFacts: ["non-salary-income.family-pension"],
			},
		});
	});

	test("rejects an unclassified other-source category", () => {
		const result = computeOtherSources({
			rulePack: itr1Ay202627RulePack20260906,
			applicable: true,
			facts: [...allCategories(), fact("non-salary-income.unknown-category", 1)],
		});

		expect(result).toMatchObject({
			kind: "unsupported",
			issue: {
				code: "RULE_OTHER_SOURCES_CATEGORY_UNSUPPORTED",
				affectedFacts: ["non-salary-income.unknown-category"],
			},
		});
	});

	test("blocks contradictory values for one canonical category", () => {
		const result = computeOtherSources({
			rulePack: itr1Ay202627RulePack20260906,
			applicable: true,
			facts: [...allCategories(), fact("non-salary-income.dividends", 26000)],
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issue: {
				code: "FACT_OTHER_SOURCES_CONFLICT",
				affectedFacts: ["non-salary-income.dividends"],
			},
		});
	});

	test("does not ask for an other-source result when the scope presence answer is No", () => {
		expect(computeOtherSources({
			rulePack: itr1Ay202627RulePack20260906,
			applicable: false,
			facts: [],
		})).toEqual({ kind: "not-applicable" });
	});
});
