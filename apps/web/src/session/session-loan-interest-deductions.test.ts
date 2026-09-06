import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260911 as rulePack } from "@openitr/itr1-ay2026-27";
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
			: question.answerSchema.kind === "boolean"
				? "no"
				: question.id === "scope-total-income" ? "900000" : "0";
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

describe("loan-interest deductions through the public session", () => {
	test("computes section 80EEA from progressive attested facts and retains date provenance", async () => {
		const session = await startDocuments();
		for (const [questionId, value] of [
			["deduction-80e-present", "no"],
			["deduction-80ee-present", "no"],
			["deduction-80eea-present", "yes"],
			["deduction-80eeb-present", "no"],
			["deduction-80eea-borrower", "yes"],
			["deduction-80eea-residential-acquisition", "yes"],
			["deduction-80eea-eligible-lender", "yes"],
			["deduction-80eea-sanction-date", "2022-03-31"],
			["deduction-80eea-stamp-value", "4500000"],
			["deduction-80eea-first-home", "yes"],
			["deduction-80eea-section-24b-exhausted", "yes"],
			["deduction-80eea-additional-interest", "175000"],
			["deduction-80eea-loan-details", "yes"],
		] as const) answer(session, questionId, value);

		const snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") throw new Error("Expected document intake");
		expect(snapshot.loanInterestDeductionComputation).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "150000",
			newRegimeTotal: "0",
			categories: [{ category: "80EEA", claimedInterest: "175000" }],
		});
		expect(snapshot.factAnswers.find((candidate) => candidate.questionId === "deduction-80eea-sanction-date")).toMatchObject({
			value: "2022-03-31",
			questionRevision: "2026-09-11",
			origin: { kind: "attested-answer", rulePackId: "itr1-ay2026-27.2026-09-11" },
		});
	});
});
