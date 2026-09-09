import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	maxExactMoney,
	minExactMoney,
	parseFactKey,
	parseIssueCode,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "@openitr/model";
import type {
	AttestedAnswer,
	ExactMoney,
	FactKey,
	IssueCode,
	ScopeRulePack,
} from "@openitr/model";

import {
	buildNewRegimeLiabilityNodes,
	constantInput,
	finalizeComputationNodes,
	nodeInput,
	TOTAL_INCOME_ROUNDED_NODE_ID,
} from "./new-regime-liability";
import type {
	ComputationNodeDraft,
	ComputationTraceNode,
} from "./new-regime-liability";

const ZERO = exactMoneyFromWholeRupees(0);

export type NewRegimeDeductionCategory =
	| "savingsAndPension"
	| "healthAndDisability"
	| "loanInterest"
	| "donations"
	| "remaining";

export type NewRegimeDeductionAmounts = Readonly<
	Record<
		NewRegimeDeductionCategory,
		Readonly<{
			oldRegimeAllowed: ExactMoney;
			newRegimeAllowed: ExactMoney;
		}>
	>
>;

export type NewRegimeAcceptedAmounts = Readonly<{
	salaryAfterExemptions: ExactMoney;
	houseProperty: Readonly<{
		kind: "income" | "loss";
		amount: ExactMoney;
	}>;
	bankInterest: ExactMoney;
	otherSources: ExactMoney;
	section112aGain: ExactMoney;
	section112aTax: ExactMoney;
	agriculturalIncome: ExactMoney;
	deductions: NewRegimeDeductionAmounts;
}>;

export type NewRegimeComputationIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type NewRegimeComputationInput =
	| Readonly<{
		kind: "blocked";
		issues: readonly NewRegimeComputationIssue[];
	}>
	| Readonly<{
		kind: "ready";
		amounts: NewRegimeAcceptedAmounts;
	}>;

export type NewRegimeDeductionComparison = Readonly<
	Record<
		NewRegimeDeductionCategory,
		Readonly<{
			oldRegimeAllowed: ExactMoney;
			newRegimeAllowed: ExactMoney;
			excludedFromNewRegime: ExactMoney;
		}>
	>
>;

export type NewRegimeSummary = Readonly<{
	salaryIncome: ExactMoney;
	housePropertyIncome: ExactMoney;
	housePropertyLossExcluded: ExactMoney;
	bankInterestIncome: ExactMoney;
	otherSourcesIncome: ExactMoney;
	section112aGain: ExactMoney;
	agriculturalIncome: ExactMoney;
	grossTotalIncome: ExactMoney;
	deductionsAllowed: ExactMoney;
	totalIncome: ExactMoney;
	normalRateIncome: ExactMoney;
	incomeTaxBeforeAdjustments: ExactMoney;
	section112aTax: ExactMoney;
	rebateApplied: ExactMoney;
	marginalReliefApplied: ExactMoney;
	surcharge: ExactMoney;
	surchargeMarginalReliefApplied: ExactMoney;
	cess: ExactMoney;
	finalTaxLiability: ExactMoney;
}>;

export type NewRegimeComputation =
	| Readonly<{
		kind: "blocked" | "unsupported";
		issues: readonly NewRegimeComputationIssue[];
	}>
	| Readonly<{
		kind: "computed";
		rulePackRevision: string;
		nodes: readonly ComputationTraceNode[];
		summary: NewRegimeSummary;
		deductionComparison: NewRegimeDeductionComparison;
	}>;

const nodeIds = Object.freeze({
	salary: parseFactKey("derived.new-regime-salary-income"),
	houseProperty: parseFactKey("derived.new-regime-house-property-income"),
	bankInterest: parseFactKey("derived.new-regime-bank-interest-income"),
	otherSources: parseFactKey("derived.new-regime-other-sources-income"),
	section112a: parseFactKey("derived.new-regime-section112a-gain"),
	agriculturalIncome: parseFactKey("derived.new-regime-agricultural-income"),
	grossTotalIncome: parseFactKey("derived.new-regime-gross-total-income"),
	savingsAndPensionDeductions: parseFactKey(
		"derived.new-regime-savings-pension-deductions",
	),
	healthAndDisabilityDeductions: parseFactKey(
		"derived.new-regime-health-disability-deductions",
	),
	loanInterestDeductions: parseFactKey(
		"derived.new-regime-loan-interest-deductions",
	),
	donationDeductions: parseFactKey(
		"derived.new-regime-donation-deductions",
	),
	remainingDeductions: parseFactKey(
		"derived.new-regime-remaining-deductions",
	),
	deductionsAllowed: parseFactKey("derived.new-regime-deductions-allowed"),
	normalRateIncome: parseFactKey("derived.new-regime-normal-rate-income"),
	section112aTax: parseFactKey("derived.new-regime-section112a-tax"),
});

