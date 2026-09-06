import type {
	RulePackManifest,
	RulePackManifestFactQuestionRecord,
} from "@openitr/model";

import { itr1Ay202627RulePackManifest20260911 } from "../2026-09-11/manifest";

const actSourceId = "income-tax-act-1961";
const validationSourceId = "itr1-validation-rules-ay2026-27";
const rule = (
	id: string,
	citation: string,
	sourceId: string,
	sourceLocation: string,
) => Object.freeze({ id, citation, sourceId, sourceLocation });

const rules = Object.freeze({
	classification: rule(
		"ITR1-OR-80G-CLASSIFICATION",
		"Section 80G classifies eligible donations for full or half deduction, with or without the qualifying limit",
		actSourceId,
		"Section 80G(1) and (2)",
	),
	payment: rule(
		"ITR1-OR-80G-PAYMENT",
		"Section 80G disallows a cash donation exceeding two thousand rupees and any donation that is not a sum of money",
		actSourceId,
		"Section 80G(5D) and Explanation 5",
	),
	adjustedGrossTotalIncome: rule(
		"ITR1-OR-80G-ADJUSTED-GTI-LIMIT",
		"Section 80G restricts donations in the qualifying-limit categories to ten percent of adjusted gross total income",
		actSourceId,
		"Section 80G(4)",
	),
	recipientQualification: rule(
		"ITR1-OR-80G-RECIPIENT-QUALIFICATION",
		"Section 80G permits deductions only for specified recipients and qualifying institutions or funds",
		actSourceId,
		"Section 80G(2) and (5)",
	),
	evidence: rule(
		"ITR1-80G-EVIDENCE-DETAILS",
		"AY 2026-27 validation requires recipient, donation, and non-cash transaction details for Schedule 80G",
		validationSourceId,
		"Category A rules 78-87, 139, 147, and 325-327",
	),
	newRegimeExclusion: rule(
		"ITR1-NR-80G-EXCLUSION",
		"AY 2026-27 validation excludes section 80G and its schedule details under the new regime",
		validationSourceId,
		"Category A rule 156",
	),
});

type Visibility = NonNullable<
	RulePackManifestFactQuestionRecord["visibility"]
>;
const always = Object.freeze({ kind: "always" as const });
const visibleWhen = (factKey: string, value: boolean): Visibility =>
	Object.freeze({ kind: "fact-boolean-equals", factKey, value });
const amountSchema = Object.freeze({
	kind: "exact-money" as const,
	minimumWholeRupees: 0,
	maximumWholeRupees: null,
});
const booleanSchema = Object.freeze({ kind: "boolean" as const });
const result = Object.freeze({
	resultId: "donation-deductions",
	label: "Donation deductions",
});
const question = (
	id: string,
	prompt: string,
	helpText: string,
	factKey: string,
	requiresRuleId: string,
	visibility: Visibility,
	answerSchema: RulePackManifestFactQuestionRecord["answerSchema"] =
		booleanSchema,
): RulePackManifestFactQuestionRecord =>
	Object.freeze({
		id,
		prompt,
		helpText,
		requiresRuleId,
		suppliesFactKey: factKey,
		whyRequired:
			"The section 80G result cannot be derived while this fact is unknown. A blank answer is not No or zero.",
		affectedResult: result,
		answerSchema,
		visibility,
	});

const present = visibleWhen("deductions.80g-present", true);
const qualifyingLimit = visibleWhen(
	"deductions.80g-subject-to-qualifying-limit",
	true,
);
const qualifiedRecipient = visibleWhen(
	"deductions.80g-recipient-qualified",
	true,
);
const noncash = visibleWhen("deductions.80g-cash-payment", false);

