import { parseExactMoney, parseFactKey } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260908 } from "../revisions/2026-09-08/rule-pack";
import {
	AGRICULTURAL_INCOME_FACT_KEY,
	computeAgriculturalIncome,
} from "./agricultural-income";

const fact = (value: string) => ({
	factKey: AGRICULTURAL_INCOME_FACT_KEY,
	value: parseExactMoney(value),
});

describe("agricultural income", () => {
	test.each([
		["4999", "computed"],
		["5000", "computed"],
		["5001", "unsupported"],
	] as const)("classifies ₹%s against the pinned ITR-1 limit", (amount, kind) => {
		expect(
			computeAgriculturalIncome({
				rulePack: itr1Ay202627RulePack20260908,
				applicable: true,
				facts: [fact(amount)],
			}),
		).toMatchObject({ kind });
	});

	test("reports an in-scope amount as exempt and keeps it out of taxable income", () => {
		expect(
			computeAgriculturalIncome({
				rulePack: itr1Ay202627RulePack20260908,
				applicable: true,
				facts: [fact("5000")],
			}),
		).toEqual({
			kind: "computed",
			exemptIncome: "5000",
			includedInTaxableIncome: "0",
			trace: [
				{
					label: "ITR-1 agricultural-income limit",
					ruleId: "ITR1-AGRICULTURAL-INCOME-LIMIT",
					inputs: [AGRICULTURAL_INCOME_FACT_KEY],
					operation:
						"Confirm that agricultural income does not exceed the pinned ₹5000 limit",
					result: "5000",
				},
				{
					label: "Agricultural income reported as exempt",
					ruleId: "ITR1-AGRICULTURAL-INCOME-EXEMPT-REPORTING",
					inputs: [AGRICULTURAL_INCOME_FACT_KEY],
					operation:
						"Report the supported amount as exempt income and exclude it from taxable total income",
					result: "0",
				},
			],
		});
	});

	test("keeps a missing amount unknown instead of treating it as zero", () => {
		expect(
			computeAgriculturalIncome({
				rulePack: itr1Ay202627RulePack20260908,
				applicable: true,
				facts: [],
			}),
		).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_AGRICULTURAL_INCOME_MISSING" },
		});
	});

	test("blocks contradictory agricultural-income values", () => {
		expect(
			computeAgriculturalIncome({
				rulePack: itr1Ay202627RulePack20260908,
				applicable: true,
				facts: [fact("4000"), fact("5000")],
			}),
		).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_AGRICULTURAL_INCOME_CONFLICT" },
		});
	});

	test("rejects facts outside the agricultural-income interface", () => {
		expect(
			computeAgriculturalIncome({
				rulePack: itr1Ay202627RulePack20260908,
				applicable: true,
				facts: [
					{
						factKey: parseFactKey("scope.unrelated"),
						value: parseExactMoney("1"),
					},
				],
			}),
		).toMatchObject({
			kind: "unsupported",
			issue: { code: "RULE_AGRICULTURAL_INCOME_FACT_UNSUPPORTED" },
		});
	});

	test("does no work when agricultural income does not apply", () => {
		expect(
			computeAgriculturalIncome({
				rulePack: itr1Ay202627RulePack20260908,
				applicable: false,
				facts: [],
			}),
		).toEqual({ kind: "not-applicable" });
	});
});
