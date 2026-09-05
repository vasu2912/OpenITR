import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260907 } from "./rule-pack";

describe("2026-09-07 rule-pack revision", () => {
	test("pins the complete limited section 112A boundary and tax treatment", () => {
		expect(
			itr1Ay202627RulePack20260907.identity.sourceManifestSha256,
		).toBe(
			"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
		);
		expect(
			itr1Ay202627RulePack20260907.identity.compiledPackSha256,
		).toBe(
			"bcc7b47ef760e67d1f42a33f6ff6355740d695424422141ad87aba53337e5e44",
		);
		expect(
			itr1Ay202627RulePack20260907.taxConstants
				?.section112aCapitalGain,
		).toMatchObject({
			itr1GainLimitWholeRupees: 125000,
			taxFreeThresholdWholeRupees: 125000,
			taxRateBasisPoints: 1250,
			taxRoundingBaseWholeRupees: 1,
		});
		expect(
			itr1Ay202627RulePack20260907.questions
				.filter(
					(question) =>
						question.affectedResult.resultId ===
						"section112a-capital-gain",
				)
				.map((question) => String(question.suppliesFact)),
		).toEqual([
			"capital-gains.section112a-eligible-asset",
			"capital-gains.section112a-long-term",
			"capital-gains.section112a-stt-conditions-met",
			"capital-gains.section112a-sale-consideration",
			"capital-gains.section112a-cost-of-acquisition",
		]);
	});
});
