import type { RulePackManifest, RulePackManifestFactQuestionRecord } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260904 } from "../2026-09-04/manifest";

const letOutGrossAnnualValueRule = Object.freeze({
	id: "ITR1-LET-OUT-GROSS-ANNUAL-VALUE-SECTION-23",
	citation: "Income-tax Act, 1961, section 23(1), expected rent, actual rent, and vacancy determine gross annual value",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Section 23(1)(a) to (c)",
});

const letOutMunicipalTaxRule = Object.freeze({
	id: "ITR1-LET-OUT-MUNICIPAL-TAX-SECTION-23",
	citation: "Income-tax Act, 1961, section 23(1), owner-borne local-authority taxes are deducted in the year actually paid",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Section 23(1), first proviso",
});

const letOutStandardDeductionRule = Object.freeze({
	id: "ITR1-LET-OUT-STANDARD-DEDUCTION-SECTION-24A",
	citation: "Income-tax Act, 1961, section 24(a), deduction equal to thirty per cent of annual value",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Section 24(a)",
});

const letOutInterestRule = Object.freeze({
	id: "ITR1-LET-OUT-INTEREST-SECTION-24B",
	citation: "Income-tax Act, 1961, section 24(b), interest payable on capital borrowed for acquisition, construction, repair, renewal, or reconstruction",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Section 24(b)",
});

const selfOccupiedAnnualValueRuleId = "ITR1-SELF-OCCUPIED-ANNUAL-VALUE-SECTION-23";
const selfOccupiedInterestRuleId = "ITR1-OR-SELF-OCCUPIED-INTEREST-SECTION-24B";
const selfOccupiedNewRegimeRuleId = "ITR1-NR-SELF-OCCUPIED-INTEREST-DISALLOWED-115BAC";

