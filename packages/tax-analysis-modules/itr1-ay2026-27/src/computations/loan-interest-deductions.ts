import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	isIsoDate,
	minExactMoney,
	parseFactKey,
	parseIssueCode,
} from "@openitr/model";
import type {
	ExactMoney,
	FactKey,
	IsoDate,
	IssueCode,
	RuleId,
	ScopeRulePack,
} from "@openitr/model";

const FACT_KEYS = Object.freeze({
	section80ePresent: parseFactKey("deductions.80e-present"),
	section80eBorrower: parseFactKey("deductions.80e-borrower"),
	section80eEligibleStudent: parseFactKey("deductions.80e-eligible-student"),
	section80eEligibleLender: parseFactKey("deductions.80e-eligible-lender"),
	section80eSanctionDate: parseFactKey("deductions.80e-sanction-date"),
	section80eFirstInterestPaymentDate: parseFactKey("deductions.80e-first-interest-payment-date"),
	section80eInterestPaid: parseFactKey("deductions.80e-interest-paid"),
	section80eLoanDetails: parseFactKey("deductions.80e-loan-details"),
	section80eePresent: parseFactKey("deductions.80ee-present"),
	section80eeBorrower: parseFactKey("deductions.80ee-borrower"),
	section80eeResidentialAcquisition: parseFactKey("deductions.80ee-residential-acquisition"),
	section80eeEligibleLender: parseFactKey("deductions.80ee-eligible-lender"),
	section80eeSanctionDate: parseFactKey("deductions.80ee-sanction-date"),
	section80eeLoanAmount: parseFactKey("deductions.80ee-loan-amount"),
	section80eePropertyValue: parseFactKey("deductions.80ee-property-value"),
	section80eeFirstHome: parseFactKey("deductions.80ee-first-home"),
	section80eeSection24bExhausted: parseFactKey("deductions.80ee-section-24b-exhausted"),
	section80eeAdditionalInterest: parseFactKey("deductions.80ee-additional-interest"),
	section80eeLoanDetails: parseFactKey("deductions.80ee-loan-details"),
	section80eeaPresent: parseFactKey("deductions.80eea-present"),
	section80eeaBorrower: parseFactKey("deductions.80eea-borrower"),
	section80eeaResidentialAcquisition: parseFactKey("deductions.80eea-residential-acquisition"),
	section80eeaEligibleLender: parseFactKey("deductions.80eea-eligible-lender"),
	section80eeaSanctionDate: parseFactKey("deductions.80eea-sanction-date"),
	section80eeaStampValue: parseFactKey("deductions.80eea-stamp-value"),
	section80eeaFirstHome: parseFactKey("deductions.80eea-first-home"),
	section80eeaSection24bExhausted: parseFactKey("deductions.80eea-section-24b-exhausted"),
	section80eeaAdditionalInterest: parseFactKey("deductions.80eea-additional-interest"),
	section80eeaLoanDetails: parseFactKey("deductions.80eea-loan-details"),
	section80eebPresent: parseFactKey("deductions.80eeb-present"),
	section80eebBorrower: parseFactKey("deductions.80eeb-borrower"),
	section80eebElectricVehiclePurchase: parseFactKey("deductions.80eeb-electric-vehicle-purchase"),
	section80eebEligibleLender: parseFactKey("deductions.80eeb-eligible-lender"),
	section80eebSanctionDate: parseFactKey("deductions.80eeb-sanction-date"),
	section80eebInterestPaid: parseFactKey("deductions.80eeb-interest-paid"),
	section80eebNotClaimedElsewhere: parseFactKey("deductions.80eeb-not-claimed-elsewhere"),
	section80eebLoanDetails: parseFactKey("deductions.80eeb-loan-details"),
});

export const LOAN_INTEREST_DEDUCTION_FACT_KEYS = FACT_KEYS;

