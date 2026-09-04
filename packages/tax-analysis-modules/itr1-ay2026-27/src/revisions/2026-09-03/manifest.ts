import type {
	NewRegimeTaxConstantRecord,
	RulePackManifest,
	RulePackManifestAnalysisScopeRecord,
	RulePackManifestScopeRuleRecord,
} from "@openitr/model";

const newRegimeTaxConstantsData: NewRegimeTaxConstantRecord = {
	slabBands: [
		{ upperBoundWholeRupees: 400000, ratePercent: 0 },
		{ upperBoundWholeRupees: 800000, ratePercent: 5 },
		{ upperBoundWholeRupees: 1200000, ratePercent: 10 },
		{ upperBoundWholeRupees: 1600000, ratePercent: 15 },
		{ upperBoundWholeRupees: 2000000, ratePercent: 20 },
		{ upperBoundWholeRupees: 2400000, ratePercent: 25 },
		{ upperBoundWholeRupees: null, ratePercent: 30 },
	],
	slabRuleId: "ITR1-NR-SLAB-TAX-115BAC",
	standardDeductionWholeRupees: 75000,
	standardDeductionRuleId: "ITR1-NR-STANDARD-DEDUCTION-16IA",
	rebateMaxTotalIncomeWholeRupees: 1200000,
	rebateMaxAmountWholeRupees: 60000,
	rebateRuleId: "ITR1-NR-REBATE-SECTION-87A",
	rebateMarginalReliefRuleId: "ITR1-NR-REBATE-MARGINAL-RELIEF-87A",
	surchargeTiers: [
		{ exceedsTotalIncomeWholeRupees: 5000000, ratePercent: 10 },
		{ exceedsTotalIncomeWholeRupees: 10000000, ratePercent: 15 },
		{ exceedsTotalIncomeWholeRupees: 20000000, ratePercent: 20 },
		{ exceedsTotalIncomeWholeRupees: 50000000, ratePercent: 25 },
	],
	surchargeRuleId: "ITR1-NR-SURCHARGE",
	cessRatePercent: 4,
	cessRuleId: "ITR1-NR-CESS",
	totalIncomeRoundingBaseWholeRupees: 10,
	totalIncomeRoundingRuleId: "ITR1-TOTAL-INCOME-ROUNDING-288A",
	taxRoundingBaseWholeRupees: 10,
	taxRoundingRuleId: "ITR1-TAX-ROUNDING-288B",
};

const newRegimeTaxConstants = Object.freeze(newRegimeTaxConstantsData);

const scopeRule = ({
	id,
	factKey,
	condition,
	citation,
	sourceId,
	sourceLocation,
	supportedExplanation,
	unsupportedExplanation,
	unknownExplanation,
	blockedExplanation,
	recoveryAction,
}: Omit<
	RulePackManifestScopeRuleRecord,
	"supportedTitle" | "unsupportedTitle"
> &
	Readonly<{
		supportedExplanation: string;
		unsupportedExplanation: string;
		unknownExplanation: string;
		blockedExplanation: string;
		recoveryAction: string;
	}>) => ({
	id,
	factKey,
	condition,
	citation,
	sourceId,
	sourceLocation,
	supportedTitle: "Within the ITR-1 analysis scope",
	supportedExplanation,
	unsupportedTitle: "Outside the ITR-1 analysis scope",
	unsupportedExplanation,
	unknownExplanation,
	blockedExplanation,
	recoveryAction,
});

const moneyFact = ({
	key,
	label,
}: Readonly<{ key: string; label: string }>) => ({
	key,
	label,
	schema: {
		kind: "exact-money" as const,
		minimumWholeRupees: 0,
		maximumWholeRupees: null,
	},
});

const booleanFact = ({
	key,
	label,
}: Readonly<{ key: string; label: string }>) => ({
	key,
	label,
	schema: { kind: "boolean" as const },
});

const booleanExclusionRule = ({
	id,
	factKey,
	sourceId = "itat-rule12-excerpt-dbs-2023",
	sourceLocation,
	citation,
	label,
}: Readonly<{
	id: string;
	factKey: string;
	sourceId?: string;
	sourceLocation: string;
	citation: string;
	label: string;
}>): RulePackManifestScopeRuleRecord =>
	scopeRule({
		id,
		factKey,
		condition: { kind: "must-be-false" },
		citation,
		sourceId,
		sourceLocation,
		supportedExplanation: `You reported no ${label}.`,
		unsupportedExplanation: `${label} is outside the ITR-1 analysis scope.`,
		unknownExplanation: `Confirm whether you had ${label}.`,
		blockedExplanation: `The ${label} fact could not be established safely from the available evidence.`,
		recoveryAction:
			"Review the cited rule and use a return-form scope that covers this fact if the answer is yes.",
	});

