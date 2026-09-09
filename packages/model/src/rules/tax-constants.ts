import type { IsoDate, RuleId } from "../primitives";

// One progressive-rate band. `upperBoundWholeRupees` is the inclusive top of
// the band; the final band of every schedule is open-ended (null).
export type RulePackSlabBand = Readonly<{
	upperBoundWholeRupees: number | null;
	ratePercent: number;
}>;

// Surcharge applies when total income exceeds
// `exceedsTotalIncomeWholeRupees`.
export type RulePackSurchargeTier = Readonly<{
	exceedsTotalIncomeWholeRupees: number;
	ratePercent: number;
}>;

// Authored new-regime computation constants. Every group carries the stable
// identifier of the supported rule that owns it, so each trace node can cite
// its rule without duplicating a threshold in code.
export type NewRegimeTaxConstantRecord = Readonly<{
	slabBands: readonly [RulePackSlabBand, ...RulePackSlabBand[]];
	slabRuleId: string;
	standardDeductionWholeRupees: number;
	standardDeductionRuleId: string;
	rebateMaxTotalIncomeWholeRupees: number;
	rebateMaxAmountWholeRupees: number;
	rebateRuleId: string;
	rebateMarginalReliefRuleId: string;
	surchargeTiers: readonly RulePackSurchargeTier[];
	surchargeRuleId: string;
	cessRatePercent: number;
	cessRuleId: string;
	totalIncomeRoundingBaseWholeRupees: number;
	totalIncomeRoundingRuleId: string;
	taxRoundingBaseWholeRupees: number;
	taxRoundingRuleId: string;
	completeComputation?: Readonly<{
		itr1NormalRateIncomeLimitWholeRupees: number;
		itr1NormalRateIncomeLimitRuleId: string;
		incomeAggregationRuleId: string;
		housePropertyLossSetoffRuleId: string;
		deductionCompositionRuleId: string;
	}>;
}>;

export type RulePackManifestTaxConstants = Readonly<{
	newRegime: NewRegimeTaxConstantRecord;
	oldRegime?: OldRegimeTaxConstantRecord;
	selfOccupiedHouseProperty?: SelfOccupiedHousePropertyTaxConstantRecord;
	houseProperty?: HousePropertyTaxConstantRecord;
	otherSources?: OtherSourcesTaxConstantRecord;
	section112aCapitalGain?: Section112aCapitalGainTaxConstantRecord;
	agriculturalIncome?: AgriculturalIncomeTaxConstantRecord;
	savingsPensionDeductions?: SavingsPensionDeductionTaxConstantRecord;
	healthDisabilityDeductions?: HealthDisabilityDeductionTaxConstantRecord;
	loanInterestDeductions?: LoanInterestDeductionTaxConstantRecord;
	donationDeductions?: DonationDeductionTaxConstantRecord;
	remainingDeductions?: RemainingDeductionTaxConstantRecord;
}>;

export type OldRegimeAgeCategory = "under-60" | "60-to-79" | "80-or-older";

export type OldRegimeTaxConstantRecord = Readonly<{
	slabBandsByAge: Readonly<
		Record<
			OldRegimeAgeCategory,
			readonly [RulePackSlabBand, ...RulePackSlabBand[]]
		>
	>;
	slabRuleId: string;
	standardDeductionWholeRupees: number;
	standardDeductionRuleId: string;
	housePropertyLossSetoffLimitWholeRupees: number;
	housePropertyLossSetoffRuleId: string;
	itr1TotalIncomeLimitWholeRupees: number;
	itr1TotalIncomeLimitRuleId: string;
	rebateMaxTotalIncomeWholeRupees: number;
	rebateMaxAmountWholeRupees: number;
	rebateRuleId: string;
	surchargeThresholdWholeRupees: number;
	surchargeRuleId: string;
	surchargeMarginalReliefRuleId: string;
	cessRatePercent: number;
	cessRuleId: string;
	totalIncomeRoundingBaseWholeRupees: number;
	totalIncomeRoundingRuleId: string;
	taxRoundingBaseWholeRupees: number;
	taxRoundingRuleId: string;
	incomeAggregationRuleId: string;
	deductionLimitRuleId: string;
	section112aTaxRuleId: string;
	agriculturalIncomeRuleId: string;
}>;

export type SelfOccupiedHousePropertyTaxConstantRecord = Readonly<{
	enhancedInterestLimitWholeRupees: number;
	basicInterestLimitWholeRupees: number;
	annualValueRuleId: string;
	oldRegimeInterestRuleId: string;
	newRegimeInterestRuleId: string;
}>;