export type LoanInterestDeductionOrigin =
	| Readonly<{ kind: "attested-answer"; answerId: string }>
	| Readonly<{ kind: "accepted-evidence"; sourceDocumentIds: readonly string[] }>;

export type LoanInterestDeductionFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney | IsoDate | boolean;
	origin: LoanInterestDeductionOrigin;
}>;

export type LoanInterestDeductionCategory = "80E" | "80EE" | "80EEA" | "80EEB";

export type LoanInterestDeductionCategoryResult = Readonly<{
	category: LoanInterestDeductionCategory;
	claimedInterest: ExactMoney;
	oldRegimeAllowed: ExactMoney;
	newRegimeAllowed: ExactMoney;
	loanPurpose: "higher-education" | "residential-property" | "electric-vehicle";
}>;

export type LoanInterestDeductionIssue = Readonly<{
	code: IssueCode;
	category: LoanInterestDeductionCategory | "selection";
	severity: "blocking" | "warning";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type LoanInterestDeductionTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	result: ExactMoney;
}>;

export type LoanInterestDeductionComputation =
	| Readonly<{
			kind: "blocked" | "unsupported";
			issues: readonly LoanInterestDeductionIssue[];
	  }>
	| Readonly<{
			kind: "computed";
			facts: readonly LoanInterestDeductionFact[];
			categories: readonly LoanInterestDeductionCategoryResult[];
			oldRegimeTotal: ExactMoney;
			newRegimeTotal: ExactMoney;
			issues: readonly LoanInterestDeductionIssue[];
			trace: readonly LoanInterestDeductionTraceNode[];
	  }>;

const issue = (
	code: string,
	category: LoanInterestDeductionIssue["category"],
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): LoanInterestDeductionIssue => ({
	code: parseIssueCode(code),
	category,
	severity: "blocking",
	affectedFacts,
	recoveryAction,
});

const sum = (values: readonly ExactMoney[]): ExactMoney =>
	values.reduce(addExactMoney, exactMoneyFromWholeRupees(0));