const questions: readonly RulePackManifestFactQuestionRecord[] = [
	question(
		"deduction-80g-present",
		"Do you want to analyze a donation under section 80G?",
		"Use this category for a monetary donation to a prescribed fund, institution, or association. Sections 80GGA and 80GGC are outside this analysis.",
		"deductions.80g-present",
		rules.recipientQualification.id,
		always,
	),
	question(
		"deduction-80g-amount",
		"How much did you donate during FY 2025-26?",
		"Enter the donation amount, not a deduction total. OpenITR derives the eligible deduction.",
		"deductions.80g-amount",
		rules.classification.id,
		present,
		amountSchema,
	),
	question(
		"deduction-80g-full-deduction",
		"Is this recipient in a 100% deduction category?",
		"Answer No for a 50% deduction category. Confirm the category from the recipient's section 80G details.",
		"deductions.80g-full-deduction",
		rules.classification.id,
		present,
	),
	question(
		"deduction-80g-subject-to-qualifying-limit",
		"Is this recipient category subject to the qualifying limit?",
		"Section 80G has categories both with and without the adjusted-gross-total-income limit.",
		"deductions.80g-subject-to-qualifying-limit",
		rules.classification.id,
		present,
	),
	question(
		"deduction-80g-adjusted-gti",
		"What is the adjusted gross total income for the section 80G limit?",
		"Use gross total income after the exclusions and other Chapter VI-A deductions required by section 80G, but before section 80G itself.",
		"deductions.80g-adjusted-gti",
		rules.adjustedGrossTotalIncome.id,
		qualifyingLimit,
		amountSchema,
	),
	question(
		"deduction-80g-cash-payment",
		"Was the donation paid in cash?",
		"A cash donation exceeding the pinned limit is not eligible. A donation in kind is not supported.",
		"deductions.80g-cash-payment",
		rules.payment.id,
		present,
	),
	question(
		"deduction-80g-noncash-payment-details",
		"Are the IFSC and transaction-reference details available?",
		"AY 2026-27 validation requires these details for a donation paid by a mode other than cash.",
		"deductions.80g-noncash-payment-details",
		rules.evidence.id,
		noncash,
	),
	question(
		"deduction-80g-recipient-qualified",
		"Was the recipient eligible under section 80G for this donation?",
		"Confirm that the prescribed fund, institution, or association had the applicable section 80G qualification.",
		"deductions.80g-recipient-qualified",
		rules.recipientQualification.id,
		present,
	),
	question(
		"deduction-80g-recipient-details",
		"Are the recipient's name, address, and applicable identification details available?",
		"The recipient details support the category and the donation entry.",
		"deductions.80g-recipient-details",
		rules.evidence.id,
		qualifiedRecipient,
	),
	question(
		"deduction-80g-certificate",
		"Is the donation certificate or equivalent recipient evidence available?",
		"The certificate supports the amount and recipient qualification. A missing certificate leaves an evidence warning.",
		"deductions.80g-certificate",
		rules.evidence.id,
		qualifiedRecipient,
	),
];

const priorConstants = itr1Ay202627RulePackManifest20260911.taxConstants;
if (priorConstants === undefined) {
	throw new Error("The prior rule pack has no tax constants");
}

export const itr1Ay202627RulePackManifest20260912 = Object.freeze({
	...itr1Ay202627RulePackManifest20260911,
	rulePackId: "itr1-ay2026-27.2026-09-12",
	packRevision: "2026-09-12",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260911.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260911.missingFactQuestions ?? []),
		...questions,
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		donationDeductions: Object.freeze({
			cashPaymentLimitWholeRupees: 2_000,
			adjustedGrossTotalIncomeLimitPercent: 10,
			fullQualifyingPercent: 100,
			halfQualifyingPercent: 50,
			classificationRuleId: rules.classification.id,
			paymentRuleId: rules.payment.id,
			adjustedGrossTotalIncomeRuleId: rules.adjustedGrossTotalIncome.id,
			recipientQualificationRuleId: rules.recipientQualification.id,
			evidenceRuleId: rules.evidence.id,
			newRegimeExclusionRuleId: rules.newRegimeExclusion.id,
		}),
	}),
}) satisfies RulePackManifest;
