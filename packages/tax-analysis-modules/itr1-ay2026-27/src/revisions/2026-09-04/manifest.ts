import type { RulePackManifest } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260903 } from "../2026-09-03/manifest";

const annualValueRule = Object.freeze({
	id: "ITR1-SELF-OCCUPIED-ANNUAL-VALUE-SECTION-23",
	citation:
		"Income-tax Act, 1961, section 23(2), annual value of a self-occupied house property is nil",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Section 23(2)",
});

const oldRegimeInterestRule = Object.freeze({
	id: "ITR1-OR-SELF-OCCUPIED-INTEREST-SECTION-24B",
	citation:
		"Income-tax Act, 1961, section 24(b), self-occupied borrowed-capital interest limits of two lakh rupees or thirty thousand rupees, as applicable",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Section 24(b) and its provisos",
});

const newRegimeInterestRule = Object.freeze({
	id: "ITR1-NR-SELF-OCCUPIED-INTEREST-DISALLOWED-115BAC",
	citation:
		"Income-tax Act, 1961, section 115BAC(2), section 24(b) deduction is unavailable for a self-occupied property in the new regime",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Section 115BAC(2), reference to section 24(b)",
});

export const itr1Ay202627RulePackManifest20260904 = Object.freeze({
	...itr1Ay202627RulePackManifest20260903,
	rulePackId: "itr1-ay2026-27.2026-09-04",
	packRevision: "2026-09-04",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260903.supportedRules,
		annualValueRule,
		oldRegimeInterestRule,
		newRegimeInterestRule,
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260903.missingFactQuestions ?? []),
		Object.freeze({
			id: "house-property-owned-by-taxpayer",
			prompt: "Did you own the self-occupied property during FY 2025-26?",
			helpText: "Answer Yes only for a property owned by you during the year.",
			requiresRuleId: annualValueRule.id,
			suppliesFactKey: "house-property.self-occupied.owned-by-taxpayer",
			whyRequired:
				"Section 23 applies the self-occupied annual-value rule to an owner, so ownership must be confirmed.",
			affectedResult: Object.freeze({
				resultId: "self-occupied-house-property",
				label: "Self-occupied house-property analysis",
			}),
			answerSchema: Object.freeze({ kind: "boolean" }),
			visibility: Object.freeze({ kind: "always" }),
		}),
		Object.freeze({
			id: "house-property-self-occupied-throughout-year",
			prompt: "Was the property self-occupied throughout FY 2025-26?",
			helpText: "Answer No if it was let out for any part of the year.",
			requiresRuleId: annualValueRule.id,
			suppliesFactKey: "house-property.self-occupied.used-throughout-year",
			whyRequired:
				"Section 23(2) sets annual value to nil only when the property qualifies as self-occupied.",
			affectedResult: Object.freeze({
				resultId: "self-occupied-house-property",
				label: "Self-occupied house-property analysis",
			}),
			answerSchema: Object.freeze({ kind: "boolean" }),
			visibility: Object.freeze({
				kind: "fact-boolean-equals",
				factKey: "house-property.self-occupied.owned-by-taxpayer",
				value: true,
			}),
		}),
		Object.freeze({
			id: "house-property-interest-on-borrowed-capital",
			prompt: "How much interest on borrowed capital was payable for this property in FY 2025-26?",
			helpText: "Use the interest amount, not the principal repayment.",
			requiresRuleId: oldRegimeInterestRule.id,
			suppliesFactKey: "house-property.self-occupied.interest-on-borrowed-capital",
			whyRequired:
				"Section 24(b) bases the old-regime deduction on eligible interest payable on borrowed capital.",
			affectedResult: Object.freeze({
				resultId: "self-occupied-house-property",
				label: "Self-occupied house-property analysis",
			}),
			answerSchema: Object.freeze({
				kind: "exact-money",
				minimumWholeRupees: 0,
				maximumWholeRupees: null,
			}),
			visibility: Object.freeze({
				kind: "fact-boolean-equals",
				factKey: "house-property.self-occupied.used-throughout-year",
				value: true,
			}),
		}),
		...[
			{
				id: "house-property-loan-for-acquisition-or-construction",
				prompt: "Was the loan used to acquire or construct the property?",
				helpText: "Answer No for repair, renewal, or reconstruction borrowing.",
				suppliesFactKey: "house-property.self-occupied.loan-for-acquisition-or-construction",
				visibility: {
					kind: "fact-money-greater-than" as const,
					factKey: "house-property.self-occupied.interest-on-borrowed-capital",
					wholeRupees: 0,
				},
			},
			{
				id: "house-property-loan-on-or-after-1999-04-01",
				prompt: "Was the capital borrowed on or after 1 April 1999?",
				helpText: "Check the loan sanction or first-disbursement records.",
				suppliesFactKey: "house-property.self-occupied.loan-on-or-after-1999-04-01",
				visibility: {
					kind: "fact-boolean-equals" as const,
					factKey: "house-property.self-occupied.loan-for-acquisition-or-construction",
					value: true,
				},
			},
			{
				id: "house-property-completed-within-five-years",
				prompt: "Was acquisition or construction completed within five years from the end of the financial year in which the capital was borrowed?",
				helpText: "Use the completion or possession records and the original borrowing date.",
				suppliesFactKey: "house-property.self-occupied.completed-within-five-years",
				visibility: {
					kind: "fact-boolean-equals" as const,
					factKey: "house-property.self-occupied.loan-on-or-after-1999-04-01",
					value: true,
				},
			},
			{
				id: "house-property-interest-certificate-available",
				prompt: "Do you have the lender's certificate for the interest payable?",
				helpText: "The certificate should identify the interest payable on the borrowed capital.",
				suppliesFactKey: "house-property.self-occupied.interest-certificate-available",
				visibility: {
					kind: "fact-boolean-equals" as const,
					factKey: "house-property.self-occupied.completed-within-five-years",
					value: true,
				},
			},
		].map((question) =>
			Object.freeze({
				...question,
				requiresRuleId: oldRegimeInterestRule.id,
				whyRequired:
					"Section 24(b) uses this condition to determine whether the enhanced two-lakh-rupee limit applies.",
				affectedResult: Object.freeze({
					resultId: "self-occupied-house-property",
					label: "Self-occupied house-property analysis",
				}),
				answerSchema: Object.freeze({ kind: "boolean" as const }),
				visibility: Object.freeze(question.visibility),
			}),
		),
	]),
	taxConstants: Object.freeze({
		newRegime:
			itr1Ay202627RulePackManifest20260903.taxConstants?.newRegime ??
			(() => {
				throw new Error("The prior rule-pack revision has no new-regime constants");
			})(),
		selfOccupiedHouseProperty: Object.freeze({
			enhancedInterestLimitWholeRupees: 200000,
			basicInterestLimitWholeRupees: 30000,
			annualValueRuleId: annualValueRule.id,
			oldRegimeInterestRuleId: oldRegimeInterestRule.id,
			newRegimeInterestRuleId: newRegimeInterestRule.id,
		}),
	}),
}) satisfies RulePackManifest;
