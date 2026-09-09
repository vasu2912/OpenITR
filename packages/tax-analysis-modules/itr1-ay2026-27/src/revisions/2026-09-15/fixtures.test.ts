import { describe, expect, it } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260915,
	itr1Ay202627RulePack20260915,
} from "./rule-pack";

describe("2026-09-15 complete new-regime rule pack", () => {
	it("pins the complete-computation rules without changing prior revisions", () => {
		expect(itr1Ay202627CompiledRulePack20260915.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-15",
			revision: "2026-09-15",
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"15a032786c2e487377de010115535eadf8d58a5203713be246fd13b9d0abbd36",
		});
		expect(
			itr1Ay202627CompiledRulePack20260915.taxConstants?.newRegime
				.completeComputation,
		).toEqual({
			itr1NormalRateIncomeLimitWholeRupees: 5_000_000,
			itr1NormalRateIncomeLimitRuleId:
				"ITR1-NR-ITR1-NORMAL-RATE-INCOME-LIMIT",
			incomeAggregationRuleId: "ITR1-NR-COMPLETE-INCOME-AGGREGATION",
			housePropertyLossSetoffRuleId:
				"ITR1-NR-HOUSE-PROPERTY-LOSS-SETOFF-EXCLUDED",
			deductionCompositionRuleId:
				"ITR1-NR-COMPLETE-DEDUCTION-COMPOSITION",
		});
		expect(itr1Ay202627RulePack20260915.identity.revision).toBe(
			"2026-09-15",
		);
	});
});
