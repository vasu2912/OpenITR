import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	subtractExactMoney,
} from "@openitr/model";
import type { ExactMoney, RuleId } from "@openitr/model";
import type {
	ComputationTraceNode,
	EstimatedBalance,
	FactSetRevision,
	NewRegimeComputation,
	OldRegimeComputation,
	RefundOrAmountPayableEstimate,
	Regime,
	RegimeComparison,
} from "@openitr/itr1-ay2026-27";
import type { AcceptedCanonicalFact } from "@openitr/fact-reconciliation";
import type { AttestedAnswerFact } from "@openitr/question-engine";

type ComputedOldRegime = Extract<OldRegimeComputation, { kind: "computed" }>;
type ComputedNewRegime = Extract<NewRegimeComputation, { kind: "computed" }>;

export type AnalysisAmount = Readonly<{
	id: string;
	label: string;
	amount: ExactMoney;
	traceTargetIds: readonly [string, ...string[]];
	evidenceTargetIds: readonly string[];
}>;

export type AnalysisAdjustment = Readonly<{
	id: string;
	label: string;
	affectedAmount: ExactMoney;
	explanation: string;
	ruleId: RuleId;
	rulePackRevision: string;
	traceTargetId: string;
	evidenceTargetIds: readonly string[];
}>;

export type FuturePlanningIdea = Readonly<{
	id: string;
	horizon: "future-financial-year";
	currentYearEffect: "none";
	title: string;
	condition: string;
	explanation: string;
	ruleReference:
		| Readonly<{ ruleId: RuleId; rulePackRevision: string }>
		| undefined;
}>;

export type AnalysisReport = Readonly<{
	kind: "computed";
	factSetRevision: FactSetRevision;
	regime: Regime;
	rulePackRevision: string;
	currentYear: Readonly<{
		incomeComposition: readonly AnalysisAmount[];
		deductions: readonly AnalysisAmount[];
		taxableIncome: AnalysisAmount;
		totalTaxLiability: AnalysisAmount;
		taxesPaid: AnalysisAmount;
		estimatedBalance: AnalysisAmount &
			Readonly<{ balanceKind: EstimatedBalance["kind"] }>;
		adjustments: readonly AnalysisAdjustment[];
	}>;
	futurePlanning: readonly FuturePlanningIdea[];
}>;

export type BuildAnalysisReportInput = Readonly<{
	acceptedFacts: readonly AcceptedCanonicalFact[];
	factAnswers: readonly AttestedAnswerFact[];
	estimateComputation: RefundOrAmountPayableEstimate | undefined;
	oldRegimeComputation: OldRegimeComputation | undefined;
	newRegimeComputation: NewRegimeComputation | undefined;
	regimeComparison: RegimeComparison | undefined;
	primaryRegime:
		| Readonly<{ regime: Regime; factSetRevision: FactSetRevision }>
		| undefined;
}>;

const ZERO = exactMoneyFromWholeRupees(0);

const regimeTraceTarget = (regime: Regime, nodeId: string): string =>
	`trace-${regime}-${nodeId}`;

const estimateTraceTarget = (nodeId: string): string =>
	`trace-estimate-${nodeId}`;

const evidenceTargetsFor = (
	input: BuildAnalysisReportInput,
	matches: (factKey: string) => boolean,
): readonly string[] => {
	const ids = new Set<string>();
	for (const fact of input.acceptedFacts) {
		if (!matches(String(fact.factKey))) continue;
		for (const candidate of fact.agreeingCandidates) {
			ids.add(`observation-${candidate.observationId}`);
		}
		if (fact.representativeObservationId !== undefined) {
			ids.add(`observation-${fact.representativeObservationId}`);
		}
	}
	for (const answer of input.factAnswers) {
		if (matches(String(answer.factKey))) ids.add(`answer-${answer.answerId}`);
	}
	if (input.estimateComputation?.kind === "computed") {
		for (const source of input.estimateComputation.sources) {
			if (!matches(String(source.factKey))) continue;
			for (const observationId of source.observationIds) {
				ids.add(`observation-${observationId}`);
			}
		}
	}
	return Object.freeze([...ids].sort());
};

const nodeById = (
	nodes: readonly ComputationTraceNode[],
	nodeId: string,
): ComputationTraceNode => {
	const node = nodes.find((candidate) => String(candidate.nodeId) === nodeId);
	if (node === undefined) {
		throw new Error(`Analysis trace node ${nodeId} is unavailable`);
	}
	return node;
};