const scopeFacts: RulePackManifestAnalysisScopeRecord["facts"] = [
	booleanFact({
		key: "scope.taxpayer-is-individual",
		label: "an individual taxpayer",
	}),
	booleanFact({
		key: "scope.taxpayer-resident-other-than-rnor",
		label: "Resident status other than Resident but not ordinarily resident",
	}),
	moneyFact({
		key: "scope.total-income",
		label: "total income, including section 112A gains",
	}),
	{
		key: "scope.house-property-count",
		label: "number of house properties contributing income or loss",
		schema: { kind: "whole-number" as const, minimum: 0, maximum: null },
	},
	moneyFact({
		key: "scope.section112a-ltcg",
		label: "section 112A long-term capital gains",
	}),
	booleanFact({
		key: "scope.other-capital-gains",
		label:
			"capital gains or losses other than permitted section 112A gains, including short-term gains",
	}),
	moneyFact({ key: "scope.agriculture-income", label: "agricultural income" }),
	booleanFact({
		key: "scope.salary-pension-income",
		label: "salary or pension income",
	}),
	booleanFact({
		key: "scope.bank-interest-income",
		label: "savings-account and deposit interest",
	}),
	booleanFact({
		key: "scope.allowed-other-sources-income",
		label:
			"permitted other-source income other than savings-account or deposit interest, including ordinary dividends, other permitted interest, and family pension",
	}),
	booleanFact({
		key: "scope.business-profession-income",
		label: "business or profession income or loss",
	}),
	booleanFact({ key: "scope.lottery-income", label: "lottery winnings" }),
	booleanFact({
		key: "scope.racehorse-income",
		label: "income from racehorse ownership or maintenance",
	}),
	booleanFact({
		key: "scope.special-rate-115bbda-income",
		label: "income chargeable under section 115BBDA",
	}),
	booleanFact({
		key: "scope.special-rate-115bbe-income",
		label: "income chargeable under section 115BBE",
	}),
	booleanFact({
		key: "scope.special-rate-online-games-income",
		label: "income from online games at a special rate",
	}),
	booleanFact({
		key: "scope.special-rate-vda-income",
		label: "virtual digital asset income at a special rate",
	}),
	booleanFact({
		key: "scope.other-special-rate-income-excluding-112a",
		label:
			"other income chargeable at a special rate, excluding permitted section 112A gains",
	}),
	booleanFact({ key: "scope.company-director", label: "company directorship" }),
	booleanFact({
		key: "scope.unlisted-equity-held",
		label: "unlisted equity held at any time",
	}),
	booleanFact({
		key: "scope.foreign-assets-interest",
		label: "foreign assets or a financial interest in a foreign entity",
	}),
	booleanFact({
		key: "scope.foreign-signing-authority",
		label: "foreign signing authority",
	}),
	booleanFact({
		key: "scope.foreign-source-income",
		label:
			"foreign-source income, including retirement accounts covered by section 89A",
	}),
	booleanFact({
		key: "scope.tds-section-194n",
		label: "tax deducted under section 194N",
	}),
	booleanFact({
		key: "scope.deferred-esop-tax",
		label: "deferred tax on eligible start-up ESOPs",
	}),
	booleanFact({
		key: "scope.brought-forward-losses",
		label: "brought-forward losses",
	}),
	booleanFact({
		key: "scope.carry-forward-losses",
		label: "losses claimed for carry-forward",
	}),
	booleanFact({
		key: "scope.other-source-loss",
		label: "loss under the head Income from other sources",
	}),
	booleanFact({
		key: "scope.section5a-apportionment",
		label: "section 5A apportionment",
	}),
	booleanFact({
		key: "scope.foreign-tax-relief",
		label: "relief under section 90, 90A, or 91",
	}),
	booleanFact({
		key: "scope.other-source-deductions",
		label: "deductions under section 57 other than family pension deduction",
	}),
	booleanFact({
		key: "scope.other-person-tds",
		label:
			"assessable income on which TDS was deducted in another person's hands",
	}),
];

const notification = "cbdt-notification-45-2026";
const notificationLocation = "Form ITR-1 heading, Gazette page 16";
const itatLocation = "Rule 12 excerpt reproduced in ITAT order, pages 14-15";
const instructionsSourceId = "itr1-instructions-ay2021-22";

