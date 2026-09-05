import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260908 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260908 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260908,
});

export const itr1Ay202627RulePack20260908 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260908,
});
