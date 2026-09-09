import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260915 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260915 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260915,
});
export const itr1Ay202627RulePack20260915 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260915,
});