const scopeRules: RulePackManifestAnalysisScopeRecord["rules"] = [
	scopeRule({
		id: "ITR1-SCOPE-INDIVIDUAL",
		factKey: "scope.taxpayer-is-individual",
		condition: { kind: "must-be-true" },
		citation: "Notification No. 45/2026, Form ITR-1 heading",
		sourceId: notification,
		sourceLocation: notificationLocation,
		supportedExplanation: "The taxpayer is an individual.",
		unsupportedExplanation:
			"The ITR-1 analysis scope is limited to an individual taxpayer.",
		unknownExplanation: "Confirm whether the taxpayer is an individual.",
		blockedExplanation: "The taxpayer type could not be established safely.",
		recoveryAction:
			"Review the taxpayer type and use a return-form scope that covers it if needed.",
	}),
	scopeRule({
		id: "ITR1-SCOPE-RESIDENT-OTHER-THAN-RNOR",
		factKey: "scope.taxpayer-resident-other-than-rnor",
		condition: { kind: "must-be-true" },
		citation: "Notification No. 45/2026, Form ITR-1 heading",
		sourceId: notification,
		sourceLocation: notificationLocation,
		supportedExplanation:
			"The status is Resident other than Resident but not ordinarily resident.",
		unsupportedExplanation:
			"Resident but not ordinarily resident and Non-resident statuses are outside this ITR-1 analysis scope.",
		unknownExplanation: "Confirm the residential status for FY 2025-26.",
		blockedExplanation:
			"The residential status could not be established safely.",
		recoveryAction:
			"Review the residential-status evidence and use a return-form scope that covers the status if needed.",
	}),
	scopeRule({
		id: "ITR1-SCOPE-TOTAL-INCOME-50-LAKH",
		factKey: "scope.total-income",
		condition: { kind: "at-most-exact-money", limit: "5000000" },
		citation: "Notification No. 45/2026, Form ITR-1 heading and C2",
		sourceId: notification,
		sourceLocation: "Form ITR-1 heading, Gazette page 16; C2, Gazette page 18",
		supportedExplanation:
			"Total income is at or below ₹50,00,000. The notified C2 wording includes section 112A gains in total income.",
		unsupportedExplanation:
			"Total income above ₹50,00,000 is outside the ITR-1 analysis scope.",
		unknownExplanation:
			"Provide total income, including section 112A gains, before this limit can be evaluated.",
		blockedExplanation:
			"Total income could not be established safely from the available evidence.",
		recoveryAction:
			"Reconcile total income, including section 112A gains, or use a return-form scope that covers a higher total.",
	}),
	scopeRule({
		id: "ITR1-SCOPE-HOUSE-PROPERTIES",
		factKey: "scope.house-property-count",
		condition: { kind: "at-most-whole-number", limit: 2 },
		citation: "Notification No. 45/2026, Form ITR-1 heading",
		sourceId: notification,
		sourceLocation: notificationLocation,
		supportedExplanation:
			"The analysis includes zero, one, or two house properties.",
		unsupportedExplanation:
			"More than two house properties are outside the ITR-1 analysis scope.",
		unknownExplanation:
			"State whether the analysis includes zero, one, or two house properties.",
		blockedExplanation:
			"The number of house properties could not be established safely.",
		recoveryAction:
			"Review the property count and use a return-form scope that covers more than two properties if needed.",
	}),
	scopeRule({
		id: "ITR1-SCOPE-SECTION-112A-LTCG",
		factKey: "scope.section112a-ltcg",
		condition: { kind: "at-most-exact-money", limit: "125000" },
		citation: "Notification No. 45/2026, Form ITR-1 heading",
		sourceId: notification,
		sourceLocation: notificationLocation,
		supportedExplanation:
			"Section 112A long-term capital gains are at or below ₹1,25,000, including zero.",
		unsupportedExplanation:
			"Section 112A long-term capital gains above ₹1,25,000 are outside the ITR-1 analysis scope.",
		unknownExplanation:
			"Provide section 112A long-term capital gains, including zero where applicable.",
		blockedExplanation: "Section 112A gains could not be established safely.",
		recoveryAction:
			"Reconcile section 112A gains or use a return-form scope that covers a higher amount.",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-OTHER-CAPITAL-GAINS",
		factKey: "scope.other-capital-gains",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3B(c), page 2",
		citation:
			"ITR-1 instructions AY 2021-22, section 3B(c), narrowed by Notification No. 45/2026 section 112A exception",
		label:
			"capital gains or losses other than permitted section 112A gains, including short-term gains",
	}),
	scopeRule({
		id: "ITR1-SCOPE-AGRICULTURE",
		factKey: "scope.agriculture-income",
		condition: { kind: "at-most-exact-money", limit: "5000" },
		citation: "Notification No. 45/2026, Form ITR-1 heading",
		sourceId: notification,
		sourceLocation: notificationLocation,
		supportedExplanation:
			"Agricultural income is at or below ₹5,000, including zero.",
		unsupportedExplanation:
			"Agricultural income above ₹5,000 is outside the ITR-1 analysis scope.",
		unknownExplanation:
			"Provide agricultural income, including zero where applicable.",
		blockedExplanation: "Agricultural income could not be established safely.",
		recoveryAction:
			"Reconcile agricultural income or use a return-form scope that covers a higher amount.",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-BUSINESS-PROFESSION",
		factKey: "scope.business-profession-income",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3B(a), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3B(a)",
		label: "business or profession income or loss",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-LOTTERY",
		factKey: "scope.lottery-income",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3B(d)(i), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3B(d)(i)",
		label: "lottery winnings",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-RACEHORSE",
		factKey: "scope.racehorse-income",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3B(d)(ii), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3B(d)(ii)",
		label: "income from racehorse ownership or maintenance",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-115BBDA",
		factKey: "scope.special-rate-115bbda-income",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3B(d)(iii), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3B(d)(iii)",
		label: "income chargeable under section 115BBDA",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-115BBE",
		factKey: "scope.special-rate-115bbe-income",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3B(d)(iii), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3B(d)(iii)",
		label: "income chargeable under section 115BBE",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-ONLINE-GAMES",
		factKey: "scope.special-rate-online-games-income",
		sourceId: "itr1-validation-rules-ay2026-27",
		sourceLocation: "Category B, rule 3, special-rate income",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, Category B rule 3",
		label: "income from online games at a special rate",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-VDA",
		factKey: "scope.special-rate-vda-income",
		sourceId: "itr1-validation-rules-ay2026-27",
		sourceLocation: "Category B, rule 3, special-rate income",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, Category B rule 3",
		label: "virtual digital asset income at a special rate",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-OTHER-SPECIAL-RATE",
		factKey: "scope.other-special-rate-income-excluding-112a",
		sourceId: "itr1-validation-rules-ay2026-27",
		sourceLocation: "Validation Rules AY 2026-27, page 22, Category B rule 3",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, page 22, Category B rule 3, excluding permitted section 112A gains",
		label: "other special-rate income (excluding permitted section 112A gains)",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-COMPANY-DIRECTOR",
		factKey: "scope.company-director",
		sourceLocation: itatLocation,
		citation: "Rule 12(1)(a) proviso (IE) reproduced in ITAT order, page 14",
		label: "company directorship",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-UNLISTED-EQUITY",
		factKey: "scope.unlisted-equity-held",
		sourceLocation: itatLocation,
		citation: "Rule 12(1)(a) proviso (IF) reproduced in ITAT order, page 14",
		label: "unlisted equity held at any time",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-FOREIGN-ASSETS",
		factKey: "scope.foreign-assets-interest",
		sourceLocation: itatLocation,
		citation: "Rule 12(1)(a) proviso (I) reproduced in ITAT order, page 14",
		label: "foreign assets or a financial interest in a foreign entity",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-FOREIGN-SIGNING",
		factKey: "scope.foreign-signing-authority",
		sourceLocation: itatLocation,
		citation: "Rule 12(1)(a) proviso (IA) reproduced in ITAT order, page 14",
		label: "foreign signing authority",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-FOREIGN-INCOME",
		factKey: "scope.foreign-source-income",
		sourceLocation: itatLocation,
		citation: "Rule 12(1)(a) proviso (IB) reproduced in ITAT order, page 14",
		label:
			"foreign-source income, including retirement accounts covered by section 89A",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-194N",
		factKey: "scope.tds-section-194n",
		sourceLocation: "Rule 12 exclusion list reproduced in ITAT order, page 15",
		citation: "Rule 12 proviso (VII) reproduced in ITAT order, page 15",
		label: "tax deducted under section 194N",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-DEFERRED-ESOP",
		factKey: "scope.deferred-esop-tax",
		sourceLocation: "Rule 12 exclusion list reproduced in ITAT order, page 15",
		citation:
			"Rule 12 proviso (VIII), section 191(2) and section 192(1C), reproduced in ITAT order, page 15",
		label: "deferred tax on eligible start-up ESOPs",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-BROUGHT-FORWARD-LOSSES",
		factKey: "scope.brought-forward-losses",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3C(a), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3C(a)",
		label: "brought-forward losses",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-CARRY-FORWARD-LOSSES",
		factKey: "scope.carry-forward-losses",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3C(a), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3C(a)",
		label: "losses claimed for carry-forward",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-OTHER-SOURCE-LOSS",
		factKey: "scope.other-source-loss",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3C(b), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3C(b)",
		label: "loss under the head Income from other sources",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-SECTION-5A",
		factKey: "scope.section5a-apportionment",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3B(e), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3B(e)",
		label: "section 5A apportionment",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-FOREIGN-TAX-RELIEF",
		factKey: "scope.foreign-tax-relief",
		sourceLocation: "Rule 12 proviso (II) reproduced in ITAT order, page 15",
		citation:
			"Rule 12 proviso (II), sections 90, 90A, and 91, reproduced in ITAT order, page 15",
		label: "relief under section 90, 90A, or 91",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-OTHER-SOURCE-DEDUCTIONS",
		factKey: "scope.other-source-deductions",
		sourceId: instructionsSourceId,
		sourceLocation:
			"Instructions for filing ITR-1 AY 2021-22, section 3C(d), page 2",
		citation: "ITR-1 instructions AY 2021-22, section 3C(d)",
		label: "deductions under section 57 other than family pension deduction",
	}),
	booleanExclusionRule({
		id: "ITR1-SCOPE-OTHER-PERSON-TDS",
		factKey: "scope.other-person-tds",
		sourceLocation:
			"Rule 12(1)(a) proviso (IG) reproduced in ITAT order, page 14",
		citation: "Rule 12(1)(a) proviso (IG) reproduced in ITAT order, page 14",
		label:
			"assessable income on which TDS was deducted in another person's hands",
	}),
];

