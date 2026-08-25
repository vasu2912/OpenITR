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
	createScopeRulePack,
} from "./scope-rule-pack";
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
export type {
	AcceptedBankInterestDocumentFacts,
	AcceptedNonSalaryIncomeDocumentFacts,
	AcceptedTdsDocumentFacts,
	AcceptedTaxPaymentDocumentFacts,
	AcceptedTaxPaymentReceipt,
	EstimateEvidenceReference,
	EstimateEvidenceRole,
	EstimateOutcome,
	EstimateFromSalaryScenarioInput,
	RefundOrAmountPayableEstimate,
	RefundOrAmountPayableEstimateInput,
	RefundOrPayableEstimateIssue,
	RefundOrPayableEstimateSummary,
} from "./computations/estimate-refund-or-payable";
