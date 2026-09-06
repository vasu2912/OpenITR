import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	minExactMoney,
	multiplyByBasisPoints,
	multiplyByWholePercent,
	parseFactKey,
	parseIssueCode,
	subtractExactMoney,
} from "@openitr/model";
import type { ExactMoney, FactKey, IssueCode, RuleId, ScopeRulePack } from "@openitr/model";

const FACT_KEYS = Object.freeze({
	savingsInterest: parseFactKey("bank-interest.savings-account"),
	depositInterest: parseFactKey("bank-interest.deposits"),
	seniorCitizen: parseFactKey("taxpayer.senior-citizen"),
	section80cchPresent: parseFactKey("deductions.80cch-present"),
	section80cchEligible: parseFactKey("deductions.80cch-agniveer-eligible"),
	section80cchAgeEligible: parseFactKey("deductions.80cch-joining-age-eligible"),
	section80cchCentralGovernmentEmployee: parseFactKey("deductions.80cch-central-government-employee"),
	section80cchTaxpayerContribution: parseFactKey("deductions.80cch-taxpayer-contribution"),
	section80cchGovernmentContribution: parseFactKey("deductions.80cch-government-contribution"),
	section80cchSalary: parseFactKey("deductions.80cch-salary-section-17-1"),
	section80cchDetailsAvailable: parseFactKey("deductions.80cch-details-available"),
	section80ggPresent: parseFactKey("deductions.80gg-present"),
	section80ggRentPaid: parseFactKey("deductions.80gg-rent-paid"),
	section80ggAdjustedTotalIncome: parseFactKey("deductions.80gg-adjusted-total-income"),
	section80ggHraReceived: parseFactKey("deductions.80gg-hra-received"),
	section80ggDisqualifyingProperty: parseFactKey("deductions.80gg-disqualifying-property"),
	section80ggForm10baDetails: parseFactKey("deductions.80gg-form-10ba-details"),
	section80ggaPresent: parseFactKey("deductions.80gga-present"),
	section80ggaAmount: parseFactKey("deductions.80gga-amount"),
	section80ggaEligiblePurpose: parseFactKey("deductions.80gga-eligible-purpose"),
	section80ggaBusinessIncome: parseFactKey("deductions.80gga-business-income"),
	section80ggaCashPayment: parseFactKey("deductions.80gga-cash-payment"),
	section80ggaDetailsAvailable: parseFactKey("deductions.80gga-details-available"),
	section80ggcPresent: parseFactKey("deductions.80ggc-present"),
	section80ggcAmount: parseFactKey("deductions.80ggc-amount"),
	section80ggcEligibleRecipient: parseFactKey("deductions.80ggc-eligible-recipient"),
	section80ggcCashPayment: parseFactKey("deductions.80ggc-cash-payment"),
	section80ggcDateWithinYear: parseFactKey("deductions.80ggc-date-within-financial-year"),
	section80ggcGrossTotalIncome: parseFactKey("deductions.80ggc-gross-total-income"),
	section80ggcDetailsAvailable: parseFactKey("deductions.80ggc-details-available"),
	otherDeductionPresent: parseFactKey("deductions.other-present"),
});

export const REMAINING_DEDUCTION_FACT_KEYS = FACT_KEYS;

export const APPROVED_ITR1_DEDUCTION_CATALOG = Object.freeze([
	["80C", "implemented-by-savings-pension"], ["80CCC", "implemented-by-savings-pension"],
	["80CCD(1)", "implemented-by-savings-pension"], ["80CCD(1B)", "implemented-by-savings-pension"],
	["80CCD(2)", "implemented-by-savings-pension"], ["80CCH", "implemented-here"],
	["80D", "implemented-by-health-disability"], ["80DD", "implemented-by-health-disability"],
	["80DDB", "implemented-by-health-disability"], ["80E", "implemented-by-loan-interest"],
	["80EE", "implemented-by-loan-interest"], ["80EEA", "implemented-by-loan-interest"],
	["80EEB", "implemented-by-loan-interest"], ["80G", "implemented-by-donations"],
	["80GG", "implemented-here"], ["80GGA", "implemented-here"],
	["80GGC", "implemented-here"], ["80TTA", "implemented-here"],
	["80TTB", "implemented-here"], ["80U", "implemented-by-health-disability"],
	["any-other", "deliberately-unsupported"],
] as const);

