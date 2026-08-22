import {
	parseIsoTimestamp,
	parseRuleId,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627CompiledRulePack, itr1Ay202627RulePack } from "./rule-pack";

describe("ITR-1 AY 2026-27 rule pack", () => {
	test("is immutable at runtime", () => {
		const unsupportedResult = itr1Ay202627CompiledRulePack.scopeCheck.results.no;
		expect({
			pack: Object.isFrozen(itr1Ay202627RulePack),
			identity: Object.isFrozen(itr1Ay202627RulePack.identity),
			sources: Object.isFrozen(itr1Ay202627RulePack.officialSources),
			question: Object.isFrozen(itr1Ay202627RulePack.question),
			answers: Object.isFrozen(itr1Ay202627RulePack.question.answers),
			results: Object.isFrozen(itr1Ay202627CompiledRulePack.scopeCheck.results),
			unsupportedIssue:
				unsupportedResult?.kind === "unsupported"
					? Object.isFrozen(unsupportedResult.issue)
					: false,
		}).toEqual({
			pack: true,
			identity: true,
			sources: true,
			question: true,
			answers: true,
			results: true,
			unsupportedIssue: true,
		});
	});

	test("pins the verified official source used by the executable rule", () => {
		const [officialSource] = itr1Ay202627RulePack.officialSources;
		const completion = itr1Ay202627RulePack.evaluate({
			answer: "yes",
			answeredAt: parseIsoTimestamp("2026-08-22T00:00:00.000Z"),
		});
		const citation =
			itr1Ay202627CompiledRulePack.ruleCitations[
				parseRuleId("ITR1-ELIGIBILITY-RESIDENT")
			];

		expect(officialSource).toEqual({
			id: "cbdt-notification-45-2026",
			title: "Notification No. 45/2026, G.S.R. 226(E)",
			authority:
				"Central Board of Direct Taxes, Ministry of Finance, Government of India",
			url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-04/Notification%20No.45_2026.pdf",
			releaseDate: "2026-03-30",
			retrievedDate: "2026-08-22",
			contentSha256:
				"b7ca15d6ca15c16ac8ad8c62cce86bc4b50b9208bcc07370298bff8515911964",
			redistributionStatus: "not-redistributed",
		});
		expect({
			questionSource: itr1Ay202627RulePack.question.sourceReference,
			ruleId: completion.result.rule.id,
			ruleSourceUrl: completion.result.rule.sourceUrl,
			citation,
		}).toEqual({
			questionSource: {
				sourceId: officialSource?.id,
				location: "Form ITR-1 heading, Gazette page 16",
			},
			ruleId: itr1Ay202627RulePack.question.requiresRuleId,
			ruleSourceUrl: officialSource?.url,
			citation: {
				id: "ITR1-ELIGIBILITY-RESIDENT",
				citation:
					"Notification No. 45/2026, Form ITR-1 heading, Gazette page 16",
				sourceUrl: officialSource?.url,
			},
		});
	});

	test("carries a reproducible compiled identity for the unchanged production revision", async () => {
		const { compileRulePack } = await import("@openitr/rulepack-compiler");
		const { itr1Ay202627RulePackManifest } = await import("./manifest");
		const recomputed = await compileRulePack({
			manifest: itr1Ay202627RulePackManifest,
		});

		expect(recomputed.identity).toEqual(itr1Ay202627RulePack.identity);
		expect(itr1Ay202627RulePack.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-08-22",
			revision: "2026-08-22",
			minimumEngineContractVersion: "1",
		});
	});
});
