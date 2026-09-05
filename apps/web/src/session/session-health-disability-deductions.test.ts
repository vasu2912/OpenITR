import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260910 as rulePack } from "@openitr/itr1-ay2026-27";
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

const snapshotOf = (session: SessionOrchestrator) => {
	const snapshot = session.getSnapshot();
	if (snapshot.kind !== "document-intake") {
		throw new Error("Expected document intake");
	}
	return snapshot;
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

const answerOtherCategoriesNo = (session: SessionOrchestrator): void => {
	answer(session, "deduction-80dd-present", "no");
	answer(session, "deduction-80ddb-present", "no");
	answer(session, "deduction-80u-present", "no");
};

describe("health and disability deductions through the public session", () => {
	test("asks each category and accepts explicit No answers", async () => {
		const session = await startDocuments();
		expect(
			snapshotOf(session).questionnaire.questions.map((question) => question.id),
		).toEqual(
			expect.arrayContaining([
				"deduction-80d-present",
				"deduction-80dd-present",
				"deduction-80ddb-present",
				"deduction-80u-present",
			]),
		);

		answer(session, "deduction-80d-present", "no");
		answerOtherCategoriesNo(session);
		expect(snapshotOf(session).healthDisabilityDeductionComputation).toMatchObject({
			kind: "computed",
			categories: [],
			oldRegimeTotal: "0",
			newRegimeTotal: "0",
		});
	});

	test("computes selected 80D details and keeps answer provenance", async () => {
		const session = await startDocuments();
		answer(session, "deduction-80d-present", "yes");
		for (const [questionId, value] of [
			["deduction-80d-self-family-claimed", "yes"],
			["deduction-80d-self-family-senior", "no"],
			["deduction-80d-self-family-premium", "26000"],
			["deduction-80d-self-family-preventive", "5000"],
			["deduction-80d-self-family-premium-noncash", "yes"],
			["deduction-80d-self-family-policy-details", "yes"],
			["deduction-80d-parents-claimed", "no"],
		] as const) {
			expect(
				snapshotOf(session).questionnaire.questions.map(
					(question) => question.id,
				),
			).toContain(questionId);
			answer(session, questionId, value);
		}
		answerOtherCategoriesNo(session);

		const snapshot = snapshotOf(session);
		expect(snapshot.healthDisabilityDeductionComputation).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "25000",
			newRegimeTotal: "0",
			categories: [{ category: "80D", claimedAmount: "31000" }],
		});
		expect(
			snapshot.factAnswers.find(
				(candidate) => candidate.questionId === "deduction-80d-self-family-premium",
			),
		).toMatchObject({
			questionRevision: "2026-09-10",
			origin: {
				kind: "attested-answer",
				rulePackId: "itr1-ay2026-27.2026-09-10",
			},
		});
	});

	test("surfaces a category-specific certificate blocker", async () => {
		const session = await startDocuments();
		answer(session, "deduction-80d-present", "no");
		answer(session, "deduction-80dd-present", "no");
		answer(session, "deduction-80ddb-present", "no");
		answer(session, "deduction-80u-present", "yes");
		answer(session, "deduction-80u-severe", "yes");
		answer(session, "deduction-80u-certificate", "no");
		expect(snapshotOf(session).healthDisabilityDeductionComputation).toMatchObject({
			kind: "blocked",
			issues: [{ code: "FACT_80U_CERTIFICATE_REQUIRED", category: "80U" }],
		});
	});
});
