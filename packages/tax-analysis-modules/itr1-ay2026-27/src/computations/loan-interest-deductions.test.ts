import { describe, expect, it } from "vitest";

import { exactMoneyFromWholeRupees, parseFactKey, parseIsoDate } from "@openitr/model";

import { itr1Ay202627RulePack20260911 } from "../revisions/2026-09-11/rule-pack";
import {
	computeLoanInterestDeductions,
	LOAN_INTEREST_DEDUCTION_FACT_KEYS as KEYS,
} from "./loan-interest-deductions";
import type { LoanInterestDeductionFact } from "./loan-interest-deductions";

const origin = Object.freeze({ kind: "attested-answer" as const, answerId: "answer-1" });
const fact = (
	factKey: string,
	value: LoanInterestDeductionFact["value"],
): LoanInterestDeductionFact => ({ factKey: parseFactKey(factKey), value, origin });
const selected = (
	category:
		| "section80ePresent"
		| "section80eePresent"
		| "section80eeaPresent"
		| "section80eebPresent",
): LoanInterestDeductionFact[] =>
	(["section80ePresent", "section80eePresent", "section80eeaPresent", "section80eebPresent"] as const).map(
		(key) => fact(KEYS[key], key === category),
	);

describe("loan-interest deductions", () => {
	it("allows actual section 80E interest within the eight-year period only under the old regime", () => {
		const result = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: [
				...selected("section80ePresent"),
				fact(KEYS.section80eBorrower, true),
				fact(KEYS.section80eEligibleStudent, true),
				fact(KEYS.section80eEligibleLender, true),
				fact(KEYS.section80eSanctionDate, parseIsoDate("2017-06-15")),
				fact(KEYS.section80eFirstInterestPaymentDate, parseIsoDate("2018-04-01")),
				fact(KEYS.section80eInterestPaid, exactMoneyFromWholeRupees(220_000)),
				fact(KEYS.section80eLoanDetails, true),
			],
		});

		expect(result.kind).toBe("computed");
		if (result.kind !== "computed") return;
		expect(result.oldRegimeTotal).toBe("220000");
		expect(result.newRegimeTotal).toBe("0");
		expect(result.categories[0]?.category).toBe("80E");
		expect(result.trace.map((node) => node.ruleId)).toContain(
			itr1Ay202627RulePack20260911.taxConstants?.loanInterestDeductions
				?.section80ePeriodRuleId,
		);
	});

	it("blocks section 80E when repayment began before the eligible eight-year period", () => {
		const result = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: [
				...selected("section80ePresent"),
				fact(KEYS.section80eBorrower, true),
				fact(KEYS.section80eEligibleStudent, true),
				fact(KEYS.section80eEligibleLender, true),
				fact(KEYS.section80eSanctionDate, parseIsoDate("2016-06-15")),
				fact(KEYS.section80eFirstInterestPaymentDate, parseIsoDate("2018-03-31")),
				fact(KEYS.section80eInterestPaid, exactMoneyFromWholeRupees(10_000)),
				fact(KEYS.section80eLoanDetails, true),
			],
		});

		expect(result.kind).toBe("blocked");
		expect(result.issues.map((issue) => issue.code)).toContain(
			"FACT_80E_OUTSIDE_DEDUCTION_PERIOD",
		);
	});

	it("enforces section 80EE dates and property thresholds, then caps the deduction", () => {
		const result = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: [
				...selected("section80eePresent"),
				fact(KEYS.section80eeBorrower, true),
				fact(KEYS.section80eeResidentialAcquisition, true),
				fact(KEYS.section80eeEligibleLender, true),
				fact(KEYS.section80eeSanctionDate, parseIsoDate("2017-03-31")),
				fact(KEYS.section80eeLoanAmount, exactMoneyFromWholeRupees(3_500_000)),
				fact(KEYS.section80eePropertyValue, exactMoneyFromWholeRupees(5_000_000)),
				fact(KEYS.section80eeFirstHome, true),
				fact(KEYS.section80eeSection24bExhausted, true),
				fact(KEYS.section80eeAdditionalInterest, exactMoneyFromWholeRupees(70_000)),
				fact(KEYS.section80eeLoanDetails, true),
			],
		});

		expect(result.kind).toBe("computed");
		if (result.kind !== "computed") return;
		expect(result.categories[0]?.oldRegimeAllowed).toBe("50000");

		const overThreshold = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: result.facts.map((candidate) =>
				candidate.factKey === KEYS.section80eeLoanAmount
					? fact(KEYS.section80eeLoanAmount, exactMoneyFromWholeRupees(3_500_001))
					: candidate,
			),
		});
		expect(overThreshold.kind).toBe("blocked");
		expect(overThreshold.issues.map((currentIssue) => currentIssue.code)).toContain(
			"FACT_80EE_LOAN_AMOUNT_EXCEEDS_LIMIT",
		);
	});

	it("blocks section 80EEA overlap with section 80EE and permits the sanction-date boundaries", () => {
		const overlapFacts = selected("section80eeaPresent");
		overlapFacts[1] = fact(KEYS.section80eePresent, true);
		const overlap = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: overlapFacts,
		});
		expect(overlap.kind).toBe("blocked");
		expect(overlap.issues.map((issue) => issue.code)).toContain(
			"FACT_80EE_80EEA_MUTUALLY_EXCLUSIVE",
		);

		const allowed = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: [
				...selected("section80eeaPresent"),
				fact(KEYS.section80eeaBorrower, true),
				fact(KEYS.section80eeaResidentialAcquisition, true),
				fact(KEYS.section80eeaEligibleLender, true),
				fact(KEYS.section80eeaSanctionDate, parseIsoDate("2019-04-01")),
				fact(KEYS.section80eeaStampValue, exactMoneyFromWholeRupees(4_500_000)),
				fact(KEYS.section80eeaFirstHome, true),
				fact(KEYS.section80eeaSection24bExhausted, true),
				fact(KEYS.section80eeaAdditionalInterest, exactMoneyFromWholeRupees(175_000)),
				fact(KEYS.section80eeaLoanDetails, true),
			],
		});
		expect(allowed.kind).toBe("computed");
		if (allowed.kind !== "computed") return;
		expect(allowed.categories[0]?.oldRegimeAllowed).toBe("150000");

		const afterWindow = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: allowed.facts.map((candidate) =>
				candidate.factKey === KEYS.section80eeaSanctionDate
					? fact(KEYS.section80eeaSanctionDate, parseIsoDate("2022-04-01"))
					: candidate,
			),
		});
		expect(afterWindow.kind).toBe("blocked");
		expect(afterWindow.issues.map((currentIssue) => currentIssue.code)).toContain(
			"FACT_80EEA_SANCTION_DATE_INELIGIBLE",
		);
	});

	it("allows eligible electric-vehicle interest and rejects an unsupported purpose", () => {
		const base = [
			...selected("section80eebPresent"),
			fact(KEYS.section80eebBorrower, true),
			fact(KEYS.section80eebElectricVehiclePurchase, true),
			fact(KEYS.section80eebEligibleLender, true),
			fact(KEYS.section80eebSanctionDate, parseIsoDate("2023-03-31")),
			fact(KEYS.section80eebInterestPaid, exactMoneyFromWholeRupees(160_000)),
			fact(KEYS.section80eebNotClaimedElsewhere, true),
			fact(KEYS.section80eebLoanDetails, true),
		];
		const allowed = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: base,
		});
		expect(allowed.kind).toBe("computed");
		if (allowed.kind === "computed") {
			expect(allowed.categories[0]?.oldRegimeAllowed).toBe("150000");
			const beforeWindow = computeLoanInterestDeductions({
				rulePack: itr1Ay202627RulePack20260911,
				facts: allowed.facts.map((candidate) =>
					candidate.factKey === KEYS.section80eebSanctionDate
						? fact(KEYS.section80eebSanctionDate, parseIsoDate("2019-03-31"))
						: candidate,
				),
			});
			expect(beforeWindow.kind).toBe("blocked");
			expect(
				beforeWindow.issues.map((currentIssue) => currentIssue.code),
			).toContain("FACT_80EEB_SANCTION_DATE_INELIGIBLE");
		}

		const unsupported = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: base.map((candidate) =>
				candidate.factKey === KEYS.section80eebElectricVehiclePurchase
					? fact(KEYS.section80eebElectricVehiclePurchase, false)
					: candidate,
			),
		});
		expect(unsupported.kind).toBe("blocked");
		expect(unsupported.issues.map((issue) => issue.code)).toContain(
			"FACT_80EEB_PURPOSE_INELIGIBLE",
		);
	});

	it("blocks missing category details and contradictory facts", () => {
		const missing = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: selected("section80eePresent"),
		});
		expect(missing.kind).toBe("blocked");
		expect(missing.issues.map((issue) => issue.code)).toContain(
			"FACT_80EE_DETAILS_MISSING",
		);

		const conflict = computeLoanInterestDeductions({
			rulePack: itr1Ay202627RulePack20260911,
			facts: [
				...selected("section80ePresent"),
				fact(KEYS.section80eBorrower, true),
				fact(KEYS.section80eBorrower, false),
			],
		});
		expect(conflict.kind).toBe("blocked");
		expect(conflict.issues.map((issue) => issue.code)).toContain(
			"FACT_LOAN_INTEREST_DEDUCTION_CONFLICT",
		);
	});
});