const amount = ({
	id,
	label,
	value,
	traceTargetIds,
	evidenceTargetIds = [],
}: Readonly<{
	id: string;
	label: string;
	value: ExactMoney;
	traceTargetIds: readonly [string, ...string[]];
	evidenceTargetIds?: readonly string[];
}>): AnalysisAmount =>
	Object.freeze({
	id,
	label,
	amount: value,
	traceTargetIds: Object.freeze(traceTargetIds),
	evidenceTargetIds: Object.freeze([...evidenceTargetIds]),
});

const incomeCompositionOf = (
	input: BuildAnalysisReportInput,
	regime: Regime,
	computation: ComputedOldRegime | ComputedNewRegime,
): readonly AnalysisAmount[] => {
	const summary = computation.summary;
	const prefix = `derived.${regime}-regime`;
	return Object.freeze([
		amount({
			id: "salary",
			label: "Salary income after standard deduction",
			value: summary.salaryIncome,
			traceTargetIds: [regimeTraceTarget(regime, `${prefix}-salary-income`)],
			evidenceTargetIds: evidenceTargetsFor(input, (key) =>
				key.startsWith("salary."),
			),
		}),
		amount({
			id: "house-property",
			label: "House-property income",
			value: summary.housePropertyIncome,
			traceTargetIds: [
				regimeTraceTarget(regime, `${prefix}-house-property-income`),
			],
			evidenceTargetIds: evidenceTargetsFor(input, (key) =>
				key.startsWith("house-property."),
			),
		}),
		amount({
			id: "bank-interest",
			label: "Bank-interest income",
			value: summary.bankInterestIncome,
			traceTargetIds: [
				regimeTraceTarget(regime, `${prefix}-bank-interest-income`),
			],
			evidenceTargetIds: evidenceTargetsFor(input, (key) =>
				key.startsWith("bank-interest."),
			),
		}),
		amount({
			id: "other-sources",
			label: "Other-source income",
			value: summary.otherSourcesIncome,
			traceTargetIds: [
				regimeTraceTarget(regime, `${prefix}-other-sources-income`),
			],
			evidenceTargetIds: evidenceTargetsFor(input, (key) =>
				key.startsWith("non-salary-income.") ||
				key.startsWith("other-sources."),
			),
		}),
		amount({
			id: "section-112a",
			label: "Section 112A gain",
			value: summary.section112aGain,
			traceTargetIds: [
				regimeTraceTarget(regime, `${prefix}-section112a-gain`),
			],
			evidenceTargetIds: evidenceTargetsFor(input, (key) =>
				key.startsWith("capital-gains."),
			),
		}),
		amount({
			id: "agricultural-income",
			label: "Agricultural income (exempt)",
			value: summary.agriculturalIncome,
			traceTargetIds: [
				regimeTraceTarget(regime, `${prefix}-agricultural-income`),
			],
			evidenceTargetIds: evidenceTargetsFor(input, (key) =>
				key.startsWith("agricultural-income."),
			),
		}),
	]);
};

const deductionCategories = Object.freeze([
	{
		id: "savings-and-pension",
		key: "savingsAndPension",
		nodeSuffix: "savings-pension",
		label: "Savings and pension deductions",
		factKeyStems: [
			"deductions.80c",
			"deductions.80ccc",
			"deductions.80ccd1",
			"deductions.80ccd1b",
			"deductions.80ccd2",
			"deductions.savings-pension",
		],
	},
	{
		id: "health-and-disability",
		key: "healthAndDisability",
		nodeSuffix: "health-disability",
		label: "Health and disability deductions",
		factKeyStems: [
			"deductions.80d",
			"deductions.80dd",
			"deductions.80ddb",
			"deductions.80u",
		],
	},
	{
		id: "loan-interest",
		key: "loanInterest",
		nodeSuffix: "loan-interest",
		label: "Loan-interest deductions",
		factKeyStems: [
			"deductions.80e",
			"deductions.80ee",
			"deductions.80eea",
			"deductions.80eeb",
		],
	},
	{
		id: "donations",
		key: "donations",
		nodeSuffix: "donation",
		label: "Donation deductions",
		factKeyStems: ["deductions.80g"],
	},
	{
		id: "remaining",
		key: "remaining",
		nodeSuffix: "remaining",
		label: "Remaining approved deductions",
		factKeyStems: [
			"deductions.80cch",
			"deductions.80gg",
			"deductions.80gga",
			"deductions.80ggc",
			"deductions.other",
			"bank-interest.",
			"taxpayer.senior-citizen",
		],
	},
] as const);

const matchesDeductionCategory = (
	category: (typeof deductionCategories)[number],
	factKey: string,
): boolean =>
	category.factKeyStems.some(
		(stem) => factKey === stem || factKey.startsWith(`${stem}-`),
	);

