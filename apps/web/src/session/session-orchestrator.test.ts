import {
	itr1Ay202627RulePack,
	itr1Ay202627RulePack20260903,
} from "@openitr/itr1-ay2026-27";
import { parseRulePackId } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createSyntheticRulePack,
	firstSyntheticRevision,
	secondSyntheticRevision,
} from "./synthetic-rule-pack-fixtures";
import { createSessionOrchestrator } from "./session-orchestrator";
import type { SessionCommand } from "./session-orchestrator";
import { inProcessInspectionFacility } from "./in-process-inspection-facility";

const fixedAnswerTime = "2026-08-22T00:00:00.000Z";
const createSession = () =>
	createSessionOrchestrator({
		rulePack: itr1Ay202627RulePack,
		documents: inProcessInspectionFacility(),
	});
const expectedInitialSnapshot = {
	kind: "awaiting-scope-answer",
	workflow: "eligibility",
	rulePackId: "itr1-ay2026-27.2026-08-22",
	question: {
		id: "itr1-resident-individual",
		prompt:
			"For FY 2025-26, were you an individual with Resident status, excluding Resident but not ordinarily resident?",
		helpText:
			"Answer No if your status was Resident but not ordinarily resident or Non-resident.",
		answers: [
			{ value: "yes", label: "Yes" },
			{ value: "no", label: "No" },
		],
		suppliesFact: "taxpayer.residential-status",
		requiresRuleId: "ITR1-ELIGIBILITY-RESIDENT",
		answerSchema: {
			kind: "choice",
			values: ["yes", "no"],
		},
		visibility: { kind: "always" },
		blockingEffect: {
			kind: "block-on-answer",
			answer: "no",
			issueCode: "RULE_ITR1_RESIDENT_STATUS_UNSUPPORTED",
		},
		sourceReference: {
			sourceId: "cbdt-notification-45-2026",
			location: "Form ITR-1 heading, Gazette page 16",
		},
	},
};

describe("ITR-1 scope check", () => {
	const questionId = itr1Ay202627RulePack.question.id;
	const answerCommand = (
		answer: "yes" | "no",
		answerTime = fixedAnswerTime,
	): SessionCommand => ({
		kind: "answer-eligibility-question",
		questionId,
		answer,
		executionContext: { answerTime },
	});

	test("presents one cited question with the facts needed by the rule pack", () => {
		const session = createSession();

		expect(session.getSnapshot()).toEqual(expectedInitialSnapshot);

		session.stop();
	});

	test("reports a resident individual as supported by the pinned rule", () => {
		const session = createSession();

		session.send(answerCommand("yes"));

		expect(session.getSnapshot()).toEqual({
			kind: "scope-check-complete",
			workflow: "eligibility",
			rulePackId: "itr1-ay2026-27.2026-08-22",
			question: {
				id: "itr1-resident-individual",
				prompt:
					"For FY 2025-26, were you an individual with Resident status, excluding Resident but not ordinarily resident?",
			},
			answer: {
				questionId: "itr1-resident-individual",
				value: "yes",
				label: "Yes",
				answeredAt: "2026-08-22T00:00:00.000Z",
				rulePackId: "itr1-ay2026-27.2026-08-22",
			},
			result: {
				kind: "supported",
				title: "Supported by this scope check",
				explanation:
					"You answered Yes. Rule ITR1-ELIGIBILITY-RESIDENT permits ITR-1 analysis for an individual who is resident other than not ordinarily resident.",
				rule: {
					id: "ITR1-ELIGIBILITY-RESIDENT",
					citation:
						"Notification No. 45/2026, Form ITR-1 heading, Gazette page 16",
					sourceUrl:
						"https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-04/Notification%20No.45_2026.pdf",
				},
			},
		});

		session.stop();
	});

	test("reports any other residential status as unsupported by the pinned rule", () => {
		const session = createSession();

		session.send(answerCommand("no"));

		expect(session.getSnapshot()).toEqual({
			kind: "scope-check-complete",
			workflow: "eligibility",
			rulePackId: "itr1-ay2026-27.2026-08-22",
			question: {
				id: "itr1-resident-individual",
				prompt:
					"For FY 2025-26, were you an individual with Resident status, excluding Resident but not ordinarily resident?",
			},
			answer: {
				questionId: "itr1-resident-individual",
				value: "no",
				label: "No",
				answeredAt: "2026-08-22T00:00:00.000Z",
				rulePackId: "itr1-ay2026-27.2026-08-22",
			},
			result: {
				kind: "unsupported",
				title: "Not supported by this scope check",
				explanation:
					"You answered No. Rule ITR1-ELIGIBILITY-RESIDENT limits ITR-1 analysis to an individual who is resident other than not ordinarily resident.",
				rule: {
					id: "ITR1-ELIGIBILITY-RESIDENT",
					citation:
						"Notification No. 45/2026, Form ITR-1 heading, Gazette page 16",
					sourceUrl:
						"https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-04/Notification%20No.45_2026.pdf",
				},
				issue: {
					code: "RULE_ITR1_RESIDENT_STATUS_UNSUPPORTED",
					severity: "blocking",
					affectedFacts: ["taxpayer.residential-status"],
					sourceReferences: [
						{
							sourceId: "cbdt-notification-45-2026",
							location: "Form ITR-1 heading, Gazette page 16",
						},
					],
					recoveryAction:
						"Stop this ITR-1 analysis and review another return-form scope or consult a qualified professional.",
				},
			},
		});

		session.stop();
	});

	test("replays the same answer against the same rule-pack revision", () => {
		const runScopeCheck = () => {
			const session = createSession();
			session.send(answerCommand("yes"));
			const snapshot = session.getSnapshot();
			session.stop();
			return snapshot;
		};

		expect(runScopeCheck()).toEqual(runScopeCheck());
	});

	test("notifies subscribers when the scope check completes", () => {
		const session = createSession();
		const observedSnapshotKinds: string[] = [];
		const unsubscribe = session.subscribe(() => {
			observedSnapshotKinds.push(session.getSnapshot().kind);
		});

		session.send(answerCommand("yes"));

		expect(observedSnapshotKinds).toEqual(["scope-check-complete"]);

		unsubscribe();
		session.stop();
	});

	test("records the explicit answer time supplied with the command", () => {
		const session = createSession();
		const answerTime = "2026-08-22T00:05:00.000Z";

		session.send(answerCommand("yes", answerTime));

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("scope-check-complete");
		if (snapshot.kind === "scope-check-complete") {
			expect(snapshot.answer.answeredAt).toBe(answerTime);
		}

		session.stop();
	});
});