export type HousePropertyTaxConstantRecord = Readonly<{
	selfOccupiedEnhancedInterestLimitWholeRupees: number;
	selfOccupiedBasicInterestLimitWholeRupees: number;
	letOutStandardDeductionPercent: number;
	selfOccupiedAnnualValueRuleId: string;
	selfOccupiedOldRegimeInterestRuleId: string;
	selfOccupiedNewRegimeInterestRuleId: string;
	letOutGrossAnnualValueRuleId: string;
	letOutMunicipalTaxRuleId: string;
	letOutStandardDeductionRuleId: string;
	letOutInterestRuleId: string;
}>;

export type OtherSourcesTaxConstantRecord = Readonly<{
	familyPensionDeductionDivisor: number;
	oldRegimeFamilyPensionDeductionLimitWholeRupees: number;
	newRegimeFamilyPensionDeductionLimitWholeRupees: number;
	dividendRuleId: string;
	interestRuleId: string;
	familyPensionIncomeRuleId: string;
	oldRegimeFamilyPensionDeductionRuleId: string;
	newRegimeFamilyPensionDeductionRuleId: string;
	totalRuleId: string;
}>;

export type Section112aCapitalGainTaxConstantRecord = Readonly<{
	itr1GainLimitWholeRupees: number;
	taxFreeThresholdWholeRupees: number;
	taxRateBasisPoints: number;
	taxRoundingBaseWholeRupees: number;
	classificationRuleId: string;
	gainRuleId: string;
	itr1LimitRuleId: string;
	taxRuleId: string;
	taxRoundingRuleId: string;
}>;

export type AgriculturalIncomeTaxConstantRecord = Readonly<{
	itr1LimitWholeRupees: number;
	exemptReportingRuleId: string;
	itr1LimitRuleId: string;
}>;

export type SavingsPensionDeductionTaxConstantRecord = Readonly<{
	sharedLimitWholeRupees: number;
	section80ccd1EmployeeSalaryPercent: number;
	section80ccd1OtherGrossTotalIncomePercent: number;
	section80ccd1bLimitWholeRupees: number;
	oldRegimeGovernmentEmployerSalaryPercent: number;
	oldRegimeOtherEmployerSalaryPercent: number;
	newRegimeEmployerSalaryPercent: number;
	sharedLimitRuleId: string;
	section80ccd1EmployeeLimitRuleId: string;
	section80ccd1OtherLimitRuleId: string;
	section80ccd1bLimitRuleId: string;
	oldRegimeGovernmentEmployerLimitRuleId: string;
	oldRegimeOtherEmployerLimitRuleId: string;
	newRegimeEmployerLimitRuleId: string;
	newRegimeExclusionRuleId: string;
	proofRuleId: string;
}>;

export type HealthDisabilityDeductionTaxConstantRecord = Readonly<{
	healthRegularGroupLimitWholeRupees: number;
	healthSeniorGroupLimitWholeRupees: number;
	healthPreventiveSharedLimitWholeRupees: number;
	healthOverallLimitWholeRupees: number;
	dependentDisabilityAmountWholeRupees: number;
	dependentSevereDisabilityAmountWholeRupees: number;
	specifiedDiseaseLimitWholeRupees: number;
	specifiedDiseaseSeniorLimitWholeRupees: number;
	taxpayerDisabilityAmountWholeRupees: number;
	taxpayerSevereDisabilityAmountWholeRupees: number;
	healthGroupLimitsRuleId: string;
	healthPreventiveLimitRuleId: string;
	healthDetailsRuleId: string;
	healthNewRegimeExclusionRuleId: string;
	dependentDisabilityRuleId: string;
	dependentDisabilityDetailsRuleId: string;
	dependentDisabilityNewRegimeExclusionRuleId: string;
	specifiedDiseaseRuleId: string;
	specifiedDiseaseDetailsRuleId: string;
	specifiedDiseaseNewRegimeExclusionRuleId: string;
	taxpayerDisabilityRuleId: string;
	taxpayerDisabilityDetailsRuleId: string;
	taxpayerDisabilityNewRegimeExclusionRuleId: string;
}>;

