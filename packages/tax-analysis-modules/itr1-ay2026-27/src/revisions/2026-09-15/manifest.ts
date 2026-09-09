import type { RulePackManifest } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260914 } from "../2026-09-14/manifest";

const act = "income-tax-act-1961";
const validation = "itr1-validation-rules-ay2026-27";
const rule = (
	id: string,
	citation: string,
	sourceId: string,
	sourceLocation: string,
) => Object.freeze({ id, citation, sourceId, sourceLocation });

const rules = Object.freeze({
	incomeAggregation: rule(
		"ITR1-NR-COMPLETE-INCOME-AGGREGATION",
		"AY 2026-27 ITR-1 validation reconciles new-regime gross total income to salary, positive house-property income, other sources, and permitted section 112A gain",
		validation,
		"Category A rules 160 and 174",
	),
	housePropertyLossSetoff: rule(
		"ITR1-NR-HOUSE-PROPERTY-LOSS-SETOFF-EXCLUDED",
		"Section 115BAC prevents a house-property loss from being set off against another head under the new regime",
		act,
		"Section 115BAC(2)(ii)(b)",
	),
	itr1NormalRateIncomeLimit: rule(
		"ITR1-NR-ITR1-NORMAL-RATE-INCOME-LIMIT",
		"AY 2026-27 ITR-1 validation limits total income excluding the permitted section 112A gain to fifty lakh rupees",
		validation,
		"Category A rule 117",
	),
	deductionComposition: rule(
		"ITR1-NR-COMPLETE-DEDUCTION-COMPOSITION",
		"Section 115BAC and AY 2026-27 ITR-1 validation retain only the approved new-regime Chapter VI-A deductions",
		validation,
		"Category A rules 151 to 159, 186, and 216",
	),
});

const priorConstants = itr1Ay202627RulePackManifest20260914.taxConstants;
if (priorConstants === undefined) {
	throw new Error("The prior rule pack has no tax constants");
}

export const itr1Ay202627RulePackManifest20260915 = Object.freeze({
	...itr1Ay202627RulePackManifest20260914,
	rulePackId: "itr1-ay2026-27.2026-09-15",
	packRevision: "2026-09-15",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260914.supportedRules,
		...Object.values(rules),
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		newRegime: Object.freeze({
			...priorConstants.newRegime,
			completeComputation: Object.freeze({
				itr1NormalRateIncomeLimitWholeRupees: 5_000_000,
				itr1NormalRateIncomeLimitRuleId:
					rules.itr1NormalRateIncomeLimit.id,
				incomeAggregationRuleId: rules.incomeAggregation.id,
				housePropertyLossSetoffRuleId: rules.housePropertyLossSetoff.id,
				deductionCompositionRuleId: rules.deductionComposition.id,
			}),
		}),
	}),
}) satisfies RulePackManifest;
