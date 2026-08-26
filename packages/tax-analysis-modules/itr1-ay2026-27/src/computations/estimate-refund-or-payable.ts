import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	parseFactKey,
	parseIssueCode,
	parseRuleId,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "@openitr/model";
import type {
	AttestedAnswer,
	BankInterestObservation,
	ExactMoney,
	FactKey,
	IssueCode,
	NonSalaryIncomeObservation,
	Sha256Digest,
	TaxPaymentObservation,
	TdsObservation,
} from "@openitr/model";
import { epayChallanReferenceOf } from "@openitr/model";

import {
	buildNewRegimeLiabilityNodes,
	constantInput,
	factInput,
	finalizeComputationNodes,
	nodeInput,
	TOTAL_INCOME_ROUNDED_NODE_ID,
} from "./new-regime-liability";
import type { ComputationTraceNode } from "./new-regime-liability";
import {
	computeNewRegimeSalaryScenario,
	SALARY_ADJUSTED_INCOME_NODE_ID,
} from "./new-regime-salary";
import type {
	AcceptedSalaryDocumentFacts,
	NewRegimeSalaryComputation,
	SalaryComputationRulePackInput,
} from "./new-regime-salary";

const BANK_INTEREST_FACT_KEYS = [
	parseFactKey("bank-interest.savings-account"),
	parseFactKey("bank-interest.deposits"),
] as const;

const NON_SALARY_INCOME_FACT_KEYS = [
	parseFactKey("non-salary-income.dividends"),
	parseFactKey("non-salary-income.interest-other-than-securities"),
] as const;

const TDS_DEPOSITED_FACT_KEY = parseFactKey("tds.tds-deposited");

const BANK_INTEREST_TOTAL_NODE_ID = parseFactKey(
	"derived.bank-interest-total",
);
const NON_SALARY_INCOME_TOTAL_NODE_ID = parseFactKey(
	"derived.non-salary-income-total",
);
const AGGREGATE_INCOME_NODE_ID = parseFactKey(
	"derived.total-income-aggregate",
);
const TAXES_PAID_NODE_ID = parseFactKey("derived.taxes-paid-total");

const ESTIMATE_RULE_IDS = Object.freeze({
	incomeAggregation: parseRuleId("ITR1-INCOME-AGGREGATION-SECTION-14"),
	interestIncome: parseRuleId("ITR1-INTEREST-INCOME-SECTION-56"),
	tdsCredit: parseRuleId("ITR1-TDS-CREDIT-SECTION-199"),
	taxPayments:
		parseRuleId("ITR1-TAXES-PAID-SECTIONS-199-207-211-140A"),
});

export const ESTIMATE_ISSUE_CODES = Object.freeze({
	bankInterestEvidenceRequired: parseIssueCode(
		"FACT_BANK_INTEREST_EVIDENCE_REQUIRED",
	),
	multipleTdsDocuments: parseIssueCode("FACT_TDS_MULTIPLE_DOCUMENTS"),
	tdsEvidenceRequired: parseIssueCode("FACT_TDS_EVIDENCE_REQUIRED"),
	taxFactConflicted: parseIssueCode("FACT_TAX_FACT_CONFLICTED"),
});

export type AcceptedBankInterestDocumentFacts = Readonly<{
	documentId: Sha256Digest;
	observations: readonly BankInterestObservation[];
}>;

export type AcceptedNonSalaryIncomeDocumentFacts = Readonly<{
	documentId: Sha256Digest;
	observations: readonly NonSalaryIncomeObservation[];
}>;

export type AcceptedTdsDocumentFacts = Readonly<{
	documentId: Sha256Digest;
	observations: readonly TdsObservation[];
}>;

export type AcceptedTaxPaymentDocumentFacts = Readonly<{
	documentId: Sha256Digest;
	observations: readonly TaxPaymentObservation[];
}>;

// One accepted receipt named in the computed result, so the analysis can
// explain exactly which challan payment moved taxes paid.
export type AcceptedTaxPaymentReceipt = Readonly<{
	sourceDocumentId: Sha256Digest;
	factKey: FactKey;
	amount: ExactMoney;
	challanReference: string;
}>;

export type RefundOrPayableEstimateIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFactKeys: readonly FactKey[];
	recoveryAction: string;
}>;

// Exactly one result per accepted fact set: money back, money owed, or an
// exact wash between liability and taxes paid.
export type EstimateOutcome =
	| Readonly<{ kind: "estimated-refund"; difference: ExactMoney }>
	| Readonly<{ kind: "estimated-amount-payable"; difference: ExactMoney }>
	| Readonly<{ kind: "balanced" }>;

export type EstimateEvidenceRole =
	| "salary-income"
	| "bank-interest-income"
	| "non-salary-income"
	| "taxes-paid"
	| "tax-payments";

export type EstimateEvidenceReference = Readonly<{
	role: EstimateEvidenceRole;
	factKey: FactKey;
	sourceDocumentId: Sha256Digest;
	observationIds: readonly string[];
}>;

export type RefundOrPayableEstimateSummary = Readonly<{
	salaryAdjustedIncome: ExactMoney;
	bankInterestTotal: ExactMoney;
	nonSalaryIncomeTotal: ExactMoney;
	totalIncome: ExactMoney;
	incomeTaxBeforeAdjustments: ExactMoney;
	rebateApplied: ExactMoney;
	marginalReliefApplied: ExactMoney;
	surcharge: ExactMoney;
	cess: ExactMoney;
	finalTaxLiability: ExactMoney;
	taxesPaid: ExactMoney;
}>;

// A fact value contributed by a stored resolution rather than by an
// observation: the taxpayer attested it, so no source document carries it.
// The estimate records it beside the observed evidence instead of
// fabricating an observation for it.
export type ResolvedFactContribution = Readonly<{
	resolutionId: string;
	factKey: FactKey;
	value: ExactMoney;
}>;

export type RefundOrAmountPayableEstimateInput = Readonly<{
	rulePack: SalaryComputationRulePackInput;
	residentAnswer: AttestedAnswer;
	salaryDocuments: readonly AcceptedSalaryDocumentFacts[];
	bankInterestDocuments: readonly AcceptedBankInterestDocumentFacts[];
	nonSalaryIncomeDocuments: readonly AcceptedNonSalaryIncomeDocumentFacts[];
	tdsDocuments: readonly AcceptedTdsDocumentFacts[];
	taxPaymentDocuments: readonly AcceptedTaxPaymentDocumentFacts[];
	// Fact keys withheld because their sources conflict and no resolution
	// exists yet. The caller's fact reconciliation owns that decision; this
	// estimate only refuses to compute on a disputed base and says which
	// facts it is waiting for.
	withheldFactKeys?: readonly FactKey[];
	// Values decided by attested resolutions, joined into the totals.
	resolvedFactContributions?: readonly ResolvedFactContribution[];
}>;

export type EstimateFromSalaryScenarioInput = Readonly<{
	rulePack: SalaryComputationRulePackInput;
	residentAnswer: AttestedAnswer;
	salaryScenario: NewRegimeSalaryComputation;
	salaryDocuments: readonly AcceptedSalaryDocumentFacts[];
	bankInterestDocuments: readonly AcceptedBankInterestDocumentFacts[];
	nonSalaryIncomeDocuments: readonly AcceptedNonSalaryIncomeDocumentFacts[];
	tdsDocuments: readonly AcceptedTdsDocumentFacts[];
	taxPaymentDocuments: readonly AcceptedTaxPaymentDocumentFacts[];
	withheldFactKeys?: readonly FactKey[];
	resolvedFactContributions?: readonly ResolvedFactContribution[];
}>;

export type RefundOrAmountPayableEstimate =
	| Readonly<{
			kind: "computed";
			scenario: "one-person-new-regime-refund-or-payable-fy-2025-26";
			rulePackRevision: string;
			outcome: EstimateOutcome;
			nodes: readonly ComputationTraceNode[];
			summary: RefundOrPayableEstimateSummary;
			sources: readonly EstimateEvidenceReference[];
			acceptedTaxPayments: readonly AcceptedTaxPaymentReceipt[];
			resolvedFactContributions: readonly ResolvedFactContribution[];
	  }>
	| Readonly<{
			kind: "blocked";
			issues: readonly RefundOrPayableEstimateIssue[];
	  }>;

