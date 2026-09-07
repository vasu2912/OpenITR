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
			"86f8c701f54a30f326a3737a37bdd5d0c3ee156f465bc29311cf301b22b76f8c",
		),
	}),
	rulePack: Object.freeze({
		id: parseRulePackId("itr1-ay2026-27.2026-09-14"),
		sourceManifestSha256: parseSha256Digest(
			"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
		),
		compiledPackSha256: parseSha256Digest(
			"5ea8edfae18d0feeac72fdaaf10e3862cf34a5df96ae7bcb75c08f9264847c91",
		),
	}),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	rulePackRevision: "2026-09-14",
	engineContractVersion: "1",
});
