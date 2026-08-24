import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	minExactMoney,
	multiplyByWholePercent,
	parseFactKey,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "@openitr/model";
import type {
	AttestedAnswer,
	CompiledNewRegimeTaxConstants,
	EligibilityAnswerValue,
	ExactMoney,
	FactKey,
	RuleId,
} from "@openitr/model";

const ZERO = exactMoneyFromWholeRupees(0);

// Stable operation names for trace nodes. The UI renders them as text, but
// the closed union keeps producers and readers from drifting apart.
export type ComputationOperation =
	| "sum-of-accepted-observations"
	| "subtract-exempt-allowances"
	| "subtract-limited-to-zero"
	| "round-to-nearest-multiple"
	| "aggregate-total-income"
	| "progressive-band-tax"
	| "sum-of-bands"
	| "rebate-minimum"
	| "marginal-relief-cap"
	| "not-applicable"
	| "percent-with-threshold-relief"
	| "percent-of";

export type ComputationRoundingMode = "nearest-multiple-half-up";

export type ComputationNodeInput =
	| Readonly<{
			kind: "fact";
			factKey: FactKey;
			value: ExactMoney;
	  }>
	| Readonly<{
			kind: "node";
			nodeId: FactKey;
			value: ExactMoney;
	  }>
	| Readonly<{
			kind: "rule-pack-constant";
			name: string;
			wholeRupees: number;
	  }>
	| Readonly<{
			kind: "user-answer";
			questionId: AttestedAnswer["questionId"];
			value: EligibilityAnswerValue;
	  }>;

export type ComputationTraceNode = Readonly<{
	nodeId: FactKey;
	rulePackRevision: string;
	ruleId: RuleId;
	operation: ComputationOperation;
	inputs: readonly ComputationNodeInput[];
	unroundedValue: ExactMoney;
	roundedValue: ExactMoney;
	roundingMode?: ComputationRoundingMode;
	note?: string;
}>;

export type ComputationNodeDraft = Omit<
	ComputationTraceNode,
	"rulePackRevision"
>;

export const factInput = (
	factKey: FactKey,
	value: ExactMoney,
): ComputationNodeInput => Object.freeze({ kind: "fact", factKey, value });

export const nodeInput = (
	nodeId: FactKey,
	value: ExactMoney,
): ComputationNodeInput => Object.freeze({ kind: "node", nodeId, value });

export const constantInput = (
	name: string,
	wholeRupees: number,
): ComputationNodeInput =>
	Object.freeze({ kind: "rule-pack-constant", name, wholeRupees });

const wholeRupeeConstant = (
	wholeRupees: number,
	name: string,
): { input: ComputationNodeInput; amount: ExactMoney } => ({
	input: constantInput(name, wholeRupees),
	amount: exactMoneyFromWholeRupees(wholeRupees),
});

export const finalizeComputationNodes = (
	drafts: readonly ComputationNodeDraft[],
	revision: string,
): ComputationTraceNode[] =>
	drafts.map((draft) =>
		Object.freeze({ ...draft, rulePackRevision: revision }),
	);

export const TOTAL_INCOME_ROUNDED_NODE_ID = parseFactKey(
	"derived.total-income-rounded-section-288a",
);

export type LiabilityBuilderInput = Readonly<{
	roundedIncomeValue: ExactMoney;
	constants: CompiledNewRegimeTaxConstants;
	residentAnswer: AttestedAnswer;
}>;

export type NewRegimeLiabilitySummary = Readonly<{
	incomeTaxBeforeAdjustments: ExactMoney;
	rebateApplied: ExactMoney;
	marginalReliefApplied: ExactMoney;
	surcharge: ExactMoney;
	cess: ExactMoney;
	finalTaxLiability: ExactMoney;
}>;

export type NewRegimeLiabilityBuild = Readonly<{
	nodes: readonly ComputationNodeDraft[];
	summary: NewRegimeLiabilitySummary;
}>;

