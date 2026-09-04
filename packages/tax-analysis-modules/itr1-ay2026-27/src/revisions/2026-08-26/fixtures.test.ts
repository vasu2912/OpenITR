import { compileRulePack, canonicalJson } from "@openitr/rulepack-compiler";
import {
	parseFactKey,
	parseIsoTimestamp,
	parseRuleId,
	parseRulePackId,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260824b,
	itr1Ay202627CompiledRulePack20260826,
	itr1Ay202627RulePack20260824b,
	itr1Ay202627RulePack20260826,
} from "../../index";

const SYNTHETIC_ANSWER_TIME = parseIsoTimestamp(
	"2099-01-01T00:00:00.000Z",
);

describe("cited contribution example: revision 2026-08-26", () => {
	test("registers every contributed rule in the immutable compiled pack", () => {
		expect(itr1Ay202627CompiledRulePack20260826.identity.id).toBe(
			"itr1-ay2026-27.2026-08-26",
		);
		expect(itr1Ay202627CompiledRulePack20260826.identity.revision).toBe(
			"2026-08-26",
		);
		for (const ruleId of ["ITR1-INCOME-AGGREGATION-SECTION-14", "ITR1-INTEREST-INCOME-SECTION-56", "ITR1-TDS-CREDIT-SECTION-199"]) {
			expect(itr1Ay202627CompiledRulePack20260826.supportedRuleIds).toContain(
				parseRuleId(ruleId),
			);
		}
	});

	test("compiles the two permitted missing-fact questions against cited rules", () => {
		const questions = itr1Ay202627CompiledRulePack20260826.missingFactQuestions;
		expect(questions?.map((question) => question.id)).toEqual([
			"bank-interest-savings-account-total",
			"bank-interest-deposits-total",
		]);

		const savings = questions?.[0];
		expect(savings).toMatchObject({
			suppliesFact: parseFactKey("bank-interest.savings-account"),
			requiresRuleId: parseRuleId("ITR1-INTEREST-INCOME-SECTION-56"),
			answerSchema: {
				kind: "exact-money",
				minimumWholeRupees: 0,
				maximumWholeRupees: null,
			},
			sourceReference: {
				sourceId: "income-tax-act-1961",
				location: "Section 56(1)",
			},
		});
		expect(savings?.affectedResult).toEqual({
			resultId: "refund-or-payable-estimate",
			label: "Estimated refund or amount payable",
		});
		expect(savings?.whyRequired).toContain("Section 56");
	});

	test("exposes the same questions through the loaded scope rule pack", () => {
		expect(itr1Ay202627RulePack20260826.questions.map((question) => question.id)).toEqual([
			"bank-interest-savings-account-total",
			"bank-interest-deposits-total",
		]);
	});

	test("keeps packs compiled before questions free of them", () => {
		expect(itr1Ay202627CompiledRulePack20260824b.missingFactQuestions).toBeUndefined();
		expect(itr1Ay202627RulePack20260824b.questions).toEqual([]);
	});

	test("recompiles to the exact registered identity", async () => {
		const firstPass = await compileRulePack({
			manifest: (await import("./manifest"))
				.itr1Ay202627RulePackManifest20260826,
		});
		const secondPass = await compileRulePack({
			manifest: (await import("./manifest"))
				.itr1Ay202627RulePackManifest20260826,
		});

		expect(
			canonicalJson(firstPass.identity) ===
				canonicalJson(secondPass.identity),
		).toBe(true);
		expect(
			canonicalJson(firstPass.identity) ===
				canonicalJson(itr1Ay202627CompiledRulePack20260826.identity),
		).toBe(true);
	});

	test("keeps every previously released revision loadable for replay", async () => {
		const { itr1Ay202627TaxAnalysisModuleArtifact } = await import(
			"../../tax-analysis-module"
		);
		const registry = itr1Ay202627TaxAnalysisModuleArtifact.rulePackRevisions;
		const registeredIds = registry.revisions.map((entry) =>
			String(entry.identity.id),
		);

		expect(registeredIds).toEqual([
			"itr1-ay2026-27.2026-08-22",
			"itr1-ay2026-27.2026-08-24",
			"itr1-ay2026-27.2026-08-24b",
			"itr1-ay2026-27.2026-08-26",
			"itr1-ay2026-27.2026-09-03",
			"itr1-ay2026-27.2026-09-04",
		]);

		const oldest = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-22"),
		);
		const previous = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-24b"),
		);
		const contributed = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-26"),
		);

		expect(contributed).toBe(itr1Ay202627RulePack20260826);
		expect(oldest.identity.compiledPackSha256).not.toBe(
			contributed.identity.compiledPackSha256,
		);
		expect(previous.identity.compiledPackSha256).not.toBe(
			contributed.identity.compiledPackSha256,
		);
	});

	test("leaves the reviewed scope-check behavior unchanged across the revision", () => {
		const previousSupported = itr1Ay202627RulePack20260824b.evaluate({
			answer: "yes",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const contributedSupported = itr1Ay202627RulePack20260826.evaluate({
			answer: "yes",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const previousUnsupported = itr1Ay202627RulePack20260824b.evaluate({
			answer: "no",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const contributedUnsupported = itr1Ay202627RulePack20260826.evaluate({
			answer: "no",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});

		expect(contributedSupported.result.kind).toBe(
			previousSupported.result.kind,
		);
		expect(contributedSupported.result.kind).toBe("supported");
		expect(contributedSupported.result.rule.id).toBe(
			previousSupported.result.rule.id,
		);

		expect(contributedUnsupported.result.kind).toBe("unsupported");
		if (
			contributedUnsupported.result.kind === "unsupported" &&
			previousUnsupported.result.kind === "unsupported"
		) {
			expect(contributedUnsupported.result.issue.code).toBe(
				previousUnsupported.result.issue.code,
			);
			expect(contributedUnsupported.result.rule.id).toBe(
				previousUnsupported.result.rule.id,
			);
		}
	});
});