const estimateIssue = (
	code: IssueCode,
	recoveryAction: string,
	affectedFactKeys: readonly FactKey[],
): RefundOrPayableEstimateIssue =>
	Object.freeze({
		code,
		severity: "blocking",
		affectedFactKeys: Object.freeze([...affectedFactKeys]),
		recoveryAction,
	});

const byObservationOrder = (
	left: { factKey: FactKey; observationId: string },
	right: { factKey: FactKey; observationId: string },
): number => {
	if (left.factKey !== right.factKey) {
		return left.factKey < right.factKey ? -1 : 1;
	}
	if (left.observationId !== right.observationId) {
		return left.observationId < right.observationId ? -1 : 1;
	}
	return 0;
};

const sumObservations = <
	TObservation extends { normalizedValue: ExactMoney },
>(
	observations: readonly TObservation[],
): ExactMoney =>
	observations.reduce<ExactMoney>(
		(total, observation) => addExactMoney(total, observation.normalizedValue),
		exactMoneyFromWholeRupees(0),
	);

const classifyOutcome = (
	finalTaxLiability: ExactMoney,
	taxesPaid: ExactMoney,
): EstimateOutcome => {
	const comparison = compareExactMoney(taxesPaid, finalTaxLiability);
	if (comparison > 0) {
		return Object.freeze({
			kind: "estimated-refund",
			difference: subtractExactMoney(taxesPaid, finalTaxLiability),
		});
	}
	if (comparison < 0) {
		return Object.freeze({
			kind: "estimated-amount-payable",
			difference: subtractExactMoney(finalTaxLiability, taxesPaid),
		});
	}
	return Object.freeze({ kind: "balanced" });
};

type MutableEvidenceReference = {
	role: EstimateEvidenceRole;
	factKey: FactKey;
	sourceDocumentId: Sha256Digest;
	observationIds: string[];
};

const collectSources = ({
	salaryDocuments,
	bankInterestObservations,
	nonSalaryIncomeObservations,
	tdsDepositedObservations,
	taxPaymentObservations,
}: Readonly<{
	salaryDocuments: readonly AcceptedSalaryDocumentFacts[];
	bankInterestObservations: readonly BankInterestObservation[];
	nonSalaryIncomeObservations: readonly NonSalaryIncomeObservation[];
	tdsDepositedObservations: readonly TdsObservation[];
	taxPaymentObservations: readonly TaxPaymentObservation[];
}>): readonly EstimateEvidenceReference[] => {
	const references: MutableEvidenceReference[] = [];
	const push = (
		role: EstimateEvidenceRole,
		factKey: FactKey,
		sourceDocumentId: Sha256Digest,
		observationId: string,
	): void => {
		const existing = references.find(
			(reference) =>
				reference.role === role &&
				reference.factKey === factKey &&
				reference.sourceDocumentId === sourceDocumentId,
		);
		if (existing === undefined) {
			references.push({
				role,
				factKey,
				sourceDocumentId,
				observationIds: [observationId],
			});
			return;
		}
		existing.observationIds.push(observationId);
	};

	for (const document of salaryDocuments) {
		for (const observation of document.observations) {
			push(
				"salary-income",
				observation.factKey,
				observation.sourceDocumentId,
				observation.observationId,
			);
		}
	}
	for (const observation of bankInterestObservations) {
		push(
			"bank-interest-income",
			observation.factKey,
			observation.sourceDocumentId,
			observation.observationId,
		);
	}
	for (const observation of nonSalaryIncomeObservations) {
		push(
			"non-salary-income",
			observation.factKey,
			observation.sourceDocumentId,
			observation.observationId,
		);
	}
	for (const observation of tdsDepositedObservations) {
		push(
			"taxes-paid",
			observation.factKey,
			observation.sourceDocumentId,
			observation.observationId,
		);
	}
	for (const observation of taxPaymentObservations) {
		push(
			"tax-payments",
			observation.factKey,
			observation.sourceDocumentId,
			observation.observationId,
		);
	}

	references.sort((left, right) => {
		const roleOrder: Readonly<Record<EstimateEvidenceRole, number>> =
			Object.freeze({
				"salary-income": 0,
				"bank-interest-income": 1,
				"non-salary-income": 2,
				"taxes-paid": 3,
				"tax-payments": 4,
			});
		return (
			roleOrder[left.role] - roleOrder[right.role] ||
			(left.factKey < right.factKey ? -1 : left.factKey > right.factKey ? 1 : 0) ||
			(left.sourceDocumentId < right.sourceDocumentId ? -1 : left.sourceDocumentId > right.sourceDocumentId ? 1 : 0)
		);
	});
	return references.map((reference) =>
		Object.freeze({ ...reference, observationIds: Object.freeze([...reference.observationIds]) }),
	);
};

