import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260910 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260910 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260910,
});

export const itr1Ay202627RulePack20260910 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260910,
});