const deductionsOf = (
	input: BuildAnalysisReportInput,
	regime: Regime,
	newRegime: ComputedNewRegime,
): readonly AnalysisAmount[] =>
	Object.freeze(
		deductionCategories.map((category) => {
			const comparison = newRegime.deductionComparison[category.key];
			return amount({
				id: category.id,
				label: category.label,
				value:
					regime === "old"
						? comparison.oldRegimeAllowed
						: comparison.newRegimeAllowed,
				traceTargetIds: [
					regimeTraceTarget(
						regime,
						`derived.${regime}-regime-${category.nodeSuffix}-deductions`,
					),
				],
				evidenceTargetIds: evidenceTargetsFor(input, (key) =>
					matchesDeductionCategory(category, key),
				),
			});
		}),
	);

const adjustment = ({
	id,
	label,
	affectedAmount,
	explanation,
	regime,
	node,
	evidenceTargetIds,
}: Readonly<{
	id: string;
	label: string;
	affectedAmount: ExactMoney;
	explanation: string;
	regime: Regime;
	node: ComputationTraceNode;
	evidenceTargetIds: readonly string[];
}>): AnalysisAdjustment =>
	Object.freeze({
		id,
		label,
		affectedAmount,
		explanation,
		ruleId: node.ruleId,
		rulePackRevision: node.rulePackRevision,
		traceTargetId: regimeTraceTarget(regime, String(node.nodeId)),
		evidenceTargetIds: Object.freeze([...evidenceTargetIds]),
	});

const adjustmentsOf = (
	input: BuildAnalysisReportInput,
	regime: Regime,
	oldRegime: ComputedOldRegime,
	newRegime: ComputedNewRegime,
): readonly AnalysisAdjustment[] => {
	const adjustments: AnalysisAdjustment[] = [];
	if (regime === "old") {
		if (
			compareExactMoney(
				oldRegime.summary.deductionsClaimed,
				oldRegime.summary.deductionsAllowed,
			) > 0
		) {
			const node = nodeById(
				oldRegime.nodes,
				"derived.old-regime-deductions-allowed",
			);
			adjustments.push(
				adjustment({
					id: "old-regime-deduction-limit",
					label: "Deductions limited by eligible income",
					affectedAmount: subtractExactMoney(
						oldRegime.summary.deductionsClaimed,
						oldRegime.summary.deductionsAllowed,
					),
					explanation:
						"Claimed deductions cannot reduce the separately taxed section 112A gain or exceed eligible ordinary income.",
					regime,
					node,
					evidenceTargetIds: evidenceTargetsFor(input, (key) =>
						key.startsWith("deductions."),
					),
				}),
			);
		}
	} else {
		for (const category of deductionCategories) {
			const comparison = newRegime.deductionComparison[category.key];
			if (compareExactMoney(comparison.excludedFromNewRegime, ZERO) <= 0) {
				continue;
			}
			const node = nodeById(
				newRegime.nodes,
				`derived.new-regime-${category.nodeSuffix}-deductions`,
			);
			adjustments.push(
				adjustment({
					id: `new-regime-${category.id}-excluded`,
					label: `${category.label} excluded from the new regime`,
					affectedAmount: comparison.excludedFromNewRegime,
					explanation:
						"The completed category computation allows this amount in the old-regime scenario but excludes it from the selected new-regime scenario.",
					regime,
					node,
					evidenceTargetIds: evidenceTargetsFor(input, (key) =>
						matchesDeductionCategory(category, key),
					),
				}),
			);
		}
		if (compareExactMoney(newRegime.summary.housePropertyLossExcluded, ZERO) > 0) {
			const node = nodeById(
				newRegime.nodes,
				"derived.new-regime-house-property-income",
			);
			adjustments.push(
				adjustment({
					id: "new-regime-house-property-loss-excluded",
					label: "House-property loss excluded from set-off",
					affectedAmount: newRegime.summary.housePropertyLossExcluded,
					explanation:
						"The loss remains visible but cannot offset another income head in the selected new-regime scenario.",
					regime,
					node,
					evidenceTargetIds: evidenceTargetsFor(input, (key) =>
						key.startsWith("house-property."),
					),
				}),
			);
		}
	}
	return Object.freeze(adjustments);
};

