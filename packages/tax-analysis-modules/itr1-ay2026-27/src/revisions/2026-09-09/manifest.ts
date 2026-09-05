import type { RulePackManifest } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260908 } from "../2026-09-08/manifest";

const validationSource = "itr1-validation-rules-ay2026-27";

const rules = Object.freeze({
	sharedLimit: Object.freeze({
		id: "ITR1-OR-80CCE-SHARED-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, old-regime aggregate of sections 80C, 80CCC, and 80CCD(1) cannot exceed one lakh fifty thousand rupees",
		sourceId: validationSource,
		sourceLocation: "Category A rule 1, page 5",
	}),
	section80ccd1Employee: Object.freeze({
		id: "ITR1-OR-80CCD1-EMPLOYEE-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80CCD(1) employee deduction limited to ten per cent of salary",
		sourceId: validationSource,
		sourceLocation: "Category A rule 3, page 5",
	}),
	section80ccd1Other: Object.freeze({
		id: "ITR1-OR-80CCD1-OTHER-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80CCD(1) non-employee deduction limited to twenty per cent of gross total income",
		sourceId: validationSource,
		sourceLocation: "Category A rule 2, page 5",
	}),
	section80ccd1b: Object.freeze({
		id: "ITR1-OR-80CCD1B-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80CCD(1B) deduction limited to fifty thousand rupees",
		sourceId: validationSource,
		sourceLocation: "Category A rule 115, page 10",
	}),
	oldGovernmentEmployer: Object.freeze({
		id: "ITR1-OR-80CCD2-GOVERNMENT-EMPLOYER-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, old-regime government-employer section 80CCD(2) deduction limited to fourteen per cent of salary",
		sourceId: validationSource,
		sourceLocation: "Category A rule 120, page 11",
	}),
	oldOtherEmployer: Object.freeze({
		id: "ITR1-OR-80CCD2-OTHER-EMPLOYER-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, old-regime section 80CCD(2) deduction for other employers limited to ten per cent of salary",
		sourceId: validationSource,
		sourceLocation: "Category A rule 4, page 5",
	}),
	newEmployer: Object.freeze({
		id: "ITR1-NR-80CCD2-EMPLOYER-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, new-regime section 80CCD(2) deduction limited to fourteen per cent of salary for all listed employer categories",
		sourceId: validationSource,
		sourceLocation: "Category A rule 216, page 16",
	}),
	newRegimeExclusions: Object.freeze({
		id: "ITR1-NR-CHAPTER-VIA-EXCLUSIONS",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, sections 80C, 80CCC, 80CCD(1), and 80CCD(1B) are unavailable under the new regime",
		sourceId: validationSource,
		sourceLocation: "Category A rules 153 and 169, page 13",
	}),
	supportingDetails: Object.freeze({
		id: "ITR1-SAVINGS-PENSION-SUPPORTING-DETAILS",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, section 80C supporting-document identification and PRAN requirements for sections 80CCD(1) and 80CCD(1B)",
		sourceId: validationSource,
		sourceLocation: "Category A rules 224 and 226, page 16",
	}),
});

const result = Object.freeze({
	resultId: "savings-pension-deductions",
	label: "Savings and pension-contribution deductions",
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
	visibility: Readonly<
		| { kind: "fact-boolean-equals"; factKey: string; value: boolean }
		| { kind: "fact-money-greater-than"; factKey: string; wholeRupees: number }
	>;
}>) =>
	Object.freeze({
		id,
		prompt,
		helpText,
		requiresRuleId,
		suppliesFactKey: factKey,
		whyRequired:
			"The pinned deduction rules need this exact amount. A blank value remains unknown; enter zero only when this category did not apply.",
		affectedResult: result,
		answerSchema: Object.freeze({
			kind: "exact-money" as const,
			minimumWholeRupees: 0,
			maximumWholeRupees: null,
		}),
		visibility,
	});

const present = Object.freeze({
	kind: "fact-boolean-equals" as const,
	factKey: "deductions.savings-pension-present",
	value: true,
});

