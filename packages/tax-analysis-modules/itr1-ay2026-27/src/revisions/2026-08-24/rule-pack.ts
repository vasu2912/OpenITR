import { compileRulePack } from "@openitr/rulepack-compiler";
import type { ScopeRulePack } from "@openitr/model";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260824 } from "./manifest";

const compiled = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260824,
});

export const itr1Ay202627CompiledRulePack20260824 = compiled;

export const itr1Ay202627RulePack20260824: ScopeRulePack =
	createScopeRulePack({ compiled });
