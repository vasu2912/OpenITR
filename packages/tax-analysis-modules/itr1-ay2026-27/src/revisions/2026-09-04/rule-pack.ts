import type { ScopeRulePack } from "@openitr/model";
import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260904 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260904 = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260904,
});

export const itr1Ay202627RulePack20260904: ScopeRulePack = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260904,
});