describe("ITR-1 full scope workflow", () => {
	const createFullScopeSession = () =>
		createSessionOrchestrator({
			rulePack: itr1Ay202627RulePack20260903,
			documents: inProcessInspectionFacility(),
		});
	const answerRequiredScopeFacts = (session: ReturnType<typeof createFullScopeSession>) => {
		const snapshot = session.getSnapshot();
		if (snapshot.kind !== "scope-check-complete" || snapshot.analysisScope === undefined) {
			throw new Error("Expected a full-scope completion snapshot");
		}
		for (const question of snapshot.analysisScope.questions) {
			if (question.requiresRuleId === undefined) {
				continue;
			}
			const value =
				question.id === "scope-total-income"
					? "5000000"
					: question.answerSchema.kind === "boolean"
						? "no"
						: question.answerSchema.kind === "whole-number"
							? "0"
							: "0";
			session.send({
				kind: "answer-analysis-scope-question",
				questionId: question.id,
				value,
				executionContext: { answerTime: fixedAnswerTime },
			});
		}
	};

	test("publishes unresolved full-scope questions after the legacy answer", () => {
		const session = createFullScopeSession();
		session.send({
			kind: "answer-eligibility-question",
			questionId: itr1Ay202627RulePack20260903.question.id,
			answer: "yes",
			executionContext: { answerTime: fixedAnswerTime },
		});
		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("scope-check-complete");
		if (snapshot.kind === "scope-check-complete") {
			expect(snapshot.analysisScope?.kind).toBe("unknown");
			expect(snapshot.analysisScope?.questions.map((question) => question.id)).toContain("scope-total-income");
			expect(snapshot.analysisScope?.decisions.find((decision) => decision.rule.id === "ITR1-SCOPE-TOTAL-INCOME-50-LAKH")?.explanation).toContain("Missing fact key: scope.total-income");
		}
		session.stop();
	});

	test("accepts one typed scope answer and invalidates stale estimates on correction", () => {
		const session = createFullScopeSession();
		session.send({
			kind: "answer-eligibility-question",
			questionId: itr1Ay202627RulePack20260903.question.id,
			answer: "yes",
			executionContext: { answerTime: fixedAnswerTime },
		});
		session.send({
			kind: "answer-analysis-scope-question",
			questionId: "scope-total-income",
			value: "5000000",
			executionContext: { answerTime: "2026-09-03T00:01:00.000Z" },
		});
		let snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("scope-check-complete");
		if (snapshot.kind === "scope-check-complete") {
			expect(snapshot.analysisScope?.decisions.find((decision) => decision.rule.id === "ITR1-SCOPE-TOTAL-INCOME-50-LAKH")?.kind).toBe("supported");
		}
		session.send({
			kind: "answer-analysis-scope-question",
			questionId: "scope-total-income",
			value: "5000000.01",
			executionContext: { answerTime: "2026-09-03T00:02:00.000Z" },
		});
		snapshot = session.getSnapshot();
		if (snapshot.kind === "scope-check-complete") {
			expect(snapshot.analysisScope?.decisions.find((decision) => decision.rule.id === "ITR1-SCOPE-TOTAL-INCOME-50-LAKH")?.kind).toBe("unsupported");
		}
		session.stop();
	});

	test("can reach supported scope while composition evidence remains a checklist concern", () => {
		const session = createFullScopeSession();
		session.send({
			kind: "answer-eligibility-question",
			questionId: itr1Ay202627RulePack20260903.question.id,
			answer: "yes",
			executionContext: { answerTime: fixedAnswerTime },
		});
		answerRequiredScopeFacts(session);
		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("scope-check-complete");
		if (snapshot.kind === "scope-check-complete" && snapshot.analysisScope !== undefined) {
			expect(snapshot.analysisScope.kind).toBe("supported");
			expect(snapshot.analysisScope.questions.map((question) => question.id)).toEqual([
				"scope-salary-pension",
				"scope-bank-interest",
				"scope-other-sources",
			]);
			expect(snapshot.analysisScope.checklist.map((item) => item.id)).toContain("salary-and-pension-evidence");
			expect(snapshot.analysisScope.checklist.map((item) => item.id)).toContain("bank-interest-evidence");
			expect(snapshot.analysisScope.checklist.map((item) => item.id)).not.toContain("tax-payment-evidence");
		}
		session.stop();
	});
});