// Progressive tax over the pinned schedule without emitting trace nodes; the
// surcharge marginal-relief comparison needs this for threshold incomes.
const progressiveSlabTaxOn = (
	totalIncome: ExactMoney,
	bands: CompiledNewRegimeTaxConstants["slabBands"],
): ExactMoney => {
	let tax = ZERO;
	let lowerBound = ZERO;
	for (const band of bands) {
		if (compareExactMoney(totalIncome, lowerBound) <= 0) {
			break;
		}
		const upperBound =
			band.upperBoundWholeRupees === null
				? undefined
				: exactMoneyFromWholeRupees(band.upperBoundWholeRupees);
		const bandWidth =
			upperBound === undefined || compareExactMoney(totalIncome, upperBound) < 0
				? subtractExactMoney(totalIncome, lowerBound)
				: subtractExactMoney(upperBound, lowerBound);
		tax = addExactMoney(
			tax,
			multiplyByWholePercent(bandWidth, band.ratePercent),
		);
		if (upperBound === undefined) {
			break;
		}
		lowerBound = upperBound;
	}
	return tax;
};

// The shared tail of every new-regime computation: slab bands over an already
// rounded total income, section 87A rebate and marginal relief for residents,
// surcharge with threshold relief, cess, and the section 288B rounding. Both
// the salary-only scenario and the refund-or-payable estimate emit these
// nodes from one reviewed derivation so neither can drift from the other.
export const buildNewRegimeLiabilityNodes = ({
	roundedIncomeValue,
	constants,
	residentAnswer,
}: LiabilityBuilderInput): NewRegimeLiabilityBuild => {
	const nodes: ComputationNodeDraft[] = [];
	const incomeNode = () => nodeInput(TOTAL_INCOME_ROUNDED_NODE_ID, roundedIncomeValue);

	let lowerBound = ZERO;
	let bandIndex = 1;
	const bandValues: { nodeId: FactKey; value: ExactMoney }[] = [];
	for (const band of constants.slabBands) {
		if (compareExactMoney(roundedIncomeValue, lowerBound) <= 0) {
			break;
		}
		const upperBoundWholeRupees = band.upperBoundWholeRupees;
		const upperBound =
			upperBoundWholeRupees === null
				? undefined
				: exactMoneyFromWholeRupees(upperBoundWholeRupees);
		const bandWidth =
			upperBound === undefined ||
			compareExactMoney(roundedIncomeValue, upperBound) < 0
				? subtractExactMoney(roundedIncomeValue, lowerBound)
				: subtractExactMoney(upperBound, lowerBound);
		const bandTax = multiplyByWholePercent(bandWidth, band.ratePercent);
		const bandNodeId = parseFactKey(`derived.slab-band-tax-${bandIndex}`);
		nodes.push({
			nodeId: bandNodeId,
			ruleId: constants.slabRuleId,
			operation: "progressive-band-tax",
			inputs: [
				incomeNode(),
				...(upperBoundWholeRupees === null
					? []
					: [constantInput("band-upper-bound", upperBoundWholeRupees)]),
				constantInput("band-rate-percent", band.ratePercent),
			],
			unroundedValue: bandTax,
			roundedValue: bandTax,
		});
		bandValues.push({ nodeId: bandNodeId, value: bandTax });
		if (upperBound === undefined) {
			break;
		}
		lowerBound = upperBound;
		bandIndex += 1;
	}

	const slabTaxValue = bandValues.reduce<ExactMoney>(
		(total, band) => addExactMoney(total, band.value),
		ZERO,
	);
	const slabTaxNodeId = parseFactKey("derived.income-tax-before-adjustments");
	nodes.push({
		nodeId: slabTaxNodeId,
		ruleId: constants.slabRuleId,
		operation: "sum-of-bands",
		inputs:
			bandValues.length === 0
				? [incomeNode()]
				: bandValues.map((band) => nodeInput(band.nodeId, band.value)),
		unroundedValue: slabTaxValue,
		roundedValue: slabTaxValue,
	});

	const isResident = residentAnswer.value === "yes";
	const residencyInput: ComputationNodeInput = Object.freeze({
		kind: "user-answer",
		questionId: residentAnswer.questionId,
		value: residentAnswer.value,
	});
	const rebateLimitIncome = wholeRupeeConstant(
		constants.rebateMaxTotalIncomeWholeRupees,
		"rebate-max-total-income",
	);
	const rebateLimitAmount = wholeRupeeConstant(
		constants.rebateMaxAmountWholeRupees,
		"rebate-max-amount",
	);

	const incomeWithinRebateLimit =
		compareExactMoney(roundedIncomeValue, rebateLimitIncome.amount) <= 0;

	const rebateValue =
		isResident && incomeWithinRebateLimit
			? minExactMoney(slabTaxValue, rebateLimitAmount.amount)
			: ZERO;
	const rebateNote = !isResident
		? "Not applied: section 87A restricts this rebate to resident individuals, and the recorded eligibility answer says otherwise."
		: incomeWithinRebateLimit
			? undefined
			: "Not applied: total income exceeds the rebate limit pinned by the rule pack.";
	const rebateNodeId = parseFactKey("derived.rebate-section-87a");
	nodes.push({
		nodeId: rebateNodeId,
		ruleId: constants.rebateRuleId,
		operation: "rebate-minimum",
		inputs: [
			nodeInput(slabTaxNodeId, slabTaxValue),
			rebateLimitIncome.input,
			rebateLimitAmount.input,
			residencyInput,
		],
		unroundedValue: rebateValue,
		roundedValue: rebateValue,
		...(rebateNote === undefined ? {} : { note: rebateNote }),
	});

	const exceedsRebateLimit =
		compareExactMoney(roundedIncomeValue, rebateLimitIncome.amount) > 0;
	const excessOverRebateLimit = exceedsRebateLimit
		? subtractExactMoney(roundedIncomeValue, rebateLimitIncome.amount)
		: ZERO;
	const reliefCandidate =
		compareExactMoney(slabTaxValue, excessOverRebateLimit) > 0
			? subtractExactMoney(slabTaxValue, excessOverRebateLimit)
			: ZERO;
	const marginalReliefValue =
		isResident && exceedsRebateLimit ? reliefCandidate : ZERO;
	const reliefNote = !isResident
		? "Not applied: the rebate's marginal relief inherits section 87A's residence requirement."
		: exceedsRebateLimit
			? undefined
			: "Not applied: total income is within the rebate limit, so no marginal comparison arises.";
	const marginalReliefNodeId = parseFactKey(
		"derived.marginal-relief-section-87a",
	);
	nodes.push({
		nodeId: marginalReliefNodeId,
		ruleId: constants.rebateMarginalReliefRuleId,
		operation: "marginal-relief-cap",
		inputs: [
			nodeInput(slabTaxNodeId, slabTaxValue),
			nodeInput(rebateNodeId, rebateValue),
			incomeNode(),
			rebateLimitIncome.input,
			residencyInput,
		],
		unroundedValue: marginalReliefValue,
		roundedValue: marginalReliefValue,
		...(reliefNote === undefined ? {} : { note: reliefNote }),
	});

	const taxAfterAdjustmentsValue = subtractExactMoney(
		subtractExactMoney(slabTaxValue, rebateValue),
		marginalReliefValue,
	);

	const activeTierIndex = constants.surchargeTiers.reduce<number>(
		(active, tier, index) =>
			compareExactMoney(
				roundedIncomeValue,
				exactMoneyFromWholeRupees(tier.exceedsTotalIncomeWholeRupees),
			) > 0
				? index
				: active,
		-1,
	);
	const activeTier =
		activeTierIndex === -1
			? undefined
			: constants.surchargeTiers[activeTierIndex];
	let surchargeValue = ZERO;
	let surchargeNote: string | undefined =
		"Total income does not exceed the lowest surcharge threshold pinned by the rule pack.";
	if (activeTier !== undefined) {
		const previousThreshold =
			activeTierIndex === 0
				? undefined
				: constants.surchargeTiers[activeTierIndex - 1];
		const thresholdAmount = exactMoneyFromWholeRupees(
			activeTier.exceedsTotalIncomeWholeRupees,
		);
		const taxAtThreshold = progressiveSlabTaxOn(
			thresholdAmount,
			constants.slabBands,
		);
		const surchargeAtPreviousTier =
			previousThreshold === undefined
				? ZERO
				: multiplyByWholePercent(
						taxAtThreshold,
						previousThreshold.ratePercent,
					);
		const rawSurcharge = multiplyByWholePercent(
			taxAfterAdjustmentsValue,
			activeTier.ratePercent,
		);
		const liabilityLimit = addExactMoney(
			addExactMoney(
				subtractExactMoney(roundedIncomeValue, thresholdAmount),
				taxAtThreshold,
			),
			surchargeAtPreviousTier,
		);
		const liabilityWithRaw = addExactMoney(
			taxAfterAdjustmentsValue,
			rawSurcharge,
		);
		surchargeValue =
			compareExactMoney(liabilityWithRaw, liabilityLimit) > 0
				? subtractExactMoney(liabilityLimit, taxAfterAdjustmentsValue)
				: rawSurcharge;
		surchargeNote = undefined;
	}
	const surchargeNodeId = parseFactKey("derived.surcharge");
	nodes.push({
		nodeId: surchargeNodeId,
		ruleId: constants.surchargeRuleId,
		operation:
			activeTier === undefined
				? "not-applicable"
				: "percent-with-threshold-relief",
		inputs: [
			incomeNode(),
			nodeInput(slabTaxNodeId, slabTaxValue),
			nodeInput(rebateNodeId, rebateValue),
			nodeInput(marginalReliefNodeId, marginalReliefValue),
			...(activeTier === undefined
				? []
				: [
						constantInput(
							"surcharge-tier-threshold",
							activeTier.exceedsTotalIncomeWholeRupees,
						),
						constantInput(
							"surcharge-tier-rate-percent",
							activeTier.ratePercent,
						),
					]),
		],
		unroundedValue: surchargeValue,
		roundedValue: surchargeValue,
		...(surchargeNote === undefined ? {} : { note: surchargeNote }),
	});

	const cessBase = addExactMoney(taxAfterAdjustmentsValue, surchargeValue);
	const cessValue = multiplyByWholePercent(
		cessBase,
		constants.cessRatePercent,
	);
	const cessNodeId = parseFactKey("derived.health-and-education-cess");
	nodes.push({
		nodeId: cessNodeId,
		ruleId: constants.cessRuleId,
		operation: "percent-of",
		inputs: [
			nodeInput(slabTaxNodeId, slabTaxValue),
			nodeInput(rebateNodeId, rebateValue),
			nodeInput(marginalReliefNodeId, marginalReliefValue),
			nodeInput(surchargeNodeId, surchargeValue),
			constantInput("cess-rate-percent", constants.cessRatePercent),
		],
		unroundedValue: cessValue,
		roundedValue: cessValue,
	});

	const liabilityBeforeRounding = addExactMoney(cessBase, cessValue);
	const taxRoundingBase = wholeRupeeConstant(
		constants.taxRoundingBaseWholeRupees,
		"tax-rounding-base",
	);
	const finalLiabilityValue = roundToNearestMultipleOf(
		liabilityBeforeRounding,
		taxRoundingBase.amount,
	);
	nodes.push({
		nodeId: parseFactKey("derived.total-tax-liability-rounded-section-288b"),
		ruleId: constants.taxRoundingRuleId,
		operation: "round-to-nearest-multiple",
		roundingMode: "nearest-multiple-half-up",
		inputs: [nodeInput(cessNodeId, cessValue), taxRoundingBase.input],
		unroundedValue: liabilityBeforeRounding,
		roundedValue: finalLiabilityValue,
	});

	return Object.freeze({
		nodes: Object.freeze(nodes),
		summary: Object.freeze({
			incomeTaxBeforeAdjustments: slabTaxValue,
			rebateApplied: rebateValue,
			marginalReliefApplied: marginalReliefValue,
			surcharge: surchargeValue,
			cess: cessValue,
			finalTaxLiability: finalLiabilityValue,
		}),
	});
};
