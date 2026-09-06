import { describe, expect, it } from "vitest";

import { exactMoneyFromWholeRupees, parseFactKey } from "@openitr/model";

import { itr1Ay202627RulePack20260912 } from "../revisions/2026-09-12/rule-pack";
import {
	computeDonationDeductions,
	DONATION_DEDUCTION_FACT_KEYS as KEYS,
} from "./donation-deductions";
import type { DonationDeductionFact } from "./donation-deductions";

const origin = Object.freeze({
	kind: "attested-answer" as const,
	answerId: "answer-1",
});
const fact = (
	factKey: string,
	value: DonationDeductionFact["value"],
): DonationDeductionFact => ({ factKey: parseFactKey(factKey), value, origin });

const qualifyingDonation = (): DonationDeductionFact[] => [
	fact(KEYS.present, true),
	fact(KEYS.amount, exactMoneyFromWholeRupees(15_000)),
	fact(KEYS.fullDeduction, true),
	fact(KEYS.subjectToQualifyingLimit, false),
	fact(KEYS.cashPayment, false),
	fact(KEYS.recipientQualified, true),
	fact(KEYS.recipientDetailsAvailable, true),
	fact(KEYS.certificateAvailable, true),
	fact(KEYS.noncashPaymentDetailsAvailable, true),
];

describe("donation deductions", () => {
	it("derives a fully qualifying non-cash donation under the old regime", () => {
		const result = computeDonationDeductions({
			rulePack: itr1Ay202627RulePack20260912,
			facts: qualifyingDonation(),
		});

		expect(result).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "15000",
			newRegimeTotal: "0",
			donations: [
				{
					status: "allowed",
					amount: "15000",
					paymentMethod: "other",
					qualifyingPercentage: 100,
					limitTreatment: "without-qualifying-limit",
					oldRegimeAllowed: "15000",
				},
			],
		});
		if (result.kind !== "computed") return;
		expect(result.facts).toHaveLength(9);
		expect(result.trace.map((node) => node.label)).toContain(
			"Section 80G qualifying percentage",
		);
	});

	it("applies the adjusted-GTI limit before a 50% deduction", () => {
		const facts = qualifyingDonation()
			.filter(
				(candidate) =>
					candidate.factKey !== KEYS.amount &&
					candidate.factKey !== KEYS.fullDeduction &&
					candidate.factKey !== KEYS.subjectToQualifyingLimit,
			)
			.concat([
				fact(KEYS.amount, exactMoneyFromWholeRupees(80_000)),
				fact(KEYS.fullDeduction, false),
				fact(KEYS.subjectToQualifyingLimit, true),
				fact(KEYS.adjustedGrossTotalIncome, exactMoneyFromWholeRupees(500_000)),
			]);
		const result = computeDonationDeductions({
			rulePack: itr1Ay202627RulePack20260912,
			facts,
		});

		expect(result).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "25000",
			donations: [
				{
					recipientCategory: "50-percent-subject-to-qualifying-limit",
					oldRegimeAllowed: "25000",
				},
			],
		});
		if (result.kind !== "computed") return;
		expect(result.trace).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Section 80G adjusted-GTI qualifying limit",
					result: "50000",
				}),
			]),
		);
	});

	it("rejects a cash donation above the pinned limit", () => {
		const facts = qualifyingDonation()
			.filter(
				(candidate) =>
					candidate.factKey !== KEYS.amount &&
					candidate.factKey !== KEYS.cashPayment &&
					candidate.factKey !== KEYS.noncashPaymentDetailsAvailable,
			)
			.concat([
				fact(KEYS.amount, exactMoneyFromWholeRupees(2_001)),
				fact(KEYS.cashPayment, true),
			]);
		const result = computeDonationDeductions({
			rulePack: itr1Ay202627RulePack20260912,
			facts,
		});

		expect(result).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "0",
			donations: [{ status: "rejected", oldRegimeAllowed: "0" }],
			issues: [{ code: "FACT_80G_CASH_PAYMENT_EXCEEDS_LIMIT" }],
		});

		const boundary = computeDonationDeductions({
			rulePack: itr1Ay202627RulePack20260912,
			facts: facts.map((candidate) =>
				candidate.factKey === KEYS.amount
					? fact(KEYS.amount, exactMoneyFromWholeRupees(2_000))
					: candidate,
			),
		});
		expect(boundary).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "2000",
			donations: [{ status: "allowed" }],
		});
	});

	it("keeps missing recipient details unresolved", () => {
		const facts = qualifyingDonation().map((candidate) =>
			candidate.factKey === KEYS.recipientDetailsAvailable
				? fact(KEYS.recipientDetailsAvailable, false)
				: candidate,
		);
		const result = computeDonationDeductions({
			rulePack: itr1Ay202627RulePack20260912,
			facts,
		});

		expect(result).toMatchObject({
			kind: "blocked",
			issues: [{ code: "FACT_80G_RECIPIENT_DETAILS_UNRESOLVED" }],
		});
	});

	it("warns when supporting certificate and non-cash transaction details are unavailable", () => {
		const facts = qualifyingDonation().map((candidate) => {
			if (candidate.factKey === KEYS.certificateAvailable) {
				return fact(KEYS.certificateAvailable, false);
			}
			return candidate.factKey === KEYS.noncashPaymentDetailsAvailable
				? fact(KEYS.noncashPaymentDetailsAvailable, false)
				: candidate;
		});
		const result = computeDonationDeductions({
			rulePack: itr1Ay202627RulePack20260912,
			facts,
		});

		expect(result).toMatchObject({
			kind: "computed",
			donations: [{ status: "warning", oldRegimeAllowed: "15000" }],
		});
		if (result.kind !== "computed") return;
		expect(result.issues.map((candidate) => candidate.code)).toEqual([
			"ANALYSIS_80G_CERTIFICATE_NOT_AVAILABLE",
			"ANALYSIS_80G_NONCASH_DETAILS_NOT_AVAILABLE",
		]);
	});
});
