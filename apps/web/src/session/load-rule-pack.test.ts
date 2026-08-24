import {
	parseRulePackId,
	parseSha256Digest,
	parseTaxAnalysisModuleId,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { activeAnalysisRelease } from "../app/release-manifest";
import { loadRulePack } from "./load-rule-pack";

describe("rule-pack loading", () => {
	test("loads the module and pack pinned by the release manifest", async () => {
		const rulePack = await loadRulePack(activeAnalysisRelease);

		expect(rulePack.identity.id).toBe(activeAnalysisRelease.rulePack.id);
		expect(rulePack.identity.sourceManifestSha256).toBe(
			activeAnalysisRelease.rulePack.sourceManifestSha256,
		);
		expect(rulePack.identity.compiledPackSha256).toBe(
			activeAnalysisRelease.rulePack.compiledPackSha256,
		);
	});

	test("rejects a module whose compiled hash does not match the release", async () => {
		const mismatchedRelease = {
			...activeAnalysisRelease,
			taxAnalysisModule: {
				...activeAnalysisRelease.taxAnalysisModule,
				compiledModuleSha256: parseSha256Digest("0".repeat(64)),
			},
		};

		await expect(loadRulePack(mismatchedRelease)).rejects.toThrow(
			"Tax-analysis module identity mismatch",
		);
	});

	test("rejects a rule pack whose compiled hash does not match the release", async () => {
		const mismatchedRelease = {
			...activeAnalysisRelease,
			rulePack: {
				...activeAnalysisRelease.rulePack,
				compiledPackSha256: parseSha256Digest("0".repeat(64)),
			},
		};

		await expect(loadRulePack(mismatchedRelease)).rejects.toThrow(
			"Rule-pack identity mismatch",
		);
	});

	test("rejects a release that selects a revision absent from the registry", async () => {
		const unknownRevisionRelease = {
			...activeAnalysisRelease,
			rulePack: {
				...activeAnalysisRelease.rulePack,
				id: parseRulePackId("itr1-ay2026-27.2099-01-01"),
			},
		};

		await expect(loadRulePack(unknownRevisionRelease)).rejects.toThrow(
			"Unknown rule-pack revision",
		);
	});

	test("rejects an unregistered runtime plugin module", async () => {
		const unregisteredPluginRelease = {
			...activeAnalysisRelease,
			taxAnalysisModule: {
				id: parseTaxAnalysisModuleId("community-plugin-ay2099"),
				compiledModuleSha256: parseSha256Digest("ab".repeat(32)),
			},
		};

		await expect(loadRulePack(unregisteredPluginRelease)).rejects.toThrow(
			"Unknown tax-analysis module",
		);
	});

	test("rejects a pack whose minimum engine contract version exceeds the release", async () => {
		const olderEngineRelease = {
			...activeAnalysisRelease,
			engineContractVersion: "0",
		};

		await expect(loadRulePack(olderEngineRelease)).rejects.toThrow(
			"Incompatible engine contract version",
		);
	});
});
