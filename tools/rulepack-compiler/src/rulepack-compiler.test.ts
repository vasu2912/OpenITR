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

describe("rule-pack compiler tax constants", () => {
	const syntheticTaxConstants = {
		newRegime: {
			slabBands: [
				{ upperBoundWholeRupees: 400000, ratePercent: 0 },
				{ upperBoundWholeRupees: 800000, ratePercent: 5 },
				{ upperBoundWholeRupees: null, ratePercent: 30 },
			],
			slabRuleId: "TEST-EXAMPLE-RULE",
			standardDeductionWholeRupees: 75000,
			standardDeductionRuleId: "TEST-EXAMPLE-RULE",
			rebateMaxTotalIncomeWholeRupees: 1200000,
			rebateMaxAmountWholeRupees: 60000,
			rebateRuleId: "TEST-EXAMPLE-RULE",
			rebateMarginalReliefRuleId: "TEST-EXAMPLE-RULE",
			surchargeTiers: [
				{ exceedsTotalIncomeWholeRupees: 5000000, ratePercent: 10 },
			],
			surchargeRuleId: "TEST-EXAMPLE-RULE",
			cessRatePercent: 4,
			cessRuleId: "TEST-EXAMPLE-RULE",
			totalIncomeRoundingBaseWholeRupees: 10,
			totalIncomeRoundingRuleId: "TEST-EXAMPLE-RULE",
			taxRoundingBaseWholeRupees: 10,
			taxRoundingRuleId: "TEST-EXAMPLE-RULE",
		},
	} satisfies RulePackManifest["taxConstants"];

	const manifestWithTaxConstants = (
		mutate?: (
			constants: NonNullable<RulePackManifest["taxConstants"]>,
		) => NonNullable<RulePackManifest["taxConstants"]>,
	): RulePackManifest =>
		syntheticManifest((manifest) => ({
			...manifest,
			taxConstants:
				mutate === undefined
					? syntheticTaxConstants
					: mutate(syntheticTaxConstants),
		}));

	test("compiles declared tax constants into the frozen pack with resolved rules", async () => {
		const compiled = await compileRulePack({
			manifest: manifestWithTaxConstants(),
		});

		expect(compiled.taxConstants).toEqual({
			newRegime: {
				...syntheticTaxConstants.newRegime,
				slabRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
				standardDeductionRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
				rebateRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
				rebateMarginalReliefRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
				surchargeRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
				cessRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
				totalIncomeRoundingRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
				taxRoundingRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
			},
		});
		expect(Object.isFrozen(compiled.taxConstants?.newRegime ?? false)).toBe(
			true,
		);
	});

	test("changes the compiled-pack hash when a constant changes", async () => {
		const original = await compileRulePack({
			manifest: manifestWithTaxConstants(),
		});
		const revised = await compileRulePack({
			manifest: manifestWithTaxConstants((constants) => ({
				newRegime: {
					...constants.newRegime,
					rebateMaxAmountWholeRupees: 61000,
				},
			})),
		});

		expect(revised.identity.compiledPackSha256).not.toBe(
			original.identity.compiledPackSha256,
		);
		expect(revised.identity.sourceManifestSha256).toBe(
			original.identity.sourceManifestSha256,
		);
	});

	test("rejects slab bands whose upper bounds do not strictly ascend", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithTaxConstants((constants) => ({
					newRegime: {
						...constants.newRegime,
						slabBands: [
							{ upperBoundWholeRupees: 800000, ratePercent: 0 },
							{ upperBoundWholeRupees: 400000, ratePercent: 5 },
							{ upperBoundWholeRupees: null, ratePercent: 30 },
						],
					},
				})),
			}),
		).rejects.toThrow(/band 2 upper bound must exceed/);
	});

	test("rejects an open-ended band that is not last", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithTaxConstants((constants) => ({
					newRegime: {
						...constants.newRegime,
						slabBands: [
							{ upperBoundWholeRupees: null, ratePercent: 0 },
							{ upperBoundWholeRupees: 800000, ratePercent: 5 },
							{ upperBoundWholeRupees: 1200000, ratePercent: 30 },
						],
					},
				})),
			}),
		).rejects.toThrow("Only the last slab band may be open-ended");
	});

	test("requires the final band of the schedule to be open-ended", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithTaxConstants((constants) => ({
					newRegime: {
						...constants.newRegime,
						slabBands: [
							{ upperBoundWholeRupees: 400000, ratePercent: 0 },
							{ upperBoundWholeRupees: 800000, ratePercent: 5 },
						],
					},
				})),
			}),
		).rejects.toThrow("The last slab band must be open-ended");
	});

	test("rejects a fractional or out-of-range rate", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithTaxConstants((constants) => ({
					newRegime: {
						...constants.newRegime,
						cessRatePercent: 4.5,
					},
				})),
			}),
		).rejects.toThrow(/whole percentage/);
	});

	test("rejects a negative money constant", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithTaxConstants((constants) => ({
					newRegime: {
						...constants.newRegime,
						standardDeductionWholeRupees: -1,
					},
				})),
			}),
		).rejects.toThrow(/non-negative whole rupee amount/);
	});

	test("rejects a surcharge tier schedule that does not ascend", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithTaxConstants((constants) => ({
					newRegime: {
						...constants.newRegime,
						surchargeTiers: [
							{ exceedsTotalIncomeWholeRupees: 10000000, ratePercent: 15 },
							{ exceedsTotalIncomeWholeRupees: 5000000, ratePercent: 10 },
						],
					},
				})),
			}),
		).rejects.toThrow(/tier 2 threshold must exceed/);
	});

	test("rejects a tax constant that cites an undeclared rule", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithTaxConstants((constants) => ({
					newRegime: {
						...constants.newRegime,
						cessRuleId: "TEST-UNDECLARED-RULE",
					},
				})),
			}),
		).rejects.toThrow('undeclared rule "TEST-UNDECLARED-RULE"');
	});
});

