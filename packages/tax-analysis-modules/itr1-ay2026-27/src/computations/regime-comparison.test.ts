import { exactMoneyFromWholeRupees } from "@openitr/model";
import { describe, expect, test } from "vitest";

import type { NewRegimeComputation } from "./new-regime";
import type { OldRegimeComputation } from "./old-regime";
import { compareRegimes } from "./regime-comparison";

const money = exactMoneyFromWholeRupees;

const oldRegime = (
	overrides: Partial<
		Extract<OldRegimeComputation, { kind: "computed" }>["summary"]
	> = {},
): Extract<OldRegimeComputation, { kind: "computed" }> => ({
	kind: "computed",
	factSetRevision: "fact-set-7",
	rulePackRevision: "old-rules",
	ageCategory: "under-60",
	nodes: [],
	summary: {
		salaryIncome: money(900_000),
		housePropertyIncome: money(0),
		housePropertyLoss: money(0),
		bankInterestIncome: money(0),
		otherSourcesIncome: money(0),
		section112aGain: money(0),
		agriculturalIncome: money(0),
		grossTotalIncome: money(900_000),
		deductionsClaimed: money(50_000),
		deductionsAllowed: money(50_000),
		totalIncome: money(850_000),
		normalRateIncome: money(850_000),
		incomeTaxBeforeRebate: money(40_000),
		section112aTax: money(0),
		rebateApplied: money(0),
		surcharge: money(0),
		surchargeMarginalRelief: money(0),
		cess: money(1_600),
		finalTaxLiability: money(41_600),
		...overrides,
	},
});

const newRegime = (
	overrides: Partial<
		Extract<NewRegimeComputation, { kind: "computed" }>["summary"]
	> = {},
): Extract<NewRegimeComputation, { kind: "computed" }> => ({
	kind: "computed",
	factSetRevision: "fact-set-7",
	rulePackRevision: "new-rules",
	nodes: [],
	deductionComparison: {
		savingsAndPension: {
			oldRegimeAllowed: money(0),
			newRegimeAllowed: money(0),
			excludedFromNewRegime: money(0),
		},
		healthAndDisability: {
			oldRegimeAllowed: money(0),
			newRegimeAllowed: money(0),
			excludedFromNewRegime: money(0),
		},
		loanInterest: {
			oldRegimeAllowed: money(0),
			newRegimeAllowed: money(0),
			excludedFromNewRegime: money(0),
		},
		donations: {
			oldRegimeAllowed: money(0),
			newRegimeAllowed: money(0),
			excludedFromNewRegime: money(0),
		},
		remaining: {
			oldRegimeAllowed: money(0),
			newRegimeAllowed: money(0),
			excludedFromNewRegime: money(0),
		},
	},
	summary: {
		salaryIncome: money(825_000),
		housePropertyIncome: money(0),
		housePropertyLossExcluded: money(0),
		bankInterestIncome: money(0),
		otherSourcesIncome: money(0),
		section112aGain: money(0),
		agriculturalIncome: money(0),
		grossTotalIncome: money(825_000),
		deductionsAllowed: money(0),
		totalIncome: money(825_000),
		normalRateIncome: money(825_000),
		incomeTaxBeforeAdjustments: money(0),
		section112aTax: money(0),
		rebateApplied: money(0),
		marginalReliefApplied: money(0),
		surcharge: money(0),
		surchargeMarginalReliefApplied: money(0),
		cess: money(0),
		finalTaxLiability: money(0),
		...overrides,
	},
});

describe("regime comparison", () => {
	test("compares the same fact revision with exact rows and balances", () => {
		const comparison = compareRegimes({
			oldRegime: oldRegime(),
			newRegime: newRegime(),
			taxesPaid: money(40_000),
		});

		expect(comparison).toMatchObject({
			kind: "computed",
			factSetRevision: "fact-set-7",
			oldRegime: {
				factSetRevision: "fact-set-7",
				rulePackRevision: "old-rules",
				estimatedBalance: { kind: "amount-payable", amount: "1600" },
			},
			newRegime: {
				factSetRevision: "fact-set-7",
				rulePackRevision: "new-rules",
				estimatedBalance: { kind: "refund", amount: "40000" },
			},
		});
		if (comparison.kind !== "computed") throw new Error("Expected comparison");
		expect(comparison.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "taxable-income",
					oldRegimeAmount: "850000",
					newRegimeAmount: "825000",
					difference: { kind: "old-higher", amount: "25000" },
				}),
				expect.objectContaining({ id: "deductions-allowed" }),
				expect.objectContaining({ id: "income-tax-before-adjustments" }),
				expect.objectContaining({ id: "rebate" }),
				expect.objectContaining({ id: "surcharge" }),
				expect.objectContaining({ id: "cess" }),
				expect.objectContaining({ id: "total-tax-liability" }),
			]),
		);
	});

	test("keeps equality neutral and a one-rupee difference exact", () => {
		const equal = compareRegimes({
			oldRegime: oldRegime({ finalTaxLiability: money(100) }),
			newRegime: newRegime({ finalTaxLiability: money(100) }),
			taxesPaid: money(100),
		});
		const nearEqual = compareRegimes({
			oldRegime: oldRegime({ finalTaxLiability: money(101) }),
			newRegime: newRegime({ finalTaxLiability: money(100) }),
			taxesPaid: money(100),
		});

		if (equal.kind !== "computed" || nearEqual.kind !== "computed") {
			throw new Error("Expected comparisons");
		}
		expect(
			equal.rows.find((row) => row.id === "total-tax-liability")?.difference,
		).toEqual({ kind: "equal", amount: "0" });
		expect(
			nearEqual.rows.find((row) => row.id === "total-tax-liability")
				?.difference,
		).toEqual({ kind: "old-higher", amount: "1" });
	});

	test("refuses to compare different fact revisions", () => {
		const comparison = compareRegimes({
			oldRegime: oldRegime(),
			newRegime: { ...newRegime(), factSetRevision: "fact-set-8" },
			taxesPaid: money(0),
		});

		expect(comparison).toEqual({
			kind: "unavailable",
			reason: "fact-set-revision-mismatch",
		});
	});
});
