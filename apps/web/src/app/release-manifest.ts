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
			"c47d3f8a55df600a2fe31f6fbb4623d19ca0e024721f4a28d1b686b1adeaa83e",
		),
	}),
	rulePack: Object.freeze({
		id: parseRulePackId("itr1-ay2026-27.2026-09-10"),
		sourceManifestSha256: parseSha256Digest(
			"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
		),
		compiledPackSha256: parseSha256Digest(
			"337492407784a001cb5e0e4407e18851a63cb0c7c500617170119da956da1647",
		),
	}),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	rulePackRevision: "2026-09-10",
	engineContractVersion: "1",
});
