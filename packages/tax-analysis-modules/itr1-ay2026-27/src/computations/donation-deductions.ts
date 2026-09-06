import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	minExactMoney,
	multiplyByWholePercent,
	parseFactKey,
	parseIssueCode,
} from "@openitr/model";
import type {
	ExactMoney,
	FactKey,
	IssueCode,
	RuleId,
	ScopeRulePack,
} from "@openitr/model";

const FACT_KEYS = Object.freeze({
	present: parseFactKey("deductions.80g-present"),
	amount: parseFactKey("deductions.80g-amount"),
	fullDeduction: parseFactKey("deductions.80g-full-deduction"),
	subjectToQualifyingLimit: parseFactKey(
		"deductions.80g-subject-to-qualifying-limit",
	),
	adjustedGrossTotalIncome: parseFactKey("deductions.80g-adjusted-gti"),
	cashPayment: parseFactKey("deductions.80g-cash-payment"),
	noncashPaymentDetailsAvailable: parseFactKey(
		"deductions.80g-noncash-payment-details",
	),
	recipientQualified: parseFactKey("deductions.80g-recipient-qualified"),
	recipientDetailsAvailable: parseFactKey("deductions.80g-recipient-details"),
	certificateAvailable: parseFactKey("deductions.80g-certificate"),
});

export const DONATION_DEDUCTION_FACT_KEYS = FACT_KEYS;

export type DonationDeductionOrigin =
	| Readonly<{ kind: "attested-answer"; answerId: string }>
	| Readonly<{
			kind: "accepted-evidence";
			sourceDocumentIds: readonly string[];
	  }>;

export type DonationDeductionFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney | boolean;
	origin: DonationDeductionOrigin;
}>;

export type DonationRecipientCategory =
	| "100-percent-without-qualifying-limit"
	| "50-percent-without-qualifying-limit"
	| "100-percent-subject-to-qualifying-limit"
	| "50-percent-subject-to-qualifying-limit";

export type DonationDeductionIssue = Readonly<{
	code: IssueCode;
	severity: "blocking" | "warning";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type DonationDeductionTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	result: ExactMoney;
}>;

export type DonationDeductionResult = Readonly<{
	recipientCategory: DonationRecipientCategory;
	amount: ExactMoney;
	paymentMethod: "cash" | "other";
	qualifyingPercentage: number;
	limitTreatment: "without-qualifying-limit" | "subject-to-qualifying-limit";
	status: "allowed" | "warning" | "rejected";
	oldRegimeAllowed: ExactMoney;
	newRegimeAllowed: ExactMoney;
	factKeys: readonly FactKey[];
}>;

export type DonationDeductionComputation =
	| Readonly<{
			kind: "blocked" | "unsupported";
			issues: readonly DonationDeductionIssue[];
	  }>
	| Readonly<{
			kind: "computed";
			facts: readonly DonationDeductionFact[];
			donations: readonly DonationDeductionResult[];
			oldRegimeTotal: ExactMoney;
			newRegimeTotal: ExactMoney;
			issues: readonly DonationDeductionIssue[];
			trace: readonly DonationDeductionTraceNode[];
	  }>;

const issue = (
	code: string,
	severity: DonationDeductionIssue["severity"],
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): DonationDeductionIssue => ({
	code: parseIssueCode(code),
	severity,
	affectedFacts,
	recoveryAction,
});

