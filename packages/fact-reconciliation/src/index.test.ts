import { parseExactMoney, parseFactKey, parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	evaluateResolutionAttempt,
	reconcileCanonicalFacts,
} from "./index";
import type { IsoTimestamp } from "@openitr/model";

const docA = parseSha256Digest(
	"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
);
const docB = parseSha256Digest(
	"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
);

const savingsGroup = (candidates: Parameters<typeof groupOf>[1]) =>
	groupOf("bank-interest.savings-account", candidates);

const groupOf = (
	factKey: string,
	candidates: readonly {
		observationId: string;
		sourceDocumentId: ReturnType<typeof parseSha256Digest>;
		amount: string;
	}[],
) => ({
	groupId: factKey,
	factKey: parseFactKey(factKey),
	candidates: candidates.map((candidate) => ({
		observationId: candidate.observationId,
		sourceDocumentId: candidate.sourceDocumentId,
		value: parseExactMoney(candidate.amount),
	})),
});

describe("incompatible canonical observations", () => {
	test("two sources disagreeing on one fact create one conflict naming every source and affected result", () => {
		const estimateResult = {
			resultId: "refund-or-payable-estimate",
			label: "Estimated refund or amount payable",
		};
		const result = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-json-1",
						sourceDocumentId: docB,
						amount: "7890.25",
					},
					{
						observationId: "obs-csv-1",
						sourceDocumentId: docA,
						amount: "9000",
					},
				]),
			],
			resolutions: [],
			attestableFactKeys: [parseFactKey("bank-interest.savings-account")],
			resultRequirements: [
				{
					result: estimateResult,
					requiredGroupIds: ["bank-interest.savings-account"],
				},
			],
		});

		expect(result.acceptedFacts).toEqual([]);
		expect(result.conflicts).toHaveLength(1);
		const conflict = result.conflicts[0];
		if (conflict === undefined) {
			throw new Error("expected one conflict");
		}
		expect(conflict.groupId).toBe("bank-interest.savings-account");
		expect(conflict.attestationPermitted).toBe(true);
		// Every source is named, in deterministic document order.
		expect(conflict.candidates).toEqual([
			{
				observationId: "obs-csv-1",
				sourceDocumentId: docA,
				value: "9000",
			},
			{
				observationId: "obs-json-1",
				sourceDocumentId: docB,
				value: "7890.25",
			},
		]);
		expect(conflict.affectedResults).toEqual([estimateResult]);
	});
});

const recordedAt = "2026-08-26T10:00:00.000Z" as IsoTimestamp;

const conflictingInput = () => ({
	groups: [
		savingsGroup([
			{
				observationId: "obs-json-1",
				sourceDocumentId: docB,
				amount: "7890.25",
			},
			{
				observationId: "obs-csv-1",
				sourceDocumentId: docA,
				amount: "9000",
			},
		]),
	],
	resolutions: [],
	attestableFactKeys: [parseFactKey("bank-interest.savings-account")],
	resultRequirements: [],
});

describe("permitted resolutions", () => {
	test("selecting an offered observation resolves the conflict with that source as representative", () => {
		const attempt = evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts(conflictingInput()),
			groupId: "bank-interest.savings-account",
			choice: { kind: "observed", observationId: "obs-json-1" },
			reason: "The JSON export matches my bank statement.",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		if (attempt.kind !== "accepted") {
			throw new Error(`expected an accepted attempt, got ${attempt.kind}`);
		}

		const result = reconcileCanonicalFacts({
			...conflictingInput(),
			resolutions: [attempt.resolution],
		});

		expect(result.conflicts).toEqual([]);
		expect(result.acceptedFacts).toHaveLength(1);
		const accepted = result.acceptedFacts[0];
		if (accepted === undefined) {
			throw new Error("expected one accepted fact");
		}
		expect(accepted.value).toBe("7890.25");
		expect(accepted.representativeObservationId).toBe("obs-json-1");
		expect(accepted.origin).toEqual({
			kind: "resolved-observed",
			resolutionId: attempt.resolution.resolutionId,
		});
	});

	test("attesting a value on a permitted fact key resolves the conflict without an observation", () => {
		const attempt = evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts(conflictingInput()),
			groupId: "bank-interest.savings-account",
			choice: { kind: "attested", value: "8450.50" },
			reason: "Bank confirmed the corrected figure by phone letter.",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		if (attempt.kind !== "accepted") {
			throw new Error(`expected an accepted attempt, got ${attempt.kind}`);
		}
		expect(attempt.resolution.choice).toEqual({
			kind: "attested",
			value: "8450.5",
		});

		const result = reconcileCanonicalFacts({
			...conflictingInput(),
			resolutions: [attempt.resolution],
		});
		expect(result.conflicts).toEqual([]);
		const accepted = result.acceptedFacts[0];
		if (accepted === undefined) {
			throw new Error("expected one accepted fact");
		}
		expect(accepted.value).toBe("8450.5");
		expect(accepted.representativeObservationId).toBeUndefined();
		expect(accepted.origin.kind).toBe("resolved-attested");
	});
});

