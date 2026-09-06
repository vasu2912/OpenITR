import type { RulePackManifest, RulePackManifestFactQuestionRecord } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260910 } from "../2026-09-10/manifest";

const actSourceId = "income-tax-act-1961";
const validationSourceId = "itr1-validation-rules-ay2026-27";
const rule = (id: string, citation: string, sourceId: string, sourceLocation: string) =>
	Object.freeze({ id, citation, sourceId, sourceLocation });

const rules = Object.freeze({
	section80eEligibility: rule("ITR1-OR-80E-ELIGIBILITY", "Income-tax Act, 1961, section 80E permits an individual to deduct interest paid on a higher-education loan from a financial institution or approved charitable institution for the individual or an eligible relative", actSourceId, "Section 80E(1), (3)(a), (3)(b), and (3)(c)"),
	section80ePeriod: rule("ITR1-OR-80E-EIGHT-YEAR-PERIOD", "Income-tax Act, 1961, section 80E permits the deduction for the initial assessment year and seven immediately succeeding assessment years, or until the interest is paid", actSourceId, "Section 80E(2)"),
	section80eDetails: rule("ITR1-80E-LOAN-DETAILS", "CBDT e-Filing ITR 1 guidance for AY 2026-27 requires the lender, loan account, sanction date, total loan, outstanding balance, and interest amount for section 80E", validationSourceId, "Schedule 80E details and Category A rules 242-244"),
	section80eeEligibility: rule("ITR1-OR-80EE-ELIGIBILITY", "Income-tax Act, 1961, section 80EE requires a first-home residential acquisition loan sanctioned from 1 April 2016 through 31 March 2017, not exceeding thirty-five lakh rupees, for property valued at no more than fifty lakh rupees", actSourceId, "Section 80EE(3)"),
	section80eeLimit: rule("ITR1-OR-80EE-LIMIT-AND-24B-ORDER", "Section 80EE permits up to fifty thousand rupees of interest not deducted under another provision, and AY 2026-27 validation applies it after the section 24(b) limit is exhausted", validationSourceId, "Category A rules 121, 221, 222, 224, and 228"),
	section80eeDetails: rule("ITR1-80EE-LOAN-DETAILS", "CBDT e-Filing ITR 1 validation requires section 80EE lender and loan-account details", validationSourceId, "Category A rules 242 and 245"),
	section80eeaEligibility: rule("ITR1-OR-80EEA-ELIGIBILITY", "Income-tax Act, 1961, section 80EEA requires a first-home residential acquisition loan sanctioned from 1 April 2019 through 31 March 2022 for property with stamp-duty value no more than forty-five lakh rupees", actSourceId, "Section 80EEA(3)"),
	section80eeaLimit: rule("ITR1-OR-80EEA-LIMIT-AND-24B-ORDER", "Section 80EEA permits up to one lakh fifty thousand rupees of interest not deducted under another provision, and AY 2026-27 validation applies it after the section 24(b) limit is exhausted", validationSourceId, "Category A rules 122, 221, 223, 225, and 229"),
	section80eeaDetails: rule("ITR1-80EEA-LOAN-DETAILS", "CBDT e-Filing ITR 1 validation requires section 80EEA lender and loan-account details", validationSourceId, "Category A rules 242 and 246"),
	section80eeMutualExclusion: rule("ITR1-80EE-80EEA-MUTUAL-EXCLUSION", "A taxpayer eligible for section 80EE cannot claim section 80EEA, and AY 2026-27 validation disallows concurrent claims", validationSourceId, "Category A rules 123-124 and 226"),
	section80eebEligibility: rule("ITR1-OR-80EEB-ELIGIBILITY", "Income-tax Act, 1961, section 80EEB applies to interest on an eligible financial-institution loan sanctioned from 1 April 2019 through 31 March 2023 for purchase of an electric vehicle", actSourceId, "Section 80EEB(1), (3)(a), and (3)(b)"),
	section80eebLimit: rule("ITR1-OR-80EEB-LIMIT", "Income-tax Act, 1961, section 80EEB limits the deduction to one lakh fifty thousand rupees and prevents duplicate deduction of the same interest", actSourceId, "Section 80EEB(1) and (2)"),
	section80eebDetails: rule("ITR1-80EEB-LOAN-AND-VEHICLE-DETAILS", "CBDT e-Filing ITR 1 guidance requires the loan and electric-vehicle registration details for section 80EEB", validationSourceId, "Category A rules 230 and 242-247"),
	newRegimeExclusion: rule("ITR1-NR-LOAN-INTEREST-DEDUCTION-EXCLUSION", "CBDT e-Filing ITR 1 validation excludes sections 80E, 80EE, 80EEA, and 80EEB under the new regime", validationSourceId, "Category A rule 255"),
});

