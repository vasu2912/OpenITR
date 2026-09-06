import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260911 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260911 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260911,
});

export const itr1Ay202627RulePack20260911 = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260911,
});
