import type { RulePackManifest, RulePackManifestFactQuestionRecord } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260912 } from "../2026-09-12/manifest";

const act = "income-tax-act-1961";
const validation = "itr1-validation-rules-ay2026-27";
const notification = "cbdt-notification-45-2026";
const rule = (id: string, citation: string, sourceId: string, sourceLocation: string) => Object.freeze({ id, citation, sourceId, sourceLocation });
const rules = Object.freeze({
	section80tta: rule("ITR1-OR-80TTA", "AY 2026-27 validation limits section 80TTA to ten thousand rupees of savings-account interest for a non-senior taxpayer", validation, "Category A rules 11-13"),
	section80ttb: rule("ITR1-OR-80TTB", "AY 2026-27 validation limits section 80TTB to fifty thousand rupees of interest income for a senior citizen", validation, "Category A rules 14-16"),
	section80cch: rule("ITR1-80CCH", "AY 2026-27 validation caps section 80CCH at 46.2 percent of salary and requires Central Government employment and joining age from 17 to 27", validation, "Category A rules 186-187"),
	section80gg: rule("ITR1-OR-80GG", "Section 80GG allows the least of rent over ten percent of adjusted total income, twenty-five percent of that income, and the statutory monthly limit", act, "Section 80GG"),
	section80gga: rule("ITR1-OR-80GGA", "Section 80GGA permits qualifying scientific-research or rural-development contributions, with business-income and cash-payment restrictions", act, "Section 80GGA"),
	section80ggc: rule("ITR1-OR-80GGC", "Section 80GGC permits qualifying non-cash contributions to a political party or electoral trust, subject to the Chapter VI-A income limit", act, "Sections 80GGC and 80A(2)"),
	newRegimeExclusion: rule("ITR1-NR-REMAINING-DEDUCTION-EXCLUSIONS", "Section 115BAC excludes sections 80GG, 80GGA, 80GGC, 80TTA, and 80TTB under the new regime while preserving section 80CCH", act, "Section 115BAC(2)"),
	unsupportedOther: rule("ITR1-OTHER-DEDUCTION-UNSUPPORTED", "The notified ITR-1 has an e-filing-utility controlled other-deduction entry; OpenITR v1 accepts only its approved named catalog", notification, "Form ITR-1 Part C, item C1(r)"),
});

type Visibility = NonNullable<RulePackManifestFactQuestionRecord["visibility"]>;
const always = Object.freeze({ kind: "always" as const });
const visibleWhen = (factKey: string): Visibility => Object.freeze({ kind: "fact-boolean-equals", factKey, value: true });
const booleanSchema = Object.freeze({ kind: "boolean" as const });
const amountSchema = Object.freeze({ kind: "exact-money" as const, minimumWholeRupees: 0, maximumWholeRupees: null });
const result = Object.freeze({ resultId: "remaining-deductions", label: "Deposit-interest and remaining deductions" });
const question = (id: string, prompt: string, helpText: string, factKey: string, requiresRuleId: string, visibility: Visibility = always, answerSchema: RulePackManifestFactQuestionRecord["answerSchema"] = booleanSchema): RulePackManifestFactQuestionRecord => Object.freeze({
	id, prompt, helpText, requiresRuleId, suppliesFactKey: factKey,
	whyRequired: "This deduction result cannot be derived while the fact is unknown. A blank answer is not No or zero.",
	affectedResult: result, answerSchema, visibility,
});

