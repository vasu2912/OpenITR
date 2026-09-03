import type { ScopeRulePack } from "@openitr/model";
import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260903 } from "./manifest";

const compiledPromise = compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260903,
});

export const itr1Ay202627CompiledRulePack20260903 = await compiledPromise;

export const itr1Ay202627RulePack20260903: ScopeRulePack = createScopeRulePack({
	compiled: itr1Ay202627CompiledRulePack20260903,
});