export const computeDonationDeductions = ({
	rulePack,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	facts: readonly DonationDeductionFact[];
}>): DonationDeductionComputation => {
	const permitted = new Set<FactKey>(Object.values(FACT_KEYS));
	const unsupported = facts.find((candidate) => !permitted.has(candidate.factKey));
	if (unsupported !== undefined) {
		return {
			kind: "unsupported",
			issues: [
				issue(
					"RULE_DONATION_DEDUCTION_FACT_UNSUPPORTED",
					"blocking",
					[unsupported.factKey],
					"Remove the unsupported fact or use an analysis that covers that donation category.",
				),
			],
		};
	}

	for (const factKey of new Set(facts.map((candidate) => candidate.factKey))) {
		const values = new Set(
			facts
				.filter((candidate) => candidate.factKey === factKey)
				.map((candidate) => String(candidate.value)),
		);
		if (values.size > 1) {
			return {
				kind: "blocked",
				issues: [
					issue(
						"FACT_DONATION_DEDUCTION_CONFLICT",
						"blocking",
						[factKey],
						"Resolve the contradictory donation facts before continuing.",
					),
				],
			};
		}
	}

	const constants = rulePack.taxConstants?.donationDeductions;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"RULE_DONATION_DEDUCTION_CONSTANTS_MISSING",
					"blocking",
					[FACT_KEYS.present],
					"Load a rule-pack revision that pins the section 80G donation rules.",
				),
			],
		};
	}

	const byKey = new Map<FactKey, DonationDeductionFact>();
	for (const candidate of facts) byKey.set(candidate.factKey, candidate);
	const bool = (factKey: FactKey): boolean | undefined => {
		const value = byKey.get(factKey)?.value;
		return typeof value === "boolean" ? value : undefined;
	};
	const money = (factKey: FactKey): ExactMoney | undefined => {
		const value = byKey.get(factKey)?.value;
		return typeof value === "string" ? value : undefined;
	};
	const zero = exactMoneyFromWholeRupees(0);
	const present = bool(FACT_KEYS.present);
	if (present === undefined) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"FACT_DONATION_DEDUCTION_PRESENCE_MISSING",
					"blocking",
					[FACT_KEYS.present],
					"Confirm whether a section 80G donation needs analysis. A blank answer is not No.",
				),
			],
		};
	}
	if (!present) {
		return {
			kind: "computed",
			facts,
			donations: [],
			oldRegimeTotal: zero,
			newRegimeTotal: zero,
			issues: [],
			trace: [],
		};
	}

	const amount = money(FACT_KEYS.amount);
	const fullDeduction = bool(FACT_KEYS.fullDeduction);
	const subjectToQualifyingLimit = bool(FACT_KEYS.subjectToQualifyingLimit);
	const cashPayment = bool(FACT_KEYS.cashPayment);
	const recipientQualified = bool(FACT_KEYS.recipientQualified);
	const recipientDetailsAvailable = bool(FACT_KEYS.recipientDetailsAvailable);
	const certificateAvailable = bool(FACT_KEYS.certificateAvailable);
	const noncashPaymentDetailsAvailable = bool(
		FACT_KEYS.noncashPaymentDetailsAvailable,
	);
	const adjustedGrossTotalIncome = money(FACT_KEYS.adjustedGrossTotalIncome);
	const missing: FactKey[] = [];
	if (amount === undefined) missing.push(FACT_KEYS.amount);
	if (fullDeduction === undefined) missing.push(FACT_KEYS.fullDeduction);
	if (subjectToQualifyingLimit === undefined) {
		missing.push(FACT_KEYS.subjectToQualifyingLimit);
	}
	if (cashPayment === undefined) missing.push(FACT_KEYS.cashPayment);
	if (recipientQualified === undefined) {
		missing.push(FACT_KEYS.recipientQualified);
	}
	if (recipientQualified === true && recipientDetailsAvailable === undefined) {
		missing.push(FACT_KEYS.recipientDetailsAvailable);
	}
	if (recipientQualified === true && certificateAvailable === undefined) {
		missing.push(FACT_KEYS.certificateAvailable);
	}
	if (cashPayment === false && noncashPaymentDetailsAvailable === undefined) {
		missing.push(FACT_KEYS.noncashPaymentDetailsAvailable);
	}
	if (subjectToQualifyingLimit === true && adjustedGrossTotalIncome === undefined) {
		missing.push(FACT_KEYS.adjustedGrossTotalIncome);
	}
	if (
		missing.length > 0 ||
		amount === undefined ||
		fullDeduction === undefined ||
		subjectToQualifyingLimit === undefined ||
		cashPayment === undefined ||
		recipientQualified === undefined
	) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"FACT_DONATION_DEDUCTION_DETAILS_MISSING",
					"blocking",
					missing,
					"Supply every requested donation, category, payment, recipient, and limit fact. A blank answer remains unknown.",
				),
			],
		};
	}

	if (recipientQualified && !recipientDetailsAvailable) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"FACT_80G_RECIPIENT_DETAILS_UNRESOLVED",
					"blocking",
					[FACT_KEYS.recipientDetailsAvailable],
					"Obtain the recipient's name, address, and applicable identification details before relying on this donation.",
				),
			],
		};
	}

	const qualifyingPercentage = fullDeduction
		? constants.fullQualifyingPercent
		: constants.halfQualifyingPercent;
	const limitTreatment = subjectToQualifyingLimit
		? "subject-to-qualifying-limit"
		: "without-qualifying-limit";
	const recipientCategory: DonationRecipientCategory = subjectToQualifyingLimit
		? fullDeduction
			? "100-percent-subject-to-qualifying-limit"
			: "50-percent-subject-to-qualifying-limit"
		: fullDeduction
			? "100-percent-without-qualifying-limit"
			: "50-percent-without-qualifying-limit";
	const paymentMethod = cashPayment ? "cash" : "other";
	const warnings: DonationDeductionIssue[] = [];
	const trace: DonationDeductionTraceNode[] = [];
	const cashLimit = exactMoneyFromWholeRupees(
		constants.cashPaymentLimitWholeRupees,
	);
	const cashRejected =
		cashPayment && compareExactMoney(amount, cashLimit) > 0;
	const recipientRejected = !recipientQualified;

	if (cashRejected) {
		warnings.push(
			issue(
				"FACT_80G_CASH_PAYMENT_EXCEEDS_LIMIT",
				"warning",
				[FACT_KEYS.amount, FACT_KEYS.cashPayment],
				"Treat this cash donation as ineligible or correct the amount or payment mode from the recipient evidence.",
			),
		);
	}
	if (recipientRejected) {
		warnings.push(
			issue(
				"FACT_80G_RECIPIENT_NOT_QUALIFIED",
				"warning",
				[FACT_KEYS.recipientQualified],
				"Exclude the donation or confirm the recipient's applicable section 80G qualification.",
			),
		);
	}
	if (recipientQualified && !certificateAvailable) {
		warnings.push(
			issue(
				"ANALYSIS_80G_CERTIFICATE_NOT_AVAILABLE",
				"warning",
				[FACT_KEYS.certificateAvailable],
				"Obtain and compare the donation certificate or equivalent recipient evidence before relying on the deduction.",
			),
		);
	}
	if (cashPayment === false && !noncashPaymentDetailsAvailable) {
		warnings.push(
			issue(
				"ANALYSIS_80G_NONCASH_DETAILS_NOT_AVAILABLE",
				"warning",
				[FACT_KEYS.noncashPaymentDetailsAvailable],
				"Obtain the IFSC and transaction-reference details required for the non-cash donation entry.",
			),
		);
	}

	const rejected = cashRejected || recipientRejected;
	trace.push({
		label: "Section 80G recipient qualification",
		ruleId: constants.recipientQualificationRuleId,
		inputs: [FACT_KEYS.recipientQualified, FACT_KEYS.recipientDetailsAvailable],
		operation: recipientRejected
			? "Reject the donation because the recipient is not qualified under section 80G"
			: "Keep the donation after confirming the recipient qualification and details",
		result: recipientRejected ? zero : amount,
	});
	trace.push({
		label: "Section 80G payment eligibility",
		ruleId: constants.paymentRuleId,
		inputs: [FACT_KEYS.amount, FACT_KEYS.cashPayment],
		operation: cashRejected
			? `Reject the cash donation because it exceeds the pinned ₹${constants.cashPaymentLimitWholeRupees} limit`
			: "Keep the monetary donation after applying the pinned payment-mode rule",
		result: cashRejected ? zero : amount,
	});

	let percentageBase = rejected ? zero : amount;
	if (subjectToQualifyingLimit) {
		if (adjustedGrossTotalIncome === undefined) {
			return {
				kind: "blocked",
				issues: [
					issue(
						"FACT_DONATION_DEDUCTION_DETAILS_MISSING",
						"blocking",
						[FACT_KEYS.adjustedGrossTotalIncome],
						"Supply the adjusted gross total income for the qualifying-limit category.",
					),
				],
			};
		}
		const qualifyingLimit = multiplyByWholePercent(
			adjustedGrossTotalIncome,
			constants.adjustedGrossTotalIncomeLimitPercent,
		);
		percentageBase = minExactMoney(percentageBase, qualifyingLimit);
		trace.push({
			label: "Section 80G adjusted-GTI qualifying limit",
			ruleId: constants.adjustedGrossTotalIncomeRuleId,
			inputs: [FACT_KEYS.amount, FACT_KEYS.adjustedGrossTotalIncome],
			operation: `Limit the qualifying donation base to ${constants.adjustedGrossTotalIncomeLimitPercent}% of adjusted gross total income`,
			result: percentageBase,
		});
	}
	const oldRegimeAllowed = multiplyByWholePercent(
		percentageBase,
		qualifyingPercentage,
	);
	trace.push({
		label: "Section 80G qualifying percentage",
		ruleId: constants.classificationRuleId,
		inputs: [
			FACT_KEYS.amount,
			FACT_KEYS.fullDeduction,
			FACT_KEYS.subjectToQualifyingLimit,
		],
		operation: `Apply the pinned ${qualifyingPercentage}% deduction rate for the ${limitTreatment} category`,
		result: oldRegimeAllowed,
	});
	if (recipientQualified) {
		trace.push({
			label: "Section 80G evidence review",
			ruleId: constants.evidenceRuleId,
			inputs: [
				FACT_KEYS.recipientDetailsAvailable,
				FACT_KEYS.certificateAvailable,
				...(cashPayment
					? []
					: [FACT_KEYS.noncashPaymentDetailsAvailable]),
			],
			operation:
				warnings.length === 0
					? "Confirm the recipient, certificate, and applicable payment evidence"
					: "Keep the derived amount with the recorded evidence warning",
			result: oldRegimeAllowed,
		});
	}
	trace.push({
		label: "Section 80G new-regime exclusion",
		ruleId: constants.newRegimeExclusionRuleId,
		inputs: [FACT_KEYS.amount],
		operation: "Exclude section 80G from the new-regime deduction total",
		result: zero,
	});

	const status = rejected
		? "rejected"
		: warnings.length > 0
			? "warning"
			: "allowed";
	return {
		kind: "computed",
		facts,
		donations: [
			{
				recipientCategory,
				amount,
				paymentMethod,
				qualifyingPercentage,
				limitTreatment,
				status,
				oldRegimeAllowed,
				newRegimeAllowed: zero,
				factKeys: facts.map((candidate) => candidate.factKey),
			},
		],
		oldRegimeTotal: oldRegimeAllowed,
		newRegimeTotal: zero,
		issues: warnings,
		trace,
	};
};
