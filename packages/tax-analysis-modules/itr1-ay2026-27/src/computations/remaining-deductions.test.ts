import { describe, expect, it } from "vitest";

import { exactMoneyFromWholeRupees, parseFactKey } from "@openitr/model";

import { itr1Ay202627RulePack20260913 } from "../revisions/2026-09-13/rule-pack";
import {
	APPROVED_ITR1_DEDUCTION_CATALOG,
	computeRemainingDeductions,
	REMAINING_DEDUCTION_FACT_KEYS as KEYS,
} from "./remaining-deductions";
import type { RemainingDeductionFact } from "./remaining-deductions";

const origin = Object.freeze({
	kind: "attested-answer" as const,
	answerId: "answer-1",
});
const fact = (
	factKey: string,
	value: RemainingDeductionFact["value"],
): RemainingDeductionFact => ({ factKey: parseFactKey(factKey), value, origin });

const absentOptionalCategories = (): RemainingDeductionFact[] => [
	fact(KEYS.section80cchPresent, false),
	fact(KEYS.section80ggPresent, false),
	fact(KEYS.section80ggaPresent, false),
	fact(KEYS.section80ggcPresent, false),
	fact(KEYS.otherDeductionPresent, false),
];

describe("remaining ITR-1 deductions", () => {
	it("classifies every notified ITR-1 deduction without a generic amount escape hatch", () => {
		expect(APPROVED_ITR1_DEDUCTION_CATALOG).toEqual([
			["80C", "implemented-by-savings-pension"],
			["80CCC", "implemented-by-savings-pension"],
			["80CCD(1)", "implemented-by-savings-pension"],
			["80CCD(1B)", "implemented-by-savings-pension"],
			["80CCD(2)", "implemented-by-savings-pension"],
			["80CCH", "implemented-here"],
			["80D", "implemented-by-health-disability"],
			["80DD", "implemented-by-health-disability"],
			["80DDB", "implemented-by-health-disability"],
			["80E", "implemented-by-loan-interest"],
			["80EE", "implemented-by-loan-interest"],
			["80EEA", "implemented-by-loan-interest"],
			["80EEB", "implemented-by-loan-interest"],
			["80G", "implemented-by-donations"],
			["80GG", "implemented-here"],
			["80GGA", "implemented-here"],
			["80GGC", "implemented-here"],
			["80TTA", "implemented-here"],
			["80TTB", "implemented-here"],
			["80U", "implemented-by-health-disability"],
			["any-other", "deliberately-unsupported"],
		]);
	});

	it("applies 80TTA and 80TTB once according to explicit senior status", () => {
		const nonSenior = computeRemainingDeductions({
			rulePack: itr1Ay202627RulePack20260913,
			facts: [
				...absentOptionalCategories(),
				fact(KEYS.savingsInterest, exactMoneyFromWholeRupees(14_000)),
				fact(KEYS.depositInterest, exactMoneyFromWholeRupees(60_000)),
				fact(KEYS.seniorCitizen, false),
			],
		});
		expect(nonSenior).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "10000",
			newRegimeTotal: "0",
			results: expect.arrayContaining([
				expect.objectContaining({ section: "80TTA", oldRegimeAllowed: "10000" }),
				expect.objectContaining({ section: "80TTB", oldRegimeAllowed: "0" }),
			]),
		});

		const senior = computeRemainingDeductions({
			rulePack: itr1Ay202627RulePack20260913,
			facts: [
				...absentOptionalCategories(),
				fact(KEYS.savingsInterest, exactMoneyFromWholeRupees(14_000)),
				fact(KEYS.depositInterest, exactMoneyFromWholeRupees(60_000)),
				fact(KEYS.seniorCitizen, true),
			],
		});
		expect(senior).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "50000",
			results: expect.arrayContaining([
				expect.objectContaining({ section: "80TTA", oldRegimeAllowed: "0" }),
				expect.objectContaining({ section: "80TTB", oldRegimeAllowed: "50000" }),
			]),
		});
	});

	it("computes 80GG, 80GGA, 80GGC, and 80CCH from eligible facts", () => {
		const result = computeRemainingDeductions({
			rulePack: itr1Ay202627RulePack20260913,
			facts: [
				fact(KEYS.savingsInterest, exactMoneyFromWholeRupees(0)),
				fact(KEYS.depositInterest, exactMoneyFromWholeRupees(0)),
				fact(KEYS.seniorCitizen, false),
				fact(KEYS.section80cchPresent, true),
				fact(KEYS.section80cchEligible, true),
				fact(KEYS.section80cchAgeEligible, true),
				fact(KEYS.section80cchCentralGovernmentEmployee, true),
				fact(KEYS.section80cchTaxpayerContribution, exactMoneyFromWholeRupees(40_000)),
				fact(KEYS.section80cchGovernmentContribution, exactMoneyFromWholeRupees(30_000)),
				fact(KEYS.section80cchSalary, exactMoneyFromWholeRupees(100_000)),
				fact(KEYS.section80cchDetailsAvailable, true),
				fact(KEYS.section80ggPresent, true),
				fact(KEYS.section80ggRentPaid, exactMoneyFromWholeRupees(120_000)),
				fact(KEYS.section80ggAdjustedTotalIncome, exactMoneyFromWholeRupees(400_000)),
				fact(KEYS.section80ggHraReceived, false),
				fact(KEYS.section80ggDisqualifyingProperty, false),
				fact(KEYS.section80ggForm10baDetails, true),
				fact(KEYS.section80ggaPresent, true),
				fact(KEYS.section80ggaAmount, exactMoneyFromWholeRupees(5_000)),
				fact(KEYS.section80ggaEligiblePurpose, true),
				fact(KEYS.section80ggaBusinessIncome, false),
				fact(KEYS.section80ggaCashPayment, false),
				fact(KEYS.section80ggaDetailsAvailable, true),
				fact(KEYS.section80ggcPresent, true),
				fact(KEYS.section80ggcAmount, exactMoneyFromWholeRupees(7_000)),
				fact(KEYS.section80ggcEligibleRecipient, true),
				fact(KEYS.section80ggcCashPayment, false),
				fact(KEYS.section80ggcDateWithinYear, true),
				fact(KEYS.section80ggcGrossTotalIncome, exactMoneyFromWholeRupees(400_000)),
				fact(KEYS.section80ggcDetailsAvailable, true),
				fact(KEYS.otherDeductionPresent, false),
			],
		});

		expect(result).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "118200",
			newRegimeTotal: "46200",
			results: expect.arrayContaining([
				expect.objectContaining({ section: "80CCH", oldRegimeAllowed: "46200", newRegimeAllowed: "46200" }),
				expect.objectContaining({ section: "80GG", oldRegimeAllowed: "60000", newRegimeAllowed: "0" }),
				expect.objectContaining({ section: "80GGA", oldRegimeAllowed: "5000", newRegimeAllowed: "0" }),
				expect.objectContaining({ section: "80GGC", oldRegimeAllowed: "7000", newRegimeAllowed: "0" }),
			]),
		});
	});

	it("rejects cash and generic unsupported deductions explicitly", () => {
		const result = computeRemainingDeductions({
			rulePack: itr1Ay202627RulePack20260913,
			facts: [
				...absentOptionalCategories().filter(
					(candidate) =>
						candidate.factKey !== KEYS.section80ggaPresent &&
						candidate.factKey !== KEYS.otherDeductionPresent,
				),
				fact(KEYS.savingsInterest, exactMoneyFromWholeRupees(0)),
				fact(KEYS.depositInterest, exactMoneyFromWholeRupees(0)),
				fact(KEYS.seniorCitizen, false),
				fact(KEYS.section80ggaPresent, true),
				fact(KEYS.section80ggaAmount, exactMoneyFromWholeRupees(2_001)),
				fact(KEYS.section80ggaEligiblePurpose, true),
				fact(KEYS.section80ggaBusinessIncome, false),
				fact(KEYS.section80ggaCashPayment, true),
				fact(KEYS.section80ggaDetailsAvailable, true),
				fact(KEYS.otherDeductionPresent, true),
			],
		});

		expect(result).toMatchObject({
			kind: "unsupported",
			issues: expect.arrayContaining([
				expect.objectContaining({ code: "RULE_OTHER_DEDUCTION_UNSUPPORTED" }),
				expect.objectContaining({ code: "FACT_80GGA_CASH_PAYMENT_EXCEEDS_LIMIT" }),
			]),
		});
	});
});
