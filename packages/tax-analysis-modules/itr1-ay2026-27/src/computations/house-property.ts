import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	maxExactMoney,
	minExactMoney,
	multiplyByWholePercent,
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

export type HousePropertyNumber = 1 | 2;

type BooleanFactName =
	| "owned-by-taxpayer"
	| "self-occupied-throughout-year"
	| "vacancy-reduced-rent"
	| "loan-for-acquisition-or-construction"
	| "loan-on-or-after-1999-04-01"
	| "completed-within-five-years"
	| "interest-certificate-available";

type MoneyFactName =
	| "expected-rent"
	| "actual-rent"
	| "municipal-taxes-paid"
	| "interest-on-borrowed-capital";

export type HousePropertyFact =
	| Readonly<{
			propertyNumber: HousePropertyNumber;
			factKey: FactKey;
			value: boolean;
	  }>
	| Readonly<{
			propertyNumber: HousePropertyNumber;
			factKey: FactKey;
			value: ExactMoney;
	  }>;

export type SignedHousePropertyAmount =
	| Readonly<{ kind: "income"; amount: ExactMoney }>
	| Readonly<{ kind: "loss"; amount: ExactMoney }>;

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

export type ComputedHouseProperty = Readonly<{
	propertyNumber: HousePropertyNumber;
	occupancy: "self-occupied" | "let-out";
	grossAnnualValue?: ExactMoney;
	annualValue: ExactMoney;
	standardDeduction: ExactMoney;
	interestDeduction: ExactMoney;
	income: SignedHousePropertyAmount;
	newRegimeInterestDeduction: ExactMoney;
	newRegimeIncome: SignedHousePropertyAmount;
	trace: readonly HousePropertyTraceNode[];
	newRegimeTrace: readonly HousePropertyTraceNode[];
}>;

export type HousePropertyComputation =
	| Readonly<{ kind: "not-applicable" }>
	| Readonly<{ kind: "blocked" | "unsupported"; issue: HousePropertyComputationIssue }>
	| Readonly<{
			kind: "computed";
			properties: readonly ComputedHouseProperty[];
			combined: SignedHousePropertyAmount;
			newRegimeCombined: SignedHousePropertyAmount;
	  }>;

const zero = exactMoneyFromWholeRupees(0);

const factKey = (
	propertyNumber: HousePropertyNumber,
	name: BooleanFactName | MoneyFactName,
): FactKey => parseFactKey(`house-property.${propertyNumber}.${name}`);

const issue = (
	code: string,
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): HousePropertyComputationIssue => ({
	code: parseIssueCode(code),
	severity: "blocking",
	affectedFacts,
	recoveryAction,
});

const blocked = (
	code: string,
	affectedFact: FactKey,
	label: string,
): HousePropertyComputation => ({
	kind: "blocked",
	issue: issue(
		code,
		[affectedFact],
		`Answer the cited ${label} question without assuming a value.`,
	),
});

const valueOf = (
	facts: readonly HousePropertyFact[],
	key: FactKey,
): boolean | ExactMoney | undefined =>
	facts.find((candidate) => candidate.factKey === key)?.value;

const signedDifference = (
	positive: ExactMoney,
	negative: ExactMoney,
): SignedHousePropertyAmount =>
	compareExactMoney(positive, negative) >= 0
		? { kind: "income", amount: subtractExactMoney(positive, negative) }
		: { kind: "loss", amount: subtractExactMoney(negative, positive) };

const addSigned = (
	left: SignedHousePropertyAmount,
	right: SignedHousePropertyAmount,
): SignedHousePropertyAmount => {
	if (left.kind === right.kind) {
		return { kind: left.kind, amount: addExactMoney(left.amount, right.amount) };
	}
	return left.kind === "income"
		? signedDifference(left.amount, right.amount)
		: signedDifference(right.amount, left.amount);
};

const sumSigned = (
	amounts: readonly SignedHousePropertyAmount[],
): SignedHousePropertyAmount =>
	amounts.reduce<SignedHousePropertyAmount>(
		(total, amount) => addSigned(total, amount),
		{ kind: "income", amount: zero },
	);