const result = Object.freeze({ resultId: "loan-interest-deductions", label: "Loan-interest deductions" });
type Visibility = NonNullable<RulePackManifestFactQuestionRecord["visibility"]>;
const always = Object.freeze({ kind: "always" as const });
const visibleWhenYes = (factKey: string): Visibility =>
	Object.freeze({ kind: "fact-boolean-equals", factKey, value: true });
const answerSchema = {
	boolean: Object.freeze({ kind: "boolean" as const }),
	amount: Object.freeze({ kind: "exact-money" as const, minimumWholeRupees: 0, maximumWholeRupees: null }),
	date: Object.freeze({ kind: "iso-date" as const }),
};
const question = (
	id: string,
	prompt: string,
	helpText: string,
	factKey: string,
	requiresRuleId: string,
	visibility: Visibility,
	schema: RulePackManifestFactQuestionRecord["answerSchema"] = answerSchema.boolean,
): RulePackManifestFactQuestionRecord => Object.freeze({
	id,
	prompt,
	helpText,
	requiresRuleId,
	suppliesFactKey: factKey,
	whyRequired: "The selected loan-interest category cannot be analyzed without this explicit fact. A blank answer is not No or zero.",
	affectedResult: result,
	answerSchema: schema,
	visibility,
});

const e = visibleWhenYes("deductions.80e-present");
const ee = visibleWhenYes("deductions.80ee-present");
const eea = visibleWhenYes("deductions.80eea-present");
const eeb = visibleWhenYes("deductions.80eeb-present");
const questions: readonly RulePackManifestFactQuestionRecord[] = [
	question("deduction-80e-present", "Do you want to analyze interest on a higher-education loan under section 80E?", "Use this category for qualifying higher education for you or an eligible relative, not for housing or vehicle interest.", "deductions.80e-present", rules.section80eEligibility.id, always),
	question("deduction-80ee-present", "Do you want to analyze additional first-home loan interest under section 80EE?", "This category is separate from house-property interest under section 24(b) and applies only to its narrow 2016-17 sanction window.", "deductions.80ee-present", rules.section80eeEligibility.id, always),
	question("deduction-80eea-present", "Do you want to analyze additional affordable first-home loan interest under section 80EEA?", "This category is separate from section 24(b) and cannot be claimed with section 80EE.", "deductions.80eea-present", rules.section80eeaEligibility.id, always),
	question("deduction-80eeb-present", "Do you want to analyze electric-vehicle loan interest under section 80EEB?", "Use this category only for purchase of an exclusively electric vehicle, not a hybrid or another loan purpose.", "deductions.80eeb-present", rules.section80eebEligibility.id, always),

	question("deduction-80e-borrower", "Are you the individual borrower who paid the section 80E interest?", "The deduction belongs to the individual borrower who paid the interest from taxable income.", "deductions.80e-borrower", rules.section80eEligibility.id, e),
	question("deduction-80e-eligible-student", "Was the loan for qualifying higher education for you, your spouse, your child, or a student for whom you are legal guardian?", "Higher education must follow senior secondary or its equivalent and the student relationship must be eligible.", "deductions.80e-eligible-student", rules.section80eEligibility.id, e),
	question("deduction-80e-eligible-lender", "Was the education loan from an eligible financial institution or approved charitable institution?", "Personal loans and loans from other sources do not qualify under section 80E.", "deductions.80e-eligible-lender", rules.section80eEligibility.id, e),
	question("deduction-80e-sanction-date", "When was the section 80E education loan sanctioned?", "Record the date from the lender's loan details.", "deductions.80e-sanction-date", rules.section80eDetails.id, e, answerSchema.date),
	question("deduction-80e-first-interest-payment-date", "When did you first start paying interest on this education loan?", "This date determines whether AY 2026-27 is within the initial assessment year and seven succeeding years.", "deductions.80e-first-interest-payment-date", rules.section80ePeriod.id, e, answerSchema.date),
	question("deduction-80e-interest-paid", "How much qualifying section 80E interest did you pay during FY 2025-26?", "Enter interest only, not principal. Section 80E has a time limit but no monetary cap.", "deductions.80e-interest-paid", rules.section80eEligibility.id, e, answerSchema.amount),
	question("deduction-80e-loan-details", "Are the lender, loan account, sanction, balance, and interest details available?", "These details support the loan category, relevant dates, and claimed amount.", "deductions.80e-loan-details", rules.section80eDetails.id, e),

	question("deduction-80ee-borrower", "Are you the individual borrower for the section 80EE housing loan?", "The section 80EE deduction belongs to the individual borrower.", "deductions.80ee-borrower", rules.section80eeEligibility.id, ee),
	question("deduction-80ee-residential-acquisition", "Was the section 80EE loan used to acquire residential house property?", "Unsupported loan purposes do not qualify.", "deductions.80ee-residential-acquisition", rules.section80eeEligibility.id, ee),
	question("deduction-80ee-eligible-lender", "Was the section 80EE loan from an eligible financial institution?", "Record No for a private or otherwise ineligible lender.", "deductions.80ee-eligible-lender", rules.section80eeEligibility.id, ee),
	question("deduction-80ee-sanction-date", "When was the section 80EE loan sanctioned?", "The permitted window is 1 April 2016 through 31 March 2017.", "deductions.80ee-sanction-date", rules.section80eeEligibility.id, ee, answerSchema.date),
	question("deduction-80ee-loan-amount", "What was the sanctioned section 80EE loan amount?", "Eligibility requires the loan amount not to exceed ₹35 lakh.", "deductions.80ee-loan-amount", rules.section80eeEligibility.id, ee, answerSchema.amount),
	question("deduction-80ee-property-value", "What was the value of the residential property for section 80EE eligibility?", "Eligibility requires the property value not to exceed ₹50 lakh.", "deductions.80ee-property-value", rules.section80eeEligibility.id, ee, answerSchema.amount),
	question("deduction-80ee-first-home", "Did you own no residential house property when the section 80EE loan was sanctioned?", "Section 80EE is a first-home provision.", "deductions.80ee-first-home", rules.section80eeEligibility.id, ee),
	question("deduction-80ee-section-24b-exhausted", "Has the eligible section 24(b) house-property interest limit been applied before section 80EE?", "Enter only additional interest not already deducted under section 24(b).", "deductions.80ee-section-24b-exhausted", rules.section80eeLimit.id, ee),
	question("deduction-80ee-additional-interest", "How much additional eligible interest remains for section 80EE after section 24(b)?", "Do not repeat interest already included in the house-property computation.", "deductions.80ee-additional-interest", rules.section80eeLimit.id, ee, answerSchema.amount),
	question("deduction-80ee-loan-details", "Are the lender and loan-account details available for section 80EE?", "These details support the category, sanction date, and amount.", "deductions.80ee-loan-details", rules.section80eeDetails.id, ee),

	question("deduction-80eea-borrower", "Are you the individual borrower for the section 80EEA housing loan?", "The section 80EEA deduction belongs to the individual borrower.", "deductions.80eea-borrower", rules.section80eeaEligibility.id, eea),
	question("deduction-80eea-residential-acquisition", "Was the section 80EEA loan used to acquire residential house property?", "Unsupported loan purposes do not qualify.", "deductions.80eea-residential-acquisition", rules.section80eeaEligibility.id, eea),
	question("deduction-80eea-eligible-lender", "Was the section 80EEA loan from an eligible financial institution?", "Record No for a private or otherwise ineligible lender.", "deductions.80eea-eligible-lender", rules.section80eeaEligibility.id, eea),
	question("deduction-80eea-sanction-date", "When was the section 80EEA loan sanctioned?", "The permitted window is 1 April 2019 through 31 March 2022.", "deductions.80eea-sanction-date", rules.section80eeaEligibility.id, eea, answerSchema.date),
	question("deduction-80eea-stamp-value", "What was the stamp-duty value of the section 80EEA property?", "Eligibility requires the stamp-duty value not to exceed ₹45 lakh.", "deductions.80eea-stamp-value", rules.section80eeaEligibility.id, eea, answerSchema.amount),
	question("deduction-80eea-first-home", "Did you own no residential house property when the section 80EEA loan was sanctioned?", "Section 80EEA is a first-home provision.", "deductions.80eea-first-home", rules.section80eeaEligibility.id, eea),
	question("deduction-80eea-section-24b-exhausted", "Has the eligible section 24(b) house-property interest limit been applied before section 80EEA?", "Enter only additional interest not already deducted under section 24(b).", "deductions.80eea-section-24b-exhausted", rules.section80eeaLimit.id, eea),
	question("deduction-80eea-additional-interest", "How much additional eligible interest remains for section 80EEA after section 24(b)?", "Do not repeat interest already included in the house-property computation.", "deductions.80eea-additional-interest", rules.section80eeaLimit.id, eea, answerSchema.amount),
	question("deduction-80eea-loan-details", "Are the lender and loan-account details available for section 80EEA?", "These details support the category, sanction date, stamp value, and amount.", "deductions.80eea-loan-details", rules.section80eeaDetails.id, eea),

	question("deduction-80eeb-borrower", "Are you the individual borrower for the section 80EEB vehicle loan?", "The section 80EEB deduction belongs to the individual borrower.", "deductions.80eeb-borrower", rules.section80eebEligibility.id, eeb),
	question("deduction-80eeb-electric-vehicle-purchase", "Was the loan used to purchase an exclusively electric vehicle?", "A hybrid vehicle or another loan purpose does not qualify.", "deductions.80eeb-electric-vehicle-purchase", rules.section80eebEligibility.id, eeb),
	question("deduction-80eeb-eligible-lender", "Was the section 80EEB loan from an eligible financial institution?", "Record No for a private or otherwise ineligible lender.", "deductions.80eeb-eligible-lender", rules.section80eebEligibility.id, eeb),
	question("deduction-80eeb-sanction-date", "When was the section 80EEB loan sanctioned?", "The permitted window is 1 April 2019 through 31 March 2023.", "deductions.80eeb-sanction-date", rules.section80eebEligibility.id, eeb, answerSchema.date),
	question("deduction-80eeb-interest-paid", "How much qualifying section 80EEB interest did you pay during FY 2025-26?", "Enter interest only, before the ₹1,50,000 statutory limit.", "deductions.80eeb-interest-paid", rules.section80eebLimit.id, eeb, answerSchema.amount),
	question("deduction-80eeb-not-claimed-elsewhere", "Is this section 80EEB interest excluded from every other deduction?", "The same interest cannot be deducted again under another provision.", "deductions.80eeb-not-claimed-elsewhere", rules.section80eebLimit.id, eeb),
	question("deduction-80eeb-loan-details", "Are the lender, loan-account, and vehicle-registration details available for section 80EEB?", "These details support the electric-vehicle purpose, sanction date, and amount.", "deductions.80eeb-loan-details", rules.section80eebDetails.id, eeb),
];