describe("rejected resolutions", () => {
	const attemptOf = (
		choice:
			| { kind: "observed"; observationId: string }
			| { kind: "attested"; value: string },
		reason = "a reason",
	) =>
		evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts(conflictingInput()),
			groupId: "bank-interest.savings-account",
			choice,
			reason,
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});

	test("a selection outside the offered candidates is rejected", () => {
		expect(
			attemptOf({ kind: "observed", observationId: "obs-not-offered" })
				.kind,
		).toBe("rejected");
	});

	test("an attestation on a fact key that forbids it is rejected", () => {
		const attempt = evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts({
				...conflictingInput(),
				attestableFactKeys: [],
			}),
			groupId: "bank-interest.savings-account",
			choice: { kind: "attested", value: "8450.50" },
			reason: "a reason",
			recordedAt,
			attestableFactKeys: [],
		});
		expect(attempt.kind).toBe("rejected");
	});

	test("a malformed attested amount is rejected", () => {
		expect(attemptOf({ kind: "attested", value: "-5" }).kind).toBe(
			"rejected",
		);
		expect(attemptOf({ kind: "attested", value: "12,000" }).kind).toBe(
			"rejected",
		);
	});

	test("every resolution requires a reason", () => {
		for (const reason of ["", "   "]) {
			expect(
				attemptOf({ kind: "observed", observationId: "obs-json-1" }, reason)
					.kind,
			).toBe("rejected");
			expect(
				attemptOf({ kind: "attested", value: "8450.50" }, reason).kind,
			).toBe("rejected");
		}
	});

	test("a resolution for a group that has no conflict is rejected", () => {
		const settled = reconcileCanonicalFacts(conflictingInput());
		const attempt = evaluateResolutionAttempt({
			reconciliation: { acceptedFacts: settled.acceptedFacts, conflicts: [] },
			groupId: "bank-interest.savings-account",
			choice: { kind: "observed", observationId: "obs-json-1" },
			reason: "a reason",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		expect(attempt.kind).toBe("rejected");
	});
});

