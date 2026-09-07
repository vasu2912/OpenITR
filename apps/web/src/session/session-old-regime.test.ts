import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260914 as rulePack } from "@openitr/itr1-ay2026-27";
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
				displayName: "synthetic-old-regime-salary.pdf",
				readBytes: () => Promise.resolve(createForm16SalaryPdfFixture()),
			},
		],
	});
	await expect.poll(() => {
		const snapshot = session.getSnapshot();
		return (
			snapshot.kind === "document-intake" &&
			snapshot.extractions[0]?.status === "done"
		);
	}).toBe(true);
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

const answerRequiredDeductionSelections = (session: SessionOrchestrator): void => {
	for (const [questionId, value] of [
		["bank-interest-savings-account-total", "0"],
		["bank-interest-deposits-total", "0"],
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
};

describe("old-regime computation through the public session", () => {
	test("blocks only on unanswered slices, then reconciles the completed result", async () => {
		const session = await startDocuments();
		answerRequiredDeductionSelections(session);

		let snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected document intake");
		}
		expect(snapshot.oldRegimeComputation).toMatchObject({
			kind: "blocked",
			issues: expect.arrayContaining([
				expect.objectContaining({
					code: "FACT_OLD_REGIME_AGE_CATEGORY_MISSING",
					affectedFacts: ["taxpayer.senior-citizen"],
				}),
			]),
		});

		answer(session, "taxpayer-senior-citizen", "no");
		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected document intake");
		}
		expect(snapshot.oldRegimeComputation).toMatchObject({
			kind: "computed",
			rulePackRevision: "2026-09-14",
			ageCategory: "under-60",
			summary: {
				totalIncome: "1000000",
				finalTaxLiability: "117000",
			},
		});
		expect(snapshot.salaryComputation?.kind).toBe("computed");
		expect(snapshot.remainingDeductionComputation?.kind).toBe("computed");
	});

	test("requests the super-senior fact only after a senior answer", async () => {
		const session = await startDocuments();
		answerRequiredDeductionSelections(session);
		answer(session, "taxpayer-senior-citizen", "yes");

		let snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected document intake");
		}
		expect(snapshot.questionnaire.questions.map((question) => question.id)).toContain(
			"taxpayer-super-senior-citizen",
		);
		expect(snapshot.oldRegimeComputation).toMatchObject({
			kind: "blocked",
			issues: expect.arrayContaining([
				expect.objectContaining({ code: "FACT_SUPER_SENIOR_STATUS_MISSING" }),
			]),
		});

		answer(session, "taxpayer-super-senior-citizen", "no");
		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected document intake");
		}
		expect(snapshot.oldRegimeComputation).toMatchObject({
			kind: "computed",
			ageCategory: "60-to-79",
			summary: { finalTaxLiability: "114400" },
		});
	});
});
