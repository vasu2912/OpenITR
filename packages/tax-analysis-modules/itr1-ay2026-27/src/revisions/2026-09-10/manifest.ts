import type { RulePackManifest, RulePackManifestFactQuestionRecord } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260909 } from "../2026-09-09/manifest";

const sourceId = "itr1-validation-rules-ay2026-27";

const rule = (id: string, citation: string, sourceLocation: string) =>
	Object.freeze({ id, citation, sourceId, sourceLocation });

const rules = Object.freeze({
	healthGroupLimits: rule(
		"ITR1-OR-80D-GROUP-LIMITS",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80D self-and-family and parent groups use twenty-five-thousand or fifty-thousand-rupee limits according to senior-citizen status, with a one-lakh overall limit",
		"Category A rules 127-137, pages 11-12",
	),
	healthPreventive: rule(
		"ITR1-OR-80D-PREVENTIVE-CAP",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, all section 80D preventive-health-checkup amounts share a five-thousand-rupee limit",
		"Category A rule 129, page 11",
	),
	healthDetails: rule(
		"ITR1-80D-PAYMENT-AND-POLICY-DETAILS",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80D claims require matching schedule details and insurer and policy details for health-insurance premiums",
		"Category A rules 138, 234-237, and 254-259, pages 12 and 17-18",
	),
	healthNewExclusion: rule(
		"ITR1-NR-80D-EXCLUSION",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80D deduction and schedule details are unavailable under the new regime",
		"Category A rule 173, page 14",
	),
	dependentDisability: rule(
		"ITR1-OR-80DD-FIXED-DEDUCTION",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80DD uses a fixed seventy-five-thousand-rupee deduction or one-lakh-twenty-five-thousand rupees for severe disability",
		"Category A rules 203-204, page 15",
	),
	dependentDisabilityDetails: rule(
		"ITR1-80DD-DETAILS-AND-FORM-10IA",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, a positive section 80DD deduction requires its schedule details and separately filed Form 10-IA details",
		"Category A rules 205-206 and 238, pages 15 and 17",
	),
	dependentDisabilityNewExclusion: rule(
		"ITR1-NR-80DD-EXCLUSION",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80DD is unavailable under the new regime",
		"Category A rule 154, page 13",
	),
	specifiedDisease: rule(
		"ITR1-OR-80DDB-LIMIT",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80DDB is limited to forty thousand rupees for self or dependent and one lakh rupees for a senior citizen",
		"Category A rules 5 and 7, page 5",
	),
	specifiedDiseaseDetails: rule(
		"ITR1-80DDB-SPECIFIED-DISEASE-DETAILS",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, a section 80DDB claim requires an eligible-category description and specified-disease details",
		"Category A rules 6 and 239, pages 5 and 17",
	),
	specifiedDiseaseNewExclusion: rule(
		"ITR1-NR-80DDB-EXCLUSION",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80DDB is unavailable under the new regime",
		"Category A rule 155, page 13",
	),
	taxpayerDisability: rule(
		"ITR1-OR-80U-FIXED-DEDUCTION",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80U uses a fixed seventy-five-thousand-rupee deduction or one-lakh-twenty-five-thousand rupees for severe disability",
		"Category A rules 200-201, page 15",
	),
	taxpayerDisabilityDetails: rule(
		"ITR1-80U-DETAILS-AND-FORM-10IA",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, a positive section 80U deduction requires its schedule details and separately filed Form 10-IA details",
		"Category A rules 202 and 207-208 and rule 238, pages 15 and 17",
	),
	taxpayerDisabilityNewExclusion: rule(
		"ITR1-NR-80U-EXCLUSION",
		"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80U is unavailable under the new regime",
		"Category A rule 159, page 13",
	),
});

const result = Object.freeze({
	resultId: "health-disability-deductions",
	label: "Health and disability deductions",
});

type Visibility = NonNullable<RulePackManifestFactQuestionRecord["visibility"]>;

const visibleWhenYes = (factKey: string): Visibility =>
	Object.freeze({ kind: "fact-boolean-equals", factKey, value: true });