describe("rule-pack compiler missing-fact questions", () => {
	const syntheticFactQuestionRecord = {
		id: "test-savings-interest-total",
		prompt: "How much savings-account interest did you receive?",
		helpText: "Check your bank statements or annual summary.",
		requiresRuleId: "TEST-EXAMPLE-RULE",
		suppliesFactKey: "test.savings-interest",
		whyRequired:
			"Test rule requires this fact before the test estimate can compute.",
		affectedResult: {
			resultId: "test-estimate",
			label: "Test estimated result",
		},
		answerSchema: {
			kind: "exact-money",
			minimumWholeRupees: 0,
			maximumWholeRupees: 10000000,
		},
	} satisfies NonNullable<
		RulePackManifest["missingFactQuestions"]
	>[number];

	const manifestWithQuestions = (
		mutate?: (
			questions: NonNullable<RulePackManifest["missingFactQuestions"]>,
		) => NonNullable<RulePackManifest["missingFactQuestions"]>,
	): RulePackManifest =>
		syntheticManifest((manifest) => {
			const catalog =
				manifest.missingFactQuestions ?? [syntheticFactQuestionRecord];
			return {
				...manifest,
				missingFactQuestions:
					mutate === undefined ? catalog : mutate(catalog),
			};
		});

	test("leaves a manifest without questions untouched in shape and identity", async () => {
		const compiled = await compileRulePack({ manifest: syntheticManifest() });

		expect(compiled.missingFactQuestions).toBeUndefined();
		expect(Object.isFrozen(compiled)).toBe(true);
	});

	test("compiles declared questions with parsed identifiers and citations", async () => {
		const compiled = await compileRulePack({
			manifest: manifestWithQuestions(),
		});

		expect(compiled.missingFactQuestions).toHaveLength(1);
		const question = compiled.missingFactQuestions?.[0];
		expect(question).toEqual({
			id: "test-savings-interest-total",
			prompt: "How much savings-account interest did you receive?",
			helpText: "Check your bank statements or annual summary.",
			requiresRuleId: parseRuleId("TEST-EXAMPLE-RULE"),
			suppliesFact: "test.savings-interest",
			whyRequired: syntheticFactQuestionRecord.whyRequired,
			affectedResult: {
				resultId: "test-estimate",
				label: "Test estimated result",
			},
			answerSchema: {
				kind: "exact-money",
				minimumWholeRupees: 0,
				maximumWholeRupees: 10000000,
			},
			sourceReference: {
				sourceId: "synthetic-source-a",
				location: "Synthetic source A (test fixture), section 1",
			},
		});
		expect(Object.isFrozen(question)).toBe(true);
	});

	test("compiles an exact-money question with no authored maximum", async () => {
		const compiled = await compileRulePack({
			manifest: manifestWithQuestions((questions) =>
				questions.map((question) => ({
					...question,
					answerSchema: {
						...question.answerSchema,
						maximumWholeRupees: null,
					},
				})),
			),
		});

		expect(compiled.missingFactQuestions?.[0]?.answerSchema).toEqual({
			kind: "exact-money",
			minimumWholeRupees: 0,
			maximumWholeRupees: null,
		});
	});

	test("keeps questions out of the hash of an otherwise identical pack only while absent", async () => {
		const withoutQuestions = await compileRulePack({
			manifest: syntheticManifest(),
		});
		const withQuestions = await compileRulePack({
			manifest: manifestWithQuestions(),
		});

		expect(withQuestions.identity.compiledPackSha256).not.toBe(
			withoutQuestions.identity.compiledPackSha256,
		);
	});

	test("rejects a duplicate question identifier", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithQuestions((questions) => [
					...(questions ?? []),
					syntheticFactQuestionRecord,
				]),
			}),
		).rejects.toThrow(
			'Duplicate missing-fact question identifier: "test-savings-interest-total"',
		);
	});

	test("rejects two questions supplying one fact key", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithQuestions((questions) => [
					...(questions ?? []),
					{
						...syntheticFactQuestionRecord,
						id: "test-savings-interest-total-again",
					},
				]),
			}),
		).rejects.toThrow(
			' supplies the fact key "test.savings-interest" more than once',
		);
	});

	test("rejects a question that reuses the scope-check identity or fact", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithQuestions(() => [
					{
						...syntheticFactQuestionRecord,
						id: "test-example-question",
					},
				]),
			}),
		).rejects.toThrow("duplicates the scope-check question");

		await expect(
			compileRulePack({
				manifest: manifestWithQuestions(() => [
					{
						...syntheticFactQuestionRecord,
						suppliesFactKey: "test.example-fact",
					},
				]),
			}),
		).rejects.toThrow("supplies the scope-check fact key");
	});

	test("rejects a question that requires an undeclared rule", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithQuestions(() => [
					{
						...syntheticFactQuestionRecord,
						requiresRuleId: "TEST-UNDECLARED-RULE",
					},
				]),
			}),
		).rejects.toThrow(
			'requires undeclared rule "TEST-UNDECLARED-RULE"',
		);
	});

	test("rejects a malformed supplied fact key", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithQuestions(() => [
					{ ...syntheticFactQuestionRecord, suppliesFactKey: "no separator" },
				]),
			}),
		).rejects.toThrow("Invalid fact key");
	});

	test("rejects an empty prompt, help text, or rationale", async () => {
		for (const blankField of ["prompt", "helpText", "whyRequired"] as const) {
			await expect(
				compileRulePack({
					manifest: manifestWithQuestions(() => [
						{ ...syntheticFactQuestionRecord, [blankField]: "   " },
					]),
				}),
			).rejects.toThrow(`Missing ${blankField}`);
		}
	});

	test("rejects bounds that are not whole rupees or that invert the range", async () => {
		await expect(
			compileRulePack({
				manifest: manifestWithQuestions(() => [
					{
						...syntheticFactQuestionRecord,
						answerSchema: {
							kind: "exact-money",
							minimumWholeRupees: 0,
							maximumWholeRupees: -1,
						},
					},
				]),
			}),
		).rejects.toThrow(/maximum/);

		await expect(
			compileRulePack({
				manifest: manifestWithQuestions(() => [
					{
						...syntheticFactQuestionRecord,
						answerSchema: {
							kind: "exact-money",
							minimumWholeRupees: 500,
							maximumWholeRupees: 499,
						},
					},
				]),
			}),
		).rejects.toThrow(/must not be less than its minimum/);
	});
});