describe("ITR-1 session reset", () => {
	const sentinelAnswerTime = "2026-08-22T09:09:09.090Z";
	const questionId = itr1Ay202627RulePack.question.id;
	const answerCommand = (
		answer: "yes" | "no",
		answerTime: string,
	): SessionCommand => ({
		kind: "answer-eligibility-question",
		questionId,
		answer,
		executionContext: { answerTime },
	});

	test("returns the application to its initial scope-check state after reset", () => {
		const session = createSession();

		session.send(answerCommand("no", fixedAnswerTime));
		expect(session.getSnapshot().kind).toBe("scope-check-complete");

		session.send({ kind: "reset" });

		expect(session.getSnapshot()).toEqual(expectedInitialSnapshot);

		session.stop();
	});

	test("releases the previous answer and result so the reset session holds no trace of them", () => {
		const session = createSession();

		session.send(answerCommand("no", sentinelAnswerTime));
		expect(JSON.stringify(session.getSnapshot())).toContain(sentinelAnswerTime);

		session.send({ kind: "reset" });
		session.send(answerCommand("yes", fixedAnswerTime));

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("scope-check-complete");
		if (snapshot.kind === "scope-check-complete") {
			expect(snapshot.answer.value).toBe("yes");
			expect(snapshot.result.kind).toBe("supported");
		}
		expect(JSON.stringify(session.getSnapshot())).not.toContain(
			sentinelAnswerTime,
		);

		session.stop();
	});

	test("records a new answer and its result when the session is answered again after reset", () => {
		const session = createSession();

		session.send(answerCommand("yes", fixedAnswerTime));
		session.send({ kind: "reset" });
		session.send(answerCommand("no", fixedAnswerTime));

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("scope-check-complete");
		if (snapshot.kind === "scope-check-complete") {
			expect(snapshot.answer.value).toBe("no");
			expect(snapshot.result.kind).toBe("unsupported");
		}

		session.stop();
	});

	test("notifies subscribers that reset returned to the initial scope-check state", () => {
		const session = createSession();
		const observedSnapshotKinds: string[] = [];
		const unsubscribe = session.subscribe(() => {
			observedSnapshotKinds.push(session.getSnapshot().kind);
		});

		session.send(answerCommand("yes", fixedAnswerTime));
		session.send({ kind: "reset" });

		expect(observedSnapshotKinds).toEqual([
			"scope-check-complete",
			"awaiting-scope-answer",
		]);

		unsubscribe();
		session.stop();
	});
});