export type RemainingDeductionOrigin =
	| Readonly<{ kind: "attested-answer"; answerId: string }>
	| Readonly<{ kind: "accepted-evidence"; sourceDocumentIds: readonly string[] }>;
export type RemainingDeductionFact = Readonly<{ factKey: FactKey; value: ExactMoney | boolean; origin: RemainingDeductionOrigin }>;
export type RemainingDeductionIssue = Readonly<{ code: IssueCode; severity: "blocking" | "warning"; affectedFacts: readonly FactKey[]; recoveryAction: string }>;
export type RemainingDeductionResult = Readonly<{ section: "80CCH" | "80GG" | "80GGA" | "80GGC" | "80TTA" | "80TTB"; oldRegimeAllowed: ExactMoney; newRegimeAllowed: ExactMoney; status: "allowed" | "rejected" | "not-applicable" }>;
export type RemainingDeductionTraceNode = Readonly<{ label: string; ruleId: RuleId; inputs: readonly FactKey[]; operation: string; result: ExactMoney }>;
export type RemainingDeductionComputation =
	| Readonly<{ kind: "blocked" | "unsupported"; issues: readonly RemainingDeductionIssue[] }>
	| Readonly<{ kind: "computed"; facts: readonly RemainingDeductionFact[]; results: readonly RemainingDeductionResult[]; oldRegimeTotal: ExactMoney; newRegimeTotal: ExactMoney; issues: readonly RemainingDeductionIssue[]; trace: readonly RemainingDeductionTraceNode[] }>;

const issue = (code: string, affectedFacts: readonly FactKey[], recoveryAction: string, severity: RemainingDeductionIssue["severity"] = "blocking"): RemainingDeductionIssue => ({ code: parseIssueCode(code), severity, affectedFacts, recoveryAction });

