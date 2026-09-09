import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
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
				displayName: "synthetic-new-regime-salary.pdf",
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

describe("complete new-regime computation through the public session", () => {
	test("blocks on incomplete slices, then publishes their combined result", async () => {
		const session = await startDocuments();
		let snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected document intake");
		}
		expect(snapshot.newRegimeComputation).toMatchObject({
			kind: "blocked",
			issues: expect.arrayContaining([
				expect.objectContaining({
					code: "FACT_SAVINGS_PENSION_DEDUCTION_PRESENCE_MISSING",
				}),
			]),
		});

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

		snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected document intake");
		}
		expect(snapshot.newRegimeComputation).toMatchObject({
			kind: "computed",
			rulePackRevision: "2026-09-15",
			summary: {
				totalIncome: "975000",
				normalRateIncome: "975000",
				finalTaxLiability: "0",
			},
		});
		expect(snapshot.salaryComputation?.kind).toBe("computed");
		expect(snapshot.remainingDeductionComputation?.kind).toBe("computed");
	});
});
