import { describe, expect, test } from "vitest";

import { createSessionOrchestrator } from "./session-orchestrator";

describe("ITR-1 scope check", () => {
	test("reports a resident individual as supported by the pinned rule", () => {
		const session = createSessionOrchestrator({
			rulePackId: "itr1-ay2026-27.2026-08-22",
		});

		session.send({
			kind: "answer-eligibility-question",
			questionId: "itr1-resident-individual",
			answer: "yes",
		});

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
				value: "yes",
				label: "Yes",
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
		const session = createSessionOrchestrator({
			rulePackId: "itr1-ay2026-27.2026-08-22",
		});

		session.send({
			kind: "answer-eligibility-question",
			questionId: "itr1-resident-individual",
			answer: "no",
		});

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
				value: "no",
				label: "No",
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
			},
		});

		session.stop();
	});

	test("replays the same answer against the same rule-pack revision", () => {
		const runScopeCheck = () => {
			const session = createSessionOrchestrator({
				rulePackId: "itr1-ay2026-27.2026-08-22",
			});
			session.send({
				kind: "answer-eligibility-question",
				questionId: "itr1-resident-individual",
				answer: "yes",
			});
			const snapshot = session.getSnapshot();
			session.stop();
			return snapshot;
		};

		expect(runScopeCheck()).toEqual(runScopeCheck());
	});
});
