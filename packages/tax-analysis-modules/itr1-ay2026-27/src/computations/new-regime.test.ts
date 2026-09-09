import { describe, expect, it } from "vitest";

import {
	exactMoneyFromWholeRupees,
	parseFactKey,
	parseIssueCode,
	parseIsoTimestamp,
} from "@openitr/model";

import { itr1Ay202627RulePack20260915 as rulePack } from "../revisions/2026-09-15/rule-pack";
import { computeNewRegime } from "./new-regime";
import type { NewRegimeAcceptedAmounts } from "./new-regime";

const money = exactMoneyFromWholeRupees;
const factSetRevision = "fact-set-1" as const;
const residentAnswer = Object.freeze({
	questionId: rulePack.question.id,
	value: "yes" as const,
	label: "Yes",
	answeredAt: parseIsoTimestamp("2099-01-01T00:00:00.000Z"),
	rulePackId: rulePack.identity.id,
});
const amounts = (
	overrides: Partial<NewRegimeAcceptedAmounts> = {},
): NewRegimeAcceptedAmounts => ({
	salaryAfterExemptions: money(1_200_000),
	houseProperty: { kind: "loss", amount: money(250_000) },
	bankInterest: money(50_000),
	otherSources: money(100_000),
	section112aGain: money(125_000),
	section112aTax: money(0),
	agriculturalIncome: money(5_000),
	deductions: {
		savingsAndPension: {
			oldRegimeAllowed: money(100_000),
			newRegimeAllowed: money(20_000),
		},
		healthAndDisability: {
			oldRegimeAllowed: money(50_000),
			newRegimeAllowed: money(0),
		},
		loanInterest: {
			oldRegimeAllowed: money(20_000),
			newRegimeAllowed: money(0),
		},
		donations: {
			oldRegimeAllowed: money(20_000),
			newRegimeAllowed: money(0),
		},
		remaining: {
			oldRegimeAllowed: money(10_000),
			newRegimeAllowed: money(10_000),
		},
	},
	...overrides,
});

