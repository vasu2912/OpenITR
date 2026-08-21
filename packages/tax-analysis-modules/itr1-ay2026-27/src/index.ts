import type { ScopeRulePack } from "@openitr/model";

import { itr1Ay202627RulePack } from "./rule-pack";

const rulePacks: ReadonlyMap<string, ScopeRulePack> = new Map([
	[itr1Ay202627RulePack.identity.id, itr1Ay202627RulePack],
]);

export const getItr1Ay202627RulePack = (
	rulePackId: string,
): ScopeRulePack | undefined => rulePacks.get(rulePackId);

export { itr1Ay202627RulePack } from "./rule-pack";

