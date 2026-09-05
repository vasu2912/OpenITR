import { describe, expect, test } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260908,
	itr1Ay202627RulePack20260908,
} from "./rule-pack";

describe("2026-09-08 agricultural-income rule pack", () => {
	test("pins the immutable identity", () => {
		expect(itr1Ay202627RulePack20260908.identity).toEqual({
			id: "itr1-ay2026-27.2026-09-08",
			form: "ITR-1",
			financialYear: "2025-26",
			assessmentYear: "2026-27",
			revision: "2026-09-08",
			minimumEngineContractVersion: "1",
			officialSourceRevisionIds:
				itr1Ay202627RulePack20260908.identity.officialSourceRevisionIds,
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"1ca023ec5076075770d32c326b30f9088d179afde5981642fbe3c1930eed2c9c",
		});
	});

	test("pins the limit, citations, and conditional amount question", () => {
		expect(
			itr1Ay202627CompiledRulePack20260908.taxConstants?.agriculturalIncome,
		).toEqual({
			itr1LimitWholeRupees: 5_000,
			exemptReportingRuleId:
				"ITR1-AGRICULTURAL-INCOME-EXEMPT-REPORTING",
			itr1LimitRuleId: "ITR1-AGRICULTURAL-INCOME-LIMIT",
		});
		expect(
			itr1Ay202627RulePack20260908.analysisScope?.questions.find(
				(question) => question.id === "scope-agriculture-present",
			),
		).toMatchObject({
			factKey: "scope.agriculture-income-present",
			answerSchema: { kind: "boolean" },
		});
		expect(
			itr1Ay202627RulePack20260908.analysisScope?.questions.some(
				(question) => question.id === "scope-agriculture",
			),
		).toBe(false);
		expect(
			itr1Ay202627RulePack20260908.questions.find(
				(question) => question.id === "agricultural-income-amount",
			),
		).toMatchObject({
			suppliesFact: "scope.agriculture-income",
			affectedResult: { resultId: "agricultural-income" },
		});
	});
});
