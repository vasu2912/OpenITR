export { itr1Ay202627RulePackManifest } from "./manifest";
export {
	itr1Ay202627CompiledRulePack20260824,
	itr1Ay202627RulePack20260824,
} from "./revisions/2026-08-24/rule-pack";
export { itr1Ay202627RulePackManifest20260824 } from "./revisions/2026-08-24/manifest";
export {
	itr1Ay202627CompiledRulePack20260824b,
	itr1Ay202627RulePack20260824b,
} from "./revisions/2026-08-24b/rule-pack";
export { itr1Ay202627RulePackManifest20260824b } from "./revisions/2026-08-24b/manifest";
export {
	itr1Ay202627CompiledRulePack20260826,
	itr1Ay202627RulePack20260826,
} from "./revisions/2026-08-26/rule-pack";
export { itr1Ay202627RulePackManifest20260826 } from "./revisions/2026-08-26/manifest";
export {
	itr1Ay202627CompiledRulePack20260903,
	itr1Ay202627RulePack20260903,
} from "./revisions/2026-09-03/rule-pack";
export { itr1Ay202627RulePackManifest20260903 } from "./revisions/2026-09-03/manifest";
export {
	itr1Ay202627CompiledRulePack20260904,
	itr1Ay202627RulePack20260904,
} from "./revisions/2026-09-04/rule-pack";
export { itr1Ay202627RulePackManifest20260904 } from "./revisions/2026-09-04/manifest";
export {
	itr1Ay202627CompiledRulePack20260905,
	itr1Ay202627RulePack20260905,
} from "./revisions/2026-09-05/rule-pack";
export { itr1Ay202627RulePackManifest20260905 } from "./revisions/2026-09-05/manifest";
export {
	itr1Ay202627CompiledRulePack20260906,
	itr1Ay202627RulePack20260906,
} from "./revisions/2026-09-06/rule-pack";
export { itr1Ay202627RulePackManifest20260906 } from "./revisions/2026-09-06/manifest";
export {
	itr1Ay202627CompiledRulePack20260907,
	itr1Ay202627RulePack20260907,
} from "./revisions/2026-09-07/rule-pack";
export { itr1Ay202627RulePackManifest20260907 } from "./revisions/2026-09-07/manifest";
export {
	itr1Ay202627CompiledRulePack20260908,
	itr1Ay202627RulePack20260908,
} from "./revisions/2026-09-08/rule-pack";
export { itr1Ay202627RulePackManifest20260908 } from "./revisions/2026-09-08/manifest";
export {
	itr1Ay202627CompiledRulePack20260909,
	itr1Ay202627RulePack20260909,
} from "./revisions/2026-09-09/rule-pack";
export { itr1Ay202627RulePackManifest20260909 } from "./revisions/2026-09-09/manifest";
export {
	createScopeRulePack,
} from "./scope-rule-pack";
export {
	deriveItr1AnalysisScopeFacts,
	evaluateItr1AnalysisScope,
	itr1EstimateIsBlockedByScopeFacts,
	knownScopeFact,
	parseItr1ScopeQuestionAnswer,
	unknownScopeFact,
} from "./scope-analysis";
export {
	itr1Ay202627CompiledRulePack,
	itr1Ay202627RulePack,
} from "./rule-pack";
export { itr1Ay202627TaxAnalysisModuleArtifact } from "./tax-analysis-module";
export { computeNewRegimeSalaryScenario, SALARY_FACT_KEYS } from "./computations/new-regime-salary";
export type {
	AcceptedSalaryDocumentFacts,
	ComputationNodeInput,
	ComputationTraceNode,
	NewRegimeSalaryComputation,
	NewRegimeSalaryComputationInput,
	NewRegimeSalarySummary,
	SalaryComputationIssue,
	SalaryComputationRulePackInput,
} from "./computations/new-regime-salary";
export {
	computeRefundOrAmountPayableEstimate,
	estimateRefundOrAmountPayableFromSalaryScenario,
} from "./computations/estimate-refund-or-payable";
export {
	computeSelfOccupiedHouseProperty,
	SELF_OCCUPIED_HOUSE_PROPERTY_FACT_KEYS,
} from "./computations/self-occupied-house-property";
export type {
	HousePropertyComputationIssue,
	HousePropertyTraceNode,
	SelfOccupiedHousePropertyComputation,
	SelfOccupiedHousePropertyFact,
} from "./computations/self-occupied-house-property";
export { computeHouseProperties } from "./computations/house-property";
export type {
	ComputedHouseProperty,
	HousePropertyComputation,
	HousePropertyFact,
	HousePropertyNumber,
	SignedHousePropertyAmount,
} from "./computations/house-property";
export { computeOtherSources } from "./computations/other-sources";
export type {
	OtherSourceCategory,
	OtherSourceFact,
	OtherSourcesComputation,
	OtherSourcesIssue,
	OtherSourcesTraceNode,
} from "./computations/other-sources";
export { computeSection112aCapitalGain } from "./computations/section112a-capital-gain";
export type {
	Section112aCapitalGainComputation,
	Section112aCapitalGainFact,
	Section112aCapitalGainIssue,
	Section112aCapitalGainTraceNode,
} from "./computations/section112a-capital-gain";
export {
	AGRICULTURAL_INCOME_FACT_KEY,
	computeAgriculturalIncome,
} from "./computations/agricultural-income";
export {
	computeSavingsPensionDeductions,
	SAVINGS_PENSION_DEDUCTION_FACT_KEYS,
} from "./computations/savings-pension-deductions";
export type {
	SavingsPensionDeductionCategory,
	SavingsPensionDeductionClaim,
	SavingsPensionDeductionComputation,
	SavingsPensionDeductionFact,
	SavingsPensionDeductionIssue,
	SavingsPensionDeductionOrigin,
	SavingsPensionDeductionTraceNode,
	SavingsPensionRegimeResult,
} from "./computations/savings-pension-deductions";
export type {
	AgriculturalIncomeComputation,
	AgriculturalIncomeFact,
	AgriculturalIncomeIssue,
	AgriculturalIncomeTraceNode,
} from "./computations/agricultural-income";
export type {
	AcceptedBankInterestDocumentFacts,
	AcceptedNonSalaryIncomeDocumentFacts,
	AcceptedTdsDocumentFacts,
	AcceptedTaxPaymentDocumentFacts,
	AcceptedTaxPaymentReceipt,
	AttestedFactContribution,
	EstimateEvidenceReference,
	EstimateEvidenceRole,
	EstimateOutcome,
	EstimateFromSalaryScenarioInput,
	RefundOrAmountPayableEstimate,
	RefundOrAmountPayableEstimateInput,
	RefundOrPayableEstimateIssue,
	RefundOrPayableEstimateSummary,
} from "./computations/estimate-refund-or-payable";
