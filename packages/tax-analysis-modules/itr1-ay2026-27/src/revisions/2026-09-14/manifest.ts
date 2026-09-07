import type {
	RulePackManifest,
	RulePackManifestFactQuestionRecord,
} from "@openitr/model";

import { itr1Ay202627RulePackManifest20260913 } from "../2026-09-13/manifest";

const financeAct = "finance-act-2025";
const act = "income-tax-act-1961";
const validation = "itr1-validation-rules-ay2026-27";
const notification = "cbdt-notification-45-2026";
const rule = (
	id: string,
	citation: string,
	sourceId: string,
	sourceLocation: string,
) => Object.freeze({ id, citation, sourceId, sourceLocation });

const rules = Object.freeze({
	slabs: rule(
		"ITR1-OR-SLAB-TAX",
		"Finance Act 2025 First Schedule applies the old-regime individual rates for AY 2026-27 by resident age category",
		financeAct,
		"First Schedule, Part III, Paragraph A",
	),
	standardDeduction: rule(
		"ITR1-OR-STANDARD-DEDUCTION-16IA",
		"AY 2026-27 ITR-1 validation limits the old-regime section 16(ia) standard deduction to fifty thousand rupees",
		validation,
		"Category A rule 112",
	),
	housePropertyLossSetoff: rule(
		"ITR1-OR-HOUSE-PROPERTY-LOSS-SETOFF",
		"Section 71 limits current-year house-property loss set off against other heads to two lakh rupees",
		act,
		"Section 71(3A)",
	),
	itr1TotalIncomeLimit: rule(
		"ITR1-OR-ITR1-TOTAL-INCOME-LIMIT",
		"The notified AY 2026-27 ITR-1 limits total income, including permitted section 112A gains, to fifty lakh rupees",
		notification,
		"Form ITR-1 heading, Gazette page 16; Part C item C2, Gazette page 18",
	),
	incomeAggregation: rule(
		"ITR1-OR-INCOME-AGGREGATION",
		"AY 2026-27 ITR-1 validation reconciles old-regime gross total income to salary, house property, other sources, and section 112A gain",
		validation,
		"Category A rules 22 and 292",
	),
	deductionLimit: rule(
		"ITR1-OR-CHAPTER-VIA-LIMIT",
		"AY 2026-27 ITR-1 validation limits Chapter VI-A deductions to gross total income and excludes deduction against section 112A gain",
		validation,
		"Category A rules 17, 18, and 24",
	),
	rebate: rule(
		"ITR1-OR-REBATE-SECTION-87A",
		"Section 87A allows a resident individual with total income up to five lakh rupees a rebate limited to twelve thousand five hundred rupees",
		act,
		"Section 87A, main provision",
	),
	surcharge: rule(
		"ITR1-OR-SURCHARGE",
		"Finance Act 2025 applies no surcharge until total income exceeds fifty lakh rupees",
		financeAct,
		"First Schedule, Part III, Paragraph A surcharge provisions",
	),
	surchargeMarginalRelief: rule(
		"ITR1-OR-SURCHARGE-MARGINAL-RELIEF",
		"Finance Act 2025 provides marginal relief when total income crosses a surcharge threshold",
		financeAct,
		"First Schedule, Part III, Paragraph A surcharge marginal-relief provisos",
	),
	cess: rule(
		"ITR1-OR-CESS",
		"Finance Act 2025 applies health and education cess at four per cent of income-tax and surcharge",
		financeAct,
		"Health and education cess provision",
	),
});

const superSeniorQuestion = Object.freeze({
	id: "taxpayer-super-senior-citizen",
	prompt: "Were you aged 80 years or older at any time during FY 2025-26?",
	helpText:
		"The old-regime basic exemption differs for resident individuals aged 80 years or older.",
	requiresRuleId: rules.slabs.id,
	suppliesFactKey: "taxpayer.super-senior-citizen",
	whyRequired:
		"The old-regime slab result cannot be derived until the applicable resident age category is known.",
	affectedResult: Object.freeze({
		resultId: "old-regime-computation",
		label: "Old-regime computation",
	}),
	answerSchema: Object.freeze({ kind: "boolean" as const }),
	visibility: Object.freeze({
		kind: "fact-boolean-equals" as const,
		factKey: "taxpayer.senior-citizen",
		value: true,
	}),
}) satisfies RulePackManifestFactQuestionRecord;

const priorConstants = itr1Ay202627RulePackManifest20260913.taxConstants;
if (priorConstants === undefined) {
	throw new Error("The prior rule pack has no tax constants");
}

export const itr1Ay202627RulePackManifest20260914 = Object.freeze({
	...itr1Ay202627RulePackManifest20260913,
	rulePackId: "itr1-ay2026-27.2026-09-14",
	packRevision: "2026-09-14",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260913.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260913.missingFactQuestions ?? []),
		superSeniorQuestion,
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		oldRegime: Object.freeze({
			slabBandsByAge: Object.freeze({
				"under-60": Object.freeze([
					{ upperBoundWholeRupees: 250_000, ratePercent: 0 },
					{ upperBoundWholeRupees: 500_000, ratePercent: 5 },
					{ upperBoundWholeRupees: 1_000_000, ratePercent: 20 },
					{ upperBoundWholeRupees: null, ratePercent: 30 },
				] as const),
				"60-to-79": Object.freeze([
					{ upperBoundWholeRupees: 300_000, ratePercent: 0 },
					{ upperBoundWholeRupees: 500_000, ratePercent: 5 },
					{ upperBoundWholeRupees: 1_000_000, ratePercent: 20 },
					{ upperBoundWholeRupees: null, ratePercent: 30 },
				] as const),
				"80-or-older": Object.freeze([
					{ upperBoundWholeRupees: 500_000, ratePercent: 0 },
					{ upperBoundWholeRupees: 1_000_000, ratePercent: 20 },
					{ upperBoundWholeRupees: null, ratePercent: 30 },
				] as const),
			}),
			slabRuleId: rules.slabs.id,
			standardDeductionWholeRupees: 50_000,
			standardDeductionRuleId: rules.standardDeduction.id,
			housePropertyLossSetoffLimitWholeRupees: 200_000,
			housePropertyLossSetoffRuleId: rules.housePropertyLossSetoff.id,
			itr1TotalIncomeLimitWholeRupees: 5_000_000,
			itr1TotalIncomeLimitRuleId: rules.itr1TotalIncomeLimit.id,
			rebateMaxTotalIncomeWholeRupees: 500_000,
			rebateMaxAmountWholeRupees: 12_500,
			rebateRuleId: rules.rebate.id,
			surchargeThresholdWholeRupees: 5_000_000,
			surchargeRuleId: rules.surcharge.id,
			surchargeMarginalReliefRuleId: rules.surchargeMarginalRelief.id,
			cessRatePercent: 4,
			cessRuleId: rules.cess.id,
			totalIncomeRoundingBaseWholeRupees: 10,
			totalIncomeRoundingRuleId: "ITR1-TOTAL-INCOME-ROUNDING-288A",
			taxRoundingBaseWholeRupees: 10,
			taxRoundingRuleId: "ITR1-TAX-ROUNDING-288B",
			incomeAggregationRuleId: rules.incomeAggregation.id,
			deductionLimitRuleId: rules.deductionLimit.id,
			section112aTaxRuleId: "ITR1-SECTION112A-TAX",
			agriculturalIncomeRuleId: "ITR1-AGRICULTURAL-INCOME-EXEMPT-REPORTING",
		}),
	}),
}) satisfies RulePackManifest;
