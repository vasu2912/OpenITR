import type {
	RulePackManifest,
	RulePackManifestFactQuestionRecord,
} from "@openitr/model";

import { itr1Ay202627RulePackManifest20260906 } from "../2026-09-06/manifest";

const rules = Object.freeze({
	classification: Object.freeze({
		id: "ITR1-SECTION112A-CLASSIFICATION",
		citation:
			"Income-tax Act, 1961, section 112A, eligible long-term listed equity, equity-oriented fund, or business-trust assets with applicable securities transaction tax conditions",
		sourceId: "income-tax-act-1961",
		sourceLocation: "Section 112A(1) and (5)",
	}),
	gain: Object.freeze({
		id: "ITR1-SECTION112A-GAIN-NOTIFIED-FORM",
		citation:
			"Notification No. 45/2026, Form ITR-1 C3(a), section 112A gain equals total sale consideration less total cost of acquisition",
		sourceId: "cbdt-notification-45-2026",
		sourceLocation: "Form ITR-1 C3(a)(i) to (iii), Gazette page 18",
	}),
	limit: Object.freeze({
		id: "ITR1-SECTION112A-ITR1-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, rules 217 and 218, section 112A gain cannot exceed one lakh twenty-five thousand rupees and must equal sale consideration less acquisition cost",
		sourceId: "itr1-validation-rules-ay2026-27",
		sourceLocation: "Category A rules 217 and 218, page 16",
	}),
	tax: Object.freeze({
		id: "ITR1-SECTION112A-TAX",
		citation:
			"Income-tax Act, 1961, section 112A, tax at twelve and one-half per cent applies only to eligible long-term capital gains above one lakh twenty-five thousand rupees",
		sourceId: "income-tax-act-1961",
		sourceLocation: "Section 112A(1)",
	}),
	taxRounding: Object.freeze({
		id: "ITR1-SECTION112A-TAX-WHOLE-RUPEE",
		citation:
			"Notification No. 45/2026, Form ITR-1 Part D, tax computation is expressed in whole rupees",
		sourceId: "cbdt-notification-45-2026",
		sourceLocation: "Form ITR-1 Part D and whole-rupee instruction, Gazette pages 17 to 18",
	}),
});

const result = Object.freeze({
	resultId: "section112a-capital-gain",
	label: "Section 112A capital-gain analysis",
});

const question = (
	record: Omit<RulePackManifestFactQuestionRecord, "affectedResult">,
): RulePackManifestFactQuestionRecord =>
	Object.freeze({ ...record, affectedResult: result });

const priorConstants = itr1Ay202627RulePackManifest20260906.taxConstants;
if (priorConstants === undefined) {
	throw new Error("The prior rule pack has no tax constants");
}

export const itr1Ay202627RulePackManifest20260907 = Object.freeze({
	...itr1Ay202627RulePackManifest20260906,
	rulePackId: "itr1-ay2026-27.2026-09-07",
	packRevision: "2026-09-07",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260906.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260906.missingFactQuestions ?? []),
		question({
			id: "section112a-eligible-asset",
			prompt:
				"Did every reported section 112A disposal involve a listed equity share, an equity-oriented fund unit, or a business-trust unit?",
			helpText:
				"Answer No if any disposal involved another asset type. Do not classify an unlisted share or another capital asset as section 112A income.",
			requiresRuleId: rules.classification.id,
			suppliesFactKey: "capital-gains.section112a-eligible-asset",
			whyRequired:
				"Section 112A applies only to the named listed equity, equity-oriented fund, and business-trust assets.",
			answerSchema: { kind: "boolean" },
			visibility: { kind: "always" },
		}),
		question({
			id: "section112a-long-term",
			prompt:
				"Was every reported section 112A disposal classified as a long-term capital gain?",
			helpText:
				"Answer only from the applicable holding-period classification. A short-term gain or any capital loss is outside this limited analysis.",
			requiresRuleId: rules.classification.id,
			suppliesFactKey: "capital-gains.section112a-long-term",
			whyRequired: "Section 112A applies only to long-term capital gains.",
			answerSchema: { kind: "boolean" },
			visibility: {
				kind: "fact-boolean-equals",
				factKey: "capital-gains.section112a-eligible-asset",
				value: true,
			},
		}),
		question({
			id: "section112a-stt-conditions",
			prompt:
				"Were all applicable section 112A securities transaction tax conditions met?",
			helpText:
				"Confirm securities transaction tax on transfer and, for an equity share, on acquisition unless a statutory exception applies.",
			requiresRuleId: rules.classification.id,
			suppliesFactKey: "capital-gains.section112a-stt-conditions-met",
			whyRequired:
				"Section 112A requires the applicable securities transaction tax conditions for the concessional treatment.",
			answerSchema: { kind: "boolean" },
			visibility: {
				kind: "fact-boolean-equals",
				factKey: "capital-gains.section112a-long-term",
				value: true,
			},
		}),
		question({
			id: "section112a-sale-consideration",
			prompt:
				"What was the total sale consideration for the supported section 112A disposals?",
			helpText:
				"Enter the total whole-rupee sale consideration shown by your reviewed records.",
			requiresRuleId: rules.gain.id,
			suppliesFactKey: "capital-gains.section112a-sale-consideration",
			whyRequired:
				"Notified Form ITR-1 C3(a) requires total sale consideration to derive the section 112A gain.",
			answerSchema: {
				kind: "exact-money",
				minimumWholeRupees: 0,
				maximumWholeRupees: null,
			},
			visibility: {
				kind: "fact-boolean-equals",
				factKey: "capital-gains.section112a-stt-conditions-met",
				value: true,
			},
		}),
		question({
			id: "section112a-cost-of-acquisition",
			prompt:
				"What was the total cost of acquisition for the supported section 112A disposals?",
			helpText:
				"Enter the total whole-rupee acquisition cost used for the notified form calculation. Do not infer the cost from the sale value.",
			requiresRuleId: rules.gain.id,
			suppliesFactKey: "capital-gains.section112a-cost-of-acquisition",
			whyRequired:
				"Notified Form ITR-1 C3(a) requires total acquisition cost and validates the gain as sale consideration less that cost.",
			answerSchema: {
				kind: "exact-money",
				minimumWholeRupees: 0,
				maximumWholeRupees: null,
			},
			visibility: {
				kind: "fact-boolean-equals",
				factKey: "capital-gains.section112a-stt-conditions-met",
				value: true,
			},
		}),
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		section112aCapitalGain: Object.freeze({
			itr1GainLimitWholeRupees: 125000,
			taxFreeThresholdWholeRupees: 125000,
			taxRateBasisPoints: 1250,
			taxRoundingBaseWholeRupees: 1,
			classificationRuleId: rules.classification.id,
			gainRuleId: rules.gain.id,
			itr1LimitRuleId: rules.limit.id,
			taxRuleId: rules.tax.id,
			taxRoundingRuleId: rules.taxRounding.id,
		}),
	}),
}) satisfies RulePackManifest;
