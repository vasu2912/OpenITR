import { compileRulePack, canonicalJson } from "@openitr/rulepack-compiler";
import {
	parseIsoTimestamp,
	parseRuleId,
	parseRulePackId,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	itr1Ay202627CompiledRulePack20260824,
	itr1Ay202627CompiledRulePack20260824b,
	itr1Ay202627RulePack20260824,
	itr1Ay202627RulePack20260824b,
} from "../../index";

const SYNTHETIC_ANSWER_TIME = parseIsoTimestamp(
	"2099-01-01T00:00:00.000Z",
);

const CONTRIBUTED_RULE_IDS = [
	"ITR1-INCOME-AGGREGATION-SECTION-14",
	"ITR1-INTEREST-INCOME-SECTION-56",
	"ITR1-TDS-CREDIT-SECTION-199",
] as const;

describe("cited contribution example: revision 2026-08-24b", () => {
	test("registers every contributed rule in the immutable compiled pack", () => {
		expect(itr1Ay202627CompiledRulePack20260824b.identity.id).toBe(
			"itr1-ay2026-27.2026-08-24b",
		);
		expect(itr1Ay202627CompiledRulePack20260824b.identity.revision).toBe(
			"2026-08-24b",
		);
		for (const ruleId of CONTRIBUTED_RULE_IDS) {
			expect(itr1Ay202627CompiledRulePack20260824b.supportedRuleIds).toContain(
				parseRuleId(ruleId),
			);
			expect(
				itr1Ay202627CompiledRulePack20260824.supportedRuleIds,
			).not.toContain(parseRuleId(ruleId));
		}
	});

	test("resolves each contributed citation against a checksummed official source", () => {
		const actSource = itr1Ay202627RulePack20260824b.officialSources.find(
			(source) => source.id === "income-tax-act-1961",
		);
		expect(actSource).toMatchObject({
			id: "income-tax-act-1961",
			contentSha256:
				"c94be60d28fa37b51ec06d95af72c8e30ba61d47fc93b25a08de746139c0fe82",
			redistributionStatus: "not-redistributed",
		});

		expect(
			itr1Ay202627CompiledRulePack20260824b.ruleCitations[
				parseRuleId("ITR1-INCOME-AGGREGATION-SECTION-14")
			],
		).toEqual({
			id: "ITR1-INCOME-AGGREGATION-SECTION-14",
			citation:
				"Income-tax Act, 1961, section 14, aggregation of salary and income from other sources into total income before rounding",
			sourceUrl:
				"https://incometaxindia.gov.in/pages/acts/income-tax-act.aspx",
		});
		expect(
			itr1Ay202627CompiledRulePack20260824b.ruleCitations[
				parseRuleId("ITR1-INTEREST-INCOME-SECTION-56")
			],
		).toEqual({
			id: "ITR1-INTEREST-INCOME-SECTION-56",
			citation:
				"Income-tax Act, 1961, section 56, interest from savings accounts and deposits chargeable under income from other sources",
			sourceUrl:
				"https://incometaxindia.gov.in/pages/acts/income-tax-act.aspx",
		});
		expect(
			itr1Ay202627CompiledRulePack20260824b.ruleCitations[
				parseRuleId("ITR1-TDS-CREDIT-SECTION-199")
			],
		).toEqual({
			id: "ITR1-TDS-CREDIT-SECTION-199",
			citation:
				"Income-tax Act, 1961, section 199, credit against tax for tax deducted at source as reported in Form 26AS Part I",
			sourceUrl:
				"https://incometaxindia.gov.in/pages/acts/income-tax-act.aspx",
		});
	});

	test("recompiles to the exact registered identity", async () => {
		const firstPass = await compileRulePack({
			manifest: (await import("./manifest"))
				.itr1Ay202627RulePackManifest20260824b,
		});
		const secondPass = await compileRulePack({
			manifest: (await import("./manifest"))
				.itr1Ay202627RulePackManifest20260824b,
		});

		expect(
			canonicalJson(firstPass.identity) ===
				canonicalJson(secondPass.identity),
		).toBe(true);
		expect(
			canonicalJson(firstPass.identity) ===
				canonicalJson(itr1Ay202627CompiledRulePack20260824b.identity),
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

		const retained = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-22"),
		);
		const previous = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-24"),
		);
		const contributed = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-24b"),
		);

		expect(retained.identity.id).toBe("itr1-ay2026-27.2026-08-22");
		expect(previous.identity.id).toBe("itr1-ay2026-27.2026-08-24");
		expect(contributed).toBe(itr1Ay202627RulePack20260824b);
		expect(retained.identity.compiledPackSha256).not.toBe(
			contributed.identity.compiledPackSha256,
		);
		expect(previous.identity.compiledPackSha256).not.toBe(
			contributed.identity.compiledPackSha256,
		);
	});

	test("leaves the reviewed scope-check behavior unchanged across the revision", () => {
		const previousSupported = itr1Ay202627RulePack20260824.evaluate({
			answer: "yes",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const contributedSupported = itr1Ay202627RulePack20260824b.evaluate({
			answer: "yes",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const previousUnsupported = itr1Ay202627RulePack20260824.evaluate({
			answer: "no",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const contributedUnsupported = itr1Ay202627RulePack20260824b.evaluate({
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
