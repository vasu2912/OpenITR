import { compileRulePack } from "@openitr/rulepack-compiler";
import type { ScopeRulePack } from "@openitr/model";

import { itr1Ay202627RulePackManifest } from "./manifest";
import { createScopeRulePack } from "./scope-rule-pack";

const compiled = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest,
});

export const itr1Ay202627CompiledRulePack = compiled;

export const itr1Ay202627RulePack: ScopeRulePack = createScopeRulePack({
	compiled,
});