type PreparedSelfOccupied = Readonly<{
	kind: "self-occupied";
	propertyNumber: HousePropertyNumber;
	interest: ExactMoney;
	enhancedLimitApplies: boolean;
	inputs: readonly FactKey[];
}>;

type PreparedLetOut = Readonly<{
	kind: "let-out";
	propertyNumber: HousePropertyNumber;
	expectedRent: ExactMoney;
	actualRent: ExactMoney;
	vacancyReducedRent: boolean;
	municipalTaxesPaid: ExactMoney;
	interest: ExactMoney;
	inputs: Readonly<{
		expectedRent: FactKey;
		actualRent: FactKey;
		vacancyReducedRent: FactKey;
		municipalTaxesPaid: FactKey;
		interest: FactKey;
	}>;
}>;

type PreparedProperty = PreparedSelfOccupied | PreparedLetOut;

const prepareProperty = ({
	propertyNumber,
	facts,
}: Readonly<{
	propertyNumber: HousePropertyNumber;
	facts: readonly HousePropertyFact[];
}>): PreparedProperty | HousePropertyComputation => {
	const ownedKey = factKey(propertyNumber, "owned-by-taxpayer");
	const owned = valueOf(facts, ownedKey);
	if (typeof owned !== "boolean") {
		return blocked("FACT_HOUSE_PROPERTY_OWNERSHIP_MISSING", ownedKey, `ownership for property ${propertyNumber}`);
	}
	if (!owned) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_HOUSE_PROPERTY_NOT_OWNED",
				[ownedKey],
				`Exclude property ${propertyNumber}, or review the taxpayer's ownership share.`,
			),
		};
	}

	const occupancyKey = factKey(propertyNumber, "self-occupied-throughout-year");
	const selfOccupied = valueOf(facts, occupancyKey);
	if (typeof selfOccupied !== "boolean") {
		return blocked("FACT_HOUSE_PROPERTY_OCCUPANCY_MISSING", occupancyKey, `occupancy for property ${propertyNumber}`);
	}
	const interestKey = factKey(propertyNumber, "interest-on-borrowed-capital");
	if (!selfOccupied) {
		const expectedRentKey = factKey(propertyNumber, "expected-rent");
		const actualRentKey = factKey(propertyNumber, "actual-rent");
		const vacancyKey = factKey(propertyNumber, "vacancy-reduced-rent");
		const municipalTaxesKey = factKey(propertyNumber, "municipal-taxes-paid");
		const expectedRent = valueOf(facts, expectedRentKey);
		const actualRent = valueOf(facts, actualRentKey);
		const vacancyReducedRent = valueOf(facts, vacancyKey);
		const municipalTaxesPaid = valueOf(facts, municipalTaxesKey);
		const interest = valueOf(facts, interestKey);
		if (typeof expectedRent !== "string") return blocked("FACT_HOUSE_PROPERTY_EXPECTED_RENT_MISSING", expectedRentKey, `expected rent for property ${propertyNumber}`);
		if (typeof actualRent !== "string") return blocked("FACT_HOUSE_PROPERTY_ACTUAL_RENT_MISSING", actualRentKey, `actual rent for property ${propertyNumber}`);
		if (typeof vacancyReducedRent !== "boolean") return blocked("FACT_HOUSE_PROPERTY_VACANCY_MISSING", vacancyKey, `vacancy effect for property ${propertyNumber}`);
		if (typeof municipalTaxesPaid !== "string") return blocked("FACT_HOUSE_PROPERTY_MUNICIPAL_TAX_MISSING", municipalTaxesKey, `owner-paid municipal taxes for property ${propertyNumber}`);
		if (typeof interest !== "string") return blocked("FACT_HOUSE_PROPERTY_INTEREST_MISSING", interestKey, `borrowed-capital interest for property ${propertyNumber}`);
		return {
			kind: "let-out",
			propertyNumber,
			expectedRent,
			actualRent,
			vacancyReducedRent,
			municipalTaxesPaid,
			interest,
			inputs: {
				expectedRent: expectedRentKey,
				actualRent: actualRentKey,
				vacancyReducedRent: vacancyKey,
				municipalTaxesPaid: municipalTaxesKey,
				interest: interestKey,
			},
		};
	}
	const interest = valueOf(facts, interestKey);
	if (typeof interest !== "string") {
		return blocked("FACT_HOUSE_PROPERTY_INTEREST_MISSING", interestKey, `borrowed-capital interest for property ${propertyNumber}`);
	}

	const conditionNames = [
		"loan-for-acquisition-or-construction",
		"loan-on-or-after-1999-04-01",
		"completed-within-five-years",
		"interest-certificate-available",
	] as const;
	const inputs = [ownedKey, occupancyKey, interestKey, ...conditionNames.map((name) => factKey(propertyNumber, name))];
	let enhancedLimitApplies = interest === zero;
	if (interest !== zero) {
		enhancedLimitApplies = true;
		for (const name of conditionNames) {
			const key = factKey(propertyNumber, name);
			const value = valueOf(facts, key);
			if (typeof value !== "boolean") return blocked("FACT_HOUSE_PROPERTY_INTEREST_CONDITION_MISSING", key, `section 24(b) eligibility for property ${propertyNumber}`);
			if (!value) {
				enhancedLimitApplies = false;
				break;
			}
		}
	}
	return { kind: "self-occupied", propertyNumber, interest, enhancedLimitApplies, inputs };
};

