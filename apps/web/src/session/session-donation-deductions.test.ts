import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260912 as rulePack } from "@openitr/itr1-ay2026-27";
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

const startDocuments = async (): Promise<SessionOrchestrator> => {
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
		if (question.requiresRuleId === undefined) continue;
		const value =
			question.id === "scope-individual" ||
			question.id === "scope-resident-other-than-rnor"
				? "yes"
				: question.answerSchema.kind === "boolean"
					? "no"
					: question.id === "scope-total-income"
						? "900000"
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
				displayName: "synthetic-salary.pdf",
				readBytes: () => Promise.resolve(createForm16SalaryPdfFixture()),
			},
		],
	});
	await expect
		.poll(() => {
			const snapshot = session.getSnapshot();
			return (
				snapshot.kind === "document-intake" &&
				snapshot.extractions[0]?.status === "done"
			);
		})
		.toBe(true);
	return session;
};

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

describe("donation deductions through the public session", () => {
	test("derives a limited donation from progressive attested facts", async () => {
		const session = await startDocuments();
		for (const [questionId, value] of [
			["deduction-80g-present", "yes"],
			["deduction-80g-amount", "80000"],
			["deduction-80g-full-deduction", "no"],
			["deduction-80g-subject-to-qualifying-limit", "yes"],
			["deduction-80g-adjusted-gti", "500000"],
			["deduction-80g-cash-payment", "no"],
			["deduction-80g-noncash-payment-details", "yes"],
			["deduction-80g-recipient-qualified", "yes"],
			["deduction-80g-recipient-details", "yes"],
			["deduction-80g-certificate", "yes"],
		] as const) {
			answer(session, questionId, value);
		}

		const snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected document intake");
		}
		expect(snapshot.donationDeductionComputation).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "25000",
			newRegimeTotal: "0",
			donations: [
				{
					status: "allowed",
					qualifyingPercentage: 50,
					limitTreatment: "subject-to-qualifying-limit",
				},
			],
		});
		expect(
			snapshot.factAnswers.find(
				(candidate) => candidate.questionId === "deduction-80g-amount",
			),
		).toMatchObject({
			value: "80000",
			questionRevision: "2026-09-12",
			origin: {
				kind: "attested-answer",
				rulePackId: "itr1-ay2026-27.2026-09-12",
			},
		});
	});
});
