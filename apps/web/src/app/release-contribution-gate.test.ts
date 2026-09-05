import {
	itr1Ay202627RulePackManifest,
	itr1Ay202627RulePackManifest20260824,
	itr1Ay202627RulePackManifest20260824b,
	itr1Ay202627RulePackManifest20260826,
	itr1Ay202627RulePackManifest20260903,
	itr1Ay202627RulePackManifest20260904,
	itr1Ay202627RulePackManifest20260905,
	itr1Ay202627RulePackManifest20260906,
	itr1Ay202627RulePackManifest20260907,
	itr1Ay202627RulePackManifest20260908,
	itr1Ay202627RulePackManifest20260909,
	itr1Ay202627TaxAnalysisModuleArtifact,
} from "@openitr/itr1-ay2026-27";
import { auditTaxAnalysisModuleContribution } from "@openitr/contribution-gate";
import { describe, expect, test } from "vitest";

import { activeAnalysisRelease } from "./release-manifest";

describe("release contribution gate", () => {
	test("the shipped rule-pack revisions pass every contribution check", async () => {
		const findings = await auditTaxAnalysisModuleContribution({
			manifests: [
				itr1Ay202627RulePackManifest,
				itr1Ay202627RulePackManifest20260824,
				itr1Ay202627RulePackManifest20260824b,
				itr1Ay202627RulePackManifest20260826,
				itr1Ay202627RulePackManifest20260903,
				itr1Ay202627RulePackManifest20260904,
				itr1Ay202627RulePackManifest20260905,
				itr1Ay202627RulePackManifest20260906,
				itr1Ay202627RulePackManifest20260907,
				itr1Ay202627RulePackManifest20260908,
				itr1Ay202627RulePackManifest20260909,
			],
			artifact: itr1Ay202627TaxAnalysisModuleArtifact,
			release: activeAnalysisRelease,
		});

		expect(findings).toEqual([]);
	});

	test("the release pins the contributed revision", () => {
		expect(activeAnalysisRelease.rulePack.id).toBe(
			"itr1-ay2026-27.2026-09-09",
		);
	});
});
