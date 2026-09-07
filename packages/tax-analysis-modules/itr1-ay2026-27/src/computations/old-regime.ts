import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	maxExactMoney,
	minExactMoney,
	multiplyByWholePercent,
	parseFactKey,
	parseIssueCode,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "@openitr/model";
import type {
	ExactMoney,
	FactKey,
	IssueCode,
	OldRegimeAgeCategory,
	ScopeRulePack,
} from "@openitr/model";

import {
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

export type OldRegimeDeductionAmounts = Readonly<{
	savingsAndPension: ExactMoney;
	healthAndDisability: ExactMoney;
	loanInterest: ExactMoney;
	donations: ExactMoney;
	remaining: ExactMoney;
}>;

export type OldRegimeAcceptedAmounts = Readonly<{
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
	deductions: OldRegimeDeductionAmounts;
}>;

export type OldRegimeComputationIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type OldRegimeComputationInput =
	| Readonly<{
		kind: "blocked";
		issues: readonly OldRegimeComputationIssue[];
	  }>
	| Readonly<{
		kind: "ready";
		ageCategory: OldRegimeAgeCategory;
		amounts: OldRegimeAcceptedAmounts;
	  }>;

export type OldRegimeSummary = Readonly<{
	salaryIncome: ExactMoney;
	housePropertyIncome: ExactMoney;
	housePropertyLoss: ExactMoney;
	bankInterestIncome: ExactMoney;
	otherSourcesIncome: ExactMoney;
	section112aGain: ExactMoney;
	agriculturalIncome: ExactMoney;
	grossTotalIncome: ExactMoney;
	deductionsClaimed: ExactMoney;
	deductionsAllowed: ExactMoney;
	totalIncome: ExactMoney;
	normalRateIncome: ExactMoney;
	incomeTaxBeforeRebate: ExactMoney;
	section112aTax: ExactMoney;
	rebateApplied: ExactMoney;
	surcharge: ExactMoney;
	surchargeMarginalRelief: ExactMoney;
	cess: ExactMoney;
	finalTaxLiability: ExactMoney;
}>;

export type OldRegimeComputation =
	| Readonly<{
		kind: "blocked" | "unsupported";
		issues: readonly OldRegimeComputationIssue[];
	  }>
	| Readonly<{
		kind: "computed";
		rulePackRevision: string;
		ageCategory: OldRegimeAgeCategory;
		nodes: readonly ComputationTraceNode[];
		summary: OldRegimeSummary;
	  }>;

const nodeIds = Object.freeze({
	salary: parseFactKey("derived.old-regime-salary-income"),
	houseProperty: parseFactKey("derived.old-regime-house-property-income"),
	bankInterest: parseFactKey("derived.old-regime-bank-interest-income"),
	otherSources: parseFactKey("derived.old-regime-other-sources-income"),
	section112a: parseFactKey("derived.old-regime-section112a-gain"),
	agriculturalIncome: parseFactKey("derived.old-regime-agricultural-income"),
	grossTotalIncome: parseFactKey("derived.old-regime-gross-total-income"),
	savingsAndPensionDeductions: parseFactKey(
		"derived.old-regime-savings-pension-deductions",
	),
	healthAndDisabilityDeductions: parseFactKey(
		"derived.old-regime-health-disability-deductions",
	),
	loanInterestDeductions: parseFactKey(
		"derived.old-regime-loan-interest-deductions",
	),
	donationDeductions: parseFactKey(
		"derived.old-regime-donation-deductions",
	),
	remainingDeductions: parseFactKey(
		"derived.old-regime-remaining-deductions",
	),
	deductionsClaimed: parseFactKey("derived.old-regime-deductions-claimed"),
	deductionsAllowed: parseFactKey("derived.old-regime-deductions-allowed"),
	normalRateIncome: parseFactKey("derived.old-regime-normal-rate-income"),
	incomeTax: parseFactKey("derived.old-regime-income-tax-before-rebate"),
	section112aTax: parseFactKey("derived.old-regime-section112a-tax"),
	rebate: parseFactKey("derived.old-regime-rebate-section-87a"),
	taxAfterRebate: parseFactKey("derived.old-regime-tax-after-rebate"),
	surcharge: parseFactKey("derived.old-regime-surcharge"),
	surchargeRelief: parseFactKey("derived.old-regime-surcharge-marginal-relief"),
	cess: parseFactKey("derived.old-regime-health-and-education-cess"),
	finalLiability: parseFactKey("derived.old-regime-total-tax-liability"),
});

const sum = (values: readonly ExactMoney[]): ExactMoney =>
	values.reduce(addExactMoney, ZERO);

const progressiveTax = (
	income: ExactMoney,
	bands: NonNullable<
		NonNullable<ScopeRulePack["taxConstants"]>["oldRegime"]
	>["slabBandsByAge"][OldRegimeAgeCategory],
): ExactMoney => {
	let tax = ZERO;
	let lower = ZERO;
	for (const band of bands) {
		if (compareExactMoney(income, lower) <= 0) break;
		const upper =
			band.upperBoundWholeRupees === null
				? undefined
				: exactMoneyFromWholeRupees(band.upperBoundWholeRupees);
		const width =
			upper === undefined || compareExactMoney(income, upper) < 0
				? subtractExactMoney(income, lower)
				: subtractExactMoney(upper, lower);
		tax = addExactMoney(tax, multiplyByWholePercent(width, band.ratePercent));
		if (upper === undefined) break;
		lower = upper;
	}
	return tax;
};

const constantsIssue = (): OldRegimeComputation => ({
	kind: "blocked",
	issues: [
		{
			code: parseIssueCode("RULE_OLD_REGIME_CONSTANTS_MISSING"),
			severity: "blocking",
			affectedFacts: [],
			recoveryAction:
				"Load a rule-pack revision that pins the complete old-regime computation.",
		},
	],
});

export const computeOldRegime = ({
	rulePack,
	input,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "identity" | "taxConstants">;
	input: OldRegimeComputationInput;
}>): OldRegimeComputation => {
	if (input.kind === "blocked") {
		return { kind: "blocked", issues: Object.freeze([...input.issues]) };
	}
	const constants = rulePack.taxConstants?.oldRegime;
	if (constants === undefined) return constantsIssue();

	const { amounts, ageCategory } = input;
	const standardDeduction = minExactMoney(
		amounts.salaryAfterExemptions,
		exactMoneyFromWholeRupees(constants.standardDeductionWholeRupees),
	);
	const salaryIncome = subtractExactMoney(
		amounts.salaryAfterExemptions,
		standardDeduction,
	);
	const housePropertyLimit = exactMoneyFromWholeRupees(
		constants.housePropertyLossSetoffLimitWholeRupees,
	);
	const housePropertyIncome =
		amounts.houseProperty.kind === "income" ? amounts.houseProperty.amount : ZERO;
	const housePropertyLoss =
		amounts.houseProperty.kind === "loss"
			? minExactMoney(amounts.houseProperty.amount, housePropertyLimit)
			: ZERO;
	const bankInterestIncome = amounts.bankInterest;
	const otherSourcesIncome = amounts.otherSources;
	const positiveOrdinaryIncome = addExactMoney(
		addExactMoney(salaryIncome, housePropertyIncome),
		addExactMoney(bankInterestIncome, otherSourcesIncome),
	);
	const ordinaryGrossIncome =
		compareExactMoney(positiveOrdinaryIncome, housePropertyLoss) >= 0
			? subtractExactMoney(positiveOrdinaryIncome, housePropertyLoss)
			: ZERO;
	const grossTotalIncome = addExactMoney(
		ordinaryGrossIncome,
		amounts.section112aGain,
	);
	const deductionsClaimed = sum(Object.values(amounts.deductions));
	const deductionsAllowed = minExactMoney(
		deductionsClaimed,
		ordinaryGrossIncome,
	);
	const normalIncomeBeforeRounding = subtractExactMoney(
		ordinaryGrossIncome,
		deductionsAllowed,
	);
	const totalIncomeBeforeRounding = addExactMoney(
		normalIncomeBeforeRounding,
		amounts.section112aGain,
	);
	const totalIncome = roundToNearestMultipleOf(
		totalIncomeBeforeRounding,
		exactMoneyFromWholeRupees(
			constants.totalIncomeRoundingBaseWholeRupees,
		),
	);
	if (
		compareExactMoney(
			totalIncome,
			exactMoneyFromWholeRupees(constants.itr1TotalIncomeLimitWholeRupees),
		) > 0
	) {
		return {
			kind: "unsupported",
			issues: [
				{
					code: parseIssueCode(
						"RULE_OLD_REGIME_ITR1_TOTAL_INCOME_LIMIT_EXCEEDED",
					),
					severity: "blocking",
					affectedFacts: [parseFactKey("scope.total-income")],
					recoveryAction:
						"Use a return-form analysis that supports total income above the ITR-1 limit.",
				},
			],
		};
	}
	const normalRateIncome = maxExactMoney(
		ZERO,
		compareExactMoney(totalIncome, amounts.section112aGain) >= 0
			? subtractExactMoney(totalIncome, amounts.section112aGain)
			: ZERO,
	);
	const incomeTaxBeforeRebate = progressiveTax(
		normalRateIncome,
		constants.slabBandsByAge[ageCategory],
	);
	const totalTaxBeforeRebate = addExactMoney(
		incomeTaxBeforeRebate,
		amounts.section112aTax,
	);
	const rebateApplied =
		compareExactMoney(
			totalIncome,
			exactMoneyFromWholeRupees(
				constants.rebateMaxTotalIncomeWholeRupees,
			),
		) <= 0
			? minExactMoney(
					incomeTaxBeforeRebate,
					exactMoneyFromWholeRupees(constants.rebateMaxAmountWholeRupees),
				)
			: ZERO;
	const taxAfterRebate = subtractExactMoney(
		totalTaxBeforeRebate,
		rebateApplied,
	);
	const surcharge = ZERO;
	const surchargeMarginalRelief = ZERO;
	const cess = multiplyByWholePercent(
		addExactMoney(taxAfterRebate, surcharge),
		constants.cessRatePercent,
	);
	const beforeFinalRounding = addExactMoney(
		addExactMoney(taxAfterRebate, surcharge),
		cess,
	);
	const finalTaxLiability = roundToNearestMultipleOf(
		beforeFinalRounding,
		exactMoneyFromWholeRupees(constants.taxRoundingBaseWholeRupees),
	);
	const deductionNode = (
		nodeId: FactKey,
		value: ExactMoney,
		label: string,
	): ComputationNodeDraft => ({
		nodeId,
		ruleId: constants.deductionLimitRuleId,
		operation: "sum-of-accepted-observations",
		inputs: [],
		unroundedValue: value,
		roundedValue: value,
		note: `${label} from its completed cited computation.`,
	});
	const deductionNodes: readonly ComputationNodeDraft[] = [
		deductionNode(
			nodeIds.savingsAndPensionDeductions,
			amounts.deductions.savingsAndPension,
			"Savings and pension deductions",
		),
		deductionNode(
			nodeIds.healthAndDisabilityDeductions,
			amounts.deductions.healthAndDisability,
			"Health and disability deductions",
		),
		deductionNode(
			nodeIds.loanInterestDeductions,
			amounts.deductions.loanInterest,
			"Loan-interest deductions",
		),
		deductionNode(
			nodeIds.donationDeductions,
			amounts.deductions.donations,
			"Donation deductions",
		),
		deductionNode(
			nodeIds.remainingDeductions,
			amounts.deductions.remaining,
			"Remaining approved deductions",
		),
	];

	const drafts: ComputationNodeDraft[] = [
		{
			nodeId: nodeIds.salary,
			ruleId: constants.standardDeductionRuleId,
			operation: "subtract-limited-to-zero",
			inputs: [
				constantInput(
					"old-regime-standard-deduction",
					constants.standardDeductionWholeRupees,
				),
			],
			unroundedValue: salaryIncome,
			roundedValue: salaryIncome,
			note: `Salary after exemptions was ${amounts.salaryAfterExemptions}.`,
		},
		{
			nodeId: nodeIds.houseProperty,
			ruleId: constants.housePropertyLossSetoffRuleId,
			operation: "limit-house-property-loss",
			inputs: [
				constantInput(
					"house-property-loss-setoff-limit",
					constants.housePropertyLossSetoffLimitWholeRupees,
				),
			],
			unroundedValue: amounts.houseProperty.amount,
			roundedValue:
				amounts.houseProperty.kind === "loss"
					? housePropertyLoss
					: housePropertyIncome,
			note: `The accepted house-property result is ${amounts.houseProperty.kind}.`,
		},
		{
			nodeId: nodeIds.bankInterest,
			ruleId: constants.incomeAggregationRuleId,
			operation: "sum-of-accepted-observations",
			inputs: [],
			unroundedValue: bankInterestIncome,
			roundedValue: bankInterestIncome,
			note: "Accepted savings-account and deposit interest.",
		},
		{
			nodeId: nodeIds.otherSources,
			ruleId: constants.incomeAggregationRuleId,
			operation: "sum-of-accepted-observations",
			inputs: [],
			unroundedValue: otherSourcesIncome,
			roundedValue: otherSourcesIncome,
			note: "Permitted other-source income after the old-regime family-pension deduction.",
		},
		{
			nodeId: nodeIds.section112a,
			ruleId: constants.section112aTaxRuleId,
			operation: "sum-of-accepted-observations",
			inputs: [],
			unroundedValue: amounts.section112aGain,
			roundedValue: amounts.section112aGain,
			note: "The supported ITR-1 section 112A gain is included in total income but taxed by its separate rule.",
		},
		{
			nodeId: nodeIds.agriculturalIncome,
			ruleId: constants.agriculturalIncomeRuleId,
			operation: "exclude-exempt-income",
			inputs: [],
			unroundedValue: amounts.agriculturalIncome,
			roundedValue: ZERO,
			note:
				"Agricultural income inside the ITR-1 limit is reported as exempt and excluded from taxable income.",
		},
		{
			nodeId: nodeIds.grossTotalIncome,
			ruleId: constants.incomeAggregationRuleId,
			operation: "aggregate-total-income",
			inputs: [
				nodeInput(nodeIds.salary, salaryIncome),
				nodeInput(
					nodeIds.houseProperty,
					amounts.houseProperty.kind === "loss"
						? housePropertyLoss
						: housePropertyIncome,
				),
				nodeInput(nodeIds.bankInterest, bankInterestIncome),
				nodeInput(nodeIds.otherSources, otherSourcesIncome),
				nodeInput(nodeIds.section112a, amounts.section112aGain),
			],
			unroundedValue: grossTotalIncome,
			roundedValue: grossTotalIncome,
			note: "Adds positive income categories and subtracts the allowed house-property loss.",
		},
		...deductionNodes,
		{
			nodeId: nodeIds.deductionsClaimed,
			ruleId: constants.deductionLimitRuleId,
			operation: "sum-of-accepted-observations",
			inputs: [
				nodeInput(
					nodeIds.savingsAndPensionDeductions,
					amounts.deductions.savingsAndPension,
				),
				nodeInput(
					nodeIds.healthAndDisabilityDeductions,
					amounts.deductions.healthAndDisability,
				),
				nodeInput(
					nodeIds.loanInterestDeductions,
					amounts.deductions.loanInterest,
				),
				nodeInput(
					nodeIds.donationDeductions,
					amounts.deductions.donations,
				),
				nodeInput(
					nodeIds.remainingDeductions,
					amounts.deductions.remaining,
				),
			],
			unroundedValue: deductionsClaimed,
			roundedValue: deductionsClaimed,
		},
		{
			nodeId: nodeIds.deductionsAllowed,
			ruleId: constants.deductionLimitRuleId,
			operation: "subtract-deductions",
			inputs: [
				nodeInput(nodeIds.deductionsClaimed, deductionsClaimed),
				nodeInput(nodeIds.grossTotalIncome, grossTotalIncome),
			],
			unroundedValue: deductionsClaimed,
			roundedValue: deductionsAllowed,
			note: "Chapter VI-A deductions cannot reduce the separately taxed section 112A gain.",
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
			ruleId: constants.slabRuleId,
			operation: "subtract-limited-to-zero",
			inputs: [
				nodeInput(TOTAL_INCOME_ROUNDED_NODE_ID, totalIncome),
				nodeInput(nodeIds.section112a, amounts.section112aGain),
			],
			unroundedValue: normalRateIncome,
			roundedValue: normalRateIncome,
		},
		{
			nodeId: nodeIds.incomeTax,
			ruleId: constants.slabRuleId,
			operation: "progressive-band-tax",
			inputs: [nodeInput(nodeIds.normalRateIncome, normalRateIncome)],
			unroundedValue: incomeTaxBeforeRebate,
			roundedValue: incomeTaxBeforeRebate,
			note: `Applied the ${ageCategory} resident schedule.`,
		},
		{
			nodeId: nodeIds.section112aTax,
			ruleId: constants.section112aTaxRuleId,
			operation: "sum-tax-components",
			inputs: [nodeInput(nodeIds.section112a, amounts.section112aGain)],
			unroundedValue: amounts.section112aTax,
			roundedValue: amounts.section112aTax,
		},
		{
			nodeId: nodeIds.rebate,
			ruleId: constants.rebateRuleId,
			operation: "rebate-minimum",
			inputs: [
				nodeInput(nodeIds.incomeTax, incomeTaxBeforeRebate),
				constantInput(
					"old-regime-rebate-income-limit",
					constants.rebateMaxTotalIncomeWholeRupees,
				),
				constantInput(
					"old-regime-rebate-amount-limit",
					constants.rebateMaxAmountWholeRupees,
				),
			],
			unroundedValue: rebateApplied,
			roundedValue: rebateApplied,
			note: "The rebate does not reduce tax charged under section 112A.",
		},
		{
			nodeId: nodeIds.taxAfterRebate,
			ruleId: constants.rebateRuleId,
			operation: "sum-tax-components",
			inputs: [
				nodeInput(nodeIds.incomeTax, incomeTaxBeforeRebate),
				nodeInput(nodeIds.section112aTax, amounts.section112aTax),
				nodeInput(nodeIds.rebate, rebateApplied),
			],
			unroundedValue: taxAfterRebate,
			roundedValue: taxAfterRebate,
			note: "Normal-rate and section 112A tax, less the allowed normal-rate rebate.",
		},
		{
			nodeId: nodeIds.surcharge,
			ruleId: constants.surchargeRuleId,
			operation: "not-applicable",
			inputs: [
				nodeInput(TOTAL_INCOME_ROUNDED_NODE_ID, totalIncome),
				constantInput(
					"old-regime-surcharge-threshold",
					constants.surchargeThresholdWholeRupees,
				),
			],
			unroundedValue: surcharge,
			roundedValue: surcharge,
			note: "The supported ITR-1 envelope does not exceed the first surcharge threshold.",
		},
		{
			nodeId: nodeIds.surchargeRelief,
			ruleId: constants.surchargeMarginalReliefRuleId,
			operation: "not-applicable",
			inputs: [nodeInput(nodeIds.surcharge, surcharge)],
			unroundedValue: surchargeMarginalRelief,
			roundedValue: surchargeMarginalRelief,
			note: "Surcharge marginal relief is not applicable when surcharge is nil.",
		},
		{
			nodeId: nodeIds.cess,
			ruleId: constants.cessRuleId,
			operation: "percent-of",
			inputs: [
				nodeInput(nodeIds.taxAfterRebate, taxAfterRebate),
				nodeInput(nodeIds.surcharge, surcharge),
				constantInput("cess-rate-percent", constants.cessRatePercent),
			],
			unroundedValue: cess,
			roundedValue: cess,
		},
		{
			nodeId: nodeIds.finalLiability,
			ruleId: constants.taxRoundingRuleId,
			operation: "round-to-nearest-multiple",
			roundingMode: "nearest-multiple-half-up",
			inputs: [
				nodeInput(nodeIds.taxAfterRebate, taxAfterRebate),
				nodeInput(nodeIds.cess, cess),
				nodeInput(nodeIds.surcharge, surcharge),
				nodeInput(nodeIds.surchargeRelief, surchargeMarginalRelief),
				constantInput(
					"tax-rounding-base",
					constants.taxRoundingBaseWholeRupees,
				),
			],
			unroundedValue: beforeFinalRounding,
			roundedValue: finalTaxLiability,
		},
	];

	return Object.freeze({
		kind: "computed",
		rulePackRevision: rulePack.identity.revision,
		ageCategory,
		nodes: Object.freeze(
			finalizeComputationNodes(drafts, rulePack.identity.revision),
		),
		summary: Object.freeze({
			salaryIncome,
			housePropertyIncome,
			housePropertyLoss,
			bankInterestIncome,
			otherSourcesIncome,
			section112aGain: amounts.section112aGain,
			agriculturalIncome: amounts.agriculturalIncome,
			grossTotalIncome,
			deductionsClaimed,
			deductionsAllowed,
			totalIncome,
			normalRateIncome,
			incomeTaxBeforeRebate,
			section112aTax: amounts.section112aTax,
			rebateApplied,
			surcharge,
			surchargeMarginalRelief,
			cess,
			finalTaxLiability,
		}),
	});
};