describe("complete new-regime computation", () => {
	it("reconciles every supported category while keeping excluded amounts visible", () => {
		const result = computeNewRegime({
			rulePack,
			residentAnswer,
			input: { kind: "ready", factSetRevision, amounts: amounts() },
		});

		expect(result).toMatchObject({
			kind: "computed",
			rulePackRevision: "2026-09-15",
			summary: {
				salaryIncome: "1125000",
				housePropertyIncome: "0",
				housePropertyLossExcluded: "250000",
				bankInterestIncome: "50000",
				otherSourcesIncome: "100000",
				section112aGain: "125000",
				agriculturalIncome: "5000",
				grossTotalIncome: "1400000",
				deductionsAllowed: "30000",
				totalIncome: "1370000",
				normalRateIncome: "1245000",
				incomeTaxBeforeAdjustments: "66750",
				section112aTax: "0",
				rebateApplied: "0",
				marginalReliefApplied: "21750",
				surcharge: "0",
				cess: "1800",
				finalTaxLiability: "46800",
			},
			deductionComparison: {
				savingsAndPension: {
					oldRegimeAllowed: "100000",
					newRegimeAllowed: "20000",
					excludedFromNewRegime: "80000",
				},
				healthAndDisability: {
					excludedFromNewRegime: "50000",
				},
				loanInterest: { excludedFromNewRegime: "20000" },
				donations: { excludedFromNewRegime: "20000" },
				remaining: { excludedFromNewRegime: "0" },
			},
		});
		if (result.kind !== "computed") throw new Error("Expected computation");
		expect(
			result.nodes.every(
				(node) => node.rulePackRevision === "2026-09-15",
			),
		).toBe(true);
		expect(result.nodes.map((node) => node.operation)).toEqual(
			expect.arrayContaining([
				"aggregate-total-income",
				"limit-house-property-loss",
				"exclude-exempt-income",
				"subtract-deductions",
				"progressive-band-tax",
				"marginal-relief-cap",
				"round-to-nearest-multiple",
			]),
		);
		expect(result.nodes.every((node) => String(node.ruleId).length > 0)).toBe(
			true,
		);
	});

	it("keeps the section 87A test on normal-rate income when section 112A gain is present", () => {
		const result = computeNewRegime({
			rulePack,
			residentAnswer,
			input: {
				kind: "ready",
				factSetRevision,
				amounts: amounts({
					salaryAfterExemptions: money(1_275_000),
					houseProperty: { kind: "income", amount: money(0) },
					bankInterest: money(0),
					otherSources: money(0),
					section112aGain: money(125_000),
					agriculturalIncome: money(0),
					deductions: {
						savingsAndPension: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						healthAndDisability: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						loanInterest: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						donations: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						remaining: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
					},
				}),
			},
		});

		expect(result).toMatchObject({
			kind: "computed",
			summary: {
				totalIncome: "1325000",
				normalRateIncome: "1200000",
				incomeTaxBeforeAdjustments: "60000",
				rebateApplied: "60000",
				finalTaxLiability: "0",
			},
		});
	});

	it("rejects only normal-rate income beyond the ITR-1 ceiling", () => {
		const atCeiling = computeNewRegime({
			rulePack,
			residentAnswer,
			input: {
				kind: "ready",
				factSetRevision,
				amounts: amounts({
					salaryAfterExemptions: money(5_075_000),
					houseProperty: { kind: "income", amount: money(0) },
					bankInterest: money(0),
					otherSources: money(0),
					section112aGain: money(125_000),
					agriculturalIncome: money(0),
					deductions: {
						savingsAndPension: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						healthAndDisability: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						loanInterest: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						donations: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						remaining: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
					},
				}),
			},
		});
		expect(atCeiling).toMatchObject({
			kind: "computed",
			summary: {
				normalRateIncome: "5000000",
				totalIncome: "5125000",
				surcharge: "87500",
				surchargeMarginalReliefApplied: "20500",
			},
		});

		const beyondCeiling = computeNewRegime({
			rulePack,
			residentAnswer,
			input: {
				kind: "ready",
				factSetRevision,
				amounts: amounts({
					salaryAfterExemptions: money(5_075_010),
					houseProperty: { kind: "income", amount: money(0) },
					bankInterest: money(0),
					otherSources: money(0),
					section112aGain: money(0),
					section112aTax: money(0),
					agriculturalIncome: money(0),
					deductions: {
						savingsAndPension: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						healthAndDisability: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						loanInterest: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						donations: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
						remaining: {
							oldRegimeAllowed: money(0),
							newRegimeAllowed: money(0),
						},
					},
				}),
			},
		});
		expect(beyondCeiling).toEqual({
			kind: "unsupported",
			issues: [
				{
					code: "RULE_NEW_REGIME_ITR1_TOTAL_INCOME_LIMIT_EXCEEDED",
					severity: "blocking",
					affectedFacts: ["scope.total-income"],
					recoveryAction:
						"Use a return-form analysis that supports normal-rate total income above the ITR-1 limit.",
				},
			],
		});
	});

	it("preserves missing dependent facts as blocking issues", () => {
		const result = computeNewRegime({
			rulePack,
			residentAnswer,
			input: {
				kind: "blocked",
				issues: [
					{
						code: parseIssueCode("FACT_OTHER_SOURCES_DIVIDENDS_MISSING"),
						severity: "blocking",
						affectedFacts: [
							parseFactKey("non-salary-income.dividends"),
						],
						recoveryAction: "Supply the cited other-source amount.",
					},
				],
			},
		});

		expect(result).toEqual({
			kind: "blocked",
			issues: [
				{
					code: "FACT_OTHER_SOURCES_DIVIDENDS_MISSING",
					severity: "blocking",
					affectedFacts: ["non-salary-income.dividends"],
					recoveryAction: "Supply the cited other-source amount.",
				},
			],
		});
	});
});
