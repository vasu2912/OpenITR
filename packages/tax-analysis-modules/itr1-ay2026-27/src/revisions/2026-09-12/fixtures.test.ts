import { describe, expect, it } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260912,
	itr1Ay202627RulePack20260912,
} from "./rule-pack";

describe("2026-09-12 donation deduction rule pack", () => {
	it("pins the immutable identity, section 80G constants, and progressive questions", () => {
		expect(itr1Ay202627CompiledRulePack20260912.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-12",
			revision: "2026-09-12",
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"b5a0955a28d81493a18ebed587564e8f00865d739163cee30397d0d07508e48f",
		});
		expect(
			itr1Ay202627CompiledRulePack20260912.taxConstants
				?.donationDeductions,
		).toMatchObject({
			cashPaymentLimitWholeRupees: 2_000,
			adjustedGrossTotalIncomeLimitPercent: 10,
			fullQualifyingPercent: 100,
			halfQualifyingPercent: 50,
		});
		expect(
			itr1Ay202627RulePack20260912.questions.filter((question) =>
				String(question.suppliesFact).startsWith("deductions.80g"),
			),
		).toHaveLength(10);
		expect(
			itr1Ay202627RulePack20260912.questions.find(
				(question) => question.id === "deduction-80g-adjusted-gti",
			)?.visibility,
		).toEqual({
			kind: "fact-boolean-equals",
			factKey: "deductions.80g-subject-to-qualifying-limit",
			value: true,
		});
	});
});