describe("re-evaluation when sources change", () => {
	test("the most recent resolution for a group decides when an older one is inert", () => {
		const firstAttempt = evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts(conflictingInput()),
			groupId: "bank-interest.savings-account",
			choice: { kind: "observed", observationId: "obs-json-1" },
			reason: "First decision.",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		if (firstAttempt.kind !== "accepted") {
			throw new Error("expected an accepted first attempt");
		}
		// The chosen source disappears, so the first resolution goes inert
		// and a fresh conflict between new candidates is resolved again.
		const secondReconciliation = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-csv-new",
						sourceDocumentId: docA,
						amount: "9000",
					},
					{
						observationId: "obs-pdf-new",
						sourceDocumentId: docB,
						amount: "7000",
					},
				]),
			],
			resolutions: [firstAttempt.resolution],
			attestableFactKeys: conflictingInput().attestableFactKeys,
			resultRequirements: [],
		});
		expect(secondReconciliation.conflicts).toHaveLength(1);
		const secondAttempt = evaluateResolutionAttempt({
			reconciliation: secondReconciliation,
			groupId: "bank-interest.savings-account",
			choice: { kind: "observed", observationId: "obs-pdf-new" },
			reason: "Second decision after the re-check.",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		if (secondAttempt.kind !== "accepted") {
			throw new Error("expected an accepted second attempt");
		}

		const settled = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-csv-new",
						sourceDocumentId: docA,
						amount: "9000",
					},
					{
						observationId: "obs-pdf-new",
						sourceDocumentId: docB,
						amount: "7000",
					},
				]),
			],
			resolutions: [firstAttempt.resolution, secondAttempt.resolution],
			attestableFactKeys: conflictingInput().attestableFactKeys,
			resultRequirements: [],
		});
		expect(settled.conflicts).toEqual([]);
		const accepted = settled.acceptedFacts[0];
		if (accepted === undefined) {
			throw new Error("expected one accepted fact");
		}
		expect(accepted.representativeObservationId).toBe("obs-pdf-new");
	});

	test("a brand-new disagreeing source re-opens a resolved conflict", () => {
		const attempt = evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts(conflictingInput()),
			groupId: "bank-interest.savings-account",
			choice: { kind: "observed", observationId: "obs-json-1" },
			reason: "The JSON export matches my bank statement.",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		if (attempt.kind !== "accepted") {
			throw new Error("expected an accepted attempt");
		}
		const before = reconcileCanonicalFacts({
			...conflictingInput(),
			resolutions: [attempt.resolution],
		});
		expect(before.conflicts).toEqual([]);

		// A third source the taxpayer has never decided about arrives.
		const after = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-json-1",
						sourceDocumentId: docB,
						amount: "7890.25",
					},
					{
						observationId: "obs-csv-1",
						sourceDocumentId: docA,
						amount: "9000",
					},
					{
						observationId: "obs-pdf-new",
						sourceDocumentId: parseSha256Digest(
							"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
						),
						amount: "5000",
					},
				]),
			],
			resolutions: [attempt.resolution],
			attestableFactKeys: conflictingInput().attestableFactKeys,
			resultRequirements: [],
		});
		expect(after.acceptedFacts).toEqual([]);
		expect(after.conflicts).toHaveLength(1);
		const reopened = after.conflicts[0];
		if (reopened === undefined) {
			throw new Error("expected the conflict to re-open");
		}
		expect(reopened.candidates.map((candidate) => candidate.value)).toEqual([
			"9000",
			"7890.25",
			"5000",
		]);
	});

	test("removing the disagreeing source dissolves the conflict and leaves a stored selection inert", () => {
		const attempt = evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts(conflictingInput()),
			groupId: "bank-interest.savings-account",
			choice: { kind: "observed", observationId: "obs-json-1" },
			reason: "The JSON export matches my bank statement.",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		if (attempt.kind !== "accepted") {
			throw new Error("expected an accepted attempt");
		}

		// The CSV source is removed; only the JSON observation remains.
		const afterRemoval = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-json-1",
						sourceDocumentId: docB,
						amount: "7890.25",
					},
				]),
			],
			resolutions: [attempt.resolution],
			attestableFactKeys: conflictingInput().attestableFactKeys,
			resultRequirements: [],
		});

		expect(afterRemoval.conflicts).toEqual([]);
		expect(afterRemoval.acceptedFacts).toHaveLength(1);
		const accepted = afterRemoval.acceptedFacts[0];
		if (accepted === undefined) {
			throw new Error("expected one accepted fact");
		}
		expect(accepted.origin.kind).toBe("observed");

		// A resolution naming an observation that no longer exists decides
		// nothing, so the remaining evidence speaks for itself.
		const stale = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-csv-replacement",
						sourceDocumentId: docA,
						amount: "9000",
					},
					{
						observationId: "obs-json-new",
						sourceDocumentId: docB,
						amount: "7890.25",
					},
				]),
			],
			resolutions: [attempt.resolution],
			attestableFactKeys: conflictingInput().attestableFactKeys,
			resultRequirements: [],
		});
		expect(stale.conflicts).toHaveLength(1);
	});

	test("a resolution on a fact key that no longer permits attestation stays inert", () => {
		const attempt = evaluateResolutionAttempt({
			reconciliation: reconcileCanonicalFacts(conflictingInput()),
			groupId: "bank-interest.savings-account",
			choice: { kind: "attested", value: "8450" },
			reason: "Bank confirmed the corrected figure.",
			recordedAt,
			attestableFactKeys: conflictingInput().attestableFactKeys,
		});
		if (attempt.kind !== "accepted") {
			throw new Error("expected an accepted attempt");
		}

		const revoked = reconcileCanonicalFacts({
			...conflictingInput(),
			resolutions: [attempt.resolution],
			attestableFactKeys: [],
		});

		expect(revoked.acceptedFacts).toEqual([]);
		expect(revoked.conflicts).toHaveLength(1);
	});
});

describe("determinism and preservation", () => {
	test("the same input reconciles identically regardless of arrival order", () => {
		const forward = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-b",
						sourceDocumentId: docB,
						amount: "7890.25",
					},
					{
						observationId: "obs-a",
						sourceDocumentId: docA,
						amount: "9000",
					},
				]),
				groupOf("bank-interest.deposits", [
					{
						observationId: "dep-a",
						sourceDocumentId: docA,
						amount: "45678.90",
					},
				]),
			],
			resolutions: [],
			attestableFactKeys: [],
			resultRequirements: [
				{
					result: {
						resultId: "refund-or-payable-estimate",
						label: "Estimated refund or amount payable",
					},
					requiredGroupIds: [
						"bank-interest.deposits",
						"bank-interest.savings-account",
					],
				},
			],
		});
		const reversed = reconcileCanonicalFacts({
			groups: [...forwardInputShuffled().groups].reverse(),
			resolutions: [],
			attestableFactKeys: [],
			resultRequirements: forwardInputShuffled().resultRequirements,
		});

		expect(reversed).toEqual(forward);
	});

	function forwardInputShuffled() {
		return {
			groups: [
				groupOf("bank-interest.deposits", [
					{
						observationId: "dep-a",
						sourceDocumentId: docA,
						amount: "45678.90",
					},
				]),
				savingsGroup([
					{
						observationId: "obs-a",
						sourceDocumentId: docA,
						amount: "9000",
					},
					{
						observationId: "obs-b",
						sourceDocumentId: docB,
						amount: "7890.25",
					},
				]),
			],
			resolutions: [],
			attestableFactKeys: [],
			resultRequirements: [
				{
					result: {
						resultId: "refund-or-payable-estimate",
						label: "Estimated refund or amount payable",
					},
					requiredGroupIds: [
						"bank-interest.deposits",
						"bank-interest.savings-account",
					],
				},
			],
		};
	}

	test("reconciliation never mutates its inputs", () => {
		const input = conflictingInput();
		const groupSnapshot = structuredClone(input.groups);

		reconcileCanonicalFacts(input);

		expect(structuredClone(input.groups)).toEqual(groupSnapshot);
	});
});

