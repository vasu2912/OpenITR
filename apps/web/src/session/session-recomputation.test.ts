import {
	itr1Ay202627RulePack20260826,
} from "@openitr/itr1-ay2026-27";
import type { RefundOrAmountPayableEstimate } from "@openitr/itr1-ay2026-27";
import {
	createAisCsvBankInterestFixture,
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { describe, expect, test } from "vitest";

import { inProcessInspectionFacility } from "./in-process-inspection-facility";
import type { SessionCommand, SessionOrchestrator } from "./session-orchestrator";
import { createSessionOrchestrator } from "./session-orchestrator";

const scopeTime = "2026-08-30T08:00:00.000Z";
const answerTime = "2026-08-30T08:05:00.000Z";

const createEligibleSession = (): SessionOrchestrator => {
	const session = createSessionOrchestrator({
		rulePack: itr1Ay202627RulePack20260826,
		documents: inProcessInspectionFacility(),
	});
	session.send({
		kind: "answer-eligibility-question",
		questionId: itr1Ay202627RulePack20260826.question.id,
		answer: "yes",
		executionContext: { answerTime: scopeTime },
	});
	return session;
};

const waitFor = async (
	predicate: () => boolean,
	budgetMs = 20_000,
): Promise<void> => {
	const deadline = Date.now() + budgetMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for session recomputation");
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
};

const selectStatement = (session: SessionOrchestrator): void => {
	const command: SessionCommand = {
		kind: "select-source-documents",
		documents: [
			{
				displayName: "openitr-sentinel-form16-salary.pdf",
				readBytes: () => Promise.resolve(createForm16SalaryPdfFixture()),
			},
			{
				displayName: "openitr-sentinel-26as-export.txt",
				readBytes: () =>
					Promise.resolve(utf8Bytes(createForm26AsTextFixture())),
			},
		],
	};
	session.send(command);
};

const selectConflictSources = (session: SessionOrchestrator): void => {
	session.send({
		kind: "select-source-documents",
		documents: [
			{
				displayName: "openitr-sentinel-form16-salary.pdf",
				readBytes: () => Promise.resolve(createForm16SalaryPdfFixture()),
			},
			{
				displayName: "openitr-sentinel-ais-export.json",
				readBytes: () =>
					Promise.resolve(utf8Bytes(createAisJsonBankInterestFixture())),
			},
			{
				displayName: "openitr-sentinel-ais-export.csv",
				readBytes: () =>
					Promise.resolve(
						utf8Bytes(
							createAisCsvBankInterestFixture({
								bankInterestRows: [
									{
										recordCategory: "SAVINGS_ACCOUNT",
										institutionName: "OpenITR Synthetic Bank",
										maskedAccountNumber: "XXXXXX0001",
										interestAmount: "9,000.00",
									},
									{
										recordCategory: "DEPOSITS",
										institutionName: "OpenITR Synthetic Co-operative Bank",
										maskedAccountNumber: "XXXXXX0002",
										interestAmount: "45,678.90",
									},
								],
							}),
						),
					),
			},
			{
				displayName: "openitr-sentinel-26as-export.txt",
				readBytes: () =>
					Promise.resolve(utf8Bytes(createForm26AsTextFixture())),
			},
		],
	});
};

const answerQuestion = ({
	questionId,
	value,
	when = answerTime,
}: Readonly<{
	questionId:
		| "bank-interest-savings-account-total"
		| "bank-interest-deposits-total";
	value: string;
	when?: string;
}>): SessionCommand => ({
	kind: "answer-missing-fact-question",
	questionId,
	value,
	executionContext: { answerTime: when },
});

type ComputedEstimate = Extract<
	RefundOrAmountPayableEstimate,
	Readonly<{ kind: "computed" }>
>;

const expectUnchangedEstimateNodes = ({
	before,
	after,
}: Readonly<{
	before: Pick<ComputedEstimate, "nodes">;
	after: Pick<ComputedEstimate, "nodes">;
}>): void => {
	for (const nodeId of [
		"derived.non-salary-income-total",
		"derived.taxes-paid-total",
	]) {
		const beforeNode = before.nodes.find((node) => node.nodeId === nodeId);
		const afterNode = after.nodes.find((node) => node.nodeId === nodeId);
		if (beforeNode === undefined || afterNode === undefined) {
			throw new Error(`Expected unchanged estimate node: ${nodeId}`);
		}
		expect(afterNode).toEqual(beforeNode);
	}
};

describe("decision recomputation", () => {
	test("clears a previous estimate while a changed answer recomputes", async () => {
		const session = createEligibleSession();
		selectStatement(session);
		await waitFor(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.extractions.length === 2 &&
				snapshot.extractions.every((record) => record.status === "done")
			);
		});

		session.send(
			answerQuestion({
				questionId: "bank-interest-savings-account-total",
				value: "4850.25",
			}),
		);
		session.send(
			answerQuestion({
				questionId: "bank-interest-deposits-total",
				value: "12000",
			}),
		);
		const original = session.getSnapshot();
		if (
			original.kind !== "document-intake" ||
			original.estimateComputation?.kind !== "computed"
		) {
			throw new Error("Expected an original computed estimate");
		}
		const answer = original.factAnswers.find(
			(candidate) => candidate.questionId === "bank-interest-savings-account-total",
		);
		const unaffectedAnswer = original.factAnswers.find(
			(candidate) => candidate.questionId === "bank-interest-deposits-total",
		);
		if (answer === undefined) {
			throw new Error("Expected the savings answer");
		}
		if (unaffectedAnswer === undefined) {
			throw new Error("Expected the deposits answer");
		}

		session.send({ kind: "remove-missing-fact-answer", answerId: answer.answerId });
		const pending = session.getSnapshot();
		expect(pending.kind).toBe("document-intake");
		if (pending.kind === "document-intake") {
			expect(pending.pendingRecomputation.kind).toBe("pending");
			expect(pending.estimateComputation).toBeUndefined();
		}

		const changedAnswerTime = "2026-08-30T08:06:00.000Z";
		session.send(
			answerQuestion({
				questionId: "bank-interest-savings-account-total",
				value: "9000",
				when: changedAnswerTime,
			}),
		);
		const changedPending = session.getSnapshot();
		expect(changedPending.kind).toBe("document-intake");
		if (changedPending.kind === "document-intake") {
			expect(changedPending.pendingRecomputation.kind).toBe("pending");
			expect(changedPending.estimateComputation).toBeUndefined();
		}
		await waitFor(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.pendingRecomputation.kind === "idle"
			);
		});
		const changed = session.getSnapshot();
		if (
			changed.kind !== "document-intake" ||
			changed.estimateComputation?.kind !== "computed"
		) {
			throw new Error("Expected the changed computed estimate");
		}
		expect(changed.estimateComputation.summary.bankInterestTotal).toBe("21000");
		expect(changed.salaryComputation).toBe(original.salaryComputation);
		expect(changed.extractions).toBe(original.extractions);
		expectUnchangedEstimateNodes({
			before: original.estimateComputation,
			after: changed.estimateComputation,
		});
		expect(
			changed.factAnswers.find(
				(candidate) => candidate.questionId === "bank-interest-deposits-total",
			),
		).toBe(unaffectedAnswer);

		const changedAnswer = changed.factAnswers.find(
			(candidate) => candidate.questionId === "bank-interest-savings-account-total",
		);
		if (changedAnswer === undefined) {
			throw new Error("Expected the changed savings answer");
		}
		session.send({
			kind: "remove-missing-fact-answer",
			answerId: changedAnswer.answerId,
		});
		session.send(
			answerQuestion({
				questionId: "bank-interest-savings-account-total",
				value: "4850.25",
				when: answerTime,
			}),
		);
		const restorePending = session.getSnapshot();
		expect(restorePending.kind).toBe("document-intake");
		if (restorePending.kind === "document-intake") {
			expect(restorePending.pendingRecomputation.kind).toBe("pending");
			expect(restorePending.estimateComputation).toBeUndefined();
		}
		await waitFor(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.pendingRecomputation.kind === "idle"
			);
		});
		await waitFor(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.pendingRecomputation.kind === "idle" &&
				snapshot.estimateComputation?.kind === "computed"
			);
		});
		const restored = session.getSnapshot();
		if (
			restored.kind !== "document-intake" ||
			restored.estimateComputation?.kind !== "computed"
		) {
			throw new Error("Expected the restored computed estimate");
		}
		expect(restored.estimateComputation).toEqual(original.estimateComputation);
		session.stop();
	});

	test("revisits a resolution while preserving evidence and restoring its trace", async () => {
		const session = createEligibleSession();
		selectConflictSources(session);
		await waitFor(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.extractions.length === 4 &&
				snapshot.extractions.every((record) => record.status === "done")
			);
		});
		const conflictSnapshot = session.getSnapshot();
		if (conflictSnapshot.kind !== "document-intake") {
			throw new Error("Expected the document workflow");
		}
		const conflict = conflictSnapshot.factConflicts[0];
		if (conflict === undefined) {
			throw new Error("Expected a bank-interest conflict");
		}
		const jsonObservation = conflict.candidates.find(
			(candidate) => candidate.value === "7890.25",
		);
		const csvObservation = conflict.candidates.find(
			(candidate) => candidate.value === "9000",
		);
		if (jsonObservation === undefined || csvObservation === undefined) {
			throw new Error("Expected both competing observations");
		}

		session.send({
			kind: "resolve-fact-conflict",
			groupId: conflict.groupId,
			choice: { kind: "observed", observationId: jsonObservation.observationId },
			reason: "The JSON export matches the bank statement.",
			executionContext: { recordedAt: "2026-08-30T08:10:00.000Z" },
		});
		const original = session.getSnapshot();
		if (
			original.kind !== "document-intake" ||
			original.estimateComputation?.kind !== "computed"
		) {
			throw new Error("Expected the original resolved estimate");
		}
		const originalResolution = original.factResolutions[0];
		if (originalResolution === undefined) {
			throw new Error("Expected a recorded resolution");
		}
		const originalSalary = original.salaryComputation;
		const originalExtractions = original.extractions;

		session.send({
			kind: "remove-fact-resolution",
			resolutionId: originalResolution.resolutionId,
		});
		const unresolvedPending = session.getSnapshot();
		expect(unresolvedPending.kind).toBe("document-intake");
		if (unresolvedPending.kind === "document-intake") {
			expect(unresolvedPending.pendingRecomputation.kind).toBe("pending");
			expect(unresolvedPending.estimateComputation).toBeUndefined();
			expect(
				unresolvedPending.factConflicts.some(
					(candidate) => candidate.groupId === conflict.groupId,
				),
			).toBe(true);
			expect(unresolvedPending.extractions).toBe(originalExtractions);
			expect(unresolvedPending.salaryComputation).toBe(originalSalary);
		}
		session.send({
			kind: "resolve-fact-conflict",
			groupId: conflict.groupId,
			choice: { kind: "observed", observationId: csvObservation.observationId },
			reason: "The CSV export is the corrected statement.",
			executionContext: { recordedAt: "2026-08-30T08:11:00.000Z" },
		});
		const changedPending = session.getSnapshot();
		expect(changedPending.kind).toBe("document-intake");
		if (changedPending.kind === "document-intake") {
			expect(changedPending.pendingRecomputation.kind).toBe("pending");
			expect(changedPending.estimateComputation).toBeUndefined();
			expect(changedPending.extractions).toBe(originalExtractions);
		}
		await waitFor(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.pendingRecomputation.kind === "idle" &&
				snapshot.estimateComputation?.kind === "computed"
			);
		});
		const changed = session.getSnapshot();
		if (
			changed.kind !== "document-intake" ||
			changed.estimateComputation?.kind !== "computed"
		) {
			throw new Error("Expected the changed resolved estimate");
		}
		expect(changed.estimateComputation.summary.bankInterestTotal).toBe("54678.9");
		expect(changed.salaryComputation).toBe(originalSalary);
		expectUnchangedEstimateNodes({
			before: original.estimateComputation,
			after: changed.estimateComputation,
		});

		const changedResolution = changed.factResolutions[0];
		if (changedResolution === undefined) {
			throw new Error("Expected the changed resolution");
		}
		session.send({
			kind: "remove-fact-resolution",
			resolutionId: changedResolution.resolutionId,
		});
		session.send({
			kind: "resolve-fact-conflict",
			groupId: conflict.groupId,
			choice: { kind: "observed", observationId: jsonObservation.observationId },
			reason: "The JSON export matches the bank statement.",
			executionContext: { recordedAt: "2026-08-30T08:10:00.000Z" },
		});
		await waitFor(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.pendingRecomputation.kind === "idle" &&
				snapshot.estimateComputation?.kind === "computed"
			);
		});
		const restored = session.getSnapshot();
		if (
			restored.kind !== "document-intake" ||
			restored.estimateComputation?.kind !== "computed"
		) {
			throw new Error("Expected the restored resolved estimate");
		}
		expect(restored.estimateComputation).toEqual(original.estimateComputation);
		expect(restored.extractions).toBe(originalExtractions);
		expect(restored.salaryComputation).toBe(originalSalary);
		session.stop();
	}, 30_000);
});
