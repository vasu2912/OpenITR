import { compileRulePack, canonicalJson } from "@openitr/rulepack-compiler";
import {
	parseIsoTimestamp,
	parseRuleId,
	parseRulePackId,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack } from "../../rule-pack";
import {
	itr1Ay202627CompiledRulePack20260824,
	itr1Ay202627RulePack20260824,
} from "./rule-pack";

const SYNTHETIC_ANSWER_TIME = parseIsoTimestamp(
	"2099-01-01T00:00:00.000Z",
);

describe("cited contribution example: revision 2026-08-24", () => {
	test("registers the contributed rule in the immutable compiled pack", () => {
		const contributedRuleId = parseRuleId(
			"ITR1-NR-SURCHARGE-MARGINAL-RELIEF",
		);

		expect(
			itr1Ay202627CompiledRulePack20260824.supportedRuleIds,
		).toContain(contributedRuleId);
		expect(
			itr1Ay202627CompiledRulePack20260824.identity.id,
		).toBe("itr1-ay2026-27.2026-08-24");
		expect(itr1Ay202627CompiledRulePack20260824.identity.revision).toBe(
			"2026-08-24",
		);
	});

	test("resolves the contributed citation against a checksummed official source", () => {
		const citation =
			itr1Ay202627CompiledRulePack20260824.ruleCitations[
				parseRuleId("ITR1-NR-SURCHARGE-MARGINAL-RELIEF")
			];
		const actSource = itr1Ay202627RulePack20260824.officialSources.find(
			(source) => source.id === "income-tax-act-1961",
		);

		expect(citation).toEqual({
			id: "ITR1-NR-SURCHARGE-MARGINAL-RELIEF",
			citation:
				"Income-tax Act, 1961, marginal relief limiting the surcharge where total income marginally exceeds a surcharge threshold",
			sourceUrl:
				"https://incometaxindia.gov.in/pages/acts/income-tax-act.aspx",
		});
		expect(actSource).toMatchObject({
			id: "income-tax-act-1961",
			contentSha256:
				"c94be60d28fa37b51ec06d95af72c8e30ba61d47fc93b25a08de746139c0fe82",
			redistributionStatus: "not-redistributed",
		});
	});

	test("recompiles to the exact registered identity", async () => {
		const { itr1Ay202627RulePackManifest20260824 } = await import(
			"./manifest"
		);
		const firstPass = await compileRulePack({
			manifest: itr1Ay202627RulePackManifest20260824,
		});
		const secondPass = await compileRulePack({
			manifest: itr1Ay202627RulePackManifest20260824,
		});

		expect(
			canonicalJson(firstPass.identity) ===
				canonicalJson(secondPass.identity),
		).toBe(true);
		expect(
			canonicalJson(firstPass.identity) ===
				canonicalJson(itr1Ay202627CompiledRulePack20260824.identity),
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
		]);

		const retained = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-22"),
		);
		const contributed = await registry.select(
			parseRulePackId("itr1-ay2026-27.2026-08-24"),
		);

		expect(retained.identity.id).toBe("itr1-ay2026-27.2026-08-22");
		expect(retained).toBe(itr1Ay202627RulePack);
		expect(contributed).toBe(itr1Ay202627RulePack20260824);
		expect(retained.identity.compiledPackSha256).not.toBe(
			contributed.identity.compiledPackSha256,
		);
	});

	test("leaves the reviewed scope-check behavior unchanged across the revision", () => {
		const before = itr1Ay202627RulePack.evaluate({
			answer: "no",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const after = itr1Ay202627RulePack20260824.evaluate({
			answer: "no",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const beforeSupported = itr1Ay202627RulePack.evaluate({
			answer: "yes",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});
		const afterSupported = itr1Ay202627RulePack20260824.evaluate({
			answer: "yes",
			answeredAt: SYNTHETIC_ANSWER_TIME,
		});

		expect(before.result.kind).toBe("unsupported");
		expect(after.result.kind).toBe("unsupported");
		if (after.result.kind === "unsupported" && before.result.kind === "unsupported") {
			expect(after.result.issue.code).toBe(before.result.issue.code);
			expect(after.result.rule.id).toBe(before.result.rule.id);
		}

		expect(afterSupported.result.kind).toBe(
			beforeSupported.result.kind,
		);
		expect(afterSupported.result.kind).toBe("supported");
		expect(afterSupported.result.rule.id).toBe(
			beforeSupported.result.rule.id,
		);
	});
});
