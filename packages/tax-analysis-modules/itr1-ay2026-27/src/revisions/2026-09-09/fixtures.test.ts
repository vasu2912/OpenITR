import { describe, expect, test } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260909,
	itr1Ay202627RulePack20260909,
} from "./rule-pack";

describe("2026-09-09 savings and pension deduction rule pack", () => {
	test("pins the immutable identity", () => {
		expect(itr1Ay202627RulePack20260909.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-09",
			revision: "2026-09-09",
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"9cc7ef16070bb4fb858fdeda855cee9e92a06488af36c7430b36e95665b5136f",
		});
	});

	test("pins shared, category, and regime-specific limits", () => {
		expect(
			itr1Ay202627CompiledRulePack20260909.taxConstants
				?.savingsPensionDeductions,
		).toEqual({
			sharedLimitWholeRupees: 150_000,
			section80ccd1EmployeeSalaryPercent: 10,
			section80ccd1OtherGrossTotalIncomePercent: 20,
			section80ccd1bLimitWholeRupees: 50_000,
			oldRegimeGovernmentEmployerSalaryPercent: 14,
			oldRegimeOtherEmployerSalaryPercent: 10,
			newRegimeEmployerSalaryPercent: 14,
			sharedLimitRuleId: "ITR1-OR-80CCE-SHARED-LIMIT",
			section80ccd1EmployeeLimitRuleId:
				"ITR1-OR-80CCD1-EMPLOYEE-LIMIT",
			section80ccd1OtherLimitRuleId: "ITR1-OR-80CCD1-OTHER-LIMIT",
			section80ccd1bLimitRuleId: "ITR1-OR-80CCD1B-LIMIT",
			oldRegimeGovernmentEmployerLimitRuleId:
				"ITR1-OR-80CCD2-GOVERNMENT-EMPLOYER-LIMIT",
			oldRegimeOtherEmployerLimitRuleId:
				"ITR1-OR-80CCD2-OTHER-EMPLOYER-LIMIT",
			newRegimeEmployerLimitRuleId: "ITR1-NR-80CCD2-EMPLOYER-LIMIT",
			newRegimeExclusionRuleId: "ITR1-NR-CHAPTER-VIA-EXCLUSIONS",
			proofRuleId: "ITR1-SAVINGS-PENSION-SUPPORTING-DETAILS",
		});
	});

	test("publishes progressive typed questions", () => {
		const questions = itr1Ay202627RulePack20260909.questions;
		expect(
			questions.find(
				(question) => question.id === "savings-pension-deductions-present",
			),
		).toMatchObject({ answerSchema: { kind: "boolean" } });
		expect(
			questions.find((question) => question.id === "deduction-80ccd1-employed"),
		).toMatchObject({
			visibility: {
				kind: "fact-money-greater-than",
				factKey: "deductions.80ccd1",
				wholeRupees: 0,
			},
		});
		expect(
			questions.find(
				(question) => question.id === "deduction-80ccd2-other-salary-base",
			),
		).toMatchObject({
			visibility: {
				kind: "fact-money-greater-than",
				factKey: "deductions.80ccd2-other",
			},
		});
	});
});
