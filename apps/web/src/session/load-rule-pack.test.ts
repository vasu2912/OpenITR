import { parseRulePackId, parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { activeAnalysisRelease } from "../app/release-manifest";
import { loadRulePack } from "./load-rule-pack";

describe("rule-pack loading", () => {
	test("loads the module and pack pinned by the release manifest", async () => {
		const rulePack = await loadRulePack(activeAnalysisRelease);

		expect(rulePack.identity).toMatchObject(activeAnalysisRelease.rulePack);
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
});