export const computeHouseProperties = ({
	rulePack,
	propertyCount,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	propertyCount: number;
	facts: readonly HousePropertyFact[];
}>): HousePropertyComputation => {
	if (propertyCount === 0) return { kind: "not-applicable" };
	if (!Number.isSafeInteger(propertyCount) || propertyCount < 0 || propertyCount > 2) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_HOUSE_PROPERTY_COUNT_OUTSIDE_ITR1",
				[parseFactKey("scope.house-property-count")],
				"Use an analysis scope that supports this property count.",
			),
		};
	}
	for (const propertyFact of facts) {
		if (!propertyFact.factKey.startsWith(`house-property.${propertyFact.propertyNumber}.`)) {
			return {
				kind: "blocked",
				issue: issue("FACT_HOUSE_PROPERTY_IDENTITY_CONFLICT", [propertyFact.factKey], "Review the property identity attached to this fact."),
			};
		}
	}
	for (const key of new Set(facts.map((propertyFact) => propertyFact.factKey))) {
		const values = new Set(facts.filter((propertyFact) => propertyFact.factKey === key).map((propertyFact) => propertyFact.value));
		if (values.size > 1) {
			return {
				kind: "blocked",
				issue: issue("FACT_HOUSE_PROPERTY_CONFLICT", [key], "Resolve the contradictory property facts before calculating the result."),
			};
		}
	}
	const constants = rulePack.taxConstants?.houseProperty;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issue: issue("RULE_HOUSE_PROPERTY_CONSTANTS_MISSING", [parseFactKey("scope.house-property-count")], "Load a rule-pack revision that pins the complete house-property rules."),
		};
	}

	const prepared: PreparedProperty[] = [];
	for (let propertyNumber = 1; propertyNumber <= propertyCount; propertyNumber += 1) {
		const current = prepareProperty({ propertyNumber: propertyNumber === 1 ? 1 : 2, facts });
		if ("issue" in current || current.kind === "not-applicable" || current.kind === "computed") return current;
		prepared.push(current);
	}

	let sharedSelfOccupiedRemaining = exactMoneyFromWholeRupees(constants.selfOccupiedEnhancedInterestLimitWholeRupees);
	let basicRemaining = exactMoneyFromWholeRupees(constants.selfOccupiedBasicInterestLimitWholeRupees);
	const properties: ComputedHouseProperty[] = [];
	for (const property of prepared) {
		if (property.kind === "let-out") {
			const grossAnnualValue = property.vacancyReducedRent
				? property.actualRent
				: maxExactMoney(property.expectedRent, property.actualRent);
			if (compareExactMoney(property.municipalTaxesPaid, grossAnnualValue) > 0) {
				return {
					kind: "blocked",
					issue: issue("FACT_HOUSE_PROPERTY_MUNICIPAL_TAX_EXCEEDS_RENT", [property.inputs.municipalTaxesPaid, property.inputs.actualRent], `Review rent and municipal taxes for property ${property.propertyNumber}.`),
				};
			}
			const annualValue = subtractExactMoney(grossAnnualValue, property.municipalTaxesPaid);
			const standardDeduction = multiplyByWholePercent(annualValue, constants.letOutStandardDeductionPercent);
			const income = signedDifference(subtractExactMoney(annualValue, standardDeduction), property.interest);
			const trace: readonly HousePropertyTraceNode[] = [
				{ label: `Property ${property.propertyNumber} gross annual value`, ruleId: constants.letOutGrossAnnualValueRuleId, inputs: [property.inputs.expectedRent, property.inputs.actualRent, property.inputs.vacancyReducedRent], operation: property.vacancyReducedRent ? "Use actual rent because vacancy reduced it below expected rent" : "Use the higher of expected rent and actual rent", result: grossAnnualValue },
				{ label: `Property ${property.propertyNumber} annual value`, ruleId: constants.letOutMunicipalTaxRuleId, inputs: [property.inputs.municipalTaxesPaid], operation: "Subtract municipal taxes borne and paid by the owner", result: annualValue },
				{ label: `Property ${property.propertyNumber} standard deduction`, ruleId: constants.letOutStandardDeductionRuleId, inputs: [property.inputs.expectedRent, property.inputs.actualRent, property.inputs.municipalTaxesPaid], operation: `Apply ${constants.letOutStandardDeductionPercent}% to annual value`, result: standardDeduction },
				{ label: `Property ${property.propertyNumber} borrowed-capital interest`, ruleId: constants.letOutInterestRuleId, inputs: [property.inputs.interest], operation: "Deduct interest payable on borrowed capital for the let-out property", result: property.interest },
			];
			properties.push({ propertyNumber: property.propertyNumber, occupancy: "let-out", grossAnnualValue, annualValue, standardDeduction, interestDeduction: property.interest, income, newRegimeInterestDeduction: property.interest, newRegimeIncome: income, trace, newRegimeTrace: trace });
			continue;
		}
		const available = property.enhancedLimitApplies
			? sharedSelfOccupiedRemaining
			: minExactMoney(sharedSelfOccupiedRemaining, basicRemaining);
		const interestDeduction = minExactMoney(property.interest, available);
		sharedSelfOccupiedRemaining = subtractExactMoney(sharedSelfOccupiedRemaining, interestDeduction);
		if (!property.enhancedLimitApplies) basicRemaining = subtractExactMoney(basicRemaining, interestDeduction);
		const annualValueNode: HousePropertyTraceNode = {
			label: `Property ${property.propertyNumber} self-occupied annual value`,
			ruleId: constants.selfOccupiedAnnualValueRuleId,
			inputs: property.inputs.slice(0, 2),
			operation: "Set annual value to nil for the self-occupied property",
			result: zero,
		};
		properties.push({
			propertyNumber: property.propertyNumber,
			occupancy: "self-occupied",
			annualValue: zero,
			standardDeduction: zero,
			interestDeduction,
			income: interestDeduction === zero ? { kind: "income", amount: zero } : { kind: "loss", amount: interestDeduction },
			newRegimeInterestDeduction: zero,
			newRegimeIncome: { kind: "income", amount: zero },
			trace: [annualValueNode, { label: `Property ${property.propertyNumber} old-regime interest deduction`, ruleId: constants.selfOccupiedOldRegimeInterestRuleId, inputs: property.inputs.slice(2), operation: `Apply the remaining shared ₹${available} self-occupied interest limit`, result: interestDeduction }],
			newRegimeTrace: [annualValueNode, { label: `Property ${property.propertyNumber} new-regime interest deduction`, ruleId: constants.selfOccupiedNewRegimeInterestRuleId, inputs: [factKey(property.propertyNumber, "interest-on-borrowed-capital")], operation: "Disallow section 24(b) interest for a self-occupied property", result: zero }],
		});
	}
	return {
		kind: "computed",
		properties,
		combined: sumSigned(properties.map((property) => property.income)),
		newRegimeCombined: sumSigned(properties.map((property) => property.newRegimeIncome)),
	};
};