export const computeLoanInterestDeductions = ({
	rulePack,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	facts: readonly LoanInterestDeductionFact[];
}>): LoanInterestDeductionComputation => {
	const permitted = new Set<FactKey>(Object.values(FACT_KEYS));
	const unsupported = facts.find((candidate) => !permitted.has(candidate.factKey));
	if (unsupported !== undefined) {
		return {
			kind: "unsupported",
			issues: [
				issue(
					"RULE_LOAN_INTEREST_DEDUCTION_FACT_UNSUPPORTED",
					"selection",
					[unsupported.factKey],
					"Remove the unsupported fact or use an analysis that covers that loan purpose.",
				),
			],
		};
	}

	for (const factKey of new Set(facts.map((candidate) => candidate.factKey))) {
		const values = new Set(
			facts
				.filter((candidate) => candidate.factKey === factKey)
				.map((candidate) => String(candidate.value)),
		);
		if (values.size > 1) {
			return {
				kind: "blocked",
				issues: [
					issue(
						"FACT_LOAN_INTEREST_DEDUCTION_CONFLICT",
						"selection",
						[factKey],
						"Resolve the contradictory loan-interest facts before continuing.",
					),
				],
			};
		}
	}

	const constants = rulePack.taxConstants?.loanInterestDeductions;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"RULE_LOAN_INTEREST_DEDUCTION_CONSTANTS_MISSING",
					"selection",
					[FACT_KEYS.section80ePresent],
					"Load a rule-pack revision that pins the loan-interest deduction rules.",
				),
			],
		};
	}

	const byKey = new Map<FactKey, LoanInterestDeductionFact>();
	for (const candidate of facts) byKey.set(candidate.factKey, candidate);
	const bool = (factKey: FactKey): boolean | undefined => {
		const value = byKey.get(factKey)?.value;
		return typeof value === "boolean" ? value : undefined;
	};
	const money = (factKey: FactKey): ExactMoney | undefined => {
		const value = byKey.get(factKey)?.value;
		return typeof value === "string" && !isIsoDate(value) ? value : undefined;
	};
	const date = (factKey: FactKey): IsoDate | undefined => {
		const value = byKey.get(factKey)?.value;
		return typeof value === "string" && isIsoDate(value) ? value : undefined;
	};
	const zero = exactMoneyFromWholeRupees(0);
	const blockers: LoanInterestDeductionIssue[] = [];
	const categories: LoanInterestDeductionCategoryResult[] = [];
	const trace: LoanInterestDeductionTraceNode[] = [];
	const selectionKeys = [
		FACT_KEYS.section80ePresent,
		FACT_KEYS.section80eePresent,
		FACT_KEYS.section80eeaPresent,
		FACT_KEYS.section80eebPresent,
	] as const;
	const missingSelections = selectionKeys.filter((factKey) => bool(factKey) === undefined);
	if (missingSelections.length > 0) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"FACT_LOAN_INTEREST_CATEGORY_SELECTION_MISSING",
					"selection",
					missingSelections,
					"Confirm each supported loan-interest category. A blank selection is not No.",
				),
			],
		};
	}
	if (bool(FACT_KEYS.section80eePresent) && bool(FACT_KEYS.section80eeaPresent)) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"FACT_80EE_80EEA_MUTUALLY_EXCLUSIVE",
					"selection",
					[FACT_KEYS.section80eePresent, FACT_KEYS.section80eeaPresent],
					"Choose section 80EE or section 80EEA for this housing-loan interest; the same claim cannot use both.",
				),
			],
		};
	}
	const requireFacts = (
		category: LoanInterestDeductionCategory,
		factKeys: readonly FactKey[],
	): boolean => {
		const missing = factKeys.filter((factKey) => !byKey.has(factKey));
		if (missing.length === 0) return true;
		blockers.push(
			issue(
				`FACT_${category}_DETAILS_MISSING`,
				category,
				missing,
				`Supply every requested section ${category} loan fact. A blank answer remains unknown.`,
			),
		);
		return false;
	};
	const requireTrue = (
		category: LoanInterestDeductionCategory,
		factKey: FactKey,
		code: string,
		recoveryAction: string,
	): boolean => {
		if (bool(factKey)) return true;
		blockers.push(issue(code, category, [factKey], recoveryAction));
		return false;
	};
	const inRange = (value: IsoDate, start: IsoDate, end: IsoDate): boolean =>
		value >= start && value <= end;
	const recordCategory = (
		category: LoanInterestDeductionCategory,
		claimedInterest: ExactMoney,
		oldRegimeAllowed: ExactMoney,
		loanPurpose: LoanInterestDeductionCategoryResult["loanPurpose"],
		ruleId: RuleId,
		inputs: readonly FactKey[],
		operation: string,
	): void => {
		categories.push({ category, claimedInterest, oldRegimeAllowed, newRegimeAllowed: zero, loanPurpose });
		trace.push({ label: `Section ${category} old-regime deduction`, ruleId, inputs, operation, result: oldRegimeAllowed });
		trace.push({ label: `Section ${category} new-regime exclusion`, ruleId: constants.newRegimeExclusionRuleId, inputs, operation: "Chapter VI-A category excluded under the new regime", result: zero });
	};

	if (bool(FACT_KEYS.section80ePresent)) {
		const required = [FACT_KEYS.section80eBorrower, FACT_KEYS.section80eEligibleStudent, FACT_KEYS.section80eEligibleLender, FACT_KEYS.section80eSanctionDate, FACT_KEYS.section80eFirstInterestPaymentDate, FACT_KEYS.section80eInterestPaid, FACT_KEYS.section80eLoanDetails];
		if (requireFacts("80E", required)) {
			const eligible = [
				requireTrue("80E", FACT_KEYS.section80eBorrower, "FACT_80E_BORROWER_INELIGIBLE", "Confirm that you are the individual borrower who paid the interest."),
				requireTrue("80E", FACT_KEYS.section80eEligibleStudent, "FACT_80E_PURPOSE_OR_STUDENT_INELIGIBLE", "Use section 80E only for qualifying higher education for you or an eligible relative."),
				requireTrue("80E", FACT_KEYS.section80eEligibleLender, "FACT_80E_LENDER_INELIGIBLE", "Use section 80E only for a loan from an eligible financial or approved charitable institution."),
				requireTrue("80E", FACT_KEYS.section80eLoanDetails, "FACT_80E_LOAN_DETAILS_MISSING", "Obtain the lender, account, sanction, balance, and interest details before relying on the claim."),
			].every(Boolean);
			const firstPaymentDate = date(FACT_KEYS.section80eFirstInterestPaymentDate)!;
			if (!inRange(firstPaymentDate, constants.section80eEarliestFirstInterestPaymentDate, constants.section80eCurrentFinancialYearEndDate)) {
				blockers.push(issue("FACT_80E_OUTSIDE_DEDUCTION_PERIOD", "80E", [FACT_KEYS.section80eFirstInterestPaymentDate], "Correct the first interest-payment date or exclude the claim because AY 2026-27 is outside the initial assessment year and seven succeeding years."));
			} else {
				trace.push({ label: "Section 80E eight-year period", ruleId: constants.section80ePeriodRuleId, inputs: [FACT_KEYS.section80eFirstInterestPaymentDate], operation: "First interest-payment date is within the AY 2026-27 eight-year window", result: money(FACT_KEYS.section80eInterestPaid)! });
			}
			if (eligible && !blockers.some((candidate) => candidate.category === "80E")) {
				const claimed = money(FACT_KEYS.section80eInterestPaid)!;
				recordCategory("80E", claimed, claimed, "higher-education", constants.section80eEligibilityRuleId, required, "Actual qualifying interest paid, with no monetary cap");
			}
		}
	}

	if (bool(FACT_KEYS.section80eePresent)) {
		const required = [FACT_KEYS.section80eeBorrower, FACT_KEYS.section80eeResidentialAcquisition, FACT_KEYS.section80eeEligibleLender, FACT_KEYS.section80eeSanctionDate, FACT_KEYS.section80eeLoanAmount, FACT_KEYS.section80eePropertyValue, FACT_KEYS.section80eeFirstHome, FACT_KEYS.section80eeSection24bExhausted, FACT_KEYS.section80eeAdditionalInterest, FACT_KEYS.section80eeLoanDetails];
		if (requireFacts("80EE", required)) {
			[
				[FACT_KEYS.section80eeBorrower, "FACT_80EE_BORROWER_INELIGIBLE", "Confirm that you are the individual borrower."],
				[FACT_KEYS.section80eeResidentialAcquisition, "FACT_80EE_PURPOSE_INELIGIBLE", "Use section 80EE only for acquisition of residential house property."],
				[FACT_KEYS.section80eeEligibleLender, "FACT_80EE_LENDER_INELIGIBLE", "Use section 80EE only for a loan from an eligible financial institution."],
				[FACT_KEYS.section80eeFirstHome, "FACT_80EE_FIRST_HOME_REQUIRED", "Exclude the claim if you owned residential house property when the loan was sanctioned."],
				[FACT_KEYS.section80eeSection24bExhausted, "FACT_80EE_SECTION_24B_NOT_EXHAUSTED", "Apply eligible interest under section 24(b) first and enter only the additional amount for section 80EE."],
				[FACT_KEYS.section80eeLoanDetails, "FACT_80EE_LOAN_DETAILS_MISSING", "Obtain the lender and loan-account details before relying on the claim."],
			].forEach(([key, code, action]) => requireTrue("80EE", key as FactKey, code as string, action as string));
			const sanction = date(FACT_KEYS.section80eeSanctionDate)!;
			if (!inRange(sanction, constants.section80eeSanctionStartDate, constants.section80eeSanctionEndDate)) blockers.push(issue("FACT_80EE_SANCTION_DATE_INELIGIBLE", "80EE", [FACT_KEYS.section80eeSanctionDate], "Exclude the claim unless the loan was sanctioned from 1 April 2016 through 31 March 2017."));
			if (compareExactMoney(money(FACT_KEYS.section80eeLoanAmount)!, exactMoneyFromWholeRupees(constants.section80eeLoanLimitWholeRupees)) > 0) blockers.push(issue("FACT_80EE_LOAN_AMOUNT_EXCEEDS_LIMIT", "80EE", [FACT_KEYS.section80eeLoanAmount], "Exclude section 80EE because the sanctioned loan exceeds ₹35 lakh."));
			if (compareExactMoney(money(FACT_KEYS.section80eePropertyValue)!, exactMoneyFromWholeRupees(constants.section80eePropertyValueLimitWholeRupees)) > 0) blockers.push(issue("FACT_80EE_PROPERTY_VALUE_EXCEEDS_LIMIT", "80EE", [FACT_KEYS.section80eePropertyValue], "Exclude section 80EE because the residential property value exceeds ₹50 lakh."));
			if (!blockers.some((candidate) => candidate.category === "80EE")) {
				const claimed = money(FACT_KEYS.section80eeAdditionalInterest)!;
				recordCategory("80EE", claimed, minExactMoney(claimed, exactMoneyFromWholeRupees(constants.section80eeLimitWholeRupees)), "residential-property", constants.section80eeLimitRuleId, required, "Additional qualifying interest after section 24(b), capped at ₹50,000");
			}
		}
	}

	if (bool(FACT_KEYS.section80eeaPresent)) {
		const required = [FACT_KEYS.section80eeaBorrower, FACT_KEYS.section80eeaResidentialAcquisition, FACT_KEYS.section80eeaEligibleLender, FACT_KEYS.section80eeaSanctionDate, FACT_KEYS.section80eeaStampValue, FACT_KEYS.section80eeaFirstHome, FACT_KEYS.section80eeaSection24bExhausted, FACT_KEYS.section80eeaAdditionalInterest, FACT_KEYS.section80eeaLoanDetails];
		if (requireFacts("80EEA", required)) {
			[
				[FACT_KEYS.section80eeaBorrower, "FACT_80EEA_BORROWER_INELIGIBLE", "Confirm that you are the individual borrower."],
				[FACT_KEYS.section80eeaResidentialAcquisition, "FACT_80EEA_PURPOSE_INELIGIBLE", "Use section 80EEA only for acquisition of residential house property."],
				[FACT_KEYS.section80eeaEligibleLender, "FACT_80EEA_LENDER_INELIGIBLE", "Use section 80EEA only for a loan from an eligible financial institution."],
				[FACT_KEYS.section80eeaFirstHome, "FACT_80EEA_FIRST_HOME_REQUIRED", "Exclude the claim if you owned residential house property when the loan was sanctioned."],
				[FACT_KEYS.section80eeaSection24bExhausted, "FACT_80EEA_SECTION_24B_NOT_EXHAUSTED", "Apply eligible interest under section 24(b) first and enter only the additional amount for section 80EEA."],
				[FACT_KEYS.section80eeaLoanDetails, "FACT_80EEA_LOAN_DETAILS_MISSING", "Obtain the lender and loan-account details before relying on the claim."],
			].forEach(([key, code, action]) => requireTrue("80EEA", key as FactKey, code as string, action as string));
			const sanction = date(FACT_KEYS.section80eeaSanctionDate)!;
			if (!inRange(sanction, constants.section80eeaSanctionStartDate, constants.section80eeaSanctionEndDate)) blockers.push(issue("FACT_80EEA_SANCTION_DATE_INELIGIBLE", "80EEA", [FACT_KEYS.section80eeaSanctionDate], "Exclude the claim unless the loan was sanctioned from 1 April 2019 through 31 March 2022."));
			if (compareExactMoney(money(FACT_KEYS.section80eeaStampValue)!, exactMoneyFromWholeRupees(constants.section80eeaStampValueLimitWholeRupees)) > 0) blockers.push(issue("FACT_80EEA_STAMP_VALUE_EXCEEDS_LIMIT", "80EEA", [FACT_KEYS.section80eeaStampValue], "Exclude section 80EEA because the stamp-duty value exceeds ₹45 lakh."));
			if (!blockers.some((candidate) => candidate.category === "80EEA")) {
				const claimed = money(FACT_KEYS.section80eeaAdditionalInterest)!;
				recordCategory("80EEA", claimed, minExactMoney(claimed, exactMoneyFromWholeRupees(constants.section80eeaLimitWholeRupees)), "residential-property", constants.section80eeaLimitRuleId, required, "Additional qualifying interest after section 24(b), capped at ₹1,50,000");
			}
		}
	}

	if (bool(FACT_KEYS.section80eebPresent)) {
		const required = [FACT_KEYS.section80eebBorrower, FACT_KEYS.section80eebElectricVehiclePurchase, FACT_KEYS.section80eebEligibleLender, FACT_KEYS.section80eebSanctionDate, FACT_KEYS.section80eebInterestPaid, FACT_KEYS.section80eebNotClaimedElsewhere, FACT_KEYS.section80eebLoanDetails];
		if (requireFacts("80EEB", required)) {
			[
				[FACT_KEYS.section80eebBorrower, "FACT_80EEB_BORROWER_INELIGIBLE", "Confirm that you are the individual borrower."],
				[FACT_KEYS.section80eebElectricVehiclePurchase, "FACT_80EEB_PURPOSE_INELIGIBLE", "Use section 80EEB only for purchase of an exclusively electric vehicle."],
				[FACT_KEYS.section80eebEligibleLender, "FACT_80EEB_LENDER_INELIGIBLE", "Use section 80EEB only for a loan from an eligible financial institution."],
				[FACT_KEYS.section80eebNotClaimedElsewhere, "FACT_80EEB_INTEREST_OVERLAP", "Enter only interest that is not claimed under another provision."],
				[FACT_KEYS.section80eebLoanDetails, "FACT_80EEB_LOAN_DETAILS_MISSING", "Obtain the lender, loan-account, and vehicle-registration details before relying on the claim."],
			].forEach(([key, code, action]) => requireTrue("80EEB", key as FactKey, code as string, action as string));
			const sanction = date(FACT_KEYS.section80eebSanctionDate)!;
			if (!inRange(sanction, constants.section80eebSanctionStartDate, constants.section80eebSanctionEndDate)) blockers.push(issue("FACT_80EEB_SANCTION_DATE_INELIGIBLE", "80EEB", [FACT_KEYS.section80eebSanctionDate], "Exclude the claim unless the loan was sanctioned from 1 April 2019 through 31 March 2023."));
			if (!blockers.some((candidate) => candidate.category === "80EEB")) {
				const claimed = money(FACT_KEYS.section80eebInterestPaid)!;
				recordCategory("80EEB", claimed, minExactMoney(claimed, exactMoneyFromWholeRupees(constants.section80eebLimitWholeRupees)), "electric-vehicle", constants.section80eebLimitRuleId, required, "Qualifying electric-vehicle loan interest, capped at ₹1,50,000");
			}
		}
	}

	if (blockers.length > 0) return { kind: "blocked", issues: blockers };
	return {
		kind: "computed",
		facts: Object.freeze([...facts]),
		categories: Object.freeze(categories),
		oldRegimeTotal: sum(categories.map((category) => category.oldRegimeAllowed)),
		newRegimeTotal: zero,
		issues: Object.freeze([]),
		trace: Object.freeze(trace),
	};
};
