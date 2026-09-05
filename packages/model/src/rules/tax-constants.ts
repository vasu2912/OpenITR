import type { RuleId } from "../primitives";

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
}>;

export type RulePackManifestTaxConstants = Readonly<{
	newRegime: NewRegimeTaxConstantRecord;
	selfOccupiedHouseProperty?: SelfOccupiedHousePropertyTaxConstantRecord;
	houseProperty?: HousePropertyTaxConstantRecord;
	otherSources?: OtherSourcesTaxConstantRecord;
	section112aCapitalGain?: Section112aCapitalGainTaxConstantRecord;
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
}>;

export type CompiledTaxConstants = Readonly<{
	newRegime: CompiledNewRegimeTaxConstants;
	selfOccupiedHouseProperty?: CompiledSelfOccupiedHousePropertyTaxConstants;
	houseProperty?: CompiledHousePropertyTaxConstants;
	otherSources?: CompiledOtherSourcesTaxConstants;
	section112aCapitalGain?: CompiledSection112aCapitalGainTaxConstants;
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
