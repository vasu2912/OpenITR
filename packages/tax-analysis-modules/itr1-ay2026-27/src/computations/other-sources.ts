import {
	addExactMoney,
	divideExactMoneyByWholeAndRound,
	exactMoneyFromWholeRupees,
	minExactMoney,
	parseFactKey,
	parseIssueCode,
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
	dividends: parseFactKey("non-salary-income.dividends"),
	otherInterest: parseFactKey("non-salary-income.interest-other-than-securities"),
	familyPension: parseFactKey("non-salary-income.family-pension"),
});

export type OtherSourceFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney;
}>;

export type OtherSourceCategory = Readonly<{
	kind: "dividends" | "other-interest" | "family-pension";
	factKey: FactKey;
	amount: ExactMoney;
}>;

export type OtherSourcesTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	result: ExactMoney;
}>;

export type OtherSourcesIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type OtherSourcesComputation =
	| Readonly<{ kind: "not-applicable" }>
	| Readonly<{ kind: "blocked" | "unsupported"; issue: OtherSourcesIssue }>
	| Readonly<{
			kind: "computed";
			categories: readonly OtherSourceCategory[];
			grossTotal: ExactMoney;
			oldRegime: Readonly<{
				familyPensionDeduction: ExactMoney;
				total: ExactMoney;
			}>;
			newRegime: Readonly<{
				familyPensionDeduction: ExactMoney;
				total: ExactMoney;
			}>;
			trace: readonly OtherSourcesTraceNode[];
	  }>;

const issue = (
	code: string,
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): OtherSourcesIssue => ({
	code: parseIssueCode(code),
	severity: "blocking",
	affectedFacts,
	recoveryAction,
});

const missing = (
	code: string,
	factKey: FactKey,
	label: string,
): OtherSourcesComputation => ({
	kind: "blocked",
	issue: issue(
		code,
		[factKey],
		`Supply ${label} from accepted evidence or the cited question. Enter zero only when the category did not apply.`,
	),
});

export const computeOtherSources = ({
	rulePack,
	applicable,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	applicable: boolean;
	facts: readonly OtherSourceFact[];
}>): OtherSourcesComputation => {
	if (!applicable) return { kind: "not-applicable" };

	const permittedFactKeys = new Set<FactKey>(Object.values(FACT_KEYS));
	const unsupportedFact = facts.find((fact) => !permittedFactKeys.has(fact.factKey));
	if (unsupportedFact !== undefined) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_OTHER_SOURCES_CATEGORY_UNSUPPORTED",
				[unsupportedFact.factKey],
				"Classify this income under a supported ITR-1 category or use an analysis scope that supports it.",
			),
		};
	}

	const factsByKey = new Map<FactKey, ExactMoney>();
	for (const fact of facts) {
		const current = factsByKey.get(fact.factKey);
		if (current !== undefined && current !== fact.value) {
			return {
				kind: "blocked",
				issue: issue(
					"FACT_OTHER_SOURCES_CONFLICT",
					[fact.factKey],
					"Resolve the contradictory category amounts before calculating income from other sources.",
				),
			};
		}
		factsByKey.set(fact.factKey, fact.value);
	}

	const dividends = factsByKey.get(FACT_KEYS.dividends);
	if (dividends === undefined) {
		return missing("FACT_OTHER_SOURCES_DIVIDENDS_MISSING", FACT_KEYS.dividends, "the gross ordinary dividend amount");
	}
	const otherInterest = factsByKey.get(FACT_KEYS.otherInterest);
	if (otherInterest === undefined) {
		return missing("FACT_OTHER_SOURCES_INTEREST_MISSING", FACT_KEYS.otherInterest, "the gross permitted other-interest amount");
	}
	const familyPension = factsByKey.get(FACT_KEYS.familyPension);
	if (familyPension === undefined) {
		return missing("FACT_OTHER_SOURCES_FAMILY_PENSION_MISSING", FACT_KEYS.familyPension, "the gross taxable family-pension amount");
	}

	const constants = rulePack.taxConstants?.otherSources;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issue: issue(
				"RULE_OTHER_SOURCES_CONSTANTS_MISSING",
				Object.values(FACT_KEYS),
				"Load a rule-pack revision that pins the complete other-source rules.",
			),
		};
	}

	const categories: readonly OtherSourceCategory[] = [
		{ kind: "dividends", factKey: FACT_KEYS.dividends, amount: dividends },
		{ kind: "other-interest", factKey: FACT_KEYS.otherInterest, amount: otherInterest },
		{ kind: "family-pension", factKey: FACT_KEYS.familyPension, amount: familyPension },
	];
	const grossTotal = categories.reduce<ExactMoney>(
		(total, category) => addExactMoney(total, category.amount),
		exactMoneyFromWholeRupees(0),
	);
	const oneThirdFamilyPension = divideExactMoneyByWholeAndRound(
		familyPension,
		constants.familyPensionDeductionDivisor,
	);
	const oldFamilyPensionDeduction = minExactMoney(
		oneThirdFamilyPension,
		exactMoneyFromWholeRupees(constants.oldRegimeFamilyPensionDeductionLimitWholeRupees),
	);
	const newFamilyPensionDeduction = minExactMoney(
		oneThirdFamilyPension,
		exactMoneyFromWholeRupees(constants.newRegimeFamilyPensionDeductionLimitWholeRupees),
	);
	return {
		kind: "computed",
		categories,
		grossTotal,
		oldRegime: {
			familyPensionDeduction: oldFamilyPensionDeduction,
			total: subtractExactMoney(grossTotal, oldFamilyPensionDeduction),
		},
		newRegime: {
			familyPensionDeduction: newFamilyPensionDeduction,
			total: subtractExactMoney(grossTotal, newFamilyPensionDeduction),
		},
		trace: [
			{ label: "Ordinary dividends", ruleId: constants.dividendRuleId, inputs: [FACT_KEYS.dividends], operation: "Include gross ordinary dividends", result: dividends },
			{ label: "Other permitted interest", ruleId: constants.interestRuleId, inputs: [FACT_KEYS.otherInterest], operation: "Include permitted interest outside savings accounts and deposits", result: otherInterest },
			{ label: "Family pension", ruleId: constants.familyPensionIncomeRuleId, inputs: [FACT_KEYS.familyPension], operation: "Include gross taxable family pension", result: familyPension },
			{ label: "Old-regime family-pension deduction", ruleId: constants.oldRegimeFamilyPensionDeductionRuleId, inputs: [FACT_KEYS.familyPension], operation: `Divide by the pinned statutory divisor ${constants.familyPensionDeductionDivisor}, round to whole rupees, and apply the pinned old-regime limit`, result: oldFamilyPensionDeduction },
			{ label: "New-regime family-pension deduction", ruleId: constants.newRegimeFamilyPensionDeductionRuleId, inputs: [FACT_KEYS.familyPension], operation: `Divide by the pinned statutory divisor ${constants.familyPensionDeductionDivisor}, round to whole rupees, and apply the pinned new-regime limit`, result: newFamilyPensionDeduction },
			{ label: "Gross income from other sources", ruleId: constants.totalRuleId, inputs: Object.values(FACT_KEYS), operation: "Add each permitted category before the family-pension deduction", result: grossTotal },
		],
	};
};