export type LoanInterestDeductionTaxConstantRecord = Readonly<{
	section80eEarliestFirstInterestPaymentDate: string;
	section80eCurrentFinancialYearEndDate: string;
	section80eeSanctionStartDate: string;
	section80eeSanctionEndDate: string;
	section80eeLimitWholeRupees: number;
	section80eeLoanLimitWholeRupees: number;
	section80eePropertyValueLimitWholeRupees: number;
	section80eeaSanctionStartDate: string;
	section80eeaSanctionEndDate: string;
	section80eeaLimitWholeRupees: number;
	section80eeaStampValueLimitWholeRupees: number;
	section80eebSanctionStartDate: string;
	section80eebSanctionEndDate: string;
	section80eebLimitWholeRupees: number;
	section80eEligibilityRuleId: string;
	section80ePeriodRuleId: string;
	section80eDetailsRuleId: string;
	section80eeEligibilityRuleId: string;
	section80eeLimitRuleId: string;
	section80eeDetailsRuleId: string;
	section80eeaEligibilityRuleId: string;
	section80eeaLimitRuleId: string;
	section80eeaDetailsRuleId: string;
	section80eeMutualExclusionRuleId: string;
	section80eebEligibilityRuleId: string;
	section80eebLimitRuleId: string;
	section80eebDetailsRuleId: string;
	newRegimeExclusionRuleId: string;
}>;

export type DonationDeductionTaxConstantRecord = Readonly<{
	cashPaymentLimitWholeRupees: number;
	adjustedGrossTotalIncomeLimitPercent: number;
	fullQualifyingPercent: number;
	halfQualifyingPercent: number;
	classificationRuleId: string;
	paymentRuleId: string;
	adjustedGrossTotalIncomeRuleId: string;
	recipientQualificationRuleId: string;
	evidenceRuleId: string;
	newRegimeExclusionRuleId: string;
}>;

export type RemainingDeductionTaxConstantRecord = Readonly<{
	section80ttaLimitWholeRupees: number;
	section80ttbLimitWholeRupees: number;
	section80cchSalaryLimitBasisPoints: number;
	section80ggAnnualLimitWholeRupees: number;
	section80ggRentReductionPercent: number;
	section80ggIncomeLimitPercent: number;
	section80ggaCashPaymentLimitWholeRupees: number;
	section80ttaRuleId: string;
	section80ttbRuleId: string;
	section80cchRuleId: string;
	section80ggRuleId: string;
	section80ggaRuleId: string;
	section80ggcRuleId: string;
	newRegimeExclusionRuleId: string;
	unsupportedOtherRuleId: string;
}>;

// The compiled form resolves every authored rule identifier to a validated
// RuleId before publication.
export type CompiledNewRegimeTaxConstants = Readonly<{
	slabBands: readonly [RulePackSlabBand, ...RulePackSlabBand[]];
	slabRuleId: RuleId;
	standardDeductionWholeRupees: number;
	standardDeductionRuleId: RuleId;
	rebateMaxTotalIncomeWholeRupees: number;
	rebateMaxAmountWholeRupees: number;
	rebateRuleId: RuleId;
	rebateMarginalReliefRuleId: RuleId;
	surchargeTiers: readonly RulePackSurchargeTier[];
	surchargeRuleId: RuleId;
	cessRatePercent: number;
	cessRuleId: RuleId;
	totalIncomeRoundingBaseWholeRupees: number;
	totalIncomeRoundingRuleId: RuleId;
	taxRoundingBaseWholeRupees: number;
	taxRoundingRuleId: RuleId;
	completeComputation?: Readonly<{
		itr1NormalRateIncomeLimitWholeRupees: number;
		itr1NormalRateIncomeLimitRuleId: RuleId;
		incomeAggregationRuleId: RuleId;
		housePropertyLossSetoffRuleId: RuleId;
		deductionCompositionRuleId: RuleId;
	}>;
}>;

export type CompiledTaxConstants = Readonly<{
	newRegime: CompiledNewRegimeTaxConstants;
	oldRegime?: CompiledOldRegimeTaxConstants;
	selfOccupiedHouseProperty?: CompiledSelfOccupiedHousePropertyTaxConstants;
	houseProperty?: CompiledHousePropertyTaxConstants;
	otherSources?: CompiledOtherSourcesTaxConstants;
	section112aCapitalGain?: CompiledSection112aCapitalGainTaxConstants;
	agriculturalIncome?: CompiledAgriculturalIncomeTaxConstants;
	savingsPensionDeductions?: CompiledSavingsPensionDeductionTaxConstants;
	healthDisabilityDeductions?: CompiledHealthDisabilityDeductionTaxConstants;
	loanInterestDeductions?: CompiledLoanInterestDeductionTaxConstants;
	donationDeductions?: CompiledDonationDeductionTaxConstants;
	remainingDeductions?: CompiledRemainingDeductionTaxConstants;
}>;

