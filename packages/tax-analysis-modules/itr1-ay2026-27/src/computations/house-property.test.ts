import {
	exactMoneyFromWholeRupees,
	parseFactKey,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260905 } from "../revisions/2026-09-05/rule-pack";
import {
	computeHouseProperties,
	type HousePropertyFact,
} from "./house-property";

const booleanFact = (
	propertyNumber: 1 | 2,
	name: "owned-by-taxpayer" | "self-occupied-throughout-year" | "vacancy-reduced-rent" | "loan-for-acquisition-or-construction" | "loan-on-or-after-1999-04-01" | "completed-within-five-years" | "interest-certificate-available",
	value: boolean,
): HousePropertyFact => ({
	propertyNumber,
	factKey: parseFactKey(`house-property.${propertyNumber}.${name}`),
	value,
});

const moneyFact = (
	propertyNumber: 1 | 2,
	name: "expected-rent" | "actual-rent" | "municipal-taxes-paid" | "interest-on-borrowed-capital",
	value: number,
): HousePropertyFact => ({
	propertyNumber,
	factKey: parseFactKey(`house-property.${propertyNumber}.${name}`),
	value: exactMoneyFromWholeRupees(value),
});

const letOutFacts = (
	propertyNumber: 1 | 2,
	overrides: Readonly<{
		expectedRent?: number;
		actualRent?: number;
		municipalTaxes?: number;
		interest?: number;
		vacancyReducedRent?: boolean;
	}> = {},
): readonly HousePropertyFact[] => [
	booleanFact(propertyNumber, "owned-by-taxpayer", true),
	booleanFact(propertyNumber, "self-occupied-throughout-year", false),
	moneyFact(propertyNumber, "expected-rent", overrides.expectedRent ?? 240000),
	moneyFact(propertyNumber, "actual-rent", overrides.actualRent ?? 300000),
	booleanFact(propertyNumber, "vacancy-reduced-rent", overrides.vacancyReducedRent ?? false),
	moneyFact(propertyNumber, "municipal-taxes-paid", overrides.municipalTaxes ?? 20000),
	moneyFact(propertyNumber, "interest-on-borrowed-capital", overrides.interest ?? 50000),
];

const selfOccupiedFacts = (
	propertyNumber: 1 | 2,
	interest: number,
): readonly HousePropertyFact[] => [
	booleanFact(propertyNumber, "owned-by-taxpayer", true),
	booleanFact(propertyNumber, "self-occupied-throughout-year", true),
	moneyFact(propertyNumber, "interest-on-borrowed-capital", interest),
	booleanFact(propertyNumber, "loan-for-acquisition-or-construction", true),
	booleanFact(propertyNumber, "loan-on-or-after-1999-04-01", true),
	booleanFact(propertyNumber, "completed-within-five-years", true),
	booleanFact(propertyNumber, "interest-certificate-available", true),
];

describe("computeHouseProperties", () => {
	test("computes each let-out property before the combined result", () => {
		const result = computeHouseProperties({
			rulePack: itr1Ay202627RulePack20260905,
			propertyCount: 2,
			facts: [...letOutFacts(1), ...letOutFacts(2, { actualRent: 180000, municipalTaxes: 10000, interest: 30000, vacancyReducedRent: true })],
		});

		expect(result.kind).toBe("computed");
		if (result.kind !== "computed") return;
		expect(result.properties).toMatchObject([
			{
				propertyNumber: 1,
				occupancy: "let-out",
				annualValue: "280000",
				standardDeduction: "84000",
				interestDeduction: "50000",
				income: { kind: "income", amount: "146000" },
			},
			{
				propertyNumber: 2,
				occupancy: "let-out",
				grossAnnualValue: "180000",
				annualValue: "170000",
				standardDeduction: "51000",
				interestDeduction: "30000",
				income: { kind: "income", amount: "89000" },
			},
		]);
		expect(result.combined).toEqual({ kind: "income", amount: "235000" });
		expect(result.properties[0]?.trace.map((node) => node.ruleId)).toEqual([
			"ITR1-LET-OUT-GROSS-ANNUAL-VALUE-SECTION-23",
			"ITR1-LET-OUT-MUNICIPAL-TAX-SECTION-23",
			"ITR1-LET-OUT-STANDARD-DEDUCTION-SECTION-24A",
			"ITR1-LET-OUT-INTEREST-SECTION-24B",
		]);
	});

	test("uses expected rent when lower actual rent was not caused by vacancy", () => {
		const result = computeHouseProperties({
			rulePack: itr1Ay202627RulePack20260905,
			propertyCount: 1,
			facts: letOutFacts(1, { expectedRent: 240000, actualRent: 180000, vacancyReducedRent: false }),
		});

		expect(result.kind === "computed" ? result.properties[0]?.grossAnnualValue : undefined).toBe("240000");
	});

	test("applies the shared self-occupied interest limit across two properties", () => {
		const result = computeHouseProperties({
			rulePack: itr1Ay202627RulePack20260905,
			propertyCount: 2,
			facts: [...selfOccupiedFacts(1, 150000), ...selfOccupiedFacts(2, 100000)],
		});

		expect(result.kind).toBe("computed");
		if (result.kind !== "computed") return;
		expect(result.properties.map((property) => property.interestDeduction)).toEqual(["150000", "50000"]);
		expect(result.combined).toEqual({ kind: "loss", amount: "200000" });
		expect(result.newRegimeCombined).toEqual({ kind: "income", amount: "0" });
	});

	test("does not add the basic self-occupied limit on top of the shared enhanced limit", () => {
		const secondProperty = selfOccupiedFacts(2, 50000).map((fact) =>
			fact.factKey === parseFactKey("house-property.2.loan-for-acquisition-or-construction")
				? booleanFact(2, "loan-for-acquisition-or-construction", false)
				: fact,
		);
		const result = computeHouseProperties({
			rulePack: itr1Ay202627RulePack20260905,
			propertyCount: 2,
			facts: [...selfOccupiedFacts(1, 190000), ...secondProperty],
		});

		expect(result.kind === "computed" ? result.properties.map((property) => property.interestDeduction) : undefined).toEqual(["190000", "10000"]);
	});

	test.each([3, -1, 1.5])("rejects property count %s outside the approved ITR-1 scope", (propertyCount) => {
		const result = computeHouseProperties({
			rulePack: itr1Ay202627RulePack20260905,
			propertyCount,
			facts: [],
		});

		expect(result).toMatchObject({
			kind: "unsupported",
			issue: {
				code: "RULE_HOUSE_PROPERTY_COUNT_OUTSIDE_ITR1",
				affectedFacts: ["scope.house-property-count"],
			},
		});
	});

	test("keeps missing let-out rent unknown", () => {
		const result = computeHouseProperties({
			rulePack: itr1Ay202627RulePack20260905,
			propertyCount: 1,
			facts: [
				booleanFact(1, "owned-by-taxpayer", true),
				booleanFact(1, "self-occupied-throughout-year", false),
			],
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issue: {
				code: "FACT_HOUSE_PROPERTY_EXPECTED_RENT_MISSING",
				affectedFacts: ["house-property.1.expected-rent"],
			},
		});
	});
});
