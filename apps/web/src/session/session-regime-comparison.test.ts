import {
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260915 as rulePack } from "@openitr/itr1-ay2026-27";
import { afterEach, describe, expect, test } from "vitest";

import { inProcessInspectionFacility } from "./in-process-inspection-facility";
import { createSessionOrchestrator } from "./session-orchestrator";
import type { SessionOrchestrator } from "./session-orchestrator";

const answerTime = "2099-01-01T00:00:00.000Z";
const sessions: SessionOrchestrator[] = [];

afterEach(() => {
	for (const session of sessions) session.stop();
	sessions.length = 0;
});

const answer = (
	session: SessionOrchestrator,
	questionId: string,
	value: string,
): void => {
	session.send({
		kind: "answer-missing-fact-question",
		questionId,
		value,
		executionContext: { answerTime },
	});
};

const startCompletedComparison = async (): Promise<SessionOrchestrator> => {
	const session = createSessionOrchestrator({
		rulePack,
		documents: inProcessInspectionFacility(),
	});
	sessions.push(session);
	session.send({
		kind: "answer-eligibility-question",
		questionId: rulePack.question.id,
		answer: "yes",
		executionContext: { answerTime },
	});
	if (rulePack.analysisScope === undefined) throw new Error("Scope missing");
	for (const question of rulePack.analysisScope.questions) {
		if (
			question.requiresRuleId === undefined &&
			question.id !== "scope-other-sources"
		) {
			continue;
		}
		const value =
			question.id === "scope-individual" ||
			question.id === "scope-resident-other-than-rnor"
				? "yes"
				: question.answerSchema.kind === "boolean"
					? "no"
					: question.id === "scope-total-income"
						? "1100000"
						: "0";
		session.send({
			kind: "answer-analysis-scope-question",
			questionId: question.id,
			value,
			executionContext: { answerTime },
		});
	}
	session.send({
		kind: "select-source-documents",
		documents: [
			{
				displayName: "synthetic-regime-comparison.pdf",
				readBytes: () => Promise.resolve(createForm16SalaryPdfFixture()),
			},
			{
				displayName: "synthetic-regime-comparison-26as.txt",
				readBytes: () =>
					Promise.resolve(utf8Bytes(createForm26AsTextFixture())),
			},
		],
	});
	await expect.poll(() => {
		const snapshot = session.getSnapshot();
		return (
			snapshot.kind === "document-intake" &&
			snapshot.extractions.length === 2 &&
			snapshot.extractions.every((record) => record.status === "done")
		);
	}).toBe(true);

	for (const [questionId, value] of [
		["bank-interest-savings-account-total", "0"],
		["bank-interest-deposits-total", "0"],
		["taxpayer-senior-citizen", "no"],
		["savings-pension-deductions-present", "no"],
		["deduction-80d-present", "no"],
		["deduction-80dd-present", "no"],
		["deduction-80ddb-present", "no"],
		["deduction-80u-present", "no"],
		["deduction-80e-present", "no"],
		["deduction-80ee-present", "no"],
		["deduction-80eea-present", "no"],
		["deduction-80eeb-present", "no"],
		["deduction-80g-present", "no"],
		["deduction-80cch-present", "no"],
		["deduction-80gg-present", "no"],
		["deduction-80gga-present", "no"],
		["deduction-80ggc-present", "no"],
		["deduction-other-present", "no"],
	] as const) {
		answer(session, questionId, value);
	}
	await expect.poll(() => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake" && snapshot.regimeComparison?.kind;
	}).toBe("computed");
	return session;
};

describe("regime comparison through the public session", () => {
	test("publishes one fact revision and requires a changeable primary choice", async () => {
		const session = await startCompletedComparison();
		let snapshot = session.getSnapshot();
		if (
			snapshot.kind !== "document-intake" ||
			snapshot.regimeComparison?.kind !== "computed" ||
			snapshot.oldRegimeComputation?.kind !== "computed" ||
			snapshot.newRegimeComputation?.kind !== "computed"
		) {
			throw new Error("Expected a completed comparison");
		}
		expect(snapshot.primaryRegime).toBeUndefined();
		expect(snapshot.oldRegimeComputation.factSetRevision).toBe(
			snapshot.newRegimeComputation.factSetRevision,
		);
		expect(snapshot.regimeComparison.factSetRevision).toBe(
			snapshot.oldRegimeComputation.factSetRevision,
		);
		const factSetRevision = snapshot.regimeComparison.factSetRevision;

		session.send({ kind: "select-primary-regime", regime: "old" });
		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") throw new Error("Expected intake");
		expect(snapshot.primaryRegime).toEqual({
			regime: "old",
			factSetRevision,
		});

		session.send({ kind: "select-primary-regime", regime: "new" });
		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") throw new Error("Expected intake");
		expect(snapshot.primaryRegime?.regime).toBe("new");
	});

	test("hides both calculations, comparison, and choice before recomputing changed facts", async () => {
		const session = await startCompletedComparison();
		let snapshot = session.getSnapshot();
		if (
			snapshot.kind !== "document-intake" ||
			snapshot.regimeComparison?.kind !== "computed"
		) {
			throw new Error("Expected comparison");
		}
		session.send({ kind: "select-primary-regime", regime: "old" });
		const revision = snapshot.regimeComparison.factSetRevision;
		const answerId = snapshot.factAnswers.find(
			(candidate) =>
				candidate.questionId === "bank-interest-savings-account-total",
		)?.answerId;
		if (answerId === undefined) throw new Error("Expected bank-interest answer");

		session.send({ kind: "remove-missing-fact-answer", answerId });
		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") throw new Error("Expected intake");
		expect(snapshot.pendingRecomputation.kind).toBe("pending");
		expect(snapshot.oldRegimeComputation).toBeUndefined();
		expect(snapshot.newRegimeComputation).toBeUndefined();
		expect(snapshot.regimeComparison).toBeUndefined();
		expect(snapshot.primaryRegime).toBeUndefined();

		await expect.poll(() => {
			const current = session.getSnapshot();
			return current.kind === "document-intake"
				? current.pendingRecomputation.kind
				: "wrong-snapshot";
		}).toBe("idle");
		answer(session, "bank-interest-savings-account-total", "1");
		await expect.poll(() => {
			const current = session.getSnapshot();
			return current.kind === "document-intake" &&
				current.regimeComparison?.kind === "computed"
				? current.regimeComparison.factSetRevision
				: undefined;
		}).not.toBe(revision);
	});

	test("records final review confirmation only for the current fact revision", async () => {
		const session = await startCompletedComparison();
		let snapshot = session.getSnapshot();
		if (
			snapshot.kind !== "document-intake" ||
			snapshot.regimeComparison?.kind !== "computed"
		) {
			throw new Error("Expected comparison");
		}
		const factSetRevision = snapshot.regimeComparison.factSetRevision;
		session.send({ kind: "select-primary-regime", regime: "old" });
		session.send({
			kind: "confirm-final-review",
			executionContext: { confirmedAt: answerTime },
		});
		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") throw new Error("Expected intake");
		expect(snapshot.finalReviewConfirmation).toEqual({
			factSetRevision,
			confirmedAt: answerTime,
		});

		const answerId = snapshot.factAnswers.find(
			(candidate) =>
				candidate.questionId === "bank-interest-savings-account-total",
		)?.answerId;
		if (answerId === undefined) throw new Error("Expected bank-interest answer");
		session.send({ kind: "remove-missing-fact-answer", answerId });
		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") throw new Error("Expected intake");
		expect(snapshot.finalReviewConfirmation).toBeUndefined();
	});
});