const planningIdeasOf = (
	adjustments: readonly AnalysisAdjustment[],
	balance: EstimatedBalance,
): readonly FuturePlanningIdea[] => {
	const ideas: FuturePlanningIdea[] = [
		Object.freeze({
			id: "repeat-regime-comparison",
			horizon: "future-financial-year" as const,
			currentYearEffect: "none" as const,
			title: "Repeat the regime comparison for a future year",
			condition:
				"If your income, deductions, or the applicable rules change in a future financial year",
			explanation:
				"Run a new comparison using that year's accepted facts and published rule pack. This does not change the FY 2025-26 computation.",
			ruleReference: undefined,
		}),
	];
	const firstAdjustment = adjustments[0];
	if (firstAdjustment !== undefined) {
		ideas.push(
			Object.freeze({
				id: "review-limited-items",
				horizon: "future-financial-year" as const,
				currentYearEffect: "none" as const,
				title: "Review deductions and losses under future-year rules",
				condition:
					"If similar deductions or losses recur in a future financial year",
				explanation:
					"Check their treatment against the rule pack for that year before making a regime choice. No future saving is assumed, and the current computation stays unchanged.",
				ruleReference: Object.freeze({
					ruleId: firstAdjustment.ruleId,
					rulePackRevision: firstAdjustment.rulePackRevision,
				}),
			}),
		);
	}
	if (balance.kind === "amount-payable") {
		ideas.push(
			Object.freeze({
				id: "review-future-tax-payments",
				horizon: "future-financial-year" as const,
				currentYearEffect: "none" as const,
				title: "Review future-year tax payments",
				condition:
					"If similar income and withholding recur in a future financial year",
				explanation:
					"Compare payments with an updated in-year estimate after that year's rules are published. This is a conditional review step, not a payment instruction, and it does not change FY 2025-26.",
				ruleReference: undefined,
			}),
		);
	}
	return Object.freeze(ideas);
};

export const buildAnalysisReport = (
	input: BuildAnalysisReportInput,
): AnalysisReport | undefined => {
	const { oldRegimeComputation, newRegimeComputation, regimeComparison } = input;
	if (
		oldRegimeComputation?.kind !== "computed" ||
		newRegimeComputation?.kind !== "computed" ||
		regimeComparison?.kind !== "computed" ||
		input.estimateComputation?.kind !== "computed" ||
		input.primaryRegime?.factSetRevision !== regimeComparison.factSetRevision
	) {
		return undefined;
	}
	const regime = input.primaryRegime.regime;
	const selected =
		regime === "old" ? oldRegimeComputation : newRegimeComputation;
	if (selected.factSetRevision !== regimeComparison.factSetRevision) {
		return undefined;
	}
	const balance = regimeComparison[`${regime}Regime`].estimatedBalance;
	const adjustmentItems = adjustmentsOf(
		input,
		regime,
		oldRegimeComputation,
		newRegimeComputation,
	);
	const taxesPaidEvidence = evidenceTargetsFor(
		input,
		(key) => key.startsWith("tds.") || key.startsWith("tax-payment."),
	);
	const liabilityNodeId =
		regime === "old"
			? "derived.old-regime-total-tax-liability"
			: "derived.total-tax-liability-rounded-section-288b";
	const liabilityTrace = regimeTraceTarget(regime, liabilityNodeId);
	const taxesPaidTrace = estimateTraceTarget("derived.taxes-paid-total");

	return Object.freeze({
		kind: "computed",
		factSetRevision: regimeComparison.factSetRevision,
		regime,
		rulePackRevision: selected.rulePackRevision,
		currentYear: Object.freeze({
			incomeComposition: incomeCompositionOf(input, regime, selected),
			deductions: deductionsOf(input, regime, newRegimeComputation),
			taxableIncome: amount({
				id: "taxable-income",
				label: "Taxable income",
				value: selected.summary.totalIncome,
				traceTargetIds: [
					regimeTraceTarget(
						regime,
						"derived.total-income-rounded-section-288a",
					),
				],
			}),
			totalTaxLiability: amount({
				id: "total-tax-liability",
				label: "Total tax liability",
				value: selected.summary.finalTaxLiability,
				traceTargetIds: [liabilityTrace],
			}),
			taxesPaid: amount({
				id: "taxes-paid",
				label: "Taxes paid",
				value: regimeComparison.taxesPaid,
				traceTargetIds: [taxesPaidTrace],
				evidenceTargetIds: taxesPaidEvidence,
			}),
			estimatedBalance: Object.freeze({
				...amount({
					id: "estimated-balance",
					label:
						balance.kind === "refund"
							? "Estimated refund"
							: balance.kind === "amount-payable"
								? "Estimated amount payable"
								: "Estimated balance",
					value: balance.amount,
					traceTargetIds: [liabilityTrace, taxesPaidTrace],
					evidenceTargetIds: taxesPaidEvidence,
				}),
				balanceKind: balance.kind,
			}),
			adjustments: adjustmentItems,
		}),
		futurePlanning: planningIdeasOf(adjustmentItems, balance),
	});
};