const questionFor = ({
	id,
	factKey,
	prompt,
	helpText,
	requiresRuleId,
	answerSchema,
}: Readonly<{
	id: string;
	factKey: string;
	prompt: string;
	helpText: string;
	requiresRuleId: string | undefined;
	answerSchema: RulePackManifestAnalysisScopeRecord["questions"][number]["answerSchema"];
}>) => ({
	...(() => {
		const base = {
			id,
			factKey,
			prompt,
			helpText,
			whyRequired:
				requiresRuleId === undefined
					? "This composition fact is optional for scope and remains unresolved until evidence or an attested answer supplies it."
					: `This fact is required to evaluate ${requiresRuleId}. OpenITR keeps it unknown until evidence or an attested answer supplies it.`,
			answerSchema,
		};
		return requiresRuleId === undefined ? base : { ...base, requiresRuleId };
	})(),
});

const yesNo = { kind: "boolean" as const };
const money = {
	kind: "exact-money" as const,
	minimumWholeRupees: 0,
	maximumWholeRupees: null,
};
const wholeNumber = {
	kind: "whole-number" as const,
	minimum: 0,
	maximum: null,
};

const scopeQuestions: RulePackManifestAnalysisScopeRecord["questions"] = [
	questionFor({
		id: "scope-individual",
		factKey: "scope.taxpayer-is-individual",
		prompt: "Are you an individual taxpayer?",
		helpText: "ITR-1 scope is defined for an individual taxpayer.",
		requiresRuleId: "ITR1-SCOPE-INDIVIDUAL",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-resident-other-than-rnor",
		factKey: "scope.taxpayer-resident-other-than-rnor",
		prompt:
			"Were you Resident other than Resident but not ordinarily resident for FY 2025-26?",
		helpText: "Answer from your residential-status records for FY 2025-26.",
		requiresRuleId: "ITR1-SCOPE-RESIDENT-OTHER-THAN-RNOR",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-total-income",
		factKey: "scope.total-income",
		prompt:
			"What was your total income, including section 112A gains, for FY 2025-26?",
		helpText:
			"Do not leave this amount blank. OpenITR does not infer total income from one salary document.",
		requiresRuleId: "ITR1-SCOPE-TOTAL-INCOME-50-LAKH",
		answerSchema: money,
	}),
	questionFor({
		id: "scope-house-property-count",
		factKey: "scope.house-property-count",
		prompt:
			"How many house properties contributed income or loss to your FY 2025-26 analysis?",
		helpText:
			"Count properties contributing income or a current-year loss to this year's analysis, not every property you own. Distinguish a current-year property loss from a brought-forward or carry-forward loss. Enter 0, 1, or 2; three or more is outside this scope.",
		requiresRuleId: "ITR1-SCOPE-HOUSE-PROPERTIES",
		answerSchema: wholeNumber,
	}),
	questionFor({
		id: "scope-section112a-ltcg",
		factKey: "scope.section112a-ltcg",
		prompt:
			"What were your section 112A long-term capital gains for FY 2025-26?",
		helpText: "Enter zero when you had no section 112A gains.",
		requiresRuleId: "ITR1-SCOPE-SECTION-112A-LTCG",
		answerSchema: money,
	}),
	questionFor({
		id: "scope-other-capital-gains",
		factKey: "scope.other-capital-gains",
		prompt:
			"Did you have any capital gain or loss other than permitted section 112A gains, including short-term gains?",
		helpText:
			"Answer No when you had no other capital gains or losses. Any such amount is outside this ITR-1 analysis scope.",
		requiresRuleId: "ITR1-SCOPE-OTHER-CAPITAL-GAINS",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-agriculture",
		factKey: "scope.agriculture-income",
		prompt: "What was your agricultural income for FY 2025-26?",
		helpText: "Enter zero when you had no agricultural income.",
		requiresRuleId: "ITR1-SCOPE-AGRICULTURE",
		answerSchema: money,
	}),
	questionFor({
		id: "scope-salary-pension",
		factKey: "scope.salary-pension-income",
		prompt:
			"Did you receive salary or pension income from any source during FY 2025-26?",
		helpText:
			"Answer Yes when any employer or pension source applies. This presence question is non-blocking for scope and does not infer an all-employer aggregate or promise a complete calculation.",
		requiresRuleId: undefined,
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-bank-interest",
		factKey: "scope.bank-interest-income",
		prompt:
			"Did you receive savings-account or deposit interest during FY 2025-26?",
		helpText:
			"Reuse the existing savings-account and deposit interest answers or accepted evidence where available. Do not infer No from missing bank evidence.",
		requiresRuleId: undefined,
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-other-sources",
		factKey: "scope.allowed-other-sources-income",
		prompt:
			"Did you receive permitted other-source income other than savings-account or deposit interest, including ordinary dividends, other permitted interest, or family pension?",
		helpText:
			"Answer Yes when any permitted category other than savings-account or deposit interest applies. This presence question is non-blocking for scope and does not duplicate the bank-interest amount questions; other-source losses and special-rate categories are separate scope checks.",
		requiresRuleId: undefined,
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-business-profession",
		factKey: "scope.business-profession-income",
		prompt: "Did you have business or profession income or a loss?",
		helpText:
			"This includes income or a loss from a business or profession, regardless of whether it was small.",
		requiresRuleId: "ITR1-SCOPE-BUSINESS-PROFESSION",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-lottery",
		factKey: "scope.lottery-income",
		prompt: "Did you have lottery winnings?",
		helpText: "Include winnings even if tax was withheld.",
		requiresRuleId: "ITR1-SCOPE-LOTTERY",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-racehorse",
		factKey: "scope.racehorse-income",
		prompt: "Did you have income from racehorse ownership or maintenance?",
		helpText: "Answer yes if this category applied at any time in FY 2025-26.",
		requiresRuleId: "ITR1-SCOPE-RACEHORSE",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-115bbda",
		factKey: "scope.special-rate-115bbda-income",
		prompt: "Did you have income chargeable under section 115BBDA?",
		helpText:
			"Review the applicable special-rate classification before answering.",
		requiresRuleId: "ITR1-SCOPE-115BBDA",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-115bbe",
		factKey: "scope.special-rate-115bbe-income",
		prompt: "Did you have income chargeable under section 115BBE?",
		helpText:
			"Review the applicable special-rate classification before answering.",
		requiresRuleId: "ITR1-SCOPE-115BBE",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-online-games",
		factKey: "scope.special-rate-online-games-income",
		prompt: "Did you have income from online games taxed at a special rate?",
		helpText:
			"This scope check covers the special-rate exclusion, not a calculation of that income.",
		requiresRuleId: "ITR1-SCOPE-ONLINE-GAMES",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-vda",
		factKey: "scope.special-rate-vda-income",
		prompt:
			"Did you have virtual digital asset income taxed at a special rate?",
		helpText:
			"This scope check covers the special-rate exclusion, not a calculation of that income.",
		requiresRuleId: "ITR1-SCOPE-VDA",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-other-special-rate",
		factKey: "scope.other-special-rate-income-excluding-112a",
		prompt:
			"Did you have any other special-rate income, excluding permitted section 112A gains?",
		helpText:
			"This includes other special-rate categories that are not the permitted section 112A gains. Review the applicable classification before answering.",
		requiresRuleId: "ITR1-SCOPE-OTHER-SPECIAL-RATE",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-company-director",
		factKey: "scope.company-director",
		prompt: "Were you a director of a company during FY 2025-26?",
		helpText:
			"Answer yes if you held a company directorship at any time in the year.",
		requiresRuleId: "ITR1-SCOPE-COMPANY-DIRECTOR",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-unlisted-equity",
		factKey: "scope.unlisted-equity-held",
		prompt: "Did you hold unlisted equity at any time during FY 2025-26?",
		helpText: "Answer yes if the holding existed at any time in the year.",
		requiresRuleId: "ITR1-SCOPE-UNLISTED-EQUITY",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-foreign-assets",
		factKey: "scope.foreign-assets-interest",
		prompt:
			"Did you have foreign assets or a financial interest in a foreign entity?",
		helpText:
			"Include foreign financial interests even when they produced no income.",
		requiresRuleId: "ITR1-SCOPE-FOREIGN-ASSETS",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-foreign-signing",
		factKey: "scope.foreign-signing-authority",
		prompt: "Did you have signing authority in a foreign account?",
		helpText:
			"Answer yes if you had signing authority at any time in the year.",
		requiresRuleId: "ITR1-SCOPE-FOREIGN-SIGNING",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-foreign-income",
		factKey: "scope.foreign-source-income",
		prompt:
			"Did you have foreign-source income, including a retirement benefit account covered by section 89A?",
		helpText:
			"Foreign-source income is separate from the foreign-asset and signing-authority questions.",
		requiresRuleId: "ITR1-SCOPE-FOREIGN-INCOME",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-194n",
		factKey: "scope.tds-section-194n",
		prompt: "Was tax deducted under section 194N?",
		helpText: "Review your TDS evidence for section 194N.",
		requiresRuleId: "ITR1-SCOPE-194N",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-deferred-esop",
		factKey: "scope.deferred-esop-tax",
		prompt: "Did you have deferred tax on eligible start-up ESOPs?",
		helpText:
			"Review Form 16 and any employer statement for deferred ESOP tax.",
		requiresRuleId: "ITR1-SCOPE-DEFERRED-ESOP",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-brought-forward-losses",
		factKey: "scope.brought-forward-losses",
		prompt: "Did you have brought-forward losses?",
		helpText:
			"Do not treat a blank loss schedule as zero without reviewing your records.",
		requiresRuleId: "ITR1-SCOPE-BROUGHT-FORWARD-LOSSES",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-carry-forward-losses",
		factKey: "scope.carry-forward-losses",
		prompt: "Did you claim losses for carry-forward?",
		helpText: "This is separate from brought-forward losses used in the year.",
		requiresRuleId: "ITR1-SCOPE-CARRY-FORWARD-LOSSES",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-other-source-loss",
		factKey: "scope.other-source-loss",
		prompt: "Did you have a loss under the head Income from other sources?",
		helpText: "Family-pension deduction is not this loss question.",
		requiresRuleId: "ITR1-SCOPE-OTHER-SOURCE-LOSS",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-section5a",
		factKey: "scope.section5a-apportionment",
		prompt: "Did section 5A apportion any income between spouses?",
		helpText:
			"Answer yes when section 5A apportionment applied. Do not infer an exclusion from ordinary clubbed permitted income.",
		requiresRuleId: "ITR1-SCOPE-SECTION-5A",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-foreign-tax-relief",
		factKey: "scope.foreign-tax-relief",
		prompt: "Did you claim relief under section 90, 90A, or 91?",
		helpText: "Review foreign-tax relief evidence before answering.",
		requiresRuleId: "ITR1-SCOPE-FOREIGN-TAX-RELIEF",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-other-source-deductions",
		factKey: "scope.other-source-deductions",
		prompt:
			"Did you claim deductions under section 57 other than family-pension deduction?",
		helpText:
			"Family-pension deduction remains a permitted category; other section 57 deductions are outside this scope.",
		requiresRuleId: "ITR1-SCOPE-OTHER-SOURCE-DEDUCTIONS",
		answerSchema: yesNo,
	}),
	questionFor({
		id: "scope-other-person-tds",
		factKey: "scope.other-person-tds",
		prompt:
			"Was TDS deducted in another person's hands on income assessable to you?",
		helpText:
			"This is a separate Rule 12 boundary. Do not mark yes merely because income was clubbed under a permitted category.",
		requiresRuleId: "ITR1-SCOPE-OTHER-PERSON-TDS",
		answerSchema: yesNo,
	}),
];

