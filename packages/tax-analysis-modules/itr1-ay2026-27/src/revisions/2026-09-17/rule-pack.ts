import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260917 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260917 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260917,
});
export const itr1Ay202627RulePack20260917 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260917,
});