export const computeRemainingDeductions = ({ rulePack, facts }: Readonly<{ rulePack: Pick<ScopeRulePack, "taxConstants">; facts: readonly RemainingDeductionFact[] }>): RemainingDeductionComputation => {
	const permitted = new Set<FactKey>(Object.values(FACT_KEYS));
	const unsupportedFact = facts.find((candidate) => !permitted.has(candidate.factKey));
	if (unsupportedFact !== undefined) return { kind: "unsupported", issues: [issue("RULE_REMAINING_DEDUCTION_FACT_UNSUPPORTED", [unsupportedFact.factKey], "Remove the unsupported fact or use an analysis that covers it.")] };
	for (const factKey of new Set(facts.map((candidate) => candidate.factKey))) {
		if (new Set(facts.filter((candidate) => candidate.factKey === factKey).map((candidate) => String(candidate.value))).size > 1) {
			return { kind: "blocked", issues: [issue("FACT_REMAINING_DEDUCTION_CONFLICT", [factKey], "Resolve the contradictory deduction facts before continuing.")] };
		}
	}
	const constants = rulePack.taxConstants?.remainingDeductions;
	if (constants === undefined) return { kind: "blocked", issues: [issue("RULE_REMAINING_DEDUCTION_CONSTANTS_MISSING", [FACT_KEYS.seniorCitizen], "Load a rule pack that pins the remaining ITR-1 deduction rules.")] };
	const byKey = new Map(facts.map((candidate) => [candidate.factKey, candidate]));
	const bool = (key: FactKey): boolean | undefined => typeof byKey.get(key)?.value === "boolean" ? byKey.get(key)?.value as boolean : undefined;
	const money = (key: FactKey): ExactMoney | undefined => typeof byKey.get(key)?.value === "string" ? byKey.get(key)?.value as ExactMoney : undefined;
	const required: FactKey[] = [FACT_KEYS.savingsInterest, FACT_KEYS.depositInterest, FACT_KEYS.seniorCitizen, FACT_KEYS.section80cchPresent, FACT_KEYS.section80ggPresent, FACT_KEYS.section80ggaPresent, FACT_KEYS.section80ggcPresent, FACT_KEYS.otherDeductionPresent];
	const conditional: readonly [FactKey, readonly FactKey[]][] = [
		[FACT_KEYS.section80cchPresent, [FACT_KEYS.section80cchEligible, FACT_KEYS.section80cchAgeEligible, FACT_KEYS.section80cchCentralGovernmentEmployee, FACT_KEYS.section80cchTaxpayerContribution, FACT_KEYS.section80cchGovernmentContribution, FACT_KEYS.section80cchSalary, FACT_KEYS.section80cchDetailsAvailable]],
		[FACT_KEYS.section80ggPresent, [FACT_KEYS.section80ggRentPaid, FACT_KEYS.section80ggAdjustedTotalIncome, FACT_KEYS.section80ggHraReceived, FACT_KEYS.section80ggDisqualifyingProperty, FACT_KEYS.section80ggForm10baDetails]],
		[FACT_KEYS.section80ggaPresent, [FACT_KEYS.section80ggaAmount, FACT_KEYS.section80ggaEligiblePurpose, FACT_KEYS.section80ggaBusinessIncome, FACT_KEYS.section80ggaCashPayment, FACT_KEYS.section80ggaDetailsAvailable]],
		[FACT_KEYS.section80ggcPresent, [FACT_KEYS.section80ggcAmount, FACT_KEYS.section80ggcEligibleRecipient, FACT_KEYS.section80ggcCashPayment, FACT_KEYS.section80ggcDateWithinYear, FACT_KEYS.section80ggcGrossTotalIncome, FACT_KEYS.section80ggcDetailsAvailable]],
	];
	for (const [present, details] of conditional) if (bool(present)) required.push(...details);
	const missing = required.filter((key) => !byKey.has(key));
	if (missing.length > 0) return { kind: "blocked", issues: [issue("FACT_REMAINING_DEDUCTION_DETAILS_MISSING", missing, "Answer each applicable remaining-deduction question. A blank answer is not No or zero.")] };

	const zero = exactMoneyFromWholeRupees(0);
	const results: RemainingDeductionResult[] = [];
	const issues: RemainingDeductionIssue[] = [];
	const trace: RemainingDeductionTraceNode[] = [];
	const addResult = (section: RemainingDeductionResult["section"], oldRegimeAllowed: ExactMoney, newRegimeAllowed: ExactMoney, ruleId: RuleId, inputs: readonly FactKey[], operation: string, status: RemainingDeductionResult["status"] = "allowed"): void => {
		results.push({ section, oldRegimeAllowed, newRegimeAllowed, status });
		trace.push({ label: `Section ${section} allowed deduction`, ruleId, inputs, operation, result: oldRegimeAllowed });
	};

	const senior = bool(FACT_KEYS.seniorCitizen)!;
	const savings = money(FACT_KEYS.savingsInterest)!;
	const deposits = money(FACT_KEYS.depositInterest)!;
	const section80tta = senior ? zero : minExactMoney(savings, exactMoneyFromWholeRupees(constants.section80ttaLimitWholeRupees));
	const section80ttb = senior ? minExactMoney(addExactMoney(savings, deposits), exactMoneyFromWholeRupees(constants.section80ttbLimitWholeRupees)) : zero;
	addResult("80TTA", section80tta, zero, constants.section80ttaRuleId, [FACT_KEYS.savingsInterest, FACT_KEYS.seniorCitizen], "Savings interest capped once for a non-senior taxpayer", senior ? "not-applicable" : "allowed");
	addResult("80TTB", section80ttb, zero, constants.section80ttbRuleId, [FACT_KEYS.savingsInterest, FACT_KEYS.depositInterest, FACT_KEYS.seniorCitizen], "Savings and deposit interest combined and capped once for a senior taxpayer", senior ? "allowed" : "not-applicable");

	let section80cch = zero;
	if (bool(FACT_KEYS.section80cchPresent)) {
		const eligible = bool(FACT_KEYS.section80cchEligible)! && bool(FACT_KEYS.section80cchAgeEligible)! && bool(FACT_KEYS.section80cchCentralGovernmentEmployee)! && bool(FACT_KEYS.section80cchDetailsAvailable)!;
		if (eligible) section80cch = minExactMoney(addExactMoney(money(FACT_KEYS.section80cchTaxpayerContribution)!, money(FACT_KEYS.section80cchGovernmentContribution)!), multiplyByBasisPoints(money(FACT_KEYS.section80cchSalary)!, constants.section80cchSalaryLimitBasisPoints));
		else issues.push(issue("FACT_80CCH_ELIGIBILITY_NOT_MET", [FACT_KEYS.section80cchEligible, FACT_KEYS.section80cchAgeEligible, FACT_KEYS.section80cchCentralGovernmentEmployee, FACT_KEYS.section80cchDetailsAvailable], "Do not claim section 80CCH unless the Agniveer, age, employment, and account details are confirmed.", "warning"));
	}
	const section80cchPresent = bool(FACT_KEYS.section80cchPresent)!;
	const section80cchEligible = bool(FACT_KEYS.section80cchEligible) === true && bool(FACT_KEYS.section80cchAgeEligible) === true && bool(FACT_KEYS.section80cchCentralGovernmentEmployee) === true && bool(FACT_KEYS.section80cchDetailsAvailable) === true;
	addResult("80CCH", section80cch, section80cch, constants.section80cchRuleId, [FACT_KEYS.section80cchTaxpayerContribution, FACT_KEYS.section80cchGovernmentContribution, FACT_KEYS.section80cchSalary], "Eligible contributions capped by the pinned salary percentage", !section80cchPresent ? "not-applicable" : section80cchEligible ? "allowed" : "rejected");

	let section80gg = zero;
	if (bool(FACT_KEYS.section80ggPresent)) {
		const eligible = !bool(FACT_KEYS.section80ggHraReceived)! && !bool(FACT_KEYS.section80ggDisqualifyingProperty)! && bool(FACT_KEYS.section80ggForm10baDetails)!;
		if (eligible) {
			const rent = money(FACT_KEYS.section80ggRentPaid)!;
			const income = money(FACT_KEYS.section80ggAdjustedTotalIncome)!;
			const reduction = multiplyByWholePercent(income, constants.section80ggRentReductionPercent);
			const excessRent = compareExactMoney(rent, reduction) > 0 ? subtractExactMoney(rent, reduction) : zero;
			section80gg = minExactMoney(excessRent, minExactMoney(multiplyByWholePercent(income, constants.section80ggIncomeLimitPercent), exactMoneyFromWholeRupees(constants.section80ggAnnualLimitWholeRupees)));
		} else issues.push(issue("FACT_80GG_ELIGIBILITY_NOT_MET", [FACT_KEYS.section80ggHraReceived, FACT_KEYS.section80ggDisqualifyingProperty, FACT_KEYS.section80ggForm10baDetails], "Resolve the HRA, property-ownership, and Form 10BA conditions before claiming section 80GG.", "warning"));
	}
	const section80ggPresent = bool(FACT_KEYS.section80ggPresent)!;
	const section80ggEligible = bool(FACT_KEYS.section80ggHraReceived) === false && bool(FACT_KEYS.section80ggDisqualifyingProperty) === false && bool(FACT_KEYS.section80ggForm10baDetails) === true;
	addResult("80GG", section80gg, zero, constants.section80ggRuleId, [FACT_KEYS.section80ggRentPaid, FACT_KEYS.section80ggAdjustedTotalIncome], "Least of rent less ten percent of income, twenty-five percent of income, and the annual cap", !section80ggPresent ? "not-applicable" : section80ggEligible ? "allowed" : "rejected");

	let section80gga = zero;
	if (bool(FACT_KEYS.section80ggaPresent)) {
		const amount = money(FACT_KEYS.section80ggaAmount)!;
		const cashRejected = bool(FACT_KEYS.section80ggaCashPayment)! && compareExactMoney(amount, exactMoneyFromWholeRupees(constants.section80ggaCashPaymentLimitWholeRupees)) > 0;
		const eligible = bool(FACT_KEYS.section80ggaEligiblePurpose)! && !bool(FACT_KEYS.section80ggaBusinessIncome)! && bool(FACT_KEYS.section80ggaDetailsAvailable)! && !cashRejected;
		if (eligible) section80gga = amount;
		if (cashRejected) issues.push(issue("FACT_80GGA_CASH_PAYMENT_EXCEEDS_LIMIT", [FACT_KEYS.section80ggaAmount, FACT_KEYS.section80ggaCashPayment], "Exclude the cash payment above the section 80GGA limit.", "warning"));
		else if (!eligible) issues.push(issue("FACT_80GGA_ELIGIBILITY_NOT_MET", [FACT_KEYS.section80ggaEligiblePurpose, FACT_KEYS.section80ggaBusinessIncome, FACT_KEYS.section80ggaDetailsAvailable], "Confirm the qualifying purpose, absence of business income, and recipient details before claiming section 80GGA.", "warning"));
	}
	const section80ggaPresent = bool(FACT_KEYS.section80ggaPresent)!;
	const section80ggaEligible = bool(FACT_KEYS.section80ggaEligiblePurpose) === true && bool(FACT_KEYS.section80ggaBusinessIncome) === false && bool(FACT_KEYS.section80ggaDetailsAvailable) === true && !(bool(FACT_KEYS.section80ggaCashPayment) === true && compareExactMoney(money(FACT_KEYS.section80ggaAmount)!, exactMoneyFromWholeRupees(constants.section80ggaCashPaymentLimitWholeRupees)) > 0);
	addResult("80GGA", section80gga, zero, constants.section80ggaRuleId, [FACT_KEYS.section80ggaAmount, FACT_KEYS.section80ggaCashPayment], "Eligible contribution after the cash-payment restriction", !section80ggaPresent ? "not-applicable" : section80ggaEligible ? "allowed" : "rejected");

	let section80ggc = zero;
	if (bool(FACT_KEYS.section80ggcPresent)) {
		const eligible = bool(FACT_KEYS.section80ggcEligibleRecipient)! && !bool(FACT_KEYS.section80ggcCashPayment)! && bool(FACT_KEYS.section80ggcDateWithinYear)! && bool(FACT_KEYS.section80ggcDetailsAvailable)!;
		if (eligible) section80ggc = minExactMoney(money(FACT_KEYS.section80ggcAmount)!, money(FACT_KEYS.section80ggcGrossTotalIncome)!);
		else issues.push(issue("FACT_80GGC_ELIGIBILITY_NOT_MET", [FACT_KEYS.section80ggcEligibleRecipient, FACT_KEYS.section80ggcCashPayment, FACT_KEYS.section80ggcDateWithinYear, FACT_KEYS.section80ggcDetailsAvailable], "Confirm the political party or electoral trust, non-cash payment, contribution date, and transaction details before claiming section 80GGC.", "warning"));
	}
	const section80ggcPresent = bool(FACT_KEYS.section80ggcPresent)!;
	const section80ggcEligible = bool(FACT_KEYS.section80ggcEligibleRecipient) === true && bool(FACT_KEYS.section80ggcCashPayment) === false && bool(FACT_KEYS.section80ggcDateWithinYear) === true && bool(FACT_KEYS.section80ggcDetailsAvailable) === true;
	addResult("80GGC", section80ggc, zero, constants.section80ggcRuleId, [FACT_KEYS.section80ggcAmount, FACT_KEYS.section80ggcGrossTotalIncome, FACT_KEYS.section80ggcEligibleRecipient, FACT_KEYS.section80ggcCashPayment, FACT_KEYS.section80ggcDateWithinYear], "Eligible non-cash political contribution capped by gross total income", !section80ggcPresent ? "not-applicable" : section80ggcEligible ? "allowed" : "rejected");
	trace.push({ label: "New-regime treatment for remaining deductions", ruleId: constants.newRegimeExclusionRuleId, inputs: [FACT_KEYS.section80cchPresent, FACT_KEYS.section80ggPresent, FACT_KEYS.section80ggaPresent, FACT_KEYS.section80ggcPresent, FACT_KEYS.seniorCitizen], operation: "Exclude sections 80GG, 80GGA, 80GGC, 80TTA, and 80TTB; retain eligible section 80CCH", result: section80cch });

	if (bool(FACT_KEYS.otherDeductionPresent)) {
		issues.push(issue("RULE_OTHER_DEDUCTION_UNSUPPORTED", [FACT_KEYS.otherDeductionPresent], "Use a supported named deduction category or a tax professional for another Chapter VI-A deduction."));
		return { kind: "unsupported", issues };
	}
	return {
		kind: "computed", facts, results,
		oldRegimeTotal: results.reduce((total, result) => addExactMoney(total, result.oldRegimeAllowed), zero),
		newRegimeTotal: results.reduce((total, result) => addExactMoney(total, result.newRegimeAllowed), zero),
		issues, trace,
	};
};
