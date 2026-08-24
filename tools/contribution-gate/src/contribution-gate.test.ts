import { compileRulePack, canonicalJson } from "@openitr/rulepack-compiler";
import {
	createRulePackRevisionRegistry,
	parseRulePackId,
	parseSha256Digest,
	parseSourceId,
	parseRuleId,
	parseTaxAnalysisModuleId,
} from "@openitr/model";
import type {
	RulePackIdentity,
	RulePackManifest,
	TaxAnalysisModuleArtifact,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { auditTaxAnalysisModuleContribution } from "./contribution-gate";

const moduleId = parseTaxAnalysisModuleId("test-scope-module");

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

const syntheticManifest = ({
	rulePackId,
	packRevision,
}: Readonly<{ rulePackId: string; packRevision: string }>): RulePackManifest => ({
	rulePackId,
	form: "ITR-1",
	financialYear: "2098-99",
	assessmentYear: "2099-00",
	packRevision,
	engineContractVersion: "1",
	officialSources: [syntheticSourceRecord],
	supportedRules: [
		{
			id: "TEST-EXAMPLE-RULE",
			citation: `Synthetic source A (test fixture), section 1 (${packRevision})`,
			sourceId: "synthetic-source-a",
			sourceLocation: "Synthetic source A (test fixture), section 1",
		},
	],
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
});

const registerArtifact = async (
	manifests: readonly RulePackManifest[],
): Promise<{ artifact: TaxAnalysisModuleArtifact; identities: RulePackIdentity[] }> => {
	const revisions = [] as {
		identity: RulePackIdentity;
		load: () => Promise<never>;
	}[];
	const identities = [];
	for (const manifest of manifests) {
		const compiled = await compileRulePack({ manifest });
		identities.push(compiled.identity);
		revisions.push({
			identity: compiled.identity,
			load: () => {
				throw new Error("not loaded in gate tests");
			},
		});
	}
	const artifact = {
		identity: {
			id: moduleId,
			compiledModuleSha256: parseSha256Digest("c4".repeat(32)),
		},
		rulePackRevisions: createRulePackRevisionRegistry({
			moduleId,
			revisions,
		}),
	} satisfies TaxAnalysisModuleArtifact;
	return { artifact, identities };
};

const releasePinFor = (artifact: TaxAnalysisModuleArtifact) => {
	const [first] = artifact.rulePackRevisions.revisions;
	if (first === undefined) {
		throw new Error("fixture needs one registered revision");
	}
	return {
		taxAnalysisModule: artifact.identity,
		rulePack: first.identity,
	};
};

const firstRevisionIdentity = (
	artifact: TaxAnalysisModuleArtifact,
): RulePackIdentity => {
	const [entry] = artifact.rulePackRevisions.revisions;
	if (entry === undefined) {
		throw new Error("fixture artifact registers no revisions");
	}
	return entry.identity;
};

const codesOf = (findings: readonly { code: string }[]) =>
	findings.map((finding) => finding.code);

describe("contribution gate", () => {
	test("accepts a registered, reproducible, correctly pinned contribution", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const second = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-02-02",
			packRevision: "2099-02-02",
		});
		const { artifact } = await registerArtifact([first, second]);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first, second],
			artifact,
			release: releasePinFor(artifact),
		});

		expect(findings).toEqual([]);
	});

	test("reports a compiled revision absent from the module registry", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const second = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-02-02",
			packRevision: "2099-02-02",
		});
		const { artifact } = await registerArtifact([first]);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first, second],
			artifact,
			release: releasePinFor(artifact),
		});

		expect(codesOf(findings)).toEqual(["unregistered-revision"]);
		expect(findings[0]?.detail).toContain("test-ay2099-00.2099-02-02");
	});

	test("reports a registry entry no shipped manifest backs", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const second = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-02-02",
			packRevision: "2099-02-02",
		});
		const { artifact } = await registerArtifact([first, second]);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first],
			artifact,
			release: {
				taxAnalysisModule: artifact.identity,
				rulePack: firstRevisionIdentity(artifact),
			},
		});

		expect(codesOf(findings)).toEqual(["stale-registration"]);
		expect(findings[0]?.detail).toContain("test-ay2099-00.2099-02-02");
	});

	test("reports a registered identity whose recorded hashes do not match a fresh compile", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const { artifact, identities } = await registerArtifact([first]);
		const [compiledIdentity] = identities;
		if (compiledIdentity === undefined) {
			throw new Error("fixture compiled no identity");
		}
		const tampered: RulePackIdentity = {
			...compiledIdentity,
			compiledPackSha256: parseSha256Digest("d5".repeat(32)),
		};
		const tamperedArtifact = {
			identity: artifact.identity,
			rulePackRevisions: createRulePackRevisionRegistry({
				moduleId,
				revisions: [
					{
						identity: tampered,
						load: () => {
							throw new Error("not loaded");
						},
					},
				],
			}),
		} satisfies TaxAnalysisModuleArtifact;

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first],
			artifact: tamperedArtifact,
			release: {
				taxAnalysisModule: tamperedArtifact.identity,
				rulePack: tampered,
			},
		});

		expect(codesOf(findings)).toEqual(["checksum-mismatch"]);
		expect(findings[0]?.detail).toContain("compiledPackSha256");
	});

	test("reports a manifest that does not compile to the same identity twice", async () => {
		let reads = 0;
		const shifting = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const unstableManifest: RulePackManifest = {
			...shifting,
			get packRevision() {
				reads += 1;
				return reads <= 1 ? "2099-01-01" : "2099-01-02";
			},
		};
		const { artifact } = await registerArtifact([
			syntheticManifest({
				rulePackId: "test-ay2099-00.2099-01-01",
				packRevision: "2099-01-01",
			}),
		]);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [unstableManifest],
			artifact,
			release: releasePinFor(artifact),
		});

		expect(codesOf(findings)).toEqual(["nondeterministic-output"]);
	});

	test("reports a release that pins a pack outside the registry", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const { artifact } = await registerArtifact([first]);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first],
			artifact,
			release: {
				taxAnalysisModule: artifact.identity,
				rulePack: {
					...firstRevisionIdentity(artifact),
					id: parseRulePackId("test-ay2099-00.2099-03-03"),
					sourceManifestSha256: parseSha256Digest("e6".repeat(32)),
					compiledPackSha256: parseSha256Digest("f7".repeat(32)),
				},
			},
		});

		expect(codesOf(findings)).toEqual(["release-pins-unregistered-pack"]);
	});

	test("reports a release whose pinned hashes disagree with the registered revision", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const { artifact } = await registerArtifact([first]);
		const registered = firstRevisionIdentity(artifact);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first],
			artifact,
			release: {
				taxAnalysisModule: artifact.identity,
				rulePack: {
					id: registered.id,
					sourceManifestSha256: registered.sourceManifestSha256,
					compiledPackSha256: parseSha256Digest("08".repeat(32)),
				},
			},
		});

		expect(codesOf(findings)).toEqual(["checksum-mismatch"]);
		expect(findings[0]?.detail).toContain("Release pin");
	});

	test("reports a release that names another tax-analysis module", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const { artifact } = await registerArtifact([first]);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first],
			artifact,
			release: {
				taxAnalysisModule: {
					id: parseTaxAnalysisModuleId("some-other-module"),
					compiledModuleSha256: parseSha256Digest("09".repeat(32)),
				},
				rulePack: firstRevisionIdentity(artifact),
			},
		});

		expect(codesOf(findings)).toEqual(["release-module-mismatch"]);
	});

	test("emits stable identifiers on the reported findings", async () => {
		const first = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-01-01",
			packRevision: "2099-01-01",
		});
		const second = syntheticManifest({
			rulePackId: "test-ay2099-00.2099-02-02",
			packRevision: "2099-02-02",
		});
		const { artifact } = await registerArtifact([first]);

		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [first, second],
			artifact,
			release: releasePinFor(artifact),
		});

		for (const finding of findings) {
			expect(finding.code).toMatch(/^[a-z][a-z-]+$/);
			expect(finding.detail.length).toBeGreaterThan(0);
		}
	});

	test("compares identities through canonical JSON so key order cannot mask drift", () => {
		expect(
			canonicalJson({ a: 1, b: 2 }) === canonicalJson({ b: 2, a: 1 }),
		).toBe(true);
	});

	test("exposes parsed source and rule identifiers for documentation examples", () => {
		expect(parseSourceId(syntheticSourceRecord.id)).toBe(
			"synthetic-source-a",
		);
		expect(parseRuleId("TEST-EXAMPLE-RULE")).toBe("TEST-EXAMPLE-RULE");
	});
});
