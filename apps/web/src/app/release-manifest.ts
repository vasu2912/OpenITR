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
	RulePackIdentity,
	TaxAnalysisModuleArtifactIdentity,
	TaxFormId,
} from "@openitr/model";

export type AnalysisRelease = Readonly<{
	taxAnalysisModule: TaxAnalysisModuleArtifactIdentity;
	rulePack: Pick<
		RulePackIdentity,
		"id" | "sourceManifestSha256" | "compiledPackSha256"
	>;
	form: TaxFormId;
	financialYear: FinancialYear;
	assessmentYear: AssessmentYear;
	rulePackRevision: string;
	engineContractVersion: string;
}>;

export const activeAnalysisRelease: AnalysisRelease = Object.freeze({
	taxAnalysisModule: Object.freeze({
		id: parseTaxAnalysisModuleId("itr1-ay2026-27"),
		compiledModuleSha256: parseSha256Digest(
			"3c00e3c2bdba293b4302bf790dada6a560ddd1aa6db144bbcf3f4218329f86cb",
		),
	}),
	rulePack: Object.freeze({
		id: parseRulePackId("itr1-ay2026-27.2026-08-24b"),
		sourceManifestSha256: parseSha256Digest(
			"63df0accc6b324bb71463cc554ae02d434822c89c509fab20d9b2c0f99fce6cc",
		),
		compiledPackSha256: parseSha256Digest(
			"97145bc2def5c6dcc390636c8a0abb3ccbae578b34d9d414130b9f3c4980bce8",
		),
	}),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	rulePackRevision: "2026-08-24b",
	engineContractVersion: "1",
});