describe("tax payment groups", () => {
	const challanGroup = (
		groupId: string,
		candidates: readonly {
			observationId: string;
			sourceDocumentId: ReturnType<typeof parseSha256Digest>;
			amount: string;
		}[],
	) => ({
		groupId,
		factKey: parseFactKey("tax-payment.advance-tax"),
		candidates: candidates.map((candidate) => ({
			observationId: candidate.observationId,
			sourceDocumentId: candidate.sourceDocumentId,
			value: parseExactMoney(candidate.amount),
		})),
	});

	test("two receipts of one challan for the same amount coalesce into one accepted payment", () => {
		const result = reconcileCanonicalFacts({
			groups: [
				challanGroup("tax-payment.advance-tax|0004321|00517|26/03/2026", [
					{
						observationId: "receipt-original",
						sourceDocumentId: docA,
						amount: "45670",
					},
					{
						observationId: "receipt-reprint",
						sourceDocumentId: docB,
						amount: "45670",
					},
				]),
				challanGroup("tax-payment.advance-tax|0004329|00999|27/03/2026", [
					{
						observationId: "receipt-other",
						sourceDocumentId: docA,
						amount: "1000",
					},
				]),
			],
			resolutions: [],
			attestableFactKeys: [],
			resultRequirements: [],
		});

		expect(result.conflicts).toEqual([]);
		expect(result.acceptedFacts).toHaveLength(2);
		const coalesced = result.acceptedFacts.find(
			(fact) =>
				fact.groupId === "tax-payment.advance-tax|0004321|00517|26/03/2026",
		);
		expect(coalesced?.representativeObservationId).toBe("receipt-original");
	});

	test("one challan printed with two different amounts conflicts and forbids attestation", () => {
		const result = reconcileCanonicalFacts({
			groups: [
				challanGroup("tax-payment.advance-tax|0004321|00517|26/03/2026", [
					{
						observationId: "receipt-original",
						sourceDocumentId: docA,
						amount: "45670",
					},
					{
						observationId: "receipt-reprint",
						sourceDocumentId: docB,
						amount: "45000",
					},
				]),
			],
			resolutions: [],
			attestableFactKeys: [],
			resultRequirements: [],
		});

		expect(result.acceptedFacts).toEqual([]);
		const conflict = result.conflicts[0];
		if (conflict === undefined) {
			throw new Error("expected one conflict");
		}
		expect(conflict.attestationPermitted).toBe(false);
	});
});

describe("equivalent canonical observations", () => {
	test("two sources reporting one identical value coexist as a single accepted fact without a conflict", () => {
		const result = reconcileCanonicalFacts({
			groups: [
				savingsGroup([
					{
						observationId: "obs-b",
						sourceDocumentId: docB,
						amount: "7890.25",
					},
					{
						observationId: "obs-a",
						sourceDocumentId: docA,
						amount: "7890.25",
					},
				]),
			],
			resolutions: [],
			attestableFactKeys: [parseFactKey("bank-interest.savings-account")],
			resultRequirements: [],
		});

		expect(result.conflicts).toEqual([]);
		expect(result.acceptedFacts).toHaveLength(1);
		const accepted = result.acceptedFacts[0];
		if (accepted === undefined) {
			throw new Error("expected one accepted fact");
		}
		expect(accepted.groupId).toBe("bank-interest.savings-account");
		expect(accepted.value).toBe("7890.25");
		expect(accepted.origin).toEqual({ kind: "observed" });
		// The representative is deterministic: lowest source document id, then
		// lowest observation id, regardless of input order.
		expect(accepted.representativeObservationId).toBe("obs-a");
		expect(accepted.agreeingCandidates.map((c) => c.observationId)).toEqual([
			"obs-a",
			"obs-b",
		]);
	});
});
