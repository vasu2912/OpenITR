import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	minExactMoney,
	parseFactKey,
	parseIssueCode,
	parseRuleId,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "@openitr/model";
import type {
	AttestedAnswer,
	CompiledTaxConstants,
	ExactMoney,
	FactKey,
	IssueCode,
	RulePackIdentity,
	SalaryObservation,
	Sha256Digest,
} from "@openitr/model";

import {
	buildNewRegimeLiabilityNodes,
	constantInput,
	factInput,
	finalizeComputationNodes,
	nodeInput,
} from "./new-regime-liability";
import type {
	ComputationNodeDraft,
	ComputationNodeInput,
	ComputationOperation,
	ComputationRoundingMode,
	ComputationTraceNode,
} from "./new-regime-liability";

export type {
	ComputationNodeInput,
	ComputationOperation,
	ComputationRoundingMode,
	ComputationTraceNode,
};

export const SALARY_FACT_KEYS = Object.freeze({
	section17_1: parseFactKey("salary.section-17-1"),
	exemptAllowancesSection10: parseFactKey(
		"salary.exempt-allowances-section-10",
	),
	taxableTotal: parseFactKey("salary.taxable-total"),
});

export const SALARY_COMPUTATION_ISSUE_CODES = Object.freeze({
	constantsMissing: parseIssueCode("RULE_NEW_REGIME_CONSTANTS_MISSING"),
	employerDocumentRequired: parseIssueCode(
		"FACT_SALARY_EMPLOYER_DOCUMENT_REQUIRED",
	),
	multipleEmployerDocuments: parseIssueCode(
		"FACT_SALARY_MULTIPLE_EMPLOYER_DOCUMENTS",
	),
	answerRulePackMismatch: parseIssueCode("QUESTION_RULE_PACK_MISMATCH"),
	salaryFieldMissing: parseIssueCode("FACT_SALARY_FIELD_MISSING"),
	salaryFieldDuplicated: parseIssueCode("FACT_SALARY_FIELD_DUPLICATED"),
	salaryFieldInvalid: parseIssueCode("FACT_SALARY_FIELD_INVALID"),
	salaryTotalMismatch: parseIssueCode("FACT_SALARY_TOTAL_MISMATCH"),
});

const RECOVERY_ACTIONS = Object.freeze({
	constantsMissing:
		"Load a rule-pack revision that pins the new-regime computation constants before requesting this scenario.",
	employerDocumentRequired:
		"Select a supported Form 16 so its reviewed salary observations can feed the analysis.",
	multipleEmployerDocuments:
		"This scenario analyses one employer at a time. Keep one Form 16 selected, or review multi-source analysis when it becomes available.",
	answerRulePackMismatch:
		"Answer the eligibility question again so your answer is pinned to the current rule-pack revision.",
	salaryFieldMissing:
		"Select the official Form 16 download for the assessment year so every Part A salary field appears once.",
	salaryFieldDuplicated:
		"Select the official Form 16 download for the assessment year so each salary field appears exactly once.",
	salaryFieldInvalid:
		"Select the document again so a reviewed adapter can re-read this field as whole rupees.",
	salaryTotalMismatch:
		"The document's own Part A figures disagree. Re-check the selected pages against the official employer-issued Form 16.",
});

export type AcceptedSalaryDocumentFacts = Readonly<{
	documentId: Sha256Digest;
	observations: readonly SalaryObservation[];
}>;

export type SalaryComputationRulePackInput = Readonly<{
	identity: Pick<RulePackIdentity, "id" | "revision">;
	taxConstants: CompiledTaxConstants | undefined;
}>;

export type NewRegimeSalaryComputationInput = Readonly<{
	rulePack: SalaryComputationRulePackInput;
	residentAnswer: AttestedAnswer;
	salaryDocuments: readonly AcceptedSalaryDocumentFacts[];
}>;

export type SalaryComputationIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFactKeys: readonly FactKey[];
	recoveryAction: string;
}>;

export const SALARY_ADJUSTED_INCOME_NODE_ID = parseFactKey(
	"derived.salary-standard-deduction-adjusted",
);

export type NewRegimeSalarySummary = Readonly<{
	salaryTotal: ExactMoney;
	taxableIncome: ExactMoney;
	incomeTaxBeforeAdjustments: ExactMoney;
	rebateApplied: ExactMoney;
	marginalReliefApplied: ExactMoney;
	surcharge: ExactMoney;
	cess: ExactMoney;
	finalTaxLiability: ExactMoney;
}>;

