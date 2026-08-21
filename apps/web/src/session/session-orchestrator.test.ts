import { itr1Ay202627RulePack } from "@openitr/itr1-ay2026-27";
import { describe, expect, test } from "vitest";

import { createSessionOrchestrator } from "./session-orchestrator";
import type { SessionCommand } from "./session-orchestrator";

describe("ITR-1 scope check", () => {
	const fixedAnswerTime = "2026-08-22T00:00:00.000Z";
	const questionId = itr1Ay202627RulePack.question.id;
	const createSession = () =>
		createSessionOrchestrator({ rulePack: itr1Ay202627RulePack });
	const answerCommand = (
		answer: "yes" | "no",
		answerTime = fixedAnswerTime,
	): SessionCommand => ({
		kind: "answer-eligibility-question",
		questionId,
		answer,
		executionContext: { answerTime },
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

describe("ITR-1 session reset", () => {
	const fixedAnswerTime = "2026-08-22T00:00:00.000Z";
	const sentinelAnswerTime = "2026-08-22T09:09:09.090Z";
	const questionId = itr1Ay202627RulePack.question.id;
	const createSession = () =>
		createSessionOrchestrator({ rulePack: itr1Ay202627RulePack });
	const answerCommand = (
		answer: "yes" | "no",
		answerTime: string,
	): SessionCommand => ({
		kind: "answer-eligibility-question",
		questionId,
		answer,
		executionContext: { answerTime },
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

		const snapshot = JSON.stringify(session.getSnapshot());
		expect(snapshot).not.toContain(sentinelAnswerTime);
		expect(snapshot).not.toContain(
			"Not supported by this scope check",
		);
		expect(snapshot).toContain(fixedAnswerTime);

		session.stop();
	});

	test("accepts a fresh answer after reset in place of the stopped completed actor", () => {
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
