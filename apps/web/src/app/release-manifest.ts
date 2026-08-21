import {
	parseAssessmentYear,
	parseFinancialYear,
	parseRulePackId,
	parseSha256Digest,
	parseTaxAnalysisModuleId,
	parseTaxFormId,
} from "@openitr/model";
import type {
	AssessmentYear,
	FinancialYear,
	RulePackId,
	Sha256Digest,
	TaxAnalysisModuleIdentity,
	TaxFormId,
} from "@openitr/model";

export type AnalysisRelease = Readonly<{
	taxAnalysisModule: TaxAnalysisModuleIdentity;
	rulePack: Readonly<{
		id: RulePackId;
		sourceManifestSha256: Sha256Digest;
		compiledPackSha256: Sha256Digest;
	}>;
	form: TaxFormId;
	financialYear: FinancialYear;
	assessmentYear: AssessmentYear;
	rulePackRevision: string;
}>;

export const activeAnalysisRelease: AnalysisRelease = Object.freeze({
	taxAnalysisModule: Object.freeze({
		id: parseTaxAnalysisModuleId("itr1-ay2026-27"),
		compiledModuleSha256: parseSha256Digest(
			"3c00e3c2bdba293b4302bf790dada6a560ddd1aa6db144bbcf3f4218329f86cb",
		),
	}),
	rulePack: Object.freeze({
		id: parseRulePackId("itr1-ay2026-27.2026-08-22"),
		sourceManifestSha256: parseSha256Digest(
			"f2958db3eaa6a1062c90937092f902abb0c9c3b52c6e5abd0c26df860281daf4",
		),
		compiledPackSha256: parseSha256Digest(
			"366b9b025afbb6f89a6532a75a74332edcf628047bc7eb104a360e6db3b50a92",
		),
	}),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	rulePackRevision: "2026-08-22",
});
