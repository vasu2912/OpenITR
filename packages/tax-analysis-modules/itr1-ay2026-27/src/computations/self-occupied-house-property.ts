import {
	exactMoneyFromWholeRupees,
	minExactMoney,
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

const FACT_KEYS = Object.freeze({
	ownedByTaxpayer: parseFactKey(
		"house-property.self-occupied.owned-by-taxpayer",
	),
	usedThroughoutYear: parseFactKey(
		"house-property.self-occupied.used-throughout-year",
	),
	interest: parseFactKey(
		"house-property.self-occupied.interest-on-borrowed-capital",
	),
	acquisitionOrConstruction: parseFactKey(
		"house-property.self-occupied.loan-for-acquisition-or-construction",
	),
	borrowedAfter1999: parseFactKey(
		"house-property.self-occupied.loan-on-or-after-1999-04-01",
	),
	completedWithinFiveYears: parseFactKey(
		"house-property.self-occupied.completed-within-five-years",
	),
	interestCertificate: parseFactKey(
		"house-property.self-occupied.interest-certificate-available",
	),
});

export const SELF_OCCUPIED_HOUSE_PROPERTY_FACT_KEYS = FACT_KEYS;

export type SelfOccupiedHousePropertyFact =
	| Readonly<{
			factKey:
				| typeof FACT_KEYS.ownedByTaxpayer
				| typeof FACT_KEYS.usedThroughoutYear
				| typeof FACT_KEYS.acquisitionOrConstruction
				| typeof FACT_KEYS.borrowedAfter1999
				| typeof FACT_KEYS.completedWithinFiveYears
				| typeof FACT_KEYS.interestCertificate;
			value: boolean;
	  }>
	| Readonly<{ factKey: typeof FACT_KEYS.interest; value: ExactMoney }>;

export type HousePropertyComputationIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type HousePropertyTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	result: string;
}>;

type RegimePropertyResult = Readonly<{
	annualValue: ExactMoney;
	interestDeduction: ExactMoney;
	taxableIncomeEffect: string;
	limitApplied?: ExactMoney;
	trace: readonly HousePropertyTraceNode[];
}>;

export type SelfOccupiedHousePropertyComputation =
	| Readonly<{ kind: "not-applicable" }>
	| Readonly<{ kind: "blocked"; issue: HousePropertyComputationIssue }>
	| Readonly<{ kind: "unsupported"; issue: HousePropertyComputationIssue }>
	| Readonly<{
			kind: "computed";
			oldRegime: RegimePropertyResult;
			newRegime: RegimePropertyResult;
	  }>;

const issue = (
	code: string,
	factKey: FactKey,
	recoveryAction: string,
): HousePropertyComputationIssue => ({
	code: parseIssueCode(code),
	severity: "blocking",
	affectedFacts: [factKey],
	recoveryAction,
});

const valueOf = (
	facts: readonly SelfOccupiedHousePropertyFact[],
	factKey: FactKey,
): SelfOccupiedHousePropertyFact["value"] | undefined =>
	facts.find((fact) => fact.factKey === factKey)?.value;

const missing = (
	code: string,
	factKey: FactKey,
	label: string,
): SelfOccupiedHousePropertyComputation => ({
	kind: "blocked",
	issue: issue(
		code,
		factKey,
		`Answer the cited ${label} question without assuming a value.`,
	),
});

