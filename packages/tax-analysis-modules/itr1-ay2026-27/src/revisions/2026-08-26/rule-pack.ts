import { compileRulePack } from "@openitr/rulepack-compiler";
import type { ScopeRulePack } from "@openitr/model";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260826 } from "./manifest";

const compiled = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260826,
});

export const itr1Ay202627CompiledRulePack20260826 = compiled;

export const itr1Ay202627RulePack20260826: ScopeRulePack =
	createScopeRulePack({ compiled });
