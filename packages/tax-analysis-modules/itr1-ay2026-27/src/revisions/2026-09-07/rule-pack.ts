import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260907 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260907 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260907,
});

export const itr1Ay202627RulePack20260907 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260907,
});