describe("rule-pack revision pinning", () => {
	const answerCommandFor = (
		rulePack: Awaited<ReturnType<typeof createSyntheticRulePack>>,
		answer: "yes" | "no",
	): SessionCommand => ({
		kind: "answer-eligibility-question",
		questionId: rulePack.question.id,
		answer,
		executionContext: { answerTime: fixedAnswerTime },
	});

	test("keeps an active session pinned to its original revision after another revision becomes available", async () => {
		const first = await createSyntheticRulePack(firstSyntheticRevision);
		const activeSession = createSessionOrchestrator({
			rulePack: first,
			documents: inProcessInspectionFacility(),
		});
		activeSession.send(answerCommandFor(first, "yes"));
		const pinnedSnapshot = activeSession.getSnapshot();

		const second = await createSyntheticRulePack(secondSyntheticRevision);
		createSessionOrchestrator({
			rulePack: second,
			documents: inProcessInspectionFacility(),
		}).stop();

		expect(activeSession.getSnapshot()).toEqual(pinnedSnapshot);
		expect(activeSession.getSnapshot().rulePackId).toBe(
			firstSyntheticRevision.rulePackId,
		);

		activeSession.stop();
	});

	test("selects the newer revision for a new session while the active session stays on its own", async () => {
		const first = await createSyntheticRulePack(firstSyntheticRevision);
		const second = await createSyntheticRulePack(secondSyntheticRevision);
		const activeSession = createSessionOrchestrator({
			rulePack: first,
			documents: inProcessInspectionFacility(),
		});
		activeSession.send(answerCommandFor(first, "yes"));

		const newSession = createSessionOrchestrator({
			rulePack: second,
			documents: inProcessInspectionFacility(),
		});
		newSession.send(answerCommandFor(second, "yes"));

		const activeSnapshot = activeSession.getSnapshot();
		const newSnapshot = newSession.getSnapshot();

		expect(activeSnapshot.kind).toBe("scope-check-complete");
		expect(newSnapshot.kind).toBe("scope-check-complete");
		expect(activeSnapshot.rulePackId).toBe(
			firstSyntheticRevision.rulePackId,
		);
		expect(newSnapshot.rulePackId).toBe(secondSyntheticRevision.rulePackId);
		if (activeSnapshot.kind === "scope-check-complete") {
			expect(activeSnapshot.result.title).toBe(
				`Supported by ${firstSyntheticRevision.packRevision}`,
			);
		}
		if (newSnapshot.kind === "scope-check-complete") {
			expect(newSnapshot.result.title).toBe(
				`Supported by ${secondSyntheticRevision.packRevision}`,
			);
		}

		activeSession.stop();
		newSession.stop();
	});

	test("produces identical scope results for identical facts, execution context, and revision", async () => {
		const runPinnedScopeCheck = async () => {
			const rulePack = await createSyntheticRulePack(secondSyntheticRevision);
			const session = createSessionOrchestrator({
				rulePack,
				documents: inProcessInspectionFacility(),
			});
			session.send(answerCommandFor(rulePack, "yes"));
			const snapshot = session.getSnapshot();
			session.stop();
			return snapshot;
		};

		expect(await runPinnedScopeCheck()).toEqual(await runPinnedScopeCheck());
	});

	test("answers recorded in a session always carry that session's pinned rule-pack identity", async () => {
		const first = await createSyntheticRulePack(firstSyntheticRevision);
		const second = await createSyntheticRulePack(secondSyntheticRevision);
		const activeSession = createSessionOrchestrator({
			rulePack: first,
			documents: inProcessInspectionFacility(),
		});

		activeSession.send(answerCommandFor(first, "yes"));
		const snapshot = activeSession.getSnapshot();
		expect(snapshot.kind).toBe("scope-check-complete");
		if (snapshot.kind === "scope-check-complete") {
			expect(snapshot.answer.rulePackId).toBe(
				parseRulePackId(firstSyntheticRevision.rulePackId),
			);
			expect(snapshot.answer.rulePackId).not.toBe(second.identity.id);
		}
		activeSession.stop();
	});
});
