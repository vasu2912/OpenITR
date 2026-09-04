import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260905 } from "./rule-pack";

describe("2026-09-05 rule-pack revision", () => {
	test("pins the complete house-property rules and two property questionnaires", () => {
		expect(itr1Ay202627RulePack20260905.taxConstants?.houseProperty).toMatchObject({
			letOutStandardDeductionPercent: 30,
			selfOccupiedEnhancedInterestLimitWholeRupees: 200000,
		});
		expect(itr1Ay202627RulePack20260905.questions.filter((question) => String(question.id).startsWith("house-property-1-"))).toHaveLength(11);
		expect(itr1Ay202627RulePack20260905.questions.filter((question) => String(question.id).startsWith("house-property-2-"))).toHaveLength(11);
	});
});