const deductionNodeIds: Readonly<Record<NewRegimeDeductionCategory, FactKey>> =
	Object.freeze({
		savingsAndPension: nodeIds.savingsAndPensionDeductions,
		healthAndDisability: nodeIds.healthAndDisabilityDeductions,
		loanInterest: nodeIds.loanInterestDeductions,
		donations: nodeIds.donationDeductions,
		remaining: nodeIds.remainingDeductions,
	});

const deductionLabels: Readonly<
	Record<NewRegimeDeductionCategory, string>
> = Object.freeze({
	savingsAndPension: "Savings and pension deductions",
	healthAndDisability: "Health and disability deductions",
	loanInterest: "Loan-interest deductions",
	donations: "Donation deductions",
	remaining: "Remaining approved deductions",
});

const sum = (values: readonly ExactMoney[]): ExactMoney =>
	values.reduce(addExactMoney, ZERO);

const blockedIssue = (
	code: string,
	recoveryAction: string,
	affectedFacts: readonly FactKey[] = [],
): NewRegimeComputationIssue => ({
	code: parseIssueCode(code),
	severity: "blocking",
	affectedFacts,
	recoveryAction,
});

export const computeNewRegime = ({
	rulePack,
	residentAnswer,
	input,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "identity" | "taxConstants">;
	residentAnswer: AttestedAnswer;
	input: NewRegimeComputationInput;
}>): NewRegimeComputation => {
	if (input.kind === "blocked") {
		return { kind: "blocked", issues: Object.freeze([...input.issues]) };
	}

	const constants = rulePack.taxConstants?.newRegime;
	const completeConstants = constants?.completeComputation;
	const section112aConstants = rulePack.taxConstants?.section112aCapitalGain;
	const agriculturalIncomeConstants =
		rulePack.taxConstants?.agriculturalIncome;
	if (
		constants === undefined ||
		completeConstants === undefined ||
		section112aConstants === undefined ||
		agriculturalIncomeConstants === undefined
	) {
		return {
			kind: "blocked",
			issues: [
				blockedIssue(
					"RULE_COMPLETE_NEW_REGIME_CONSTANTS_MISSING",
					"Load a rule-pack revision that pins the complete new-regime computation.",
				),
			],
		};
	}
	if (residentAnswer.rulePackId !== rulePack.identity.id) {
		return {
			kind: "blocked",
			issues: [
				blockedIssue(
					"QUESTION_RULE_PACK_MISMATCH",
					"Answer the residence question again under the current rule-pack revision.",
					[parseFactKey("taxpayer.residential-status")],
				),
			],
		};
	}

	const { amounts } = input;
	const standardDeduction = minExactMoney(
		amounts.salaryAfterExemptions,
		exactMoneyFromWholeRupees(constants.standardDeductionWholeRupees),
	);
	const salaryIncome = subtractExactMoney(
		amounts.salaryAfterExemptions,
		standardDeduction,
	);
	const housePropertyIncome =
		amounts.houseProperty.kind === "income"
			? amounts.houseProperty.amount
			: ZERO;
	const housePropertyLossExcluded =
		amounts.houseProperty.kind === "loss"
			? amounts.houseProperty.amount
			: ZERO;
	const ordinaryGrossIncome = sum([
		salaryIncome,
		housePropertyIncome,
		amounts.bankInterest,
		amounts.otherSources,
	]);
	const grossTotalIncome = addExactMoney(
		ordinaryGrossIncome,
		amounts.section112aGain,
	);
	const deductionCategories = Object.keys(
		amounts.deductions,
	) as NewRegimeDeductionCategory[];
	const deductionComparison = Object.freeze(
		Object.fromEntries(
			deductionCategories.map((category) => {
				const deduction = amounts.deductions[category];
				return [
					category,
					Object.freeze({
						...deduction,
						excludedFromNewRegime: maxExactMoney(
							ZERO,
							compareExactMoney(
								deduction.oldRegimeAllowed,
								deduction.newRegimeAllowed,
							) >= 0
								? subtractExactMoney(
										deduction.oldRegimeAllowed,
										deduction.newRegimeAllowed,
									)
								: ZERO,
						),
					}),
				];
			}),
		) as NewRegimeDeductionComparison,
	);
	const deductionsAllowed = minExactMoney(
		sum(
			deductionCategories.map(
				(category) => amounts.deductions[category].newRegimeAllowed,
			),
		),
		ordinaryGrossIncome,
	);
	const totalIncomeBeforeRounding = addExactMoney(
		subtractExactMoney(ordinaryGrossIncome, deductionsAllowed),
		amounts.section112aGain,
	);
	const totalIncome = roundToNearestMultipleOf(
		totalIncomeBeforeRounding,
		exactMoneyFromWholeRupees(
			constants.totalIncomeRoundingBaseWholeRupees,
		),
	);
	const normalRateIncome = maxExactMoney(
		ZERO,
		compareExactMoney(totalIncome, amounts.section112aGain) >= 0
			? subtractExactMoney(totalIncome, amounts.section112aGain)
			: ZERO,
	);
	if (
		compareExactMoney(
			normalRateIncome,
			exactMoneyFromWholeRupees(
				completeConstants.itr1NormalRateIncomeLimitWholeRupees,
			),
		) > 0
	) {
		return {
			kind: "unsupported",
			issues: [
				blockedIssue(
					"RULE_NEW_REGIME_ITR1_TOTAL_INCOME_LIMIT_EXCEEDED",
					"Use a return-form analysis that supports normal-rate total income above the ITR-1 limit.",
					[parseFactKey("scope.total-income")],
				),
			],
		};
	}

	const deductionNodes: ComputationNodeDraft[] = deductionCategories.map(
		(category) => {
			const comparison = deductionComparison[category];
			return {
				nodeId: deductionNodeIds[category],
				ruleId: completeConstants.deductionCompositionRuleId,
				operation: "sum-of-accepted-observations",
				inputs: [],
				unroundedValue: comparison.oldRegimeAllowed,
				roundedValue: comparison.newRegimeAllowed,
				note:
					comparison.excludedFromNewRegime === ZERO
						? `${deductionLabels[category]} remain allowed at the amount produced by the completed category computation.`
						: `${deductionLabels[category]} include ${comparison.excludedFromNewRegime} that the completed category computation excludes from the new regime.`,
			};
		},
	);
	const section112aTaxNode: ComputationNodeDraft = {
		nodeId: nodeIds.section112aTax,
		ruleId: section112aConstants.taxRuleId,
		operation: "sum-tax-components",
		inputs: [nodeInput(nodeIds.section112a, amounts.section112aGain)],
		unroundedValue: amounts.section112aTax,
		roundedValue: amounts.section112aTax,
		note:
			"Section 112A tax remains separate from the normal-rate section 87A rebate.",
	};
	const drafts: ComputationNodeDraft[] = [
		{
			nodeId: nodeIds.salary,
			ruleId: constants.standardDeductionRuleId,
			operation: "subtract-limited-to-zero",
			inputs: [
				constantInput(
					"new-regime-standard-deduction",
					constants.standardDeductionWholeRupees,
				),
			],
			unroundedValue: salaryIncome,
			roundedValue: salaryIncome,
			note: `Salary after exemptions was ${amounts.salaryAfterExemptions}.`,
		},
		{
			nodeId: nodeIds.houseProperty,
			ruleId: completeConstants.housePropertyLossSetoffRuleId,
			operation: "limit-house-property-loss",
			inputs: [],
			unroundedValue: amounts.houseProperty.amount,
			roundedValue: housePropertyIncome,
			note:
				amounts.houseProperty.kind === "loss"
					? "The completed new-regime house-property loss remains visible but cannot offset another income head."
					: "The completed positive new-regime house-property result is included in gross total income.",
		},
		{
			nodeId: nodeIds.bankInterest,
			ruleId: completeConstants.incomeAggregationRuleId,
			operation: "sum-of-accepted-observations",
			inputs: [],
			unroundedValue: amounts.bankInterest,
			roundedValue: amounts.bankInterest,
			note: "Accepted savings-account and deposit interest.",
		},
		{
			nodeId: nodeIds.otherSources,
			ruleId: completeConstants.incomeAggregationRuleId,
			operation: "sum-of-accepted-observations",
			inputs: [],
			unroundedValue: amounts.otherSources,
			roundedValue: amounts.otherSources,
			note:
				"Permitted other-source income after the new-regime family-pension deduction.",
		},
		{
			nodeId: nodeIds.section112a,
			ruleId: section112aConstants.taxRuleId,
			operation: "sum-of-accepted-observations",
			inputs: [],
			unroundedValue: amounts.section112aGain,
			roundedValue: amounts.section112aGain,
			note:
				"The supported section 112A gain is included in total income and kept outside normal slab tax.",
		},
		{
			nodeId: nodeIds.agriculturalIncome,
			ruleId: agriculturalIncomeConstants.exemptReportingRuleId,
			operation: "exclude-exempt-income",
			inputs: [],
			unroundedValue: amounts.agriculturalIncome,
			roundedValue: ZERO,
			note:
				"Agricultural income inside the ITR-1 limit is reported as exempt and excluded from taxable income.",
		},
		{
			nodeId: nodeIds.grossTotalIncome,
			ruleId: completeConstants.incomeAggregationRuleId,
			operation: "aggregate-total-income",
			inputs: [
				nodeInput(nodeIds.salary, salaryIncome),
				nodeInput(nodeIds.houseProperty, housePropertyIncome),
				nodeInput(nodeIds.bankInterest, amounts.bankInterest),
				nodeInput(nodeIds.otherSources, amounts.otherSources),
				nodeInput(nodeIds.section112a, amounts.section112aGain),
			],
			unroundedValue: grossTotalIncome,
			roundedValue: grossTotalIncome,
		},
		...deductionNodes,
		{
			nodeId: nodeIds.deductionsAllowed,
			ruleId: completeConstants.deductionCompositionRuleId,
			operation: "subtract-deductions",
			inputs: deductionCategories.map((category) =>
				nodeInput(
					deductionNodeIds[category],
					amounts.deductions[category].newRegimeAllowed,
				),
			),
			unroundedValue: sum(
				deductionCategories.map(
					(category) => amounts.deductions[category].newRegimeAllowed,
				),
			),
			roundedValue: deductionsAllowed,
			note:
				"Allowed Chapter VI-A deductions cannot reduce the separately treated section 112A gain.",
		},
		{
			nodeId: TOTAL_INCOME_ROUNDED_NODE_ID,
			ruleId: constants.totalIncomeRoundingRuleId,
			operation: "round-to-nearest-multiple",
			roundingMode: "nearest-multiple-half-up",
			inputs: [
				nodeInput(nodeIds.grossTotalIncome, grossTotalIncome),
				nodeInput(nodeIds.deductionsAllowed, deductionsAllowed),
				constantInput(
					"total-income-rounding-base",
					constants.totalIncomeRoundingBaseWholeRupees,
				),
			],
			unroundedValue: totalIncomeBeforeRounding,
			roundedValue: totalIncome,
		},
		{
			nodeId: nodeIds.normalRateIncome,
			ruleId: completeConstants.itr1NormalRateIncomeLimitRuleId,
			operation: "subtract-limited-to-zero",
			inputs: [
				nodeInput(TOTAL_INCOME_ROUNDED_NODE_ID, totalIncome),
				nodeInput(nodeIds.section112a, amounts.section112aGain),
				constantInput(
					"itr1-normal-rate-income-limit",
					completeConstants.itr1NormalRateIncomeLimitWholeRupees,
				),
			],
			unroundedValue: normalRateIncome,
			roundedValue: normalRateIncome,
		},
		section112aTaxNode,
	];
	const liability = buildNewRegimeLiabilityNodes({
		roundedIncomeValue: totalIncome,
		normalRateIncomeValue: normalRateIncome,
		normalRateIncomeNodeId: nodeIds.normalRateIncome,
		section112aIncomeValue: amounts.section112aGain,
		section112aTax: {
			nodeId: nodeIds.section112aTax,
			value: amounts.section112aTax,
		},
		constants,
		residentAnswer,
	});

	return Object.freeze({
		kind: "computed",
		rulePackRevision: rulePack.identity.revision,
		nodes: Object.freeze(
			finalizeComputationNodes(
				[...drafts, ...liability.nodes],
				rulePack.identity.revision,
			),
		),
		summary: Object.freeze({
			salaryIncome,
			housePropertyIncome,
			housePropertyLossExcluded,
			bankInterestIncome: amounts.bankInterest,
			otherSourcesIncome: amounts.otherSources,
			section112aGain: amounts.section112aGain,
			agriculturalIncome: amounts.agriculturalIncome,
			grossTotalIncome,
			deductionsAllowed,
			totalIncome,
			normalRateIncome,
			incomeTaxBeforeAdjustments:
				liability.summary.incomeTaxBeforeAdjustments,
			section112aTax: amounts.section112aTax,
			rebateApplied: liability.summary.rebateApplied,
			marginalReliefApplied: liability.summary.marginalReliefApplied,
			surcharge: liability.summary.surcharge,
			surchargeMarginalReliefApplied:
				liability.summary.surchargeMarginalReliefApplied,
			cess: liability.summary.cess,
			finalTaxLiability: liability.summary.finalTaxLiability,
		}),
		deductionComparison,
	});
};
