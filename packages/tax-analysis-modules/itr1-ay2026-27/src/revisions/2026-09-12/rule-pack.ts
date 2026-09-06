import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260912 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260912 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260912,
});

export const itr1Ay202627RulePack20260912 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260912,
});