const questions: readonly RulePackManifestFactQuestionRecord[] = [
	question("taxpayer-senior-citizen", "Were you a resident senior citizen for FY 2025-26?", "Answer from your explicit taxpayer category. OpenITR does not infer this from another age fact.", "taxpayer.senior-citizen", rules.section80ttb.id),
	question("deduction-80cch-present", "Do you want to analyze an Agniveer Corpus Fund deduction under section 80CCH?", "Answer Yes only for an account covered by section 80CCH.", "deductions.80cch-present", rules.section80cch.id),
	question("deduction-80cch-eligible", "Were you enrolled under the Agnipath Scheme and subscribed to the notified Agniveer Corpus Fund?", "Confirm the statutory taxpayer and account category.", "deductions.80cch-agniveer-eligible", rules.section80cch.id, visibleWhen("deductions.80cch-present")),
	question("deduction-80cch-age", "Were you aged 17 to 27 years when you joined the armed forces under the scheme?", "AY 2026-27 validation requires this explicit joining-age condition.", "deductions.80cch-joining-age-eligible", rules.section80cch.id, visibleWhen("deductions.80cch-present")),
	question("deduction-80cch-employer", "Was the related employment with the Central Government?", "AY 2026-27 validation requires the Central Government employment category.", "deductions.80cch-central-government-employee", rules.section80cch.id, visibleWhen("deductions.80cch-present")),
	question("deduction-80cch-taxpayer-contribution", "How much did you contribute to the Agniveer Corpus Fund?", "Enter your FY 2025-26 contribution.", "deductions.80cch-taxpayer-contribution", rules.section80cch.id, visibleWhen("deductions.80cch-present"), amountSchema),
	question("deduction-80cch-government-contribution", "How much did the Central Government contribute to the fund for you?", "Enter the FY 2025-26 government contribution.", "deductions.80cch-government-contribution", rules.section80cch.id, visibleWhen("deductions.80cch-present"), amountSchema),
	question("deduction-80cch-salary", "What was your salary under section 17(1) for the 80CCH validation limit?", "OpenITR applies the pinned salary-percentage validation limit.", "deductions.80cch-salary-section-17-1", rules.section80cch.id, visibleWhen("deductions.80cch-present"), amountSchema),
	question("deduction-80cch-details", "Are the Agniveer account and contribution details available?", "Keep the account and contribution evidence for review.", "deductions.80cch-details-available", rules.section80cch.id, visibleWhen("deductions.80cch-present")),
	question("deduction-80gg-present", "Do you want to analyze rent paid under section 80GG?", "Use this only when you did not receive house-rent allowance.", "deductions.80gg-present", rules.section80gg.id),
	question("deduction-80gg-rent", "How much rent did you pay during FY 2025-26?", "Enter the eligible residential rent paid for the year.", "deductions.80gg-rent-paid", rules.section80gg.id, visibleWhen("deductions.80gg-present"), amountSchema),
	question("deduction-80gg-income", "What is adjusted total income before section 80GG?", "Use the statutory section 80GG income base before this deduction.", "deductions.80gg-adjusted-total-income", rules.section80gg.id, visibleWhen("deductions.80gg-present"), amountSchema),
	question("deduction-80gg-hra", "Did you receive house-rent allowance during FY 2025-26?", "Receiving HRA prevents this section 80GG claim.", "deductions.80gg-hra-received", rules.section80gg.id, visibleWhen("deductions.80gg-present")),
	question("deduction-80gg-property", "Did you, your spouse, or minor child own residential accommodation that disqualifies this claim?", "Apply the ownership conditions in section 80GG.", "deductions.80gg-disqualifying-property", rules.section80gg.id, visibleWhen("deductions.80gg-present")),
	question("deduction-80gg-form10ba", "Are the details required for Form 10BA available?", "The AY 2026-27 validation rules require the declaration details.", "deductions.80gg-form-10ba-details", rules.section80gg.id, visibleWhen("deductions.80gg-present")),
	question("deduction-80gga-present", "Do you want to analyze a contribution under section 80GGA?", "Use this for a qualifying scientific-research or rural-development contribution.", "deductions.80gga-present", rules.section80gga.id),
	question("deduction-80gga-amount", "How much did you contribute under section 80GGA?", "Enter the FY 2025-26 contribution.", "deductions.80gga-amount", rules.section80gga.id, visibleWhen("deductions.80gga-present"), amountSchema),
	question("deduction-80gga-purpose", "Was the recipient and purpose eligible under section 80GGA?", "Confirm the prescribed recipient and qualifying purpose.", "deductions.80gga-eligible-purpose", rules.section80gga.id, visibleWhen("deductions.80gga-present")),
	question("deduction-80gga-business", "Did your gross total income include profits and gains of business or profession?", "Section 80GGA is unavailable when this income head is included.", "deductions.80gga-business-income", rules.section80gga.id, visibleWhen("deductions.80gga-present")),
	question("deduction-80gga-cash", "Was the contribution paid in cash?", "Cash above the pinned limit is not deductible.", "deductions.80gga-cash-payment", rules.section80gga.id, visibleWhen("deductions.80gga-present")),
	question("deduction-80gga-details", "Are the recipient and contribution details available?", "Schedule 80GGA requires recipient and payment details.", "deductions.80gga-details-available", rules.section80gga.id, visibleWhen("deductions.80gga-present")),
	question("deduction-80ggc-present", "Do you want to analyze a political contribution under section 80GGC?", "Use this only for an eligible political party or electoral trust.", "deductions.80ggc-present", rules.section80ggc.id),
	question("deduction-80ggc-amount", "How much did you contribute under section 80GGC?", "Enter the FY 2025-26 contribution.", "deductions.80ggc-amount", rules.section80ggc.id, visibleWhen("deductions.80ggc-present"), amountSchema),
	question("deduction-80ggc-recipient", "Was the recipient an eligible political party or electoral trust?", "Confirm the recipient category before relying on the deduction.", "deductions.80ggc-eligible-recipient", rules.section80ggc.id, visibleWhen("deductions.80ggc-present")),
	question("deduction-80ggc-cash", "Was the contribution paid in cash?", "Section 80GGC excludes cash contributions.", "deductions.80ggc-cash-payment", rules.section80ggc.id, visibleWhen("deductions.80ggc-present")),
	question("deduction-80ggc-date", "Was the contribution made between 1 April 2025 and 31 March 2026?", "AY 2026-27 validation requires the contribution to fall within FY 2025-26.", "deductions.80ggc-date-within-financial-year", rules.section80ggc.id, visibleWhen("deductions.80ggc-present")),
	question("deduction-80ggc-gti", "What is your gross total income for the section 80GGC limit?", "The eligible contribution cannot exceed gross total income.", "deductions.80ggc-gross-total-income", rules.section80ggc.id, visibleWhen("deductions.80ggc-present"), amountSchema),
	question("deduction-80ggc-details", "Are the recipient and transaction details available?", "Schedule 80GGC requires political-party or electoral-trust and payment details.", "deductions.80ggc-details-available", rules.section80ggc.id, visibleWhen("deductions.80ggc-present")),
	question("deduction-other-present", "Do you need a Chapter VI-A deduction not named in this questionnaire?", "OpenITR v1 deliberately does not accept a generic free-form deduction amount.", "deductions.other-present", rules.unsupportedOther.id),
];

