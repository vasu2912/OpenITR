import { describe, expect, test } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260910,
	itr1Ay202627RulePack20260910,
} from "./rule-pack";

describe("2026-09-10 health and disability deduction rule pack", () => {
	test("pins the immutable identity", () => {
		expect(itr1Ay202627RulePack20260910.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-10",
			revision: "2026-09-10",
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"337492407784a001cb5e0e4407e18851a63cb0c7c500617170119da956da1647",
		});
	});

	test("pins every category amount and regime rule", () => {
		expect(
			itr1Ay202627CompiledRulePack20260910.taxConstants
				?.healthDisabilityDeductions,
		).toMatchObject({
			healthRegularGroupLimitWholeRupees: 25_000,
			healthSeniorGroupLimitWholeRupees: 50_000,
			healthPreventiveSharedLimitWholeRupees: 5_000,
			healthOverallLimitWholeRupees: 100_000,
			dependentDisabilityAmountWholeRupees: 75_000,
			dependentSevereDisabilityAmountWholeRupees: 125_000,
			specifiedDiseaseLimitWholeRupees: 40_000,
			specifiedDiseaseSeniorLimitWholeRupees: 100_000,
			taxpayerDisabilityAmountWholeRupees: 75_000,
			taxpayerSevereDisabilityAmountWholeRupees: 125_000,
			healthNewRegimeExclusionRuleId: "ITR1-NR-80D-EXCLUSION",
			dependentDisabilityNewRegimeExclusionRuleId:
				"ITR1-NR-80DD-EXCLUSION",
			specifiedDiseaseNewRegimeExclusionRuleId:
				"ITR1-NR-80DDB-EXCLUSION",
			taxpayerDisabilityNewRegimeExclusionRuleId:
				"ITR1-NR-80U-EXCLUSION",
		});
	});

	test("asks category details only after the category is selected", () => {
		const questions = itr1Ay202627RulePack20260910.questions;
		expect(
			questions.find((question) => question.id === "deduction-80d-present"),
		).toMatchObject({ visibility: { kind: "always" } });
		expect(
			questions.find(
				(question) => question.id === "deduction-80d-self-family-premium",
			),
		).toMatchObject({
			visibility: {
				kind: "fact-boolean-equals",
				factKey: "deductions.80d-self-family-claimed",
				value: true,
			},
		});
		expect(
			questions.find(
				(question) => question.id === "deduction-80u-certificate",
			),
		).toMatchObject({
			visibility: {
				kind: "fact-boolean-equals",
				factKey: "deductions.80u-present",
				value: true,
			},
		});
	});
});
