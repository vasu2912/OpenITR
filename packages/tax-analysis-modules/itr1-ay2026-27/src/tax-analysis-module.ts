import {
	createRulePackRevisionRegistry,
	parseSha256Digest,
	parseTaxAnalysisModuleId,
} from "@openitr/model";
import type { TaxAnalysisModuleArtifact } from "@openitr/model";

import { itr1Ay202627RulePack } from "./rule-pack";
import { itr1Ay202627RulePack20260824 } from "./revisions/2026-08-24/rule-pack";
import { itr1Ay202627RulePack20260824b } from "./revisions/2026-08-24b/rule-pack";
import { itr1Ay202627RulePack20260826 } from "./revisions/2026-08-26/rule-pack";

const moduleId = parseTaxAnalysisModuleId("itr1-ay2026-27");

export const itr1Ay202627TaxAnalysisModuleArtifact = Object.freeze({
	identity: Object.freeze({
		id: moduleId,
		compiledModuleSha256: parseSha256Digest(
			"cf2f844af75f56f576b6719160e4a3581a178208c6fff7002988ac08f79943bb",
		),
	}),
	rulePackRevisions: createRulePackRevisionRegistry({
		moduleId,
		revisions: [
			Object.freeze({
				identity: itr1Ay202627RulePack.identity,
				load: async () => itr1Ay202627RulePack,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260824.identity,
				load: async () => itr1Ay202627RulePack20260824,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260824b.identity,
				load: async () => itr1Ay202627RulePack20260824b,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260826.identity,
				load: async () => itr1Ay202627RulePack20260826,
			}),
		],
	}),
}) satisfies TaxAnalysisModuleArtifact;
