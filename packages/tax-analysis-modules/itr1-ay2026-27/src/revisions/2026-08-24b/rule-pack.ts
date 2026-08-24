import { compileRulePack } from "@openitr/rulepack-compiler";
import type { ScopeRulePack } from "@openitr/model";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260824b } from "./manifest";

const compiled = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260824b,
});

export const itr1Ay202627CompiledRulePack20260824b = compiled;

export const itr1Ay202627RulePack20260824b: ScopeRulePack =
	createScopeRulePack({ compiled });
