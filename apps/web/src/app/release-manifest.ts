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
			"b01ed8ebbd4cf193e7f1c3735d12e6785cfe1e67dadcd0034f772149441f3811",
		),
	}),
	rulePack: Object.freeze({
		id: parseRulePackId("itr1-ay2026-27.2026-09-08"),
		sourceManifestSha256: parseSha256Digest(
			"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
		),
		compiledPackSha256: parseSha256Digest(
			"1ca023ec5076075770d32c326b30f9088d179afde5981642fbe3c1930eed2c9c",
		),
	}),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	rulePackRevision: "2026-09-08",
	engineContractVersion: "1",
});
