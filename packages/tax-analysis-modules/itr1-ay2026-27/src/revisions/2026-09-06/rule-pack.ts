import type { ScopeRulePack } from "@openitr/model";
import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260906 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260906 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260906,
});

export const itr1Ay202627RulePack20260906: ScopeRulePack = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260906,
});
