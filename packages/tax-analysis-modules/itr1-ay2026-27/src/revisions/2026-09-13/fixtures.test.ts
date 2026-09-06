import { describe, expect, it } from "vitest";

import { itr1Ay202627CompiledRulePack20260913, itr1Ay202627RulePack20260913 } from "./rule-pack";

describe("2026-09-13 remaining deduction rule pack", () => {
	it("pins the immutable identity, constants, and questions", () => {
		expect(itr1Ay202627CompiledRulePack20260913.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-13",
			revision: "2026-09-13",
			sourceManifestSha256: "80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256: "6e5d0eb78682fb7aaed5eab04d0e09334b11b118e03ecca0c89ea6d45f9bcc5a",
		});
		expect(itr1Ay202627CompiledRulePack20260913.taxConstants?.remainingDeductions).toMatchObject({
			section80ttaLimitWholeRupees: 10_000,
			section80ttbLimitWholeRupees: 50_000,
			section80cchSalaryLimitBasisPoints: 4_620,
			section80ggAnnualLimitWholeRupees: 60_000,
			section80ggaCashPaymentLimitWholeRupees: 2_000,
		});
		expect(itr1Ay202627RulePack20260913.questions.filter((question) =>
			String(question.affectedResult.resultId) === "remaining-deductions",
		)).toHaveLength(29);
	});
});
