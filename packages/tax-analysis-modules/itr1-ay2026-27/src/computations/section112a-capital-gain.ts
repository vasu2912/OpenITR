import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	maxExactMoney,
	multiplyByBasisPoints,
	parseFactKey,
	parseIssueCode,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "@openitr/model";
import type {
	ExactMoney,
	FactKey,
	IssueCode,
	RuleId,
	ScopeRulePack,
} from "@openitr/model";

const FACT_KEYS = Object.freeze({
	reportedGain: parseFactKey("scope.section112a-ltcg"),
	eligibleAsset: parseFactKey("capital-gains.section112a-eligible-asset"),
	longTerm: parseFactKey("capital-gains.section112a-long-term"),
	sttConditionsMet: parseFactKey(
		"capital-gains.section112a-stt-conditions-met",
	),
	saleConsideration: parseFactKey(
		"capital-gains.section112a-sale-consideration",
	),
	costOfAcquisition: parseFactKey(
		"capital-gains.section112a-cost-of-acquisition",
	),
});

export type Section112aCapitalGainFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney | boolean;
}>;

export type Section112aCapitalGainIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type Section112aCapitalGainTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	rounding: string;
	result: string;
	roundingRuleId?: RuleId;
}>;

export type Section112aCapitalGainComputation =
	| Readonly<{ kind: "not-applicable" }>
	| Readonly<{
			kind: "blocked" | "unsupported";
			issue: Section112aCapitalGainIssue;
	  }>
	| Readonly<{
			kind: "computed";
			saleConsideration: ExactMoney;
			costOfAcquisition: ExactMoney;
			gain: ExactMoney;
			taxableGain: ExactMoney;
			tax: ExactMoney;
			trace: readonly Section112aCapitalGainTraceNode[];
	  }>;

const zero = exactMoneyFromWholeRupees(0);

const issue = (
	code: string,
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): Section112aCapitalGainIssue => ({
	code: parseIssueCode(code),
	severity: "blocking",
	affectedFacts,
	recoveryAction,
});

const blocked = (
	code: string,
	factKey: FactKey,
	label: string,
): Section112aCapitalGainComputation => ({
	kind: "blocked",
	issue: issue(
		code,
		[factKey],
		`Supply ${label} from accepted evidence or the cited question. Do not infer it from another amount.`,
	),
});

const valueOf = (
	facts: readonly Section112aCapitalGainFact[],
	factKey: FactKey,
): ExactMoney | boolean | undefined =>
	facts.find((fact) => fact.factKey === factKey)?.value;

