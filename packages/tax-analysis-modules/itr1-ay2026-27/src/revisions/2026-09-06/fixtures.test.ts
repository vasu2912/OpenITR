import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260906 } from "./rule-pack";

describe("2026-09-06 rule-pack revision", () => {
	test("pins every v1 other-source category and both family-pension limits", () => {
		expect(itr1Ay202627RulePack20260906.identity.sourceManifestSha256).toBe("80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577");
		expect(itr1Ay202627RulePack20260906.identity.compiledPackSha256).toBe("98e74a66cc8e0ccc43df7bd443a2dc87425d18a94680818eeac8130e5a44c82f");
		expect(itr1Ay202627RulePack20260906.taxConstants?.otherSources).toMatchObject({
			familyPensionDeductionDivisor: 3,
			oldRegimeFamilyPensionDeductionLimitWholeRupees: 15000,
			newRegimeFamilyPensionDeductionLimitWholeRupees: 25000,
		});
		expect(
			itr1Ay202627RulePack20260906.questions
				.filter((question) => question.affectedResult.resultId === "other-sources")
				.map((question) => String(question.suppliesFact)),
		).toEqual([
			"non-salary-income.dividends",
			"non-salary-income.interest-other-than-securities",
			"non-salary-income.family-pension",
		]);
	});
});
