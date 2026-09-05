import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	parseFactKey,
	parseIssueCode,
} from "@openitr/model";
import type {
	ExactMoney,
	FactKey,
	IssueCode,
	RuleId,
	ScopeRulePack,
} from "@openitr/model";

export const AGRICULTURAL_INCOME_FACT_KEY = parseFactKey(
	"scope.agriculture-income",
);

export type AgriculturalIncomeFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney;
}>;

export type AgriculturalIncomeIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type AgriculturalIncomeTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	result: ExactMoney;
}>;

export type AgriculturalIncomeComputation =
	| Readonly<{ kind: "not-applicable" }>
	| Readonly<{
			kind: "blocked" | "unsupported";
			issue: AgriculturalIncomeIssue;
	  }>
	| Readonly<{
			kind: "computed";
			exemptIncome: ExactMoney;
			includedInTaxableIncome: ExactMoney;
			trace: readonly AgriculturalIncomeTraceNode[];
	  }>;

const issue = (
	code: string,
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): AgriculturalIncomeIssue => ({
	code: parseIssueCode(code),
	severity: "blocking",
	affectedFacts,
	recoveryAction,
});

export const computeAgriculturalIncome = ({
	rulePack,
	applicable,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	applicable: boolean;
	facts: readonly AgriculturalIncomeFact[];
}>): AgriculturalIncomeComputation => {
	if (!applicable) return { kind: "not-applicable" };

	const unsupportedFact = facts.find(
		(fact) => fact.factKey !== AGRICULTURAL_INCOME_FACT_KEY,
	);
	if (unsupportedFact !== undefined) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_AGRICULTURAL_INCOME_FACT_UNSUPPORTED",
				[unsupportedFact.factKey],
				"Remove the unsupported fact or use an analysis scope that covers it.",
			),
		};
	}

	const amounts = facts
		.filter((fact) => fact.factKey === AGRICULTURAL_INCOME_FACT_KEY)
		.map((fact) => fact.value);
	if (new Set(amounts).size > 1) {
		return {
			kind: "blocked",
			issue: issue(
				"FACT_AGRICULTURAL_INCOME_CONFLICT",
				[AGRICULTURAL_INCOME_FACT_KEY],
				"Resolve the contradictory agricultural-income amounts before continuing.",
			),
		};
	}
	const amount = amounts[0];
	if (amount === undefined) {
		return {
			kind: "blocked",
			issue: issue(
				"FACT_AGRICULTURAL_INCOME_MISSING",
				[AGRICULTURAL_INCOME_FACT_KEY],
				"Supply the agricultural-income amount from accepted evidence or the cited question. A blank or unknown amount is not zero.",
			),
		};
	}

	const constants = rulePack.taxConstants?.agriculturalIncome;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issue: issue(
				"RULE_AGRICULTURAL_INCOME_CONSTANTS_MISSING",
				[AGRICULTURAL_INCOME_FACT_KEY],
				"Load a rule-pack revision that pins the agricultural-income limit and exempt-reporting rule.",
			),
		};
	}
	const limit = exactMoneyFromWholeRupees(constants.itr1LimitWholeRupees);
	if (compareExactMoney(amount, limit) > 0) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_AGRICULTURAL_INCOME_ITR1_LIMIT_EXCEEDED",
				[AGRICULTURAL_INCOME_FACT_KEY],
				`Agricultural income exceeds the pinned ITR-1 limit of ₹${constants.itr1LimitWholeRupees}. Use a return-form analysis that supports the higher amount.`,
			),
		};
	}

	const zero = exactMoneyFromWholeRupees(0);
	return {
		kind: "computed",
		exemptIncome: amount,
		includedInTaxableIncome: zero,
		trace: Object.freeze([
			{
				label: "ITR-1 agricultural-income limit",
				ruleId: constants.itr1LimitRuleId,
				inputs: [AGRICULTURAL_INCOME_FACT_KEY],
				operation: `Confirm that agricultural income does not exceed the pinned ₹${constants.itr1LimitWholeRupees} limit`,
				result: amount,
			},
			{
				label: "Agricultural income reported as exempt",
				ruleId: constants.exemptReportingRuleId,
				inputs: [AGRICULTURAL_INCOME_FACT_KEY],
				operation:
					"Report the supported amount as exempt income and exclude it from taxable total income",
				result: zero,
			},
		]),
	};
};
