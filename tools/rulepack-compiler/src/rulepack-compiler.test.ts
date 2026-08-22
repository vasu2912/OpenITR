import { parseRuleId } from "@openitr/model";
import type { RulePackManifest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { compileRulePack } from "./rulepack-compiler";

const syntheticSourceRecord = {
	id: "synthetic-source-a",
	title: "Synthetic source A (test fixture)",
	authority: "OpenITR synthetic fixtures, not a real authority",
	url: "https://fixture.openitr.test/synthetic-source-a.pdf",
	releaseDate: "2098-12-31",
	retrievedDate: "2099-01-01",
	contentSha256: "a1".repeat(32),
	redistributionStatus: "not-redistributed",
} satisfies RulePackManifest["officialSources"][number];

const syntheticRuleRecord = {
	id: "TEST-EXAMPLE-RULE",
	citation: "Synthetic source A (test fixture), section 1",
	sourceId: "synthetic-source-a",
	sourceLocation: "Synthetic source A (test fixture), section 1",
} satisfies RulePackManifest["supportedRules"][number];

const syntheticManifest = (
	mutate?: (manifest: RulePackManifest) => RulePackManifest,
): RulePackManifest => {
	const manifest: RulePackManifest = {
		rulePackId: "test-ay2099-00.2099-01-01",
		form: "ITR-1",
		financialYear: "2098-99",
		assessmentYear: "2099-00",
		packRevision: "2099-01-01",
		engineContractVersion: "1",
		officialSources: [syntheticSourceRecord],
		supportedRules: [syntheticRuleRecord],
		scopeCheck: {
			questionId: "test-example-question",
			prompt: "Test example question prompt?",
			helpText: "Test example question help text.",
			requiresRuleId: "TEST-EXAMPLE-RULE",
			suppliesFactKey: "test.example-fact",
			blockingIssueCode: "RULE_TEST_EXAMPLE_UNSUPPORTED",
			supportedResult: {
				title: "Test supported title",
				explanation: "Test supported explanation.",
			},
			unsupportedResult: {
				title: "Test unsupported title",
				explanation: "Test unsupported explanation.",
				recoveryAction: "Test recovery action.",
			},
		},
	};
	return mutate === undefined ? manifest : mutate(manifest);
};

describe("rule-pack compiler", () => {
	test("compiles a cited manifest into an immutable pack with computed identity", async () => {
		const compiled = await compileRulePack({
			manifest: syntheticManifest(),
		});

		expect(compiled.identity).toEqual({
			id: "test-ay2099-00.2099-01-01",
			form: "ITR-1",
			financialYear: "2098-99",
			assessmentYear: "2099-00",
			revision: "2099-01-01",
			officialSourceRevisionIds: ["synthetic-source-a"],
			sourceManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			compiledPackSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			minimumEngineContractVersion: "1",
		});
	});

	test("resolves rule citations against the declared official sources", async () => {
		const compiled = await compileRulePack({
			manifest: syntheticManifest(),
		});

		expect(compiled.supportedRuleIds).toEqual(["TEST-EXAMPLE-RULE"]);
		expect(compiled.ruleCitations[parseRuleId("TEST-EXAMPLE-RULE")]).toEqual({
			id: "TEST-EXAMPLE-RULE",
			citation: "Synthetic source A (test fixture), section 1",
			sourceUrl: "https://fixture.openitr.test/synthetic-source-a.pdf",
		});
		expect(compiled.scopeCheck.question.sourceReference).toEqual({
			sourceId: "synthetic-source-a",
			location: "Synthetic source A (test fixture), section 1",
		});
	});

	test("produces identical source-manifest and compiled-pack hashes for identical manifests", async () => {
		const first = await compileRulePack({ manifest: syntheticManifest() });
		const second = await compileRulePack({ manifest: syntheticManifest() });

		expect(second.identity.sourceManifestSha256).toBe(
			first.identity.sourceManifestSha256,
		);
		expect(second.identity.compiledPackSha256).toBe(
			first.identity.compiledPackSha256,
		);
	});

	test("changes the source-manifest hash when a source record changes", async () => {
		const original = await compileRulePack({ manifest: syntheticManifest() });
		const revised = await compileRulePack({
			manifest: syntheticManifest((manifest) => ({
				...manifest,
				officialSources: [
					{
						...syntheticSourceRecord,
						contentSha256:
							"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
					},
				],
			})),
		});

		expect(revised.identity.sourceManifestSha256).not.toBe(
			original.identity.sourceManifestSha256,
		);
		expect(revised.identity.compiledPackSha256).not.toBe(
			original.identity.compiledPackSha256,
		);
	});

	test("freezes the complete compiled output against mutation", async () => {
		const compiled = await compileRulePack({
			manifest: syntheticManifest(),
		});
		const unsupportedResult = compiled.scopeCheck.results.no;
		if (unsupportedResult === undefined || unsupportedResult.kind !== "unsupported") {
			throw new Error("Expected the compiled pack to contain an unsupported result");
		}

		const frozenTargets = [
			compiled,
			compiled.identity,
			compiled.officialSources,
			compiled.officialSources[0],
			compiled.supportedRuleIds,
			compiled.ruleCitations[parseRuleId("TEST-EXAMPLE-RULE")],
			compiled.scopeCheck.question,
			compiled.scopeCheck.results,
			compiled.scopeCheck.results.yes,
			unsupportedResult,
			unsupportedResult.issue,
		];
		expect(frozenTargets.map(Object.isFrozen)).toEqual(
			frozenTargets.map(() => true),
		);
	});

	test("rejects a manifest whose supported rule has no citation", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					supportedRules: [
						{ ...syntheticRuleRecord, citation: "" },
					],
				})),
			}),
		).rejects.toThrow('Missing citation for rule "TEST-EXAMPLE-RULE"');
	});

	test("rejects a manifest whose rule cites no source location", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					supportedRules: [
						{ ...syntheticRuleRecord, sourceLocation: "" },
					],
				})),
			}),
		).rejects.toThrow('Missing source location for rule "TEST-EXAMPLE-RULE"');
	});

	test("rejects a malformed source checksum", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					officialSources: [
						{
							...syntheticSourceRecord,
							contentSha256: "not-a-checksum",
						},
					],
				})),
			}),
		).rejects.toThrow(
			'Malformed SHA-256 checksum for official source "synthetic-source-a"',
		);
	});

	test("rejects a source record with an unsupported redistribution status", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					officialSources: [
						{
							...syntheticSourceRecord,
							contentSha256: "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
							redistributionStatus: "redistributed-with-permission",
						},
					],
				})),
			}),
		).rejects.toThrow(
			'Unsupported redistribution status for official source "synthetic-source-a"',
		);
	});

	test("rejects an engine contract version this compiler does not support", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					engineContractVersion: "999",
				})),
			}),
		).rejects.toThrow("Incompatible engine contract version: 999");
	});

	test("rejects duplicate rule identifiers", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					supportedRules: [
						...manifest.supportedRules,
						syntheticRuleRecord,
					],
				})),
			}),
		).rejects.toThrow("Duplicate rule identifier: TEST-EXAMPLE-RULE");
	});

	test("rejects duplicate official source identifiers", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					officialSources: [
						...manifest.officialSources,
						syntheticSourceRecord,
					],
				})),
			}),
		).rejects.toThrow(
			"Duplicate official source identifier: synthetic-source-a",
		);
	});

	test("rejects a rule that cites an unknown source", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					supportedRules: [
						{ ...syntheticRuleRecord, sourceId: "undeclared-source" },
					],
				})),
			}),
		).rejects.toThrow(
			'Unknown source reference: rule "TEST-EXAMPLE-RULE" cites undeclared source "undeclared-source"',
		);
	});

	test("rejects a declared source that no rule resolves", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					officialSources: [
						...manifest.officialSources,
						{
							id: "synthetic-source-b",
							title: "Synthetic source B (test fixture)",
							authority: "OpenITR synthetic fixtures, not a real authority",
							url: "https://fixture.openitr.test/synthetic-source-b.pdf",
							releaseDate: "2098-12-31",
							retrievedDate: "2099-01-01",
							contentSha256:
								"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
							redistributionStatus: "not-redistributed",
						},
					],
				})),
			}),
		).rejects.toThrow(
			'Unresolved source reference: official source "synthetic-source-b" is declared but never cited by a supported rule',
		);
	});

	test("rejects a scope check that requires an unknown rule", async () => {
		await expect(
			compileRulePack({
				manifest: syntheticManifest((manifest) => ({
					...manifest,
					scopeCheck: {
						...manifest.scopeCheck,
						requiresRuleId: "TEST-OTHER-RULE",
					},
				})),
			}),
		).rejects.toThrow(
			'Unknown rule reference: scope check requires undeclared rule "TEST-OTHER-RULE"',
		);
	});
});