export const computeSelfOccupiedHouseProperty = ({
	rulePack,
	propertyCount,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	propertyCount: number;
	facts: readonly SelfOccupiedHousePropertyFact[];
}>): SelfOccupiedHousePropertyComputation => {
	if (propertyCount === 0) return { kind: "not-applicable" };
	if (propertyCount !== 1) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_HOUSE_PROPERTY_SINGLE_PROPERTY_REQUIRED",
				parseFactKey("scope.house-property-count"),
				"Complete the second-property analysis before using a combined house-property result.",
			),
		};
	}
	for (const factKey of Object.values(FACT_KEYS)) {
		const values = new Set(
			facts
				.filter((fact) => fact.factKey === factKey)
				.map((fact) => fact.value),
		);
		if (values.size > 1) {
			return {
				kind: "blocked",
				issue: issue(
					"FACT_HOUSE_PROPERTY_CONFLICT",
					factKey,
					"Resolve the contradictory house-property facts before calculating either regime.",
				),
			};
		}
	}

	const constants = rulePack.taxConstants?.selfOccupiedHouseProperty;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issue: issue(
				"RULE_HOUSE_PROPERTY_CONSTANTS_MISSING",
				FACT_KEYS.interest,
				"Load a rule-pack revision that pins the self-occupied house-property rules.",
			),
		};
	}

	const owned = valueOf(facts, FACT_KEYS.ownedByTaxpayer);
	if (owned === undefined) {
		return missing(
			"FACT_HOUSE_PROPERTY_OWNERSHIP_MISSING",
			FACT_KEYS.ownedByTaxpayer,
			"property ownership",
		);
	}
	if (owned !== true) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_HOUSE_PROPERTY_NOT_OWNED",
				FACT_KEYS.ownedByTaxpayer,
				"Exclude this property or review the correct taxpayer ownership share.",
			),
		};
	}

	const selfOccupied = valueOf(facts, FACT_KEYS.usedThroughoutYear);
	if (selfOccupied === undefined) {
		return missing(
			"FACT_HOUSE_PROPERTY_OCCUPANCY_MISSING",
			FACT_KEYS.usedThroughoutYear,
			"property occupancy",
		);
	}
	if (selfOccupied !== true) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_HOUSE_PROPERTY_NOT_SELF_OCCUPIED",
				FACT_KEYS.usedThroughoutYear,
				"Use the let-out property analysis when the property was let for any part of the year.",
			),
		};
	}

	const interest = valueOf(facts, FACT_KEYS.interest);
	if (typeof interest !== "string") {
		return missing(
			"FACT_HOUSE_PROPERTY_INTEREST_MISSING",
			FACT_KEYS.interest,
			"borrowed-capital interest",
		);
	}

	const zero = exactMoneyFromWholeRupees(0);
	let enhancedLimitApplies = interest === zero;
	const conditionKeys = [
		FACT_KEYS.acquisitionOrConstruction,
		FACT_KEYS.borrowedAfter1999,
		FACT_KEYS.completedWithinFiveYears,
		FACT_KEYS.interestCertificate,
	] as const;
	const conditionCodes = [
		"FACT_HOUSE_PROPERTY_LOAN_PURPOSE_MISSING",
		"FACT_HOUSE_PROPERTY_LOAN_DATE_MISSING",
		"FACT_HOUSE_PROPERTY_COMPLETION_PERIOD_MISSING",
		"FACT_HOUSE_PROPERTY_INTEREST_CERTIFICATE_MISSING",
	] as const;
	if (interest !== zero) {
		enhancedLimitApplies = true;
		for (const [index, factKey] of conditionKeys.entries()) {
			const condition = valueOf(facts, factKey);
			if (condition === undefined) {
				return missing(
					conditionCodes[index] ?? "FACT_HOUSE_PROPERTY_CONDITION_MISSING",
					factKey,
					"section 24(b) eligibility",
				);
			}
			if (condition !== true) {
				enhancedLimitApplies = false;
				break;
			}
		}
	}

	const limit = exactMoneyFromWholeRupees(
		enhancedLimitApplies
			? constants.enhancedInterestLimitWholeRupees
			: constants.basicInterestLimitWholeRupees,
	);
	const oldDeduction = minExactMoney(interest, limit);
	const annualValueNode: HousePropertyTraceNode = {
		label: "Self-occupied annual value",
		ruleId: constants.annualValueRuleId,
		inputs: [FACT_KEYS.ownedByTaxpayer, FACT_KEYS.usedThroughoutYear],
		operation: "Set annual value to nil for the self-occupied property",
		result: zero,
	};
	return {
		kind: "computed",
		oldRegime: {
			annualValue: zero,
			interestDeduction: oldDeduction,
			taxableIncomeEffect: oldDeduction === zero ? zero : `-${oldDeduction}`,
			limitApplied: limit,
			trace: [
				annualValueNode,
				{
					label: "Old-regime interest deduction",
					ruleId: constants.oldRegimeInterestRuleId,
					inputs: [FACT_KEYS.interest, ...conditionKeys],
					operation: `Use the lower of eligible interest and the ₹${limit} limit`,
					result: oldDeduction,
				},
			],
		},
		newRegime: {
			annualValue: zero,
			interestDeduction: zero,
			taxableIncomeEffect: zero,
			trace: [
				annualValueNode,
				{
					label: "New-regime interest deduction",
					ruleId: constants.newRegimeInterestRuleId,
					inputs: [FACT_KEYS.interest],
					operation: "Disallow section 24(b) interest for self-occupied property",
					result: zero,
				},
			],
		},
	};
};
