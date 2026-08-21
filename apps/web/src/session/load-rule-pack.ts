import type { RulePackId, ScopeRulePack } from "@openitr/model";

import { activeAnalysisRelease } from "../app/release-manifest";

type RulePackLoader = () => Promise<ScopeRulePack>;

const rulePackLoaders: ReadonlyMap<RulePackId, RulePackLoader> = new Map([
	[
		activeAnalysisRelease.rulePackId,
		async () => {
			const module = await import("@openitr/itr1-ay2026-27");
			return module.itr1Ay202627RulePack;
		},
	],
]);

export const loadRulePack = async (
	rulePackId: RulePackId,
): Promise<ScopeRulePack> => {
	const load = rulePackLoaders.get(rulePackId);
	if (load === undefined) {
		throw new Error(`Unknown rule pack: ${rulePackId}`);
	}

	const rulePack = await load();
	if (rulePack.identity.id !== rulePackId) {
		throw new Error(`Rule-pack identity mismatch: ${rulePackId}`);
	}
	return rulePack;
};