const documentExpectations: RulePackManifestAnalysisScopeRecord["documentExpectations"] =
	[
		{
			id: "salary-and-pension-evidence",
			label: "Salary and pension evidence",
			documentKinds: ["form16-pdf", "prefilled-itr1-json"],
			factKeys: ["scope.salary-pension-income"],
			parserSupport: "supported",
			purpose:
				"Use every relevant official Form 16 PDF. Prefilled ITR-1 JSON is an official source, but the current adapter exposes only its reviewed salary and TDS fields.",
		},
		{
			id: "permitted-other-sources-evidence",
			label:
				"Permitted other-source evidence (excluding savings/deposit interest)",
			documentKinds: ["ais-json", "ais-csv", "form16a-pdf"],
			factKeys: ["scope.allowed-other-sources-income"],
			parserSupport: "expected-only",
			purpose:
				"Review ordinary dividends, other permitted interest, and family pension separately from savings-account and deposit interest. AIS and Form 16A cover named slices; other categories need review and are not silently inferred by the current adapters.",
		},
		{
			id: "bank-interest-evidence",
			label: "Savings-account and deposit interest evidence",
			documentKinds: ["ais-json", "ais-csv", "form16a-pdf"],
			factKeys: ["scope.bank-interest-income"],
			parserSupport: "expected-only",
			purpose:
				"Use AIS JSON/CSV and Form 16A where they establish interest. An explicit attested zero means this evidence is not needed; missing evidence remains unresolved.",
		},
		{
			id: "house-property-evidence",
			label: "House-property income/loss evidence",
			documentKinds: ["prefilled-itr1-json"],
			factKeys: ["scope.house-property-count"],
			parserSupport: "expected-only",
			purpose:
				"Review each property contributing income or a current-year loss to this year's analysis. The notified form includes up to two; a brought-forward or carry-forward loss is a separate scope fact. The current prefilled adapter does not promise complete property-field extraction.",
		},
		{
			id: "section112a-evidence",
			label: "Section 112A capital-gain evidence",
			documentKinds: ["prefilled-itr1-json", "ais-json", "ais-csv"],
			factKeys: ["scope.section112a-ltcg", "scope.other-capital-gains"],
			parserSupport: "expected-only",
			purpose:
				"The notified form permits section 112A gains up to ₹1,25,000 and excludes other capital gains. Current adapters do not promise broker or capital-gain schedule extraction.",
		},
		{
			id: "agriculture-evidence",
			label: "Agricultural-income evidence",
			documentKinds: ["prefilled-itr1-json"],
			factKeys: ["scope.agriculture-income"],
			parserSupport: "expected-only",
			purpose:
				"The notified form permits agricultural income up to ₹5,000. The current adapter does not promise a complete agricultural-income field adapter.",
		},
		{
			id: "tax-credit-evidence",
			label: "Tax-credit evidence",
			documentKinds: ["form26as-text", "form26as", "epay-tax-receipt-pdf"],
			factKeys: [
				"scope.salary-pension-income",
				"scope.bank-interest-income",
				"scope.allowed-other-sources-income",
			],
			parserSupport: "supported",
			purpose:
				"Use the supported official Form 26AS text or Excel export if TDS applies to the reported income. If you made advance-tax or self-assessment-tax payments, use the supported official e-Pay Tax receipt PDF. These records do not establish every income category or total income.",
		},
		{
			id: "deferred-esop-evidence",
			label: "Deferred ESOP-tax evidence",
			documentKinds: ["form16-pdf"],
			factKeys: ["scope.deferred-esop-tax"],
			parserSupport: "expected-only",
			purpose:
				"Review Form 16 and related official statements. The current salary adapter does not promise a deferred-ESOP field.",
		},
	];

