import { describe, expect, it } from "vitest";

import { exactMoneyFromWholeRupees, parseFactKey, parseIssueCode } from "@openitr/model";

import { itr1Ay202627RulePack20260914 as rulePack } from "../revisions/2026-09-14/rule-pack";
import { computeOldRegime } from "./old-regime";
import type { OldRegimeAcceptedAmounts } from "./old-regime";

const money = exactMoneyFromWholeRupees;
const amounts = (
	overrides: Partial<OldRegimeAcceptedAmounts> = {},
): OldRegimeAcceptedAmounts => ({
	salaryAfterExemptions: money(1_200_000),
	houseProperty: { kind: "loss", amount: money(250_000) },
	bankInterest: money(50_000),
	otherSources: money(100_000),
	section112aGain: money(125_000),
	section112aTax: money(0),
	agriculturalIncome: money(5_000),
	deductions: {
		savingsAndPension: money(100_000),
		healthAndDisability: money(50_000),
		loanInterest: money(20_000),
		donations: money(20_000),
		remaining: money(10_000),
	},
	...overrides,
});

describe("complete old-regime computation", () => {
	it("reconciles every supported category to taxable income and liability", () => {
		const result = computeOldRegime({
			rulePack,
			input: { kind: "ready", ageCategory: "under-60", amounts: amounts() },
		});

		expect(result).toMatchObject({
			kind: "computed",
			rulePackRevision: "2026-09-14",
			summary: {
				salaryIncome: "1150000",
				housePropertyLoss: "200000",
				bankInterestIncome: "50000",
				otherSourcesIncome: "100000",
				section112aGain: "125000",
				agriculturalIncome: "5000",
				grossTotalIncome: "1225000",
				deductionsAllowed: "200000",
				totalIncome: "1025000",
				normalRateIncome: "900000",
				incomeTaxBeforeRebate: "92500",
				section112aTax: "0",
				surcharge: "0",
				surchargeMarginalRelief: "0",
				cess: "3700",
				finalTaxLiability: "96200",
			},
		});
		if (result.kind !== "computed") throw new Error("Expected computation");
		expect(result.nodes.every((node) => node.rulePackRevision === "2026-09-14")).toBe(true);
		expect(result.nodes.map((node) => node.operation)).toEqual(
			expect.arrayContaining([
				"limit-house-property-loss",
				"subtract-deductions",
				"progressive-band-tax",
				"not-applicable",
				"round-to-nearest-multiple",
			]),
		);
		expect(result.nodes.map((node) => String(node.nodeId))).toEqual(
			expect.arrayContaining([
				"derived.old-regime-bank-interest-income",
				"derived.old-regime-other-sources-income",
				"derived.old-regime-agricultural-income",
				"derived.old-regime-savings-pension-deductions",
				"derived.old-regime-health-disability-deductions",
				"derived.old-regime-loan-interest-deductions",
				"derived.old-regime-donation-deductions",
				"derived.old-regime-remaining-deductions",
			]),
		);
		expect(result.nodes.every((node) => String(node.ruleId).length > 0)).toBe(true);
	});

	it("limits the rebate to normal-rate tax when total income is five lakh", () => {
		const result = computeOldRegime({
			rulePack,
			input: {
				kind: "ready",
				ageCategory: "under-60",
				amounts: amounts({
					salaryAfterExemptions: money(550_000),
					houseProperty: { kind: "income", amount: money(0) },
					bankInterest: money(0),
					otherSources: money(0),
					section112aGain: money(100_000),
					agriculturalIncome: money(0),
					deductions: {
						savingsAndPension: money(100_000),
						healthAndDisability: money(0),
						loanInterest: money(0),
						donations: money(0),
						remaining: money(0),
					},
				}),
			},
		});

		expect(result).toMatchObject({
			kind: "computed",
			summary: {
				totalIncome: "500000",
				normalRateIncome: "400000",
				incomeTaxBeforeRebate: "7500",
				rebateApplied: "7500",
				finalTaxLiability: "0",
			},
		});
	});

	it.each([
		[250_000, "0"],
		[500_000, "12500"],
		[1_000_000, "112500"],
		[1_000_010, "112503"],
	] as const)(
		"applies the under-60 slab boundary at %i rupees",
		(totalIncome, incomeTaxBeforeRebate) => {
			const result = computeOldRegime({
				rulePack,
				input: {
					kind: "ready",
					ageCategory: "under-60",
					amounts: amounts({
						salaryAfterExemptions: money(totalIncome + 50_000),
						houseProperty: { kind: "income", amount: money(0) },
						bankInterest: money(0),
						otherSources: money(0),
						section112aGain: money(0),
						section112aTax: money(0),
						agriculturalIncome: money(0),
						deductions: {
							savingsAndPension: money(0),
							healthAndDisability: money(0),
							loanInterest: money(0),
							donations: money(0),
							remaining: money(0),
						},
					}),
				},
			});

			expect(result).toMatchObject({
				kind: "computed",
				summary: { totalIncome: String(totalIncome), incomeTaxBeforeRebate },
			});
		},
	);

	it.each([
		[500_004, "500000", "12500"],
		[500_005, "500010", "0"],
	] as const)(
		"applies statutory total-income rounding before the rebate test",
		(incomeBeforeRounding, totalIncome, rebateApplied) => {
			const result = computeOldRegime({
				rulePack,
				input: {
					kind: "ready",
					ageCategory: "under-60",
					amounts: amounts({
						salaryAfterExemptions: money(incomeBeforeRounding + 50_000),
						houseProperty: { kind: "income", amount: money(0) },
						bankInterest: money(0),
						otherSources: money(0),
						section112aGain: money(0),
						section112aTax: money(0),
						agriculturalIncome: money(0),
						deductions: {
							savingsAndPension: money(0),
							healthAndDisability: money(0),
							loanInterest: money(0),
							donations: money(0),
							remaining: money(0),
						},
					}),
				},
			});

			expect(result).toMatchObject({
				kind: "computed",
				summary: { totalIncome, rebateApplied },
			});
		},
	);

	it.each([
		["under-60", "7500"],
		["60-to-79", "5000"],
		["80-or-older", "0"],
	] as const)("uses the %s resident slab schedule", (ageCategory, tax) => {
		const result = computeOldRegime({
			rulePack,
			input: {
				kind: "ready",
				ageCategory,
				amounts: amounts({
					salaryAfterExemptions: money(450_000),
					houseProperty: { kind: "income", amount: money(0) },
					bankInterest: money(0),
					otherSources: money(0),
					section112aGain: money(100_010),
					agriculturalIncome: money(0),
					deductions: {
						savingsAndPension: money(0),
						healthAndDisability: money(0),
						loanInterest: money(0),
						donations: money(0),
						remaining: money(0),
					},
				}),
			},
		});
		expect(result).toMatchObject({
			kind: "computed",
			summary: { incomeTaxBeforeRebate: tax, rebateApplied: "0" },
		});
	});

	it("keeps the surcharge and marginal-relief nodes inapplicable at the ITR-1 ceiling", () => {
		const result = computeOldRegime({
			rulePack,
			input: {
				kind: "ready",
				ageCategory: "under-60",
				amounts: amounts({
					salaryAfterExemptions: money(5_050_000),
					houseProperty: { kind: "income", amount: money(0) },
					bankInterest: money(0),
					otherSources: money(0),
					section112aGain: money(0),
					section112aTax: money(0),
					agriculturalIncome: money(0),
					deductions: {
						savingsAndPension: money(0),
						healthAndDisability: money(0),
						loanInterest: money(0),
						donations: money(0),
						remaining: money(0),
					},
				}),
			},
		});

		expect(result).toMatchObject({
			kind: "computed",
			summary: {
				totalIncome: "5000000",
				surcharge: "0",
				surchargeMarginalRelief: "0",
				finalTaxLiability: "1365000",
			},
		});
	});

	it("fails closed when rounded total income exceeds the approved ITR-1 envelope", () => {
		const result = computeOldRegime({
			rulePack,
			input: {
				kind: "ready",
				ageCategory: "under-60",
				amounts: amounts({
					salaryAfterExemptions: money(5_050_010),
					houseProperty: { kind: "income", amount: money(0) },
					bankInterest: money(0),
					otherSources: money(0),
					section112aGain: money(0),
					section112aTax: money(0),
					agriculturalIncome: money(0),
					deductions: {
						savingsAndPension: money(0),
						healthAndDisability: money(0),
						loanInterest: money(0),
						donations: money(0),
						remaining: money(0),
					},
				}),
			},
		});

		expect(result).toEqual({
			kind: "unsupported",
			issues: [
				{
					code: "RULE_OLD_REGIME_ITR1_TOTAL_INCOME_LIMIT_EXCEEDED",
					severity: "blocking",
					affectedFacts: ["scope.total-income"],
					recoveryAction:
						"Use a return-form analysis that supports total income above the ITR-1 limit.",
				},
			],
		});
	});

	it("keeps a missing dependent fact as a blocking issue", () => {
		const result = computeOldRegime({
			rulePack,
			input: {
				kind: "blocked",
				issues: [
					{
						code: parseIssueCode("FACT_SUPER_SENIOR_STATUS_MISSING"),
						severity: "blocking",
						affectedFacts: [parseFactKey("taxpayer.super-senior-citizen")],
						recoveryAction: "Answer the cited age-category question.",
					},
				],
			},
		});
		expect(result).toEqual({
			kind: "blocked",
			issues: [
				{
					code: "FACT_SUPER_SENIOR_STATUS_MISSING",
					severity: "blocking",
					affectedFacts: ["taxpayer.super-senior-citizen"],
					recoveryAction: "Answer the cited age-category question.",
				},
			],
		});
	});
});
