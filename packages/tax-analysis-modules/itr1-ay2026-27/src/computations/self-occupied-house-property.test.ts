import {
	exactMoneyFromWholeRupees,
	parseFactKey,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260904 } from "../revisions/2026-09-04/rule-pack";
import {
	computeSelfOccupiedHouseProperty,
	type SelfOccupiedHousePropertyFact,
} from "./self-occupied-house-property";

const moneyFact = (
	factKey: "house-property.self-occupied.interest-on-borrowed-capital",
	wholeRupees: number,
): SelfOccupiedHousePropertyFact => ({
	factKey: parseFactKey(factKey),
	value: exactMoneyFromWholeRupees(wholeRupees),
});

const booleanFact = (
	factKey:
		| "house-property.self-occupied.owned-by-taxpayer"
		| "house-property.self-occupied.used-throughout-year"
		| "house-property.self-occupied.loan-for-acquisition-or-construction"
		| "house-property.self-occupied.loan-on-or-after-1999-04-01"
		| "house-property.self-occupied.completed-within-five-years"
		| "house-property.self-occupied.interest-certificate-available",
	value: boolean,
): SelfOccupiedHousePropertyFact => ({
	factKey: parseFactKey(factKey),
	value,
});

const qualifyingFacts = (interest: number): readonly SelfOccupiedHousePropertyFact[] => [
	booleanFact("house-property.self-occupied.owned-by-taxpayer", true),
	booleanFact("house-property.self-occupied.used-throughout-year", true),
	moneyFact("house-property.self-occupied.interest-on-borrowed-capital", interest),
	booleanFact(
		"house-property.self-occupied.loan-for-acquisition-or-construction",
		true,
	),
	booleanFact("house-property.self-occupied.loan-on-or-after-1999-04-01", true),
	booleanFact(
		"house-property.self-occupied.completed-within-five-years",
		true,
	),
	booleanFact(
		"house-property.self-occupied.interest-certificate-available",
		true,
	),
];

describe("computeSelfOccupiedHouseProperty", () => {
	test("applies the old-regime two-lakh limit and disallows the deduction in the new regime", () => {
		const result = computeSelfOccupiedHouseProperty({
			rulePack: itr1Ay202627RulePack20260904,
			propertyCount: 1,
			facts: qualifyingFacts(250000),
		});

		expect(result.kind).toBe("computed");
		if (result.kind !== "computed") return;
		expect(result.oldRegime).toMatchObject({
			annualValue: "0",
			interestDeduction: "200000",
			taxableIncomeEffect: "-200000",
			limitApplied: "200000",
		});
		expect(result.newRegime).toMatchObject({
			annualValue: "0",
			interestDeduction: "0",
			taxableIncomeEffect: "0",
		});
		expect(result.oldRegime.trace.map((node) => node.ruleId)).toContain(
			"ITR1-OR-SELF-OCCUPIED-INTEREST-SECTION-24B",
		);
		expect(result.newRegime.trace.map((node) => node.ruleId)).toContain(
			"ITR1-NR-SELF-OCCUPIED-INTEREST-DISALLOWED-115BAC",
		);
	});

	test.each([
		{ interest: 30000, expected: "30000" },
		{ interest: 200000, expected: "200000" },
		{ interest: 200001, expected: "200000" },
	])("covers the enhanced statutory limit at $interest", ({ interest, expected }) => {
		const result = computeSelfOccupiedHouseProperty({
			rulePack: itr1Ay202627RulePack20260904,
			propertyCount: 1,
			facts: qualifyingFacts(interest),
		});
		expect(result.kind === "computed" ? result.oldRegime.interestDeduction : undefined).toBe(
			expected,
		);
	});

	test("uses the thirty-thousand limit when the enhanced conditions are not met", () => {
		const facts = qualifyingFacts(80000).map((fact) =>
			fact.factKey ===
			parseFactKey("house-property.self-occupied.completed-within-five-years")
				? booleanFact(
						"house-property.self-occupied.completed-within-five-years",
						false,
					)
				: fact,
		);
		const result = computeSelfOccupiedHouseProperty({
			rulePack: itr1Ay202627RulePack20260904,
			propertyCount: 1,
			facts,
		});

		expect(result.kind === "computed" ? result.oldRegime.interestDeduction : undefined).toBe(
			"30000",
		);
	});

	test("blocks the property result without assuming a missing ownership fact", () => {
		const result = computeSelfOccupiedHouseProperty({
			rulePack: itr1Ay202627RulePack20260904,
			propertyCount: 1,
			facts: [],
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issue: {
				code: "FACT_HOUSE_PROPERTY_OWNERSHIP_MISSING",
				affectedFacts: ["house-property.self-occupied.owned-by-taxpayer"],
			},
		});
	});

	test("returns a scoped unsupported issue when the property was let for part of the year", () => {
		const result = computeSelfOccupiedHouseProperty({
			rulePack: itr1Ay202627RulePack20260904,
			propertyCount: 1,
			facts: [
				booleanFact("house-property.self-occupied.owned-by-taxpayer", true),
				booleanFact("house-property.self-occupied.used-throughout-year", false),
			],
		});

		expect(result).toMatchObject({
			kind: "unsupported",
			issue: {
				code: "RULE_HOUSE_PROPERTY_NOT_SELF_OCCUPIED",
				affectedFacts: ["house-property.self-occupied.used-throughout-year"],
			},
		});
	});

	test("blocks contradictory facts instead of selecting one by array order", () => {
		const result = computeSelfOccupiedHouseProperty({
			rulePack: itr1Ay202627RulePack20260904,
			propertyCount: 1,
			facts: [
				booleanFact("house-property.self-occupied.owned-by-taxpayer", true),
				booleanFact("house-property.self-occupied.owned-by-taxpayer", false),
			],
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issue: {
				code: "FACT_HOUSE_PROPERTY_CONFLICT",
				affectedFacts: ["house-property.self-occupied.owned-by-taxpayer"],
			},
		});
	});
});