const visibleWhenPositive = (factKey: string): Visibility =>
	Object.freeze({ kind: "fact-money-greater-than", factKey, wholeRupees: 0 });

const booleanQuestion = ({
	id,
	prompt,
	helpText,
	factKey,
	requiresRuleId,
	visibility,
}: Readonly<{
	id: string;
	prompt: string;
	helpText: string;
	factKey: string;
	requiresRuleId: string;
	visibility: Visibility;
}>): RulePackManifestFactQuestionRecord =>
	Object.freeze({
		id,
		prompt,
		helpText,
		requiresRuleId,
		suppliesFactKey: factKey,
		whyRequired: "The selected deduction category cannot be analyzed without this explicit fact. A blank answer is not No.",
		affectedResult: result,
		answerSchema: Object.freeze({ kind: "boolean" as const }),
		visibility,
	});

const amountQuestion = ({
	id,
	prompt,
	helpText,
	factKey,
	requiresRuleId,
	visibility,
}: Readonly<{
	id: string;
	prompt: string;
	helpText: string;
	factKey: string;
	requiresRuleId: string;
	visibility: Visibility;
}>): RulePackManifestFactQuestionRecord =>
	Object.freeze({
		id,
		prompt,
		helpText,
		requiresRuleId,
		suppliesFactKey: factKey,
		whyRequired: "The pinned category rule needs this exact payment amount. A blank answer remains unknown; enter zero only when the payment did not occur.",
		affectedResult: result,
		answerSchema: Object.freeze({
			kind: "exact-money" as const,
			minimumWholeRupees: 0,
			maximumWholeRupees: null,
		}),
		visibility,
	});

const always = Object.freeze({ kind: "always" as const });
const healthPresent = visibleWhenYes("deductions.80d-present");
const selfFamilyClaimed = visibleWhenYes("deductions.80d-self-family-claimed");
const parentClaimed = visibleWhenYes("deductions.80d-parents-claimed");
const dependentDisabilityPresent = visibleWhenYes("deductions.80dd-present");
const specifiedDiseasePresent = visibleWhenYes("deductions.80ddb-present");
const taxpayerDisabilityPresent = visibleWhenYes("deductions.80u-present");