const questionsForProperty = (
	propertyNumber: 1 | 2,
): readonly RulePackManifestFactQuestionRecord[] => {
	const prefix = `house-property.${propertyNumber}`;
	const result = Object.freeze({
		resultId: `house-property-${propertyNumber}`,
		label: `House-property analysis for property ${propertyNumber}`,
	});
	const question = (
		record: Omit<RulePackManifestFactQuestionRecord, "affectedResult">,
	): RulePackManifestFactQuestionRecord => Object.freeze({ ...record, affectedResult: result });
	return Object.freeze([
		question({
			id: `house-property-${propertyNumber}-owned-by-taxpayer`,
			prompt: `Did you own property ${propertyNumber} during FY 2025-26?`,
			helpText: "Answer Yes for sole or joint ownership. Enter only amounts attributable to your ownership share in the later questions.",
			requiresRuleId: selfOccupiedAnnualValueRuleId,
			suppliesFactKey: `${prefix}.owned-by-taxpayer`,
			whyRequired: "Sections 22 and 23 apply house-property income to the owner.",
			answerSchema: { kind: "boolean" },
			visibility: { kind: "always" },
		}),
		question({
			id: `house-property-${propertyNumber}-self-occupied`,
			prompt: `Was property ${propertyNumber} self-occupied throughout FY 2025-26?`,
			helpText: "Answer No if the property was let for any part of the year or treated as deemed let-out.",
			requiresRuleId: selfOccupiedAnnualValueRuleId,
			suppliesFactKey: `${prefix}.self-occupied-throughout-year`,
			whyRequired: "Section 23 applies different annual-value rules to self-occupied and let-out property.",
			answerSchema: { kind: "boolean" },
			visibility: { kind: "fact-boolean-equals", factKey: `${prefix}.owned-by-taxpayer`, value: true },
		}),
		question({
			id: `house-property-${propertyNumber}-interest`,
			prompt: `How much interest on borrowed capital was payable for property ${propertyNumber} in FY 2025-26?`,
			helpText: "Enter the interest attributable to your ownership share, not principal repayment.",
			requiresRuleId: letOutInterestRule.id,
			suppliesFactKey: `${prefix}.interest-on-borrowed-capital`,
			whyRequired: "Section 24(b) bases the deduction on interest payable on eligible borrowed capital.",
			answerSchema: { kind: "exact-money", minimumWholeRupees: 0, maximumWholeRupees: null },
			visibility: { kind: "fact-boolean-equals", factKey: `${prefix}.owned-by-taxpayer`, value: true },
		}),
		question({
			id: `house-property-${propertyNumber}-expected-rent`,
			prompt: `What was the reasonable expected rent for property ${propertyNumber} in FY 2025-26?`,
			helpText: "Use the higher of municipal value and fair rent, capped at standard rent when rent control applies, for your ownership share.",
			requiresRuleId: letOutGrossAnnualValueRule.id,
			suppliesFactKey: `${prefix}.expected-rent`,
			whyRequired: "Section 23 compares reasonable expected rent with actual rent when it derives gross annual value.",
			answerSchema: { kind: "exact-money", minimumWholeRupees: 0, maximumWholeRupees: null },
			visibility: { kind: "fact-boolean-equals", factKey: `${prefix}.self-occupied-throughout-year`, value: false },
		}),
		question({
			id: `house-property-${propertyNumber}-actual-rent`,
			prompt: `What rent was received or receivable for property ${propertyNumber} in FY 2025-26?`,
			helpText: "Enter rent for your ownership share before deducting municipal taxes.",
			requiresRuleId: letOutGrossAnnualValueRule.id,
			suppliesFactKey: `${prefix}.actual-rent`,
			whyRequired: "Section 23 uses actual rent when it exceeds expected rent or vacancy reduced the rent.",
			answerSchema: { kind: "exact-money", minimumWholeRupees: 0, maximumWholeRupees: null },
			visibility: { kind: "fact-boolean-equals", factKey: `${prefix}.self-occupied-throughout-year`, value: false },
		}),
		question({
			id: `house-property-${propertyNumber}-vacancy-reduced-rent`,
			prompt: `Was actual rent for property ${propertyNumber} below expected rent because it was vacant?`,
			helpText: "Answer Yes only when vacancy during the year caused the lower actual rent.",
			requiresRuleId: letOutGrossAnnualValueRule.id,
			suppliesFactKey: `${prefix}.vacancy-reduced-rent`,
			whyRequired: "Section 23(1)(c) permits actual rent below expected rent when vacancy caused the shortfall.",
			answerSchema: { kind: "boolean" },
			visibility: { kind: "fact-boolean-equals", factKey: `${prefix}.self-occupied-throughout-year`, value: false },
		}),
		question({
			id: `house-property-${propertyNumber}-municipal-taxes`,
			prompt: `How much municipal tax did you bear and actually pay for property ${propertyNumber} in FY 2025-26?`,
			helpText: "Exclude tax paid by a tenant and amounts that remained unpaid at year end.",
			requiresRuleId: letOutMunicipalTaxRule.id,
			suppliesFactKey: `${prefix}.municipal-taxes-paid`,
			whyRequired: "Section 23 permits only owner-borne municipal tax actually paid during the year.",
			answerSchema: { kind: "exact-money", minimumWholeRupees: 0, maximumWholeRupees: null },
			visibility: { kind: "fact-boolean-equals", factKey: `${prefix}.self-occupied-throughout-year`, value: false },
		}),
		...[
			{
				id: `house-property-${propertyNumber}-acquisition-or-construction`,
				prompt: `Was the loan for property ${propertyNumber} used to acquire or construct it?`,
				helpText: "Answer No for repair, renewal, or reconstruction borrowing.",
				suppliesFactKey: `${prefix}.loan-for-acquisition-or-construction`,
				visibility: { kind: "fact-boolean-equals" as const, factKey: `${prefix}.self-occupied-throughout-year`, value: true },
			},
			{
				id: `house-property-${propertyNumber}-loan-date`,
				prompt: `Was capital for property ${propertyNumber} borrowed on or after 1 April 1999?`,
				helpText: "Check the original loan sanction or disbursement record.",
				suppliesFactKey: `${prefix}.loan-on-or-after-1999-04-01`,
				visibility: { kind: "fact-boolean-equals" as const, factKey: `${prefix}.loan-for-acquisition-or-construction`, value: true },
			},
			{
				id: `house-property-${propertyNumber}-completion-period`,
				prompt: `Was property ${propertyNumber} acquired or constructed within the section 24(b) five-year period?`,
				helpText: "Measure five years from the end of the financial year in which the capital was borrowed.",
				suppliesFactKey: `${prefix}.completed-within-five-years`,
				visibility: { kind: "fact-boolean-equals" as const, factKey: `${prefix}.loan-on-or-after-1999-04-01`, value: true },
			},
			{
				id: `house-property-${propertyNumber}-interest-certificate`,
				prompt: `Do you have the lender's interest certificate for property ${propertyNumber}?`,
				helpText: "The certificate should identify interest payable on the borrowed capital.",
				suppliesFactKey: `${prefix}.interest-certificate-available`,
				visibility: { kind: "fact-boolean-equals" as const, factKey: `${prefix}.completed-within-five-years`, value: true },
			},
		].map((record) => question({
			...record,
			requiresRuleId: selfOccupiedInterestRuleId,
			whyRequired: "Section 24(b) uses this fact to determine the shared self-occupied interest limit.",
			answerSchema: { kind: "boolean" as const },
		})),
	]);
};

const priorConstants = itr1Ay202627RulePackManifest20260904.taxConstants;
if (priorConstants === undefined) throw new Error("The prior rule pack has no tax constants");

export const itr1Ay202627RulePackManifest20260905 = Object.freeze({
	...itr1Ay202627RulePackManifest20260904,
	rulePackId: "itr1-ay2026-27.2026-09-05",
	packRevision: "2026-09-05",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260904.supportedRules,
		letOutGrossAnnualValueRule,
		letOutMunicipalTaxRule,
		letOutStandardDeductionRule,
		letOutInterestRule,
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260904.missingFactQuestions ?? []),
		...questionsForProperty(1),
		...questionsForProperty(2),
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		houseProperty: Object.freeze({
			selfOccupiedEnhancedInterestLimitWholeRupees: 200000,
			selfOccupiedBasicInterestLimitWholeRupees: 30000,
			letOutStandardDeductionPercent: 30,
			selfOccupiedAnnualValueRuleId,
			selfOccupiedOldRegimeInterestRuleId: selfOccupiedInterestRuleId,
			selfOccupiedNewRegimeInterestRuleId: selfOccupiedNewRegimeRuleId,
			letOutGrossAnnualValueRuleId: letOutGrossAnnualValueRule.id,
			letOutMunicipalTaxRuleId: letOutMunicipalTaxRule.id,
			letOutStandardDeductionRuleId: letOutStandardDeductionRule.id,
			letOutInterestRuleId: letOutInterestRule.id,
		}),
	}),
}) satisfies RulePackManifest;