export const computeSection112aCapitalGain = ({
	rulePack,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	facts: readonly Section112aCapitalGainFact[];
}>): Section112aCapitalGainComputation => {
	const permittedFactKeys = new Set<FactKey>(Object.values(FACT_KEYS));
	const unknownFact = facts.find(
		(fact) => !permittedFactKeys.has(fact.factKey),
	);
	if (unknownFact !== undefined) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_SECTION112A_FACT_UNSUPPORTED",
				[unknownFact.factKey],
				"Remove the unsupported capital-gain fact or use an analysis scope that covers it.",
			),
		};
	}

	const values = new Map<FactKey, ExactMoney | boolean>();
	for (const fact of facts) {
		const current = values.get(fact.factKey);
		if (current !== undefined && current !== fact.value) {
			return {
				kind: "blocked",
				issue: issue(
					"FACT_SECTION112A_CONFLICT",
					[fact.factKey],
					"Resolve the contradictory capital-gain facts before calculating the section 112A result.",
				),
			};
		}
		values.set(fact.factKey, fact.value);
	}

	const reportedGain = valueOf(facts, FACT_KEYS.reportedGain);
	if (typeof reportedGain !== "string") {
		return blocked(
			"FACT_SECTION112A_REPORTED_GAIN_MISSING",
			FACT_KEYS.reportedGain,
			"the reported section 112A gain",
		);
	}
	if (reportedGain === zero) return { kind: "not-applicable" };

	const constants = rulePack.taxConstants?.section112aCapitalGain;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issue: issue(
				"RULE_SECTION112A_CONSTANTS_MISSING",
				Object.values(FACT_KEYS),
				"Load a rule-pack revision that pins the section 112A classification, ITR-1 limit, rate, and rounding rules.",
			),
		};
	}

	const itr1Limit = exactMoneyFromWholeRupees(
		constants.itr1GainLimitWholeRupees,
	);
	if (compareExactMoney(reportedGain, itr1Limit) > 0) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_SECTION112A_ITR1_LIMIT_EXCEEDED",
				[FACT_KEYS.reportedGain],
				"Use a return-form analysis that supports section 112A gains above the ITR-1 limit.",
			),
		};
	}

	for (const [factKey, code, label, recoveryAction] of [
		[
			FACT_KEYS.eligibleAsset,
			"FACT_SECTION112A_ASSET_CLASSIFICATION_MISSING",
			"the eligible asset classification",
			"Use an analysis scope that supports the asset type reported in the capital-gain records.",
		],
		[
			FACT_KEYS.longTerm,
			"FACT_SECTION112A_HOLDING_CLASSIFICATION_MISSING",
			"the long-term classification",
			"Use an analysis scope that supports short-term gains or capital losses.",
		],
		[
			FACT_KEYS.sttConditionsMet,
			"FACT_SECTION112A_STT_CLASSIFICATION_MISSING",
			"the applicable securities transaction tax conditions",
			"Use an analysis scope that supports a gain outside section 112A.",
		],
	] as const) {
		const value = valueOf(facts, factKey);
		if (typeof value !== "boolean") return blocked(code, factKey, label);
		if (!value) {
			return {
				kind: "unsupported",
				issue: issue(
					"RULE_SECTION112A_CLASSIFICATION_UNSUPPORTED",
					[factKey],
					recoveryAction,
				),
			};
		}
	}

	const saleConsideration = valueOf(facts, FACT_KEYS.saleConsideration);
	if (typeof saleConsideration !== "string") {
		return blocked(
			"FACT_SECTION112A_SALE_CONSIDERATION_MISSING",
			FACT_KEYS.saleConsideration,
			"the total sale consideration",
		);
	}
	const costOfAcquisition = valueOf(facts, FACT_KEYS.costOfAcquisition);
	if (typeof costOfAcquisition !== "string") {
		return blocked(
			"FACT_SECTION112A_COST_OF_ACQUISITION_MISSING",
			FACT_KEYS.costOfAcquisition,
			"the total cost of acquisition",
		);
	}
	if (compareExactMoney(saleConsideration, costOfAcquisition) < 0) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_SECTION112A_CAPITAL_LOSS_UNSUPPORTED",
				[FACT_KEYS.saleConsideration, FACT_KEYS.costOfAcquisition],
				"Use a return-form analysis that supports a section 112A capital loss.",
			),
		};
	}

	const gain = subtractExactMoney(saleConsideration, costOfAcquisition);
	if (compareExactMoney(gain, reportedGain) !== 0) {
		return {
			kind: "blocked",
			issue: issue(
				"FACT_SECTION112A_GAIN_MISMATCH",
				[
					FACT_KEYS.reportedGain,
					FACT_KEYS.saleConsideration,
					FACT_KEYS.costOfAcquisition,
				],
				"Reconcile the reported gain with sale consideration less acquisition cost.",
			),
		};
	}
	const taxFreeThreshold = exactMoneyFromWholeRupees(
		constants.taxFreeThresholdWholeRupees,
	);
	const taxableGain = maxExactMoney(
		zero,
		compareExactMoney(gain, taxFreeThreshold) > 0
			? subtractExactMoney(gain, taxFreeThreshold)
			: zero,
	);
	const tax = roundToNearestMultipleOf(
		multiplyByBasisPoints(taxableGain, constants.taxRateBasisPoints),
		exactMoneyFromWholeRupees(constants.taxRoundingBaseWholeRupees),
	);

	return {
		kind: "computed",
		saleConsideration,
		costOfAcquisition,
		gain,
		taxableGain,
		tax,
		trace: [
			{
				label: "Section 112A classification",
				ruleId: constants.classificationRuleId,
				inputs: [
					FACT_KEYS.eligibleAsset,
					FACT_KEYS.longTerm,
					FACT_KEYS.sttConditionsMet,
				],
				operation:
					"Require an eligible asset, long-term classification, and applicable securities transaction tax conditions",
				rounding: "No rounding",
				result: "Supported",
			},
			{
				label: "Section 112A long-term capital gain",
				ruleId: constants.gainRuleId,
				inputs: [
					FACT_KEYS.saleConsideration,
					FACT_KEYS.costOfAcquisition,
				],
				operation: "Subtract total acquisition cost from total sale consideration",
				rounding: "No intermediate rounding",
				result: gain,
			},
			{
				label: "ITR-1 section 112A limit",
				ruleId: constants.itr1LimitRuleId,
				inputs: [FACT_KEYS.reportedGain],
				operation: `Require the gain to be at or below the pinned ITR-1 limit of ${itr1Limit}`,
				rounding: "No rounding",
				result: gain,
			},
			{
				label: "Section 112A tax component",
				ruleId: constants.taxRuleId,
				inputs: [FACT_KEYS.reportedGain],
				operation: `Apply ${constants.taxRateBasisPoints} basis points only to gain above the pinned threshold of ${taxFreeThreshold}`,
				rounding: "Round the exact tax component to the nearest whole rupee",
				result: tax,
				roundingRuleId: constants.taxRoundingRuleId,
			},
		],
	};
};
