import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260913 as rulePack } from "@openitr/itr1-ay2026-27";
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
	const session = createSessionOrchestrator({ rulePack, documents: inProcessInspectionFacility() });
	sessions.push(session);
	session.send({ kind: "answer-eligibility-question", questionId: rulePack.question.id, answer: "yes", executionContext: { answerTime } });
	if (rulePack.analysisScope === undefined) throw new Error("Scope missing");
	for (const question of rulePack.analysisScope.questions) {
		if (question.requiresRuleId === undefined) continue;
		const value = question.id === "scope-individual" || question.id === "scope-resident-other-than-rnor"
			? "yes"
			: question.answerSchema.kind === "boolean" ? "no" : question.id === "scope-total-income" ? "900000" : "0";
		session.send({ kind: "answer-analysis-scope-question", questionId: question.id, value, executionContext: { answerTime } });
	}
	session.send({ kind: "select-source-documents", documents: [{ displayName: "synthetic-salary.pdf", readBytes: () => Promise.resolve(createForm16SalaryPdfFixture()) }] });
	await expect.poll(() => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake" && snapshot.extractions[0]?.status === "done";
	}).toBe(true);
	return session;
};

const answer = (session: SessionOrchestrator, questionId: string, value: string): void => {
	session.send({ kind: "answer-missing-fact-question", questionId, value, executionContext: { answerTime } });
};

describe("remaining deductions through the public session", () => {
	test("reuses bank-interest answers and exposes the section 80TTA result", async () => {
		const session = await startDocuments();
		for (const [questionId, value] of [
			["bank-interest-savings-account-total", "14000"],
			["bank-interest-deposits-total", "60000"],
			["taxpayer-senior-citizen", "no"],
			["deduction-80cch-present", "no"],
			["deduction-80gg-present", "no"],
			["deduction-80gga-present", "no"],
			["deduction-80ggc-present", "no"],
			["deduction-other-present", "no"],
		] as const) answer(session, questionId, value);

		const snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") throw new Error("Expected document intake");
		expect(snapshot.remainingDeductionComputation).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "10000",
			newRegimeTotal: "0",
			results: expect.arrayContaining([
				expect.objectContaining({ section: "80TTA", oldRegimeAllowed: "10000" }),
			]),
		});
		expect(snapshot.factAnswers.find((candidate) => candidate.questionId === "taxpayer-senior-citizen")).toMatchObject({
			value: false,
			questionRevision: "2026-09-13",
		});
	});
});
