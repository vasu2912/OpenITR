import { describe, expect, it } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260911,
	itr1Ay202627RulePack20260911,
} from "./rule-pack";

describe("2026-09-11 loan-interest deduction rule pack", () => {
	it("pins the immutable identity, supported dates, limits, and progressive questions", () => {
		expect(itr1Ay202627CompiledRulePack20260911.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-11",
			revision: "2026-09-11",
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"8b3ea3c60b8721fd8ea876be53c30a0088b819706227db95c9df80c714673a8d",
		});
		const constants =
			itr1Ay202627CompiledRulePack20260911.taxConstants?.loanInterestDeductions;
		expect(constants).toMatchObject({
			section80eEarliestFirstInterestPaymentDate: "2018-04-01",
			section80eeSanctionStartDate: "2016-04-01",
			section80eeSanctionEndDate: "2017-03-31",
			section80eeLimitWholeRupees: 50_000,
			section80eeaSanctionStartDate: "2019-04-01",
			section80eeaSanctionEndDate: "2022-03-31",
			section80eeaLimitWholeRupees: 150_000,
			section80eebSanctionEndDate: "2023-03-31",
			section80eebLimitWholeRupees: 150_000,
		});
		expect(
			itr1Ay202627RulePack20260911.questions.filter((question) =>
				String(question.suppliesFact).startsWith("deductions.80e"),
			),
		).toHaveLength(37);
		expect(
			itr1Ay202627RulePack20260911.questions.find(
				(question) => question.id === "deduction-80ee-sanction-date",
			)?.answerSchema,
		).toEqual({ kind: "iso-date" });
	});
});