const readTraceValue = (
	nodes: readonly ComputationTraceNode[],
	nodeId: FactKey,
	field: "unroundedValue" | "roundedValue",
): ExactMoney => {
	const found = nodes.find((candidate) => candidate.nodeId === nodeId);
	if (found === undefined) {
		throw new Error(`Expected node disappeared from salary trace: ${nodeId}`);
	}
	return found[field];
};

export const computeRefundOrAmountPayableEstimate = ({
	rulePack,
	residentAnswer,
	salaryDocuments,
	bankInterestDocuments,
	nonSalaryIncomeDocuments,
	tdsDocuments,
	taxPaymentDocuments,
	withheldFactKeys,
	resolvedFactContributions,
}: RefundOrAmountPayableEstimateInput): RefundOrAmountPayableEstimate =>
	estimateRefundOrAmountPayableFromSalaryScenario({
		rulePack,
		residentAnswer,
		salaryScenario: computeNewRegimeSalaryScenario({
			rulePack,
			residentAnswer,
			salaryDocuments,
		}),
		salaryDocuments,
		bankInterestDocuments,
		nonSalaryIncomeDocuments,
		tdsDocuments,
		taxPaymentDocuments,
		...(withheldFactKeys === undefined ? {} : { withheldFactKeys }),
		...(resolvedFactContributions === undefined
			? {}
			: { resolvedFactContributions }),
	});