const questions: readonly RulePackManifestFactQuestionRecord[] = [
	booleanQuestion({ id: "deduction-80d-present", prompt: "Do you want to analyze section 80D health-insurance, preventive-checkup, or eligible senior-citizen medical payments?", helpText: "Select Yes only for the approved self-and-family or parent groups. This analysis does not infer a claim from salary documents.", factKey: "deductions.80d-present", requiresRuleId: rules.healthGroupLimits.id, visibility: always }),
	booleanQuestion({ id: "deduction-80d-self-family-claimed", prompt: "Does the section 80D claim include you, your spouse, or dependent children?", helpText: "This group excludes parents. Children must be dependent for this category.", factKey: "deductions.80d-self-family-claimed", requiresRuleId: rules.healthGroupLimits.id, visibility: healthPresent }),
	booleanQuestion({ id: "deduction-80d-self-family-senior", prompt: "Was anyone in the section 80D self, spouse, or dependent-child group a senior citizen?", helpText: "Senior-citizen status changes this group's statutory limit.", factKey: "deductions.80d-self-family-senior", requiresRuleId: rules.healthGroupLimits.id, visibility: selfFamilyClaimed }),
	amountQuestion({ id: "deduction-80d-self-family-premium", prompt: "How much health-insurance premium was paid for the section 80D self-and-family group?", helpText: "Enter the premium before the group limit. Premium payments must use an eligible non-cash mode.", factKey: "deductions.80d-self-family-premium", requiresRuleId: rules.healthDetails.id, visibility: selfFamilyClaimed }),
	amountQuestion({ id: "deduction-80d-self-family-preventive", prompt: "How much was paid for preventive health checkups for the section 80D self-and-family group?", helpText: "This amount shares one ₹5,000 limit with parent-group preventive checkups.", factKey: "deductions.80d-self-family-preventive", requiresRuleId: rules.healthPreventive.id, visibility: selfFamilyClaimed }),
	amountQuestion({ id: "deduction-80d-self-family-medical", prompt: "How much eligible medical expenditure was paid for senior citizens in the self-and-family group?", helpText: "This expenditure is eligible only when no health-insurance premium was paid for this group.", factKey: "deductions.80d-self-family-medical", requiresRuleId: rules.healthGroupLimits.id, visibility: visibleWhenYes("deductions.80d-self-family-senior") }),
	booleanQuestion({ id: "deduction-80d-self-family-premium-noncash", prompt: "Was every self-and-family health-insurance premium payment made by an eligible non-cash mode?", helpText: "Preventive-checkup payments are separate; this answer concerns insurance premiums.", factKey: "deductions.80d-self-family-premium-noncash", requiresRuleId: rules.healthDetails.id, visibility: visibleWhenPositive("deductions.80d-self-family-premium") }),
	booleanQuestion({ id: "deduction-80d-self-family-policy-details", prompt: "Are insurer and policy details available for the self-and-family health-insurance premium?", helpText: "The schedule requires the insurer name and policy number for a premium claim.", factKey: "deductions.80d-self-family-policy-details", requiresRuleId: rules.healthDetails.id, visibility: visibleWhenPositive("deductions.80d-self-family-premium") }),
	booleanQuestion({ id: "deduction-80d-parents-claimed", prompt: "Does the section 80D claim include either of your parents?", helpText: "Parents use a separate group limit from self, spouse, and dependent children.", factKey: "deductions.80d-parents-claimed", requiresRuleId: rules.healthGroupLimits.id, visibility: healthPresent }),
	booleanQuestion({ id: "deduction-80d-parents-senior", prompt: "Was either parent in the section 80D parent group a senior citizen?", helpText: "Senior-citizen status changes the parent group's statutory limit.", factKey: "deductions.80d-parents-senior", requiresRuleId: rules.healthGroupLimits.id, visibility: parentClaimed }),
	amountQuestion({ id: "deduction-80d-parents-premium", prompt: "How much health-insurance premium was paid for the section 80D parent group?", helpText: "Enter the premium before the parent-group limit. Premium payments must use an eligible non-cash mode.", factKey: "deductions.80d-parents-premium", requiresRuleId: rules.healthDetails.id, visibility: parentClaimed }),
	amountQuestion({ id: "deduction-80d-parents-preventive", prompt: "How much was paid for preventive health checkups for the section 80D parent group?", helpText: "This amount shares one ₹5,000 limit with self-and-family preventive checkups.", factKey: "deductions.80d-parents-preventive", requiresRuleId: rules.healthPreventive.id, visibility: parentClaimed }),
	amountQuestion({ id: "deduction-80d-parents-medical", prompt: "How much eligible medical expenditure was paid for senior citizens in the parent group?", helpText: "This expenditure is eligible only when no health-insurance premium was paid for this group.", factKey: "deductions.80d-parents-medical", requiresRuleId: rules.healthGroupLimits.id, visibility: visibleWhenYes("deductions.80d-parents-senior") }),
	booleanQuestion({ id: "deduction-80d-parents-premium-noncash", prompt: "Was every parent-group health-insurance premium payment made by an eligible non-cash mode?", helpText: "Preventive-checkup payments are separate; this answer concerns insurance premiums.", factKey: "deductions.80d-parents-premium-noncash", requiresRuleId: rules.healthDetails.id, visibility: visibleWhenPositive("deductions.80d-parents-premium") }),
	booleanQuestion({ id: "deduction-80d-parents-policy-details", prompt: "Are insurer and policy details available for the parent-group health-insurance premium?", helpText: "The schedule requires the insurer name and policy number for a premium claim.", factKey: "deductions.80d-parents-policy-details", requiresRuleId: rules.healthDetails.id, visibility: visibleWhenPositive("deductions.80d-parents-premium") }),
	booleanQuestion({ id: "deduction-80dd-present", prompt: "Do you want to analyze a section 80DD deduction for a dependent person with disability?", helpText: "This category covers qualifying maintenance, medical treatment, training, rehabilitation, or an approved-scheme payment for an eligible dependent.", factKey: "deductions.80dd-present", requiresRuleId: rules.dependentDisability.id, visibility: always }),
	booleanQuestion({ id: "deduction-80dd-eligible-dependent", prompt: "Was the person an eligible dependent relationship who was wholly or mainly dependent on you and did not claim section 80U?", helpText: "For an individual, the approved relationships are spouse, children, parents, brothers, or sisters, subject to the dependency conditions.", factKey: "deductions.80dd-eligible-dependent", requiresRuleId: rules.dependentDisability.id, visibility: dependentDisabilityPresent }),
	booleanQuestion({ id: "deduction-80dd-qualifying-payment", prompt: "Did you make a qualifying section 80DD maintenance, treatment, training, rehabilitation, or approved-scheme payment?", helpText: "The fixed deduction still requires a qualifying payment or deposit; it is not inferred from disability alone.", factKey: "deductions.80dd-qualifying-payment", requiresRuleId: rules.dependentDisability.id, visibility: dependentDisabilityPresent }),
	booleanQuestion({ id: "deduction-80dd-severe", prompt: "Did the dependent have severe disability of 80% or more?", helpText: "Severe disability uses the higher fixed deduction amount.", factKey: "deductions.80dd-severe", requiresRuleId: rules.dependentDisability.id, visibility: dependentDisabilityPresent }),
	booleanQuestion({ id: "deduction-80dd-certificate", prompt: "Are the required section 80DD disability-certificate and Form 10-IA details available?", helpText: "Keep the applicable certificate, disability details, and separately filed Form 10-IA acknowledgement available.", factKey: "deductions.80dd-certificate", requiresRuleId: rules.dependentDisabilityDetails.id, visibility: dependentDisabilityPresent }),
	booleanQuestion({ id: "deduction-80ddb-present", prompt: "Do you want to analyze section 80DDB medical treatment for a specified disease?", helpText: "This category covers treatment paid for you or an eligible dependent, reduced by reimbursement.", factKey: "deductions.80ddb-present", requiresRuleId: rules.specifiedDisease.id, visibility: always }),
	booleanQuestion({ id: "deduction-80ddb-eligible-person", prompt: "Was the treatment for you or an eligible dependent relationship?", helpText: "For an individual, an eligible dependent can be a spouse, child, parent, brother, or sister who was wholly or mainly dependent on you.", factKey: "deductions.80ddb-eligible-person", requiresRuleId: rules.specifiedDisease.id, visibility: specifiedDiseasePresent }),
	booleanQuestion({ id: "deduction-80ddb-specified-disease", prompt: "Was the treatment for a disease or ailment specified for section 80DDB?", helpText: "Do not treat an unclassified condition as a specified disease.", factKey: "deductions.80ddb-specified-disease", requiresRuleId: rules.specifiedDiseaseDetails.id, visibility: specifiedDiseasePresent }),
	booleanQuestion({ id: "deduction-80ddb-senior", prompt: "Was the person receiving section 80DDB treatment a senior citizen?", helpText: "Senior-citizen status changes the statutory deduction limit.", factKey: "deductions.80ddb-senior", requiresRuleId: rules.specifiedDisease.id, visibility: specifiedDiseasePresent }),
	amountQuestion({ id: "deduction-80ddb-expenditure", prompt: "How much qualifying section 80DDB medical-treatment expenditure was paid?", helpText: "Enter the qualifying expenditure before insurance or employer reimbursement and before the statutory limit.", factKey: "deductions.80ddb-expenditure", requiresRuleId: rules.specifiedDisease.id, visibility: specifiedDiseasePresent }),
	amountQuestion({ id: "deduction-80ddb-reimbursement", prompt: "How much of that section 80DDB expenditure was reimbursed by insurance or an employer?", helpText: "The reimbursement reduces the amount eligible for deduction and cannot exceed the qualifying expenditure.", factKey: "deductions.80ddb-reimbursement", requiresRuleId: rules.specifiedDisease.id, visibility: specifiedDiseasePresent }),
	booleanQuestion({ id: "deduction-80ddb-prescription", prompt: "Are the required specialist prescription and specified-disease details available?", helpText: "The analysis must not treat an unsupported disease classification as an established claim.", factKey: "deductions.80ddb-prescription", requiresRuleId: rules.specifiedDiseaseDetails.id, visibility: specifiedDiseasePresent }),
	booleanQuestion({ id: "deduction-80u-present", prompt: "Do you want to analyze section 80U for your own disability?", helpText: "Section 80U applies to a resident individual taxpayer's own certified disability, not a dependent's disability.", factKey: "deductions.80u-present", requiresRuleId: rules.taxpayerDisability.id, visibility: always }),
	booleanQuestion({ id: "deduction-80u-severe", prompt: "Was your certified disability severe disability of 80% or more?", helpText: "Severe disability uses the higher fixed deduction amount.", factKey: "deductions.80u-severe", requiresRuleId: rules.taxpayerDisability.id, visibility: taxpayerDisabilityPresent }),
	booleanQuestion({ id: "deduction-80u-certificate", prompt: "Are the required section 80U disability-certificate and Form 10-IA details available?", helpText: "Keep the applicable certificate, disability details, and separately filed Form 10-IA acknowledgement available.", factKey: "deductions.80u-certificate", requiresRuleId: rules.taxpayerDisabilityDetails.id, visibility: taxpayerDisabilityPresent }),
];

