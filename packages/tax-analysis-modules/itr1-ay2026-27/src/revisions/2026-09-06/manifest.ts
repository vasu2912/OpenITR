import type { RulePackManifest } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260905 } from "../2026-09-05/manifest";

const rules = Object.freeze({
	dividends: Object.freeze({
		id: "ITR1-OTHER-SOURCES-DIVIDENDS-SECTION-56",
		citation: "Income-tax Act, 1961, section 56, ordinary dividend income chargeable under Income from other sources",
		sourceId: "income-tax-act-1961",
		sourceLocation: "Section 56(1), read with dividend income",
	}),
	interest: Object.freeze({
		id: "ITR1-OTHER-SOURCES-INTEREST-SECTION-56",
		citation: "Income-tax Act, 1961, section 56, permitted interest outside the separately analyzed savings-account and deposit categories",
		sourceId: "income-tax-act-1961",
		sourceLocation: "Section 56(1)",
	}),
	familyPension: Object.freeze({
		id: "ITR1-OTHER-SOURCES-FAMILY-PENSION-SECTION-56",
		citation: "Income-tax Act, 1961, sections 56 and 57(iia), family pension chargeable under Income from other sources",
		sourceId: "income-tax-act-1961",
		sourceLocation: "Sections 56(1) and 57(iia), Explanation",
	}),
	oldFamilyPensionDeduction: Object.freeze({
		id: "ITR1-OR-FAMILY-PENSION-DEDUCTION-SECTION-57-IIA",
		citation: "Income-tax Act, 1961, section 57(iia), old-regime family-pension deduction of one-third subject to fifteen thousand rupees",
		sourceId: "income-tax-act-1961",
		sourceLocation: "Section 57(iia)",
	}),
	newFamilyPensionDeduction: Object.freeze({
		id: "ITR1-NR-FAMILY-PENSION-DEDUCTION-SECTION-57-IIA",
		citation: "Income-tax Act, 1961, section 57(iia) proviso, new-regime family-pension deduction of one-third subject to twenty-five thousand rupees",
		sourceId: "income-tax-act-1961",
		sourceLocation: "Section 57(iia), proviso for section 115BAC(1A)(ii)",
	}),
	total: Object.freeze({
		id: "ITR1-OTHER-SOURCES-TOTAL-SECTION-56",
		citation: "Notification No. 45/2026, Form ITR-1 Part B3, separate other-source amounts less the section 57(iia) family-pension deduction",
		sourceId: "cbdt-notification-45-2026",
		sourceLocation: "Form ITR-1 Part B3, Gazette page 17",
	}),
});

const result = Object.freeze({
	resultId: "other-sources",
	label: "Income from other sources analysis",
});

const question = ({
	id,
	prompt,
	helpText,
	rule,
	factKey,
}: Readonly<{
	id: string;
	prompt: string;
	helpText: string;
	rule: (typeof rules)["dividends" | "interest" | "familyPension"];
	factKey: string;
}>) => Object.freeze({
	id,
	prompt,
	helpText,
	requiresRuleId: rule.id,
	suppliesFactKey: factKey,
	whyRequired: `${rule.citation}, and no accepted evidence has supplied this category yet.`,
	affectedResult: result,
	answerSchema: Object.freeze({
		kind: "exact-money" as const,
		minimumWholeRupees: 0,
		maximumWholeRupees: null,
	}),
	visibility: Object.freeze({ kind: "always" as const }),
});

const priorConstants = itr1Ay202627RulePackManifest20260905.taxConstants;
if (priorConstants === undefined) throw new Error("The prior rule pack has no tax constants");

export const itr1Ay202627RulePackManifest20260906 = Object.freeze({
	...itr1Ay202627RulePackManifest20260905,
	rulePackId: "itr1-ay2026-27.2026-09-06",
	packRevision: "2026-09-06",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260905.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260905.missingFactQuestions ?? []),
		question({
			id: "other-sources-dividends",
			prompt: "How much ordinary dividend income did you receive in FY 2025-26?",
			helpText: "Enter the gross ordinary dividend amount before TDS. Enter zero if this category did not apply. Do not include special-rate income.",
			rule: rules.dividends,
			factKey: "non-salary-income.dividends",
		}),
		question({
			id: "other-sources-other-interest",
			prompt: "How much permitted interest outside savings accounts and deposits did you receive in FY 2025-26?",
			helpText: "Enter gross permitted interest, such as interest from an income-tax refund or other ordinary interest. Enter zero if none. Do not repeat savings-account or deposit interest.",
			rule: rules.interest,
			factKey: "non-salary-income.interest-other-than-securities",
		}),
		question({
			id: "other-sources-family-pension",
			prompt: "How much taxable family pension did you receive in FY 2025-26?",
			helpText: "Enter family pension before the section 57(iia) deduction. Enter zero if none. Do not include your own employment pension or exempt armed-forces family pension.",
			rule: rules.familyPension,
			factKey: "non-salary-income.family-pension",
		}),
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		otherSources: Object.freeze({
			familyPensionDeductionDivisor: 3,
			oldRegimeFamilyPensionDeductionLimitWholeRupees: 15000,
			newRegimeFamilyPensionDeductionLimitWholeRupees: 25000,
			dividendRuleId: rules.dividends.id,
			interestRuleId: rules.interest.id,
			familyPensionIncomeRuleId: rules.familyPension.id,
			oldRegimeFamilyPensionDeductionRuleId: rules.oldFamilyPensionDeduction.id,
			newRegimeFamilyPensionDeductionRuleId: rules.newFamilyPensionDeduction.id,
			totalRuleId: rules.total.id,
		}),
	}),
}) satisfies RulePackManifest;