const priorConstants = itr1Ay202627RulePackManifest20260910.taxConstants;
if (priorConstants === undefined) throw new Error("The prior rule pack has no tax constants");

export const itr1Ay202627RulePackManifest20260911 = Object.freeze({
	...itr1Ay202627RulePackManifest20260910,
	rulePackId: "itr1-ay2026-27.2026-09-11",
	packRevision: "2026-09-11",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260910.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260910.missingFactQuestions ?? []),
		...questions,
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		loanInterestDeductions: Object.freeze({
			section80eEarliestFirstInterestPaymentDate: "2018-04-01",
			section80eCurrentFinancialYearEndDate: "2026-03-31",
			section80eeSanctionStartDate: "2016-04-01",
			section80eeSanctionEndDate: "2017-03-31",
			section80eeLimitWholeRupees: 50_000,
			section80eeLoanLimitWholeRupees: 3_500_000,
			section80eePropertyValueLimitWholeRupees: 5_000_000,
			section80eeaSanctionStartDate: "2019-04-01",
			section80eeaSanctionEndDate: "2022-03-31",
			section80eeaLimitWholeRupees: 150_000,
			section80eeaStampValueLimitWholeRupees: 4_500_000,
			section80eebSanctionStartDate: "2019-04-01",
			section80eebSanctionEndDate: "2023-03-31",
			section80eebLimitWholeRupees: 150_000,
			section80eEligibilityRuleId: rules.section80eEligibility.id,
			section80ePeriodRuleId: rules.section80ePeriod.id,
			section80eDetailsRuleId: rules.section80eDetails.id,
			section80eeEligibilityRuleId: rules.section80eeEligibility.id,
			section80eeLimitRuleId: rules.section80eeLimit.id,
			section80eeDetailsRuleId: rules.section80eeDetails.id,
			section80eeaEligibilityRuleId: rules.section80eeaEligibility.id,
			section80eeaLimitRuleId: rules.section80eeaLimit.id,
			section80eeaDetailsRuleId: rules.section80eeaDetails.id,
			section80eeMutualExclusionRuleId: rules.section80eeMutualExclusion.id,
			section80eebEligibilityRuleId: rules.section80eebEligibility.id,
			section80eebLimitRuleId: rules.section80eebLimit.id,
			section80eebDetailsRuleId: rules.section80eebDetails.id,
			newRegimeExclusionRuleId: rules.newRegimeExclusion.id,
		}),
	}),
}) satisfies RulePackManifest;
