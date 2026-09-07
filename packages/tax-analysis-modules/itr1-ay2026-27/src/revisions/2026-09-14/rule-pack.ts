import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260914 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260914 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260914,
});
export const itr1Ay202627RulePack20260914 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260914,
});
