import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260909 as rulePack } from "@openitr/itr1-ay2026-27";
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

describe("savings and pension deductions through the public session", () => {
	test("asks whether the deduction analysis applies and accepts an explicit no", async () => {
		const session = await startDocuments();
		expect(
			snapshotOf(session).questionnaire.questions.map((question) => question.id),
		).toContain("savings-pension-deductions-present");
		expect(snapshotOf(session).savingsPensionDeductionComputation).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_SAVINGS_PENSION_DEDUCTION_PRESENCE_MISSING" },
		});

		answer(session, "savings-pension-deductions-present", "no");
		expect(snapshotOf(session).savingsPensionDeductionComputation).toMatchObject({
			kind: "computed",
			claims: [],
			oldRegime: { totalAllowed: "0" },
			newRegime: { totalAllowed: "0" },
		});
	});

	test("progressively collects bases and records provenance for a complete computation", async () => {
		const session = await startDocuments();
		answer(session, "savings-pension-deductions-present", "yes");
		for (const [questionId, value] of [
			["deduction-80c-amount", "100000"],
			["deduction-80ccc-amount", "60000"],
			["deduction-80ccd1-amount", "50000"],
			["deduction-80ccd1-employed", "yes"],
			["deduction-80ccd1-salary-base", "300000"],
			["deduction-80ccd1b-amount", "60000"],
			["deduction-80ccd2-government-amount", "150000"],
			["deduction-80ccd2-government-salary-base", "1000000"],
			["deduction-80ccd2-other-amount", "150000"],
			["deduction-80ccd2-other-salary-base", "1000000"],
			["savings-pension-proof-available", "no"],
		] as const) {
			expect(
				snapshotOf(session).questionnaire.questions.map(
					(question) => question.id,
				),
			).toContain(questionId);
			answer(session, questionId, value);
		}

		const snapshot = snapshotOf(session);
		expect(snapshot.savingsPensionDeductionComputation).toMatchObject({
			kind: "computed",
			oldRegime: { totalAllowed: "440000" },
			newRegime: { totalAllowed: "280000" },
			issues: [
				{ code: "ANALYSIS_SAVINGS_PENSION_PROOF_NOT_AVAILABLE" },
			],
		});
		expect(
			snapshot.factAnswers.find(
				(candidate) => candidate.questionId === "deduction-80c-amount",
			),
		).toMatchObject({
			questionRevision: "2026-09-09",
			origin: {
				kind: "attested-answer",
				rulePackId: "itr1-ay2026-27.2026-09-09",
			},
		});
	});

	test("rejects a negative contribution at the session boundary", async () => {
		const session = await startDocuments();
		answer(session, "savings-pension-deductions-present", "yes");
		const before = snapshotOf(session);
		expect(() => answer(session, "deduction-80c-amount", "-1")).toThrow();
		expect(snapshotOf(session)).toEqual(before);
	});
});