// The reconciliation over an already-derived salary scenario. Callers that
// computed the salary slice for the same inputs (the session derives it for
// its own card) pass it here instead of paying for a second run; the public
// entry point above keeps the derive-it-for-me behavior.
//
// Slice observations arrive from the caller's fact reconciliation: every
// fact key carries only accepted representatives, so agreeing sources have
// been collapsed to one value and conflicted keys are named in
// `withheldFactKeys` instead of being passed through. This estimate
// therefore sums what it receives without re-judging source multiplicity.
export const estimateRefundOrAmountPayableFromSalaryScenario = ({
	rulePack,
	residentAnswer,
	salaryScenario,
	salaryDocuments,
	bankInterestDocuments,
	nonSalaryIncomeDocuments,
	tdsDocuments,
	taxPaymentDocuments,
	withheldFactKeys,
	resolvedFactContributions,
}: EstimateFromSalaryScenarioInput): RefundOrAmountPayableEstimate => {
	const issues: RefundOrPayableEstimateIssue[] = [];

	// Attested values join the totals beside observed evidence, sorted for a
	// deterministic trace.
	const resolvedContributions = (resolvedFactContributions ?? [])
		.map((contribution, index) => ({ contribution, index }))
		.sort(
			(left, right) =>
				left.contribution.factKey < right.contribution.factKey
					? -1
					: left.contribution.factKey > right.contribution.factKey
					? 1
					: left.index - right.index,
		)
		.map((entry) => entry.contribution);

	// The salary slice owns every Form 16 validation; its blocking issues join
	// any bank-interest or TDS gaps so one blocked screen lists everything
	// that needs review.
	if (salaryScenario.kind === "blocked") {
		issues.push(...salaryScenario.issues);
	}

	// A disputed fact blocks this estimate outright, even when other facts
	// are intact: any accepted value here would silently pick a side.
	const withheld =
		withheldFactKeys === undefined ? [] : [...withheldFactKeys].sort();
	if (withheld.length > 0) {
		issues.push(
			estimateIssue(
				ESTIMATE_ISSUE_CODES.taxFactConflicted,
				"Sources disagree about these facts and no resolution has been recorded yet. Resolve each conflict in the review panel by selecting one source's value or attesting the correct amount with a reason.",
				withheld,
			),
		);
	}

	// Every accepted interest observation feeds the total; the caller's fact
	// reconciliation guarantees one representative per fact key. Attested
	// resolutions join here too. Only the complete absence of evidence still
	// blocks, naming what is missing.
	const bankInterestObservations = bankInterestDocuments.flatMap(
		(document) => document.observations,
	);
	const resolvedBankInterest = resolvedContributions.filter((contribution) =>
		BANK_INTEREST_FACT_KEYS.includes(contribution.factKey),
	);
	if (
		bankInterestObservations.length === 0 &&
		resolvedBankInterest.length === 0
	) {
		issues.push(
			estimateIssue(
				ESTIMATE_ISSUE_CODES.bankInterestEvidenceRequired,
				"Select the official AIS export of the supported revision so its reviewed bank-interest observations can feed the estimate.",
				BANK_INTEREST_FACT_KEYS,
			),
		);
	}

	// Non-salary certificate evidence is situational, not owed: a user with
	// no Form 16A at all still gets an estimate. Attested resolutions join
	// the gross receipts the same way.
	const nonSalaryIncomeObservations = nonSalaryIncomeDocuments.flatMap(
		(document) => document.observations,
	);
	const resolvedNonSalaryIncome = resolvedContributions.filter(
		(contribution) =>
			NON_SALARY_INCOME_FACT_KEYS.includes(contribution.factKey),
	);
	const sortedNonSalaryIncome =
		[...nonSalaryIncomeObservations].sort(byObservationOrder);
	const nonSalaryIncomeTotal = resolvedNonSalaryIncome.reduce(
		(total, contribution) => addExactMoney(total, contribution.value),
		sumObservations(sortedNonSalaryIncome),
	);

	// Only deposits feed taxes paid; the paid/credited and deducted columns
	// stay untouched as evidence and never enter the arithmetic.
	const contributingTdsDocuments = tdsDocuments.filter(
		(document) => document.observations.length > 0,
	);
	// Deposit records print no cross-document identity (no challan CIN), so
	// two statements cannot be judged compatible or duplicated. Rather than
	// guess, deposits still come from exactly one reviewed export.
	if (contributingTdsDocuments.length > 1) {
		issues.push(
			estimateIssue(
				ESTIMATE_ISSUE_CODES.multipleTdsDocuments,
				"Deposit records print no shared identity across statements, so this estimate reads one tax-credit statement or TDS certificate at a time. Keep exactly one such export selected.",
				[TDS_DEPOSITED_FACT_KEY],
			),
		);
	}
	const tdsObservations = contributingTdsDocuments.flatMap(
		(document) => document.observations,
	);
	const tdsDepositedObservations = tdsObservations.filter(
		(observation) => observation.factKey === TDS_DEPOSITED_FACT_KEY,
	);

	// A statement can arrive whose records print paid or deducted columns but
	// no deposited cell at all. Deposits are the creditable amount, so their
	// total absence is unresolved evidence rather than a zero to estimate on.
	if (
		tdsObservations.length > 0 &&
		tdsDepositedObservations.length === 0 &&
		!issues.some(
			(issue) => issue.code === ESTIMATE_ISSUE_CODES.tdsEvidenceRequired,
		)
	) {
		issues.push(
			estimateIssue(
				ESTIMATE_ISSUE_CODES.tdsEvidenceRequired,
				"Select an official tax-credit statement or TDS certificate whose records print the Total TDS Deposited column so accepted deposits can feed the estimate.",
				[TDS_DEPOSITED_FACT_KEY],
			),
		);
	}
	if (tdsObservations.length === 0) {
		issues.push(
			estimateIssue(
				ESTIMATE_ISSUE_CODES.tdsEvidenceRequired,
				"Select the official Form 26AS text export of the supported revision so its reviewed tax-deducted-at-source observations can feed the estimate.",
				[TDS_DEPOSITED_FACT_KEY],
			),
		);
	}

	// Each receipt documents its own challan payment, so several receipts are
	// normal. Duplicate-identity guarding happens in fact reconciliation,
	// which collapses agreeing reprints and conflicts on disagreements.
	const acceptedTaxPaymentObservations = taxPaymentDocuments.flatMap(
		(document) => document.observations,
	);

	if (issues.length > 0 || salaryScenario.kind === "blocked") {
		return Object.freeze({ kind: "blocked", issues: Object.freeze(issues) });
	}

	// The salary slice validated constants and its own trace above, so both
	// lookups are internal invariants rather than new inputs to validate.
	const constants = rulePack.taxConstants?.newRegime;
	if (constants === undefined) {
		throw new Error(
			"New-regime constants disappeared after the salary slice computed",
		);
	}
	const revision = rulePack.identity.revision;

	// Section 288A rounds total income once, so the salary slice enters the
	// aggregation at its post-deduction, pre-rounding value from the reviewed
	// salary computation's own trace.
	const salaryAdjustedIncome = readTraceValue(
		salaryScenario.nodes,
		SALARY_ADJUSTED_INCOME_NODE_ID,
		"unroundedValue",
	);

	const sortedBankInterest = [...bankInterestObservations].sort(
		byObservationOrder,
	);
	const bankInterestTotal = resolvedBankInterest.reduce(
		(total, contribution) => addExactMoney(total, contribution.value),
		sumObservations(sortedBankInterest),
	);

	// Section 14 aggregates income from other sources with the salary slice,
	// so reviewed certificate receipts join the same pre-rounding total.
	const aggregateIncome = addExactMoney(
		addExactMoney(salaryAdjustedIncome, bankInterestTotal),
		nonSalaryIncomeTotal,
	);
	const totalIncome = roundToNearestMultipleOf(
		aggregateIncome,
		exactMoneyFromWholeRupees(constants.totalIncomeRoundingBaseWholeRupees),
	);

	const sortedTds = [...tdsDepositedObservations].sort(byObservationOrder);
	// Taxes paid combine the two creditable streams: deposits reported by the
	// reviewed statement slice, plus challan payments from accepted e-Pay Tax
	// receipts. Both streams are already exact money.
	const sortedTaxPayments = [...acceptedTaxPaymentObservations].sort(
		byObservationOrder,
	);
	const tdsPaidTotal = sumObservations(sortedTds);
	const taxPaymentsTotal = sumObservations(sortedTaxPayments);
	const taxesPaid = addExactMoney(tdsPaidTotal, taxPaymentsTotal);

	const liability = buildNewRegimeLiabilityNodes({
		roundedIncomeValue: totalIncome,
		constants,
		residentAnswer,
	});

	const nodes = finalizeComputationNodes(
		[
			{
				nodeId: BANK_INTEREST_TOTAL_NODE_ID,
				ruleId: ESTIMATE_RULE_IDS.interestIncome,
				operation: "sum-of-accepted-observations",
				inputs: [
					...sortedBankInterest.map((observation) =>
						factInput(observation.factKey, observation.normalizedValue),
					),
					...resolvedBankInterest.map((contribution) =>
						factInput(contribution.factKey, contribution.value),
					),
				],
				unroundedValue: bankInterestTotal,
				roundedValue: bankInterestTotal,
			},
			{
				nodeId: NON_SALARY_INCOME_TOTAL_NODE_ID,
				ruleId: ESTIMATE_RULE_IDS.interestIncome,
				operation: "sum-of-accepted-observations",
				inputs: [
					...sortedNonSalaryIncome.map((observation) =>
						factInput(observation.factKey, observation.normalizedValue),
					),
					...resolvedNonSalaryIncome.map((contribution) =>
						factInput(contribution.factKey, contribution.value),
					),
				],
				unroundedValue: nonSalaryIncomeTotal,
				roundedValue: nonSalaryIncomeTotal,
				note: "Gross receipts from reviewed Form 16A summary records, chargeable as income from other sources.",
			},
			{
				nodeId: AGGREGATE_INCOME_NODE_ID,
				ruleId: ESTIMATE_RULE_IDS.incomeAggregation,
				operation: "aggregate-total-income",
				inputs: [
					nodeInput(SALARY_ADJUSTED_INCOME_NODE_ID, salaryAdjustedIncome),
					nodeInput(BANK_INTEREST_TOTAL_NODE_ID, bankInterestTotal),
					nodeInput(NON_SALARY_INCOME_TOTAL_NODE_ID, nonSalaryIncomeTotal),
				],
				unroundedValue: aggregateIncome,
				roundedValue: aggregateIncome,
				note: "Section 288A rounds total income once, so the accepted salary slice joins this aggregation before rounding rather than after it.",
			},
			{
				nodeId: TOTAL_INCOME_ROUNDED_NODE_ID,
				ruleId: constants.totalIncomeRoundingRuleId,
				operation: "round-to-nearest-multiple",
				roundingMode: "nearest-multiple-half-up",
				inputs: [
					nodeInput(AGGREGATE_INCOME_NODE_ID, aggregateIncome),
					constantInput(
						"total-income-rounding-base",
						constants.totalIncomeRoundingBaseWholeRupees,
					),
				],
				unroundedValue: aggregateIncome,
				roundedValue: totalIncome,
			},
		{
			nodeId: TAXES_PAID_NODE_ID,
			ruleId:
				sortedTaxPayments.length > 0
					? ESTIMATE_RULE_IDS.taxPayments
					: ESTIMATE_RULE_IDS.tdsCredit,
			operation: "sum-of-accepted-observations",
			inputs: [...sortedTds, ...sortedTaxPayments].map((observation) =>
				factInput(observation.factKey, observation.normalizedValue),
			),
			unroundedValue: taxesPaid,
			roundedValue: taxesPaid,
			...(sortedTaxPayments.length > 0
				? {
						note: "Accepted TDS deposits under section 199 plus paid challan receipts under sections 207 to 211 and 140A.",
					}
				: {}),
		},
			...liability.nodes,
		],
		revision,
	);

	return Object.freeze({
		kind: "computed",
		scenario: "one-person-new-regime-refund-or-payable-fy-2025-26",
		rulePackRevision: revision,
		outcome: classifyOutcome(liability.summary.finalTaxLiability, taxesPaid),
		nodes,
		summary: Object.freeze({
			salaryAdjustedIncome,
			bankInterestTotal,
			nonSalaryIncomeTotal,
			totalIncome,
			incomeTaxBeforeAdjustments: liability.summary.incomeTaxBeforeAdjustments,
			rebateApplied: liability.summary.rebateApplied,
			marginalReliefApplied: liability.summary.marginalReliefApplied,
			surcharge: liability.summary.surcharge,
			cess: liability.summary.cess,
			finalTaxLiability: liability.summary.finalTaxLiability,
			taxesPaid,
		}),
		sources: collectSources({
			salaryDocuments,
			bankInterestObservations: sortedBankInterest,
			nonSalaryIncomeObservations: sortedNonSalaryIncome,
			tdsDepositedObservations: sortedTds,
			taxPaymentObservations: sortedTaxPayments,
		}),
		acceptedTaxPayments: Object.freeze(
			sortedTaxPayments.map((observation) => ({
				sourceDocumentId: observation.sourceDocumentId,
				factKey: observation.factKey,
				amount: observation.normalizedValue,
				challanReference: epayChallanReferenceOf(observation.record),
			})),
		),
		resolvedFactContributions: Object.freeze(resolvedContributions),
	});
};