export type CompiledOldRegimeTaxConstants = Readonly<{
	slabBandsByAge: Readonly<
		Record<
			OldRegimeAgeCategory,
			readonly [RulePackSlabBand, ...RulePackSlabBand[]]
		>
	>;
	slabRuleId: RuleId;
	standardDeductionWholeRupees: number;
	standardDeductionRuleId: RuleId;
	housePropertyLossSetoffLimitWholeRupees: number;
	housePropertyLossSetoffRuleId: RuleId;
	itr1TotalIncomeLimitWholeRupees: number;
	itr1TotalIncomeLimitRuleId: RuleId;
	rebateMaxTotalIncomeWholeRupees: number;
	rebateMaxAmountWholeRupees: number;
	rebateRuleId: RuleId;
	surchargeThresholdWholeRupees: number;
	surchargeRuleId: RuleId;
	surchargeMarginalReliefRuleId: RuleId;
	cessRatePercent: number;
	cessRuleId: RuleId;
	totalIncomeRoundingBaseWholeRupees: number;
	totalIncomeRoundingRuleId: RuleId;
	taxRoundingBaseWholeRupees: number;
	taxRoundingRuleId: RuleId;
	incomeAggregationRuleId: RuleId;
	deductionLimitRuleId: RuleId;
	section112aTaxRuleId: RuleId;
	agriculturalIncomeRuleId: RuleId;
}>;

export type CompiledSelfOccupiedHousePropertyTaxConstants = Readonly<{
	enhancedInterestLimitWholeRupees: number;
	basicInterestLimitWholeRupees: number;
	annualValueRuleId: RuleId;
	oldRegimeInterestRuleId: RuleId;
	newRegimeInterestRuleId: RuleId;
}>;

export type CompiledHousePropertyTaxConstants = Readonly<{
	selfOccupiedEnhancedInterestLimitWholeRupees: number;
	selfOccupiedBasicInterestLimitWholeRupees: number;
	letOutStandardDeductionPercent: number;
	selfOccupiedAnnualValueRuleId: RuleId;
	selfOccupiedOldRegimeInterestRuleId: RuleId;
	selfOccupiedNewRegimeInterestRuleId: RuleId;
	letOutGrossAnnualValueRuleId: RuleId;
	letOutMunicipalTaxRuleId: RuleId;
	letOutStandardDeductionRuleId: RuleId;
	letOutInterestRuleId: RuleId;
}>;

export type CompiledOtherSourcesTaxConstants = Readonly<{
	familyPensionDeductionDivisor: number;
	oldRegimeFamilyPensionDeductionLimitWholeRupees: number;
	newRegimeFamilyPensionDeductionLimitWholeRupees: number;
	dividendRuleId: RuleId;
	interestRuleId: RuleId;
	familyPensionIncomeRuleId: RuleId;
	oldRegimeFamilyPensionDeductionRuleId: RuleId;
	newRegimeFamilyPensionDeductionRuleId: RuleId;
	totalRuleId: RuleId;
}>;

export type CompiledSection112aCapitalGainTaxConstants = Readonly<{
	itr1GainLimitWholeRupees: number;
	taxFreeThresholdWholeRupees: number;
	taxRateBasisPoints: number;
	taxRoundingBaseWholeRupees: number;
	classificationRuleId: RuleId;
	gainRuleId: RuleId;
	itr1LimitRuleId: RuleId;
	taxRuleId: RuleId;
	taxRoundingRuleId: RuleId;
}>;

export type CompiledAgriculturalIncomeTaxConstants = Readonly<{
	itr1LimitWholeRupees: number;
	exemptReportingRuleId: RuleId;
	itr1LimitRuleId: RuleId;
}>;

export type CompiledSavingsPensionDeductionTaxConstants = Readonly<{
	sharedLimitWholeRupees: number;
	section80ccd1EmployeeSalaryPercent: number;
	section80ccd1OtherGrossTotalIncomePercent: number;
	section80ccd1bLimitWholeRupees: number;
	oldRegimeGovernmentEmployerSalaryPercent: number;
	oldRegimeOtherEmployerSalaryPercent: number;
	newRegimeEmployerSalaryPercent: number;
	sharedLimitRuleId: RuleId;
	section80ccd1EmployeeLimitRuleId: RuleId;
	section80ccd1OtherLimitRuleId: RuleId;
	section80ccd1bLimitRuleId: RuleId;
	oldRegimeGovernmentEmployerLimitRuleId: RuleId;
	oldRegimeOtherEmployerLimitRuleId: RuleId;
	newRegimeEmployerLimitRuleId: RuleId;
	newRegimeExclusionRuleId: RuleId;
	proofRuleId: RuleId;
}>;

