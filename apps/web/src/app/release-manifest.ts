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
			"b7a609afd6964d9a7d6b18d1dff2f280615900e38e3fb79116d89fa4c19831a8",
		),
	}),
	rulePack: Object.freeze({
		id: parseRulePackId("itr1-ay2026-27.2026-09-05"),
		sourceManifestSha256: parseSha256Digest(
			"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
		),
		compiledPackSha256: parseSha256Digest(
			"ae48aed1cca9917e56a62e5d4c784396f9ca3f7500975cbdd9ed112ce6b87725",
		),
	}),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	rulePackRevision: "2026-09-05",
	engineContractVersion: "1",
});
