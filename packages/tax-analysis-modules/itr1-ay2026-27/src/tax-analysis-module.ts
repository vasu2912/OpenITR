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
import { itr1Ay202627RulePack20260903 } from "./revisions/2026-09-03/rule-pack";
import { itr1Ay202627RulePack20260904 } from "./revisions/2026-09-04/rule-pack";
import { itr1Ay202627RulePack20260905 } from "./revisions/2026-09-05/rule-pack";

const moduleId = parseTaxAnalysisModuleId("itr1-ay2026-27");

export const itr1Ay202627TaxAnalysisModuleArtifact = Object.freeze({
	identity: Object.freeze({
		id: moduleId,
		compiledModuleSha256: parseSha256Digest(
			"b7a609afd6964d9a7d6b18d1dff2f280615900e38e3fb79116d89fa4c19831a8",
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
			Object.freeze({
				identity: itr1Ay202627RulePack20260903.identity,
				load: async () => itr1Ay202627RulePack20260903,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260904.identity,
				load: async () => itr1Ay202627RulePack20260904,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260905.identity,
				load: async () => itr1Ay202627RulePack20260905,
			}),
		],
	}),
}) satisfies TaxAnalysisModuleArtifact;
