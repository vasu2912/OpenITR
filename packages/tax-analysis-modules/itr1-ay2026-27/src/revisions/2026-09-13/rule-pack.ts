import { compileRulePack } from "@openitr/rulepack-compiler";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260913 } from "./manifest";

export const itr1Ay202627CompiledRulePack20260913 = await compileRulePack({ manifest: itr1Ay202627RulePackManifest20260913 });
export const itr1Ay202627RulePack20260913 = createScopeRulePack({ compiled: itr1Ay202627CompiledRulePack20260913 });