const priorConstants = itr1Ay202627RulePackManifest20260912.taxConstants;
if (priorConstants === undefined) throw new Error("The prior rule pack has no tax constants");

export const itr1Ay202627RulePackManifest20260913 = Object.freeze({
	...itr1Ay202627RulePackManifest20260912,
	rulePackId: "itr1-ay2026-27.2026-09-13",
	packRevision: "2026-09-13",
	supportedRules: Object.freeze([...itr1Ay202627RulePackManifest20260912.supportedRules, ...Object.values(rules)]),
	missingFactQuestions: Object.freeze([...(itr1Ay202627RulePackManifest20260912.missingFactQuestions ?? []), ...questions]),
	taxConstants: Object.freeze({
		...priorConstants,
		remainingDeductions: Object.freeze({
			section80ttaLimitWholeRupees: 10_000,
			section80ttbLimitWholeRupees: 50_000,
			section80cchSalaryLimitBasisPoints: 4_620,
			section80ggAnnualLimitWholeRupees: 60_000,
			section80ggRentReductionPercent: 10,
			section80ggIncomeLimitPercent: 25,
			section80ggaCashPaymentLimitWholeRupees: 2_000,
			section80ttaRuleId: rules.section80tta.id,
			section80ttbRuleId: rules.section80ttb.id,
			section80cchRuleId: rules.section80cch.id,
			section80ggRuleId: rules.section80gg.id,
			section80ggaRuleId: rules.section80gga.id,
			section80ggcRuleId: rules.section80ggc.id,
			newRegimeExclusionRuleId: rules.newRegimeExclusion.id,
			unsupportedOtherRuleId: rules.unsupportedOther.id,
		}),
	}),
}) satisfies RulePackManifest;
