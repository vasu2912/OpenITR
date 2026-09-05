import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260909 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260909 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260909,
});

export const itr1Ay202627RulePack20260909 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260909,
});