const priorConstants = itr1Ay202627RulePackManifest20260909.taxConstants;
if (priorConstants === undefined) throw new Error("The prior rule pack has no tax constants");

export const itr1Ay202627RulePackManifest20260910 = Object.freeze({
	...itr1Ay202627RulePackManifest20260909,
	rulePackId: "itr1-ay2026-27.2026-09-10",
	packRevision: "2026-09-10",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260909.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260909.missingFactQuestions ?? []),
		...questions,
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		healthDisabilityDeductions: Object.freeze({
			healthRegularGroupLimitWholeRupees: 25_000,
			healthSeniorGroupLimitWholeRupees: 50_000,
			healthPreventiveSharedLimitWholeRupees: 5_000,
			healthOverallLimitWholeRupees: 100_000,
			dependentDisabilityAmountWholeRupees: 75_000,
			dependentSevereDisabilityAmountWholeRupees: 125_000,
			specifiedDiseaseLimitWholeRupees: 40_000,
			specifiedDiseaseSeniorLimitWholeRupees: 100_000,
			taxpayerDisabilityAmountWholeRupees: 75_000,
			taxpayerSevereDisabilityAmountWholeRupees: 125_000,
			healthGroupLimitsRuleId: rules.healthGroupLimits.id,
			healthPreventiveLimitRuleId: rules.healthPreventive.id,
			healthDetailsRuleId: rules.healthDetails.id,
			healthNewRegimeExclusionRuleId: rules.healthNewExclusion.id,
			dependentDisabilityRuleId: rules.dependentDisability.id,
			dependentDisabilityDetailsRuleId: rules.dependentDisabilityDetails.id,
			dependentDisabilityNewRegimeExclusionRuleId:
				rules.dependentDisabilityNewExclusion.id,
			specifiedDiseaseRuleId: rules.specifiedDisease.id,
			specifiedDiseaseDetailsRuleId: rules.specifiedDiseaseDetails.id,
			specifiedDiseaseNewRegimeExclusionRuleId:
				rules.specifiedDiseaseNewExclusion.id,
			taxpayerDisabilityRuleId: rules.taxpayerDisability.id,
			taxpayerDisabilityDetailsRuleId: rules.taxpayerDisabilityDetails.id,
			taxpayerDisabilityNewRegimeExclusionRuleId:
				rules.taxpayerDisabilityNewExclusion.id,
		}),
	}),
}) satisfies RulePackManifest;