const analysisScope = Object.freeze({
	facts: scopeFacts,
	rules: scopeRules,
	questions: scopeQuestions,
	documentExpectations,
	educationalLimitations: [
		"This is an educational analysis scope, not permission to file and not an official eligibility determination.",
		"Scope support does not mean every calculation or document field is implemented. Current adapters expose only their reviewed fields, and out-of-slice income remains blocked or limited.",
		"OpenITR does not provide tax, legal, accounting, investment, or professional advice and gives no correctness, completeness, refund, outcome, or portal-acceptance guarantee.",
	],
}) satisfies RulePackManifestAnalysisScopeRecord;

export const itr1Ay202627RulePackManifest20260903: RulePackManifest =
	Object.freeze({
		rulePackId: "itr1-ay2026-27.2026-09-03",
		form: "ITR-1",
		financialYear: "2025-26",
		assessmentYear: "2026-27",
		packRevision: "2026-09-03",
		engineContractVersion: "1",
		officialSources: [
			Object.freeze({
				id: "cbdt-notification-45-2026",
				title: "Notification No. 45/2026, G.S.R. 226(E)",
				authority:
					"Central Board of Direct Taxes, Ministry of Finance, Government of India",
				url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-04/Notification%20No.45_2026.pdf",
				releaseDate: "2026-03-30",
				retrievedDate: "2026-09-03",
				contentSha256:
					"b7ca15d6ca15c16ac8ad8c62cce86bc4b50b9208bcc07370298bff8515911964",
				redistributionStatus: "not-redistributed" as const,
			}),
			Object.freeze({
				id: "finance-act-2025",
				title: "The Finance Act, 2025",
				authority: "Ministry of Law and Justice, Government of India",
				url: "https://incometaxindia.gov.in/Documents/finance-act/finance-act-2025.pdf",
				releaseDate: "2025-03-29",
				retrievedDate: "2026-08-23",
				contentSha256:
					"5f1d3c8a90e24b67ad53c07e1b98f4d26c7ae35980bd14f72ea6c50938d21b47",
				redistributionStatus: "not-redistributed" as const,
			}),
			Object.freeze({
				id: "income-tax-act-1961",
				title: "Income-tax Act, 1961 (as amended for assessment year 2026-27)",
				authority: "Government of India",
				url: "https://incometaxindia.gov.in/pages/acts/income-tax-act.aspx",
				releaseDate: "1961-09-01",
				retrievedDate: "2026-08-23",
				contentSha256:
					"c94be60d28fa37b51ec06d95af72c8e30ba61d47fc93b25a08de746139c0fe82",
				redistributionStatus: "not-redistributed" as const,
			}),
			{
				id: "itr1-validation-rules-ay2026-27",
				title: "CBDT e-Filing ITR 1 Validation Rules AY 2026-27",
				authority:
					"Central Board of Direct Taxes, Income Tax Department, Government of India",
				url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-05/CBDT_e-Filing_ITR%201_Validation%20Rules_AY%202026-27.pdf",
				releaseDate: "2026-05-15",
				retrievedDate: "2026-09-03",
				contentSha256:
					"fd0e447af6c0a6ed43c29697722c4d469f42d5e7a0bad54e21bd4600803a100a",
				redistributionStatus: "not-redistributed" as const,
			},
			{
				id: "itr1-instructions-ay2021-22",
				title: "Instructions for filing ITR-1 (SAHAJ) AY 2021-22",
				authority: "Income Tax Department, Government of India",
				url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2021-05/Instructions_ITR1_AY2021_22.pdf",
				releaseDate: "2021-05-30",
				retrievedDate: "2026-09-03",
				contentSha256:
					"71e97ccf824b2db33e9e4c3f2a904dae960dfb002bd0eec3c43f83b6dbb28d71",
				redistributionStatus: "not-redistributed" as const,
			},
			{
				id: "itat-rule12-excerpt-dbs-2023",
				title:
					"DBS Technology Services India Private Limited, ITA 151/Hyd/2023 and CO 2/Hyd/2023",
				authority:
					"Income Tax Appellate Tribunal, Hyderabad Bench, Government of India",
				url: "https://itat.gov.in/public/files/upload/1690783457-DBS%20Technology%20Services%20ITA%20151-Hyd-2023%20%26%20CO%202-21-07-23.pdf",
				releaseDate: "2023-07-21",
				retrievedDate: "2026-09-03",
				contentSha256:
					"d2b4cf8153c5c7fed9531907a75d6cf2bdce419da77488a7b8dce015d9d2a7e9",
				redistributionStatus: "not-redistributed" as const,
			},
		],
		supportedRules: [
			Object.freeze({
				id: "ITR1-ELIGIBILITY-RESIDENT",
				citation:
					"Notification No. 45/2026, Form ITR-1 heading, Gazette page 16",
				sourceId: "cbdt-notification-45-2026",
				sourceLocation: "Form ITR-1 heading, Gazette page 16",
			}),
			Object.freeze({
				id: "ITR1-INCOME-AGGREGATION-SECTION-14",
				citation:
					"Income-tax Act, 1961, section 14, aggregation of salary and income from other sources into total income before rounding",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 14",
			}),
			Object.freeze({
				id: "ITR1-INTEREST-INCOME-SECTION-56",
				citation:
					"Income-tax Act, 1961, section 56, interest from savings accounts and deposits chargeable under income from other sources",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 56(1)",
			}),
			Object.freeze({
				id: "ITR1-NR-CESS",
				citation:
					"The Finance Act, 2025, health and education cess at four per cent of income-tax and surcharge",
				sourceId: "finance-act-2025",
				sourceLocation: "Health and education cess provision, four per cent",
			}),
			Object.freeze({
				id: "ITR1-NR-INCOME-TAX-BEFORE-ADJUSTMENTS",
				citation:
					"Income-tax Act, 1961, section 115BAC(1A) slab computation on rounded total income",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 115BAC(1A)",
			}),
			Object.freeze({
				id: "ITR1-NR-REBATE-MARGINAL-RELIEF-87A",
				citation:
					"The Finance Act, 2025, marginal relief where tax exceeds the excess of total income over twelve lakh rupees",
				sourceId: "finance-act-2025",
				sourceLocation: "Marginal-relief proviso to the section 87A amendment",
			}),
			Object.freeze({
				id: "ITR1-NR-REBATE-SECTION-87A",
				citation:
					"The Finance Act, 2025, rebate up to sixty thousand rupees where total income does not exceed twelve lakh rupees, resident individuals only",
				sourceId: "finance-act-2025",
				sourceLocation:
					"Amendment to section 87A, clause for resident individuals",
			}),
			Object.freeze({
				id: "ITR1-NR-SLAB-TAX-115BAC",
				citation:
					"The Finance Act, 2025, substituted slab rates for individual non-business regimes effective financial year 2025-26",
				sourceId: "finance-act-2025",
				sourceLocation:
					"Amendment to clause (i) of sub-section (1A) of section 115BAC",
			}),
			Object.freeze({
				id: "ITR1-NR-STANDARD-DEDUCTION-16IA",
				citation:
					"The Finance Act, 2025, standard deduction of seventy-five thousand rupees from salary income",
				sourceId: "finance-act-2025",
				sourceLocation: "Amendment to section 16(ia)",
			}),
			Object.freeze({
				id: "ITR1-NR-SURCHARGE",
				citation:
					"Surcharge on income-tax for the new regime, capped at twenty-five per cent",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Annual rate schedule read with section 115BAC(1B)",
			}),
			Object.freeze({
				id: "ITR1-NR-SURCHARGE-MARGINAL-RELIEF",
				citation:
					"Income-tax Act, 1961, marginal relief limiting the surcharge where total income marginally exceeds a surcharge threshold",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Annual rate schedule read with section 115BAC(1B)",
			}),
			Object.freeze({
				id: "ITR1-SALARY-EXEMPT-ALLOWANCES-SECTION-10",
				citation:
					"Income-tax Act, 1961, section 10 exemptions reported as reductions in Form 16 Part A",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 10",
			}),
			Object.freeze({
				id: "ITR1-SALARY-INCOME-SECTION-15",
				citation:
					"Income-tax Act, 1961, section 15, salary chargeable to income-tax read with Form 16 Part A",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 15",
			}),
			Object.freeze({
				id: "ITR1-TDS-CREDIT-SECTION-199",
				citation:
					"Income-tax Act, 1961, section 199, credit against tax for tax deducted at source as reported in Form 26AS Part I",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 199",
			}),
			Object.freeze({
				id: "ITR1-TAX-ROUNDING-288B",
				citation:
					"Income-tax Act, 1961, section 288B, rounding of tax payable to the nearest multiple of ten rupees",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 288B",
			}),
			Object.freeze({
				id: "ITR1-TOTAL-INCOME-ROUNDING-288A",
				citation:
					"Income-tax Act, 1961, section 288A, rounding of total income to the nearest multiple of ten rupees",
				sourceId: "income-tax-act-1961",
				sourceLocation: "Section 288A",
			}),
			...scopeRules.map((rule) => ({
				id: rule.id,
				citation: rule.citation,
				sourceId: rule.sourceId,
				sourceLocation: rule.sourceLocation,
			})),
		],
		scopeCheck: Object.freeze({
			questionId: "itr1-resident-individual",
			prompt:
				"For FY 2025-26, were you an individual with Resident status, excluding Resident but not ordinarily resident?",
			helpText:
				"Answer No if your status was Resident but not ordinarily resident or Non-resident.",
			requiresRuleId: "ITR1-ELIGIBILITY-RESIDENT",
			suppliesFactKey: "taxpayer.residential-status",
			blockingIssueCode: "RULE_ITR1_RESIDENT_STATUS_UNSUPPORTED",
			supportedResult: Object.freeze({
				title: "Supported by this scope check",
				explanation:
					"You answered Yes. Rule ITR1-ELIGIBILITY-RESIDENT permits ITR-1 analysis for an individual who is resident other than not ordinarily resident.",
			}),
			unsupportedResult: Object.freeze({
				title: "Not supported by this scope check",
				explanation:
					"You answered No. Rule ITR1-ELIGIBILITY-RESIDENT limits ITR-1 analysis to an individual who is resident other than not ordinarily resident.",
				recoveryAction:
					"Stop this ITR-1 analysis and review another return-form scope or consult a qualified professional.",
			}),
		}),
		missingFactQuestions: [
			Object.freeze({
				id: "bank-interest-savings-account-total",
				prompt:
					"How much savings-account interest did you receive in FY 2025-26?",
				helpText:
					"Answer from your passbook, bank statements, or the bank's annual interest summary once you can attest a figure.",
				requiresRuleId: "ITR1-INTEREST-INCOME-SECTION-56",
				suppliesFactKey: "bank-interest.savings-account",
				whyRequired:
					"Section 56 charges savings-account interest as income from other sources, and no selected source document has supplied this total yet.",
				affectedResult: Object.freeze({
					resultId: "refund-or-payable-estimate",
					label: "Estimated refund or amount payable",
				}),
				answerSchema: Object.freeze({
					kind: "exact-money",
					minimumWholeRupees: 0,
					maximumWholeRupees: null,
				}),
			}),
			Object.freeze({
				id: "bank-interest-deposits-total",
				prompt:
					"How much interest on deposits (fixed or recurring) did you receive in FY 2025-26?",
				helpText:
					"Answer from your deposit statements or the bank's annual interest summary once you can attest a figure.",
				requiresRuleId: "ITR1-INTEREST-INCOME-SECTION-56",
				suppliesFactKey: "bank-interest.deposits",
				whyRequired:
					"Section 56 charges deposit interest as income from other sources, and no selected source document has supplied this total yet.",
				affectedResult: Object.freeze({
					resultId: "refund-or-payable-estimate",
					label: "Estimated refund or amount payable",
				}),
				answerSchema: Object.freeze({
					kind: "exact-money",
					minimumWholeRupees: 0,
					maximumWholeRupees: null,
				}),
			}),
		],
		taxConstants: Object.freeze({
			newRegime: newRegimeTaxConstants,
		}),
		analysisScope,
	});
