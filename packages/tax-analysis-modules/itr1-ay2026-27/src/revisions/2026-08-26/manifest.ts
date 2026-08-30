import type {
	NewRegimeTaxConstantRecord,
	RulePackManifest,
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

export const itr1Ay202627RulePackManifest20260826 = Object.freeze({
	rulePackId: "itr1-ay2026-27.2026-08-26",
	form: "ITR-1",
	financialYear: "2025-26",
	assessmentYear: "2026-27",
	packRevision: "2026-08-26",
	engineContractVersion: "1",
	officialSources: [
		Object.freeze({
			id: "cbdt-notification-45-2026",
			title: "Notification No. 45/2026, G.S.R. 226(E)",
			authority:
				"Central Board of Direct Taxes, Ministry of Finance, Government of India",
			url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-04/Notification%20No.45_2026.pdf",
			releaseDate: "2026-03-30",
			retrievedDate: "2026-08-22",
			contentSha256:
				"b7ca15d6ca15c16ac8ad8c62cce86bc4b50b9208bcc07370298bff8515911964",
			redistributionStatus: "not-redistributed",
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
			redistributionStatus: "not-redistributed",
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
			redistributionStatus: "not-redistributed",
		}),
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
			sourceLocation: "Amendment to section 87A, clause for resident individuals",
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
}) satisfies RulePackManifest;