export type CompiledHealthDisabilityDeductionTaxConstants = Readonly<{
	healthRegularGroupLimitWholeRupees: number;
	healthSeniorGroupLimitWholeRupees: number;
	healthPreventiveSharedLimitWholeRupees: number;
	healthOverallLimitWholeRupees: number;
	dependentDisabilityAmountWholeRupees: number;
	dependentSevereDisabilityAmountWholeRupees: number;
	specifiedDiseaseLimitWholeRupees: number;
	specifiedDiseaseSeniorLimitWholeRupees: number;
	taxpayerDisabilityAmountWholeRupees: number;
	taxpayerSevereDisabilityAmountWholeRupees: number;
	healthGroupLimitsRuleId: RuleId;
	healthPreventiveLimitRuleId: RuleId;
	healthDetailsRuleId: RuleId;
	healthNewRegimeExclusionRuleId: RuleId;
	dependentDisabilityRuleId: RuleId;
	dependentDisabilityDetailsRuleId: RuleId;
	dependentDisabilityNewRegimeExclusionRuleId: RuleId;
	specifiedDiseaseRuleId: RuleId;
	specifiedDiseaseDetailsRuleId: RuleId;
	specifiedDiseaseNewRegimeExclusionRuleId: RuleId;
	taxpayerDisabilityRuleId: RuleId;
	taxpayerDisabilityDetailsRuleId: RuleId;
	taxpayerDisabilityNewRegimeExclusionRuleId: RuleId;
}>;

export type CompiledLoanInterestDeductionTaxConstants = Readonly<{
	section80eEarliestFirstInterestPaymentDate: IsoDate;
	section80eCurrentFinancialYearEndDate: IsoDate;
	section80eeSanctionStartDate: IsoDate;
	section80eeSanctionEndDate: IsoDate;
	section80eeLimitWholeRupees: number;
	section80eeLoanLimitWholeRupees: number;
	section80eePropertyValueLimitWholeRupees: number;
	section80eeaSanctionStartDate: IsoDate;
	section80eeaSanctionEndDate: IsoDate;
	section80eeaLimitWholeRupees: number;
	section80eeaStampValueLimitWholeRupees: number;
	section80eebSanctionStartDate: IsoDate;
	section80eebSanctionEndDate: IsoDate;
	section80eebLimitWholeRupees: number;
	section80eEligibilityRuleId: RuleId;
	section80ePeriodRuleId: RuleId;
	section80eDetailsRuleId: RuleId;
	section80eeEligibilityRuleId: RuleId;
	section80eeLimitRuleId: RuleId;
	section80eeDetailsRuleId: RuleId;
	section80eeaEligibilityRuleId: RuleId;
	section80eeaLimitRuleId: RuleId;
	section80eeaDetailsRuleId: RuleId;
	section80eeMutualExclusionRuleId: RuleId;
	section80eebEligibilityRuleId: RuleId;
	section80eebLimitRuleId: RuleId;
	section80eebDetailsRuleId: RuleId;
	newRegimeExclusionRuleId: RuleId;
}>;

export type CompiledDonationDeductionTaxConstants = Readonly<{
	cashPaymentLimitWholeRupees: number;
	adjustedGrossTotalIncomeLimitPercent: number;
	fullQualifyingPercent: number;
	halfQualifyingPercent: number;
	classificationRuleId: RuleId;
	paymentRuleId: RuleId;
	adjustedGrossTotalIncomeRuleId: RuleId;
	recipientQualificationRuleId: RuleId;
	evidenceRuleId: RuleId;
	newRegimeExclusionRuleId: RuleId;
}>;

export type CompiledRemainingDeductionTaxConstants = Readonly<{
	section80ttaLimitWholeRupees: number;
	section80ttbLimitWholeRupees: number;
	section80cchSalaryLimitBasisPoints: number;
	section80ggAnnualLimitWholeRupees: number;
	section80ggRentReductionPercent: number;
	section80ggIncomeLimitPercent: number;
	section80ggaCashPaymentLimitWholeRupees: number;
	section80ttaRuleId: RuleId;
	section80ttbRuleId: RuleId;
	section80cchRuleId: RuleId;
	section80ggRuleId: RuleId;
	section80ggaRuleId: RuleId;
	section80ggcRuleId: RuleId;
	newRegimeExclusionRuleId: RuleId;
	unsupportedOtherRuleId: RuleId;
}>;