const priorConstants = itr1Ay202627RulePackManifest20260908.taxConstants;
if (priorConstants === undefined) {
	throw new Error("The prior rule pack has no tax constants");
}

export const itr1Ay202627RulePackManifest20260909 = Object.freeze({
	...itr1Ay202627RulePackManifest20260908,
	rulePackId: "itr1-ay2026-27.2026-09-09",
	packRevision: "2026-09-09",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260908.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260908.missingFactQuestions ?? []),
		Object.freeze({
			id: "savings-pension-deductions-present",
			prompt:
				"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
			helpText:
				"Answer Yes for eligible savings or pension contributions made by you, an eligible family member where section 80C permits it, or your employer. A blank answer is not No.",
			requiresRuleId: rules.sharedLimit.id,
			suppliesFactKey: "deductions.savings-pension-present",
			whyRequired:
				"This answer controls whether the category amounts and their statutory bases are needed.",
			affectedResult: result,
			answerSchema: Object.freeze({ kind: "boolean" as const }),
			visibility: Object.freeze({ kind: "always" as const }),
		}),
		amountQuestion({
			id: "deduction-80c-amount",
			prompt: "What was your eligible section 80C amount for FY 2025-26?",
			helpText:
				"Enter the eligible amount before the shared limit, covering only supported section 80C payments for you or an eligible family member.",
			factKey: "deductions.80c",
			requiresRuleId: rules.supportingDetails.id,
			visibility: present,
		}),
		amountQuestion({
			id: "deduction-80ccc-amount",
			prompt: "What did you contribute to an eligible section 80CCC pension annuity for FY 2025-26?",
			helpText: "Enter your eligible contribution before the shared limit.",
			factKey: "deductions.80ccc",
			requiresRuleId: rules.sharedLimit.id,
			visibility: present,
		}),
		amountQuestion({
			id: "deduction-80ccd1-amount",
			prompt: "What did you contribute under section 80CCD(1) for FY 2025-26?",
			helpText:
				"Enter your eligible Tier-I pension contribution allocated to section 80CCD(1), before its percentage and shared limits.",
			factKey: "deductions.80ccd1",
			requiresRuleId: rules.section80ccd1Employee.id,
			visibility: present,
		}),
		Object.freeze({
			id: "deduction-80ccd1-employed",
			prompt: "Were you an employee for the section 80CCD(1) contribution?",
			helpText:
				"Employee contributions use the salary base. A person who was not an employee uses the applicable gross-total-income base.",
			requiresRuleId: rules.section80ccd1Employee.id,
			suppliesFactKey: "deductions.80ccd1-employed",
			whyRequired:
				"The pinned rules apply different percentage bases to employee and non-employee contributions.",
			affectedResult: result,
			answerSchema: Object.freeze({ kind: "boolean" as const }),
			visibility: Object.freeze({
				kind: "fact-money-greater-than" as const,
				factKey: "deductions.80ccd1",
				wholeRupees: 0,
			}),
		}),
		amountQuestion({
			id: "deduction-80ccd1-salary-base",
			prompt: "What salary amount is the section 80CCD(1) percentage based on?",
			helpText:
				"Enter the eligible salary base used by section 80CCD(1), not gross salary or taxable income unless it is the statutory base.",
			factKey: "deductions.80ccd1-salary-base",
			requiresRuleId: rules.section80ccd1Employee.id,
			visibility: Object.freeze({
				kind: "fact-boolean-equals",
				factKey: "deductions.80ccd1-employed",
				value: true,
			}),
		}),
		amountQuestion({
			id: "deduction-80ccd1-gti-base",
			prompt: "What gross total income amount is the section 80CCD(1) percentage based on?",
			helpText:
				"Enter the applicable gross total income before Chapter VI-A deductions for the non-employee percentage limit.",
			factKey: "deductions.80ccd1-gti-base",
			requiresRuleId: rules.section80ccd1Other.id,
			visibility: Object.freeze({
				kind: "fact-boolean-equals",
				factKey: "deductions.80ccd1-employed",
				value: false,
			}),
		}),
		amountQuestion({
			id: "deduction-80ccd1b-amount",
			prompt: "What additional contribution did you allocate to section 80CCD(1B) for FY 2025-26?",
			helpText:
				"Enter only the contribution not already allocated to section 80CCD(1).",
			factKey: "deductions.80ccd1b",
			requiresRuleId: rules.section80ccd1b.id,
			visibility: present,
		}),
		amountQuestion({
			id: "deduction-80ccd2-government-amount",
			prompt: "How much did Central or State Government employers contribute under section 80CCD(2)?",
			helpText:
				"Combine only employer contributions from Central or State Government employment.",
			factKey: "deductions.80ccd2-government",
			requiresRuleId: rules.oldGovernmentEmployer.id,
			visibility: present,
		}),
		amountQuestion({
			id: "deduction-80ccd2-government-salary-base",
			prompt: "What salary base applies to those government-employer contributions?",
			helpText:
				"Enter the combined eligible salary base for the Central or State Government employer contributions.",
			factKey: "deductions.80ccd2-government-salary-base",
			requiresRuleId: rules.oldGovernmentEmployer.id,
			visibility: Object.freeze({
				kind: "fact-money-greater-than",
				factKey: "deductions.80ccd2-government",
				wholeRupees: 0,
			}),
		}),
		amountQuestion({
			id: "deduction-80ccd2-other-amount",
			prompt: "How much did PSU or other employers contribute under section 80CCD(2)?",
			helpText:
				"Combine only employer contributions from PSU or other non-government employment.",
			factKey: "deductions.80ccd2-other",
			requiresRuleId: rules.oldOtherEmployer.id,
			visibility: present,
		}),
		amountQuestion({
			id: "deduction-80ccd2-other-salary-base",
			prompt: "What salary base applies to those PSU or other-employer contributions?",
			helpText:
				"Enter the combined eligible salary base for the PSU or other-employer contributions.",
			factKey: "deductions.80ccd2-other-salary-base",
			requiresRuleId: rules.oldOtherEmployer.id,
			visibility: Object.freeze({
				kind: "fact-money-greater-than",
				factKey: "deductions.80ccd2-other",
				wholeRupees: 0,
			}),
		}),
		Object.freeze({
			id: "savings-pension-proof-available",
			prompt: "Do you have supporting details available for every positive savings or pension amount?",
			helpText:
				"Examples include the section 80C document identifier, pension contribution record, PRAN details, and employer contribution evidence. OpenITR does not currently extract these fields from documents.",
			requiresRuleId: rules.supportingDetails.id,
			suppliesFactKey: "deductions.savings-pension-proof-available",
			whyRequired:
				"The analysis must distinguish a supported amount from an attested amount whose evidence still needs review.",
			affectedResult: result,
			answerSchema: Object.freeze({ kind: "boolean" as const }),
			visibility: present,
		}),
	]),
	taxConstants: Object.freeze({
		...priorConstants,
		savingsPensionDeductions: Object.freeze({
			sharedLimitWholeRupees: 150_000,
			section80ccd1EmployeeSalaryPercent: 10,
			section80ccd1OtherGrossTotalIncomePercent: 20,
			section80ccd1bLimitWholeRupees: 50_000,
			oldRegimeGovernmentEmployerSalaryPercent: 14,
			oldRegimeOtherEmployerSalaryPercent: 10,
			newRegimeEmployerSalaryPercent: 14,
			sharedLimitRuleId: rules.sharedLimit.id,
			section80ccd1EmployeeLimitRuleId: rules.section80ccd1Employee.id,
			section80ccd1OtherLimitRuleId: rules.section80ccd1Other.id,
			section80ccd1bLimitRuleId: rules.section80ccd1b.id,
			oldRegimeGovernmentEmployerLimitRuleId:
				rules.oldGovernmentEmployer.id,
			oldRegimeOtherEmployerLimitRuleId: rules.oldOtherEmployer.id,
			newRegimeEmployerLimitRuleId: rules.newEmployer.id,
			newRegimeExclusionRuleId: rules.newRegimeExclusions.id,
			proofRuleId: rules.supportingDetails.id,
		}),
	}),
}) satisfies RulePackManifest;
