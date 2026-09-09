import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	subtractExactMoney,
} from "@openitr/model";
import type { ExactMoney } from "@openitr/model";

import type { FactSetRevision } from "./fact-set-revision";
import type { NewRegimeComputation } from "./new-regime";
import type { OldRegimeComputation } from "./old-regime";

type ComputedOldRegime = Extract<OldRegimeComputation, { kind: "computed" }>;
type ComputedNewRegime = Extract<NewRegimeComputation, { kind: "computed" }>;

export type Regime = "old" | "new";

export type ExactAmountDifference =
	| Readonly<{ kind: "equal"; amount: ExactMoney }>
	| Readonly<{ kind: "old-higher"; amount: ExactMoney }>
	| Readonly<{ kind: "new-higher"; amount: ExactMoney }>;

export type RegimeComparisonRowId =
	| "taxable-income"
	| "deductions-allowed"
	| "income-tax-before-adjustments"
	| "section-112a-tax"
	| "rebate"
	| "marginal-relief"
	| "surcharge"
	| "surcharge-marginal-relief"
	| "cess"
	| "total-tax-liability";

export type RegimeComparisonRow = Readonly<{
	id: RegimeComparisonRowId;
	label: string;
	oldRegimeAmount: ExactMoney;
	newRegimeAmount: ExactMoney;
	difference: ExactAmountDifference;
}>;

export type EstimatedBalance =
	| Readonly<{ kind: "refund"; amount: ExactMoney }>
	| Readonly<{ kind: "amount-payable"; amount: ExactMoney }>
	| Readonly<{ kind: "settled"; amount: ExactMoney }>;

export type ComparedRegime = Readonly<{
	factSetRevision: FactSetRevision;
	rulePackRevision: string;
	estimatedBalance: EstimatedBalance;
}>;

export type RegimeComparison =
	| Readonly<{
		kind: "unavailable";
		reason: "fact-set-revision-mismatch";
	  }>
	| Readonly<{
		kind: "computed";
		factSetRevision: FactSetRevision;
		taxesPaid: ExactMoney;
		oldRegime: ComparedRegime;
		newRegime: ComparedRegime;
		rows: readonly RegimeComparisonRow[];
		balanceDifference: ExactAmountDifference;
	  }>;

const differenceBetween = (
	oldRegimeAmount: ExactMoney,
	newRegimeAmount: ExactMoney,
): ExactAmountDifference => {
	const comparison = compareExactMoney(oldRegimeAmount, newRegimeAmount);
	if (comparison === 0) {
		return Object.freeze({
			kind: "equal",
			amount: exactMoneyFromWholeRupees(0),
		});
	}
	return comparison > 0
		? Object.freeze({
				kind: "old-higher",
				amount: subtractExactMoney(oldRegimeAmount, newRegimeAmount),
			})
		: Object.freeze({
				kind: "new-higher",
				amount: subtractExactMoney(newRegimeAmount, oldRegimeAmount),
			});
};

const estimatedBalanceFor = (
	finalTaxLiability: ExactMoney,
	taxesPaid: ExactMoney,
): EstimatedBalance => {
	const comparison = compareExactMoney(taxesPaid, finalTaxLiability);
	if (comparison === 0) {
		return Object.freeze({
			kind: "settled",
			amount: exactMoneyFromWholeRupees(0),
		});
	}
	return comparison > 0
		? Object.freeze({
				kind: "refund",
				amount: subtractExactMoney(taxesPaid, finalTaxLiability),
			})
		: Object.freeze({
				kind: "amount-payable",
				amount: subtractExactMoney(finalTaxLiability, taxesPaid),
			});
};

const row = (
	id: RegimeComparisonRowId,
	label: string,
	oldRegimeAmount: ExactMoney,
	newRegimeAmount: ExactMoney,
): RegimeComparisonRow =>
	Object.freeze({
		id,
		label,
		oldRegimeAmount,
		newRegimeAmount,
		difference: differenceBetween(oldRegimeAmount, newRegimeAmount),
	});

export const compareRegimes = ({
	oldRegime,
	newRegime,
	taxesPaid,
}: Readonly<{
	oldRegime: ComputedOldRegime;
	newRegime: ComputedNewRegime;
	taxesPaid: ExactMoney;
}>): RegimeComparison => {
	if (oldRegime.factSetRevision !== newRegime.factSetRevision) {
		return Object.freeze({
			kind: "unavailable",
			reason: "fact-set-revision-mismatch",
		});
	}

	const rows = Object.freeze([
		row(
			"taxable-income",
			"Taxable income",
			oldRegime.summary.totalIncome,
			newRegime.summary.totalIncome,
		),
		row(
			"deductions-allowed",
			"Deductions allowed",
			oldRegime.summary.deductionsAllowed,
			newRegime.summary.deductionsAllowed,
		),
		row(
			"income-tax-before-adjustments",
			"Normal-rate income tax before adjustments",
			oldRegime.summary.incomeTaxBeforeRebate,
			newRegime.summary.incomeTaxBeforeAdjustments,
		),
		row(
			"section-112a-tax",
			"Section 112A tax",
			oldRegime.summary.section112aTax,
			newRegime.summary.section112aTax,
		),
		row(
			"rebate",
			"Section 87A rebate",
			oldRegime.summary.rebateApplied,
			newRegime.summary.rebateApplied,
		),
		row(
			"marginal-relief",
			"Section 87A marginal relief",
			exactMoneyFromWholeRupees(0),
			newRegime.summary.marginalReliefApplied,
		),
		row(
			"surcharge",
			"Surcharge",
			oldRegime.summary.surcharge,
			newRegime.summary.surcharge,
		),
		row(
			"surcharge-marginal-relief",
			"Surcharge marginal relief",
			oldRegime.summary.surchargeMarginalRelief,
			newRegime.summary.surchargeMarginalReliefApplied,
		),
		row(
			"cess",
			"Health and education cess",
			oldRegime.summary.cess,
			newRegime.summary.cess,
		),
		row(
			"total-tax-liability",
			"Total tax liability",
			oldRegime.summary.finalTaxLiability,
			newRegime.summary.finalTaxLiability,
		),
	]);

	return Object.freeze({
		kind: "computed",
		factSetRevision: oldRegime.factSetRevision,
		taxesPaid,
		oldRegime: Object.freeze({
			factSetRevision: oldRegime.factSetRevision,
			rulePackRevision: oldRegime.rulePackRevision,
			estimatedBalance: estimatedBalanceFor(
				oldRegime.summary.finalTaxLiability,
				taxesPaid,
			),
		}),
		newRegime: Object.freeze({
			factSetRevision: newRegime.factSetRevision,
			rulePackRevision: newRegime.rulePackRevision,
			estimatedBalance: estimatedBalanceFor(
				newRegime.summary.finalTaxLiability,
				taxesPaid,
			),
		}),
		rows,
		balanceDifference: differenceBetween(
			oldRegime.summary.finalTaxLiability,
			newRegime.summary.finalTaxLiability,
		),
	});
};
