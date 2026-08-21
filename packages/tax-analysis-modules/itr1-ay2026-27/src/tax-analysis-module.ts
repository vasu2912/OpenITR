import {
	parseSha256Digest,
	parseTaxAnalysisModuleId,
} from "@openitr/model";
import type { TaxAnalysisModule } from "@openitr/model";

import { itr1Ay202627RulePack } from "./rule-pack";

export const itr1Ay202627TaxAnalysisModule = Object.freeze({
	identity: Object.freeze({
		id: parseTaxAnalysisModuleId("itr1-ay2026-27"),
		compiledModuleSha256: parseSha256Digest(
			"3c00e3c2bdba293b4302bf790dada6a560ddd1aa6db144bbcf3f4218329f86cb",
		),
	}),
	rulePack: itr1Ay202627RulePack,
}) satisfies TaxAnalysisModule;