export type NewRegimeSalaryComputation =
	| Readonly<{
			kind: "computed";
			scenario: "one-employer-new-regime-salary-fy-2025-26";
			rulePackRevision: string;
			nodes: readonly ComputationTraceNode[];
			summary: NewRegimeSalarySummary;
	  }>
	| Readonly<{
			kind: "blocked";
			issues: readonly SalaryComputationIssue[];
	  }>;

const blockingIssue = (
	code: IssueCode,
	recoveryAction: string,
	affectedFactKeys: readonly FactKey[],
): SalaryComputationIssue =>
	Object.freeze({
		code,
		severity: "blocking",
		affectedFactKeys,
		recoveryAction,
	});

// The salary slice of a new-regime computation: accepted Part A observations
// up to and including the section 288A rounding of salary income. The shared
// liability builder supplies every node after total income.
export const computeNewRegimeSalaryScenario = ({
	rulePack,
	residentAnswer,
	salaryDocuments,
}: NewRegimeSalaryComputationInput): NewRegimeSalaryComputation => {
	const issues: SalaryComputationIssue[] = [];

	const constants = rulePack.taxConstants?.newRegime;
	if (constants === undefined) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.constantsMissing,
				RECOVERY_ACTIONS.constantsMissing,
				[...Object.values(SALARY_FACT_KEYS)],
			),
		);
	}
	if (salaryDocuments.length === 0) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.employerDocumentRequired,
				RECOVERY_ACTIONS.employerDocumentRequired,
				[...Object.values(SALARY_FACT_KEYS)],
			),
		);
	}
	if (salaryDocuments.length > 1) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.multipleEmployerDocuments,
				RECOVERY_ACTIONS.multipleEmployerDocuments,
				[...Object.values(SALARY_FACT_KEYS)],
			),
		);
	}
	if (residentAnswer.rulePackId !== rulePack.identity.id) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.answerRulePackMismatch,
				RECOVERY_ACTIONS.answerRulePackMismatch,
				[parseFactKey("taxpayer.residential-status")],
			),
		);
	}

	let documentObservations: readonly SalaryObservation[] = [];
	if (salaryDocuments.length === 1) {
		const [document] = salaryDocuments;
		documentObservations = document?.observations ?? [];
		for (const requiredKey of [
			SALARY_FACT_KEYS.section17_1,
			SALARY_FACT_KEYS.exemptAllowancesSection10,
			SALARY_FACT_KEYS.taxableTotal,
		]) {
			const matching = documentObservations.filter(
				(candidate) => candidate.factKey === requiredKey,
			);
			if (matching.length === 0) {
				issues.push(
					blockingIssue(
						SALARY_COMPUTATION_ISSUE_CODES.salaryFieldMissing,
						RECOVERY_ACTIONS.salaryFieldMissing,
						[requiredKey],
					),
				);
			}
			if (matching.length > 1) {
				issues.push(
					blockingIssue(
						SALARY_COMPUTATION_ISSUE_CODES.salaryFieldDuplicated,
						RECOVERY_ACTIONS.salaryFieldDuplicated,
						[requiredKey],
					),
				);
			}
			for (const candidate of matching) {
				if (
					!Number.isSafeInteger(candidate.normalizedValue) ||
					candidate.normalizedValue < 0
				) {
					issues.push(
						blockingIssue(
							SALARY_COMPUTATION_ISSUE_CODES.salaryFieldInvalid,
							RECOVERY_ACTIONS.salaryFieldInvalid,
							[requiredKey],
						),
					);
				}
			}
		}
	}

	if (issues.length > 0 || constants === undefined) {
		return Object.freeze({ kind: "blocked", issues: Object.freeze(issues) });
	}

	const revision = rulePack.identity.revision;

	const observationFor = (factKey: FactKey): SalaryObservation => {
		const found = documentObservations.find(
			(candidate) => candidate.factKey === factKey,
		);
		if (found === undefined) {
			throw new Error(`Accepted observation disappeared for ${factKey}`);
		}
		return found;
	};

	const section17_1 = observationFor(SALARY_FACT_KEYS.section17_1);
	const exemptAllowances = observationFor(
		SALARY_FACT_KEYS.exemptAllowancesSection10,
	);
	const printedTaxableTotal = observationFor(SALARY_FACT_KEYS.taxableTotal);

	const section17_1Value = exactMoneyFromWholeRupees(
		section17_1.normalizedValue,
	);
	const exemptAllowancesValue = exactMoneyFromWholeRupees(
		exemptAllowances.normalizedValue,
	);
	const printedTaxableTotalValue = exactMoneyFromWholeRupees(
		printedTaxableTotal.normalizedValue,
	);

	const expectedTaxableTotal = subtractExactMoney(
		section17_1Value,
		exemptAllowancesValue,
	);
	if (
		compareExactMoney(expectedTaxableTotal, printedTaxableTotalValue) !== 0
	) {
		return Object.freeze({
			kind: "blocked",
			issues: Object.freeze([
				blockingIssue(
					SALARY_COMPUTATION_ISSUE_CODES.salaryTotalMismatch,
					RECOVERY_ACTIONS.salaryTotalMismatch,
					[
						SALARY_FACT_KEYS.section17_1,
						SALARY_FACT_KEYS.exemptAllowancesSection10,
						SALARY_FACT_KEYS.taxableTotal,
					],
				),
			]),
		});
	}

	const standardDeduction = exactMoneyFromWholeRupees(
		constants.standardDeductionWholeRupees,
	);

	type NodeDraft = ComputationNodeDraft;
	const nodes: NodeDraft[] = [];

	const salaryTotalNode: NodeDraft = {
		nodeId: parseFactKey("derived.salary-total"),
		ruleId: parseRuleId("ITR1-SALARY-INCOME-SECTION-15"),
		operation: "sum-of-accepted-observations",
		inputs: [factInput(SALARY_FACT_KEYS.section17_1, section17_1Value)],
		unroundedValue: section17_1Value,
		roundedValue: section17_1Value,
	};
	nodes.push(salaryTotalNode);

	const afterExemptionsValue = subtractExactMoney(
		section17_1Value,
		exemptAllowancesValue,
	);
	const afterExemptionsNode: NodeDraft = {
		nodeId: parseFactKey("derived.salary-after-section-10-exemptions"),
		ruleId: parseRuleId("ITR1-SALARY-EXEMPT-ALLOWANCES-SECTION-10"),
		operation: "subtract-exempt-allowances",
		inputs: [
			nodeInput(salaryTotalNode.nodeId, section17_1Value),
			factInput(
				SALARY_FACT_KEYS.exemptAllowancesSection10,
				exemptAllowancesValue,
			),
		],
		unroundedValue: afterExemptionsValue,
		roundedValue: afterExemptionsValue,
	};
	nodes.push(afterExemptionsNode);

	const deductionApplied = minExactMoney(
		standardDeduction,
		afterExemptionsValue,
	);
	const afterStandardDeductionValue = subtractExactMoney(
		afterExemptionsValue,
		deductionApplied,
	);
	const afterDeductionNode: NodeDraft = {
		nodeId: parseFactKey("derived.salary-standard-deduction-adjusted"),
		ruleId: constants.standardDeductionRuleId,
		operation: "subtract-limited-to-zero",
		inputs: [
			nodeInput(afterExemptionsNode.nodeId, afterExemptionsValue),
			constantInput(
				"standard-deduction-section-16ia",
				constants.standardDeductionWholeRupees,
			),
		],
		unroundedValue: afterStandardDeductionValue,
		roundedValue: afterStandardDeductionValue,
	};
	nodes.push(afterDeductionNode);

	const roundingBase = exactMoneyFromWholeRupees(
		constants.totalIncomeRoundingBaseWholeRupees,
	);
	const roundedIncomeValue = roundToNearestMultipleOf(
		afterStandardDeductionValue,
		roundingBase,
	);
	const roundedIncomeNode: NodeDraft = {
		nodeId: parseFactKey("derived.total-income-rounded-section-288a"),
		ruleId: constants.totalIncomeRoundingRuleId,
		operation: "round-to-nearest-multiple",
		roundingMode: "nearest-multiple-half-up",
		inputs: [
			nodeInput(afterDeductionNode.nodeId, afterStandardDeductionValue),
			constantInput(
				"total-income-rounding-base",
				constants.totalIncomeRoundingBaseWholeRupees,
			),
		],
		unroundedValue: afterStandardDeductionValue,
		roundedValue: roundedIncomeValue,
	};
	nodes.push(roundedIncomeNode);

	const liability = buildNewRegimeLiabilityNodes({
		roundedIncomeValue,
		constants,
		residentAnswer,
	});

	return Object.freeze({
		kind: "computed",
		scenario: "one-employer-new-regime-salary-fy-2025-26",
		rulePackRevision: revision,
		nodes: finalizeComputationNodes(
			[...nodes, ...liability.nodes],
			revision,
		),
		summary: Object.freeze({
			salaryTotal: section17_1Value,
			taxableIncome: roundedIncomeValue,
			incomeTaxBeforeAdjustments: liability.summary.incomeTaxBeforeAdjustments,
			rebateApplied: liability.summary.rebateApplied,
			marginalReliefApplied: liability.summary.marginalReliefApplied,
			surcharge: liability.summary.surcharge,
			cess: liability.summary.cess,
			finalTaxLiability: liability.summary.finalTaxLiability,
		}),
	});
};
