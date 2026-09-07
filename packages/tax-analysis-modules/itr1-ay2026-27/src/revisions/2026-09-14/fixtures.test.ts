import { describe, expect, it } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260914,
	itr1Ay202627RulePack20260914,
} from "./rule-pack";

describe("2026-09-14 old-regime rule pack", () => {
	it("pins the old-regime schedules and age question", () => {
		expect(itr1Ay202627CompiledRulePack20260914.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-14",
			revision: "2026-09-14",
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"5ea8edfae18d0feeac72fdaaf10e3862cf34a5df96ae7bcb75c08f9264847c91",
		});
		expect(
			itr1Ay202627CompiledRulePack20260914.taxConstants?.oldRegime,
		).toMatchObject({
			standardDeductionWholeRupees: 50_000,
			housePropertyLossSetoffLimitWholeRupees: 200_000,
			itr1TotalIncomeLimitWholeRupees: 5_000_000,
			rebateMaxTotalIncomeWholeRupees: 500_000,
			rebateMaxAmountWholeRupees: 12_500,
			cessRatePercent: 4,
		});
		expect(
			itr1Ay202627RulePack20260914.questions.find(
				(question) => question.id === "taxpayer-super-senior-citizen",
			),
		).toMatchObject({
			suppliesFact: "taxpayer.super-senior-citizen",
			visibility: {
				kind: "fact-boolean-equals",
				factKey: "taxpayer.senior-citizen",
				value: true,
			},
		});
	});
});
