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
import { itr1Ay202627RulePack20260906 } from "./revisions/2026-09-06/rule-pack";
import { itr1Ay202627RulePack20260907 } from "./revisions/2026-09-07/rule-pack";
import { itr1Ay202627RulePack20260908 } from "./revisions/2026-09-08/rule-pack";
import { itr1Ay202627RulePack20260909 } from "./revisions/2026-09-09/rule-pack";

const moduleId = parseTaxAnalysisModuleId("itr1-ay2026-27");

export const itr1Ay202627TaxAnalysisModuleArtifact = Object.freeze({
	identity: Object.freeze({
		id: moduleId,
		compiledModuleSha256: parseSha256Digest(
			"8b230b52786458bbb1441ca3ad4709a111e6910631e844e504b7ad96bd4bcccc",
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
			Object.freeze({
				identity: itr1Ay202627RulePack20260906.identity,
				load: async () => itr1Ay202627RulePack20260906,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260907.identity,
				load: async () => itr1Ay202627RulePack20260907,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260908.identity,
				load: async () => itr1Ay202627RulePack20260908,
			}),
			Object.freeze({
				identity: itr1Ay202627RulePack20260909.identity,
				load: async () => itr1Ay202627RulePack20260909,
			}),
		],
	}),
}) satisfies TaxAnalysisModuleArtifact;
