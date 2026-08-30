import {
	itr1Ay202627RulePack20260826,
} from "@openitr/itr1-ay2026-27";
import {
	createAisCsvBankInterestFixture,
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { describe, expect, test } from "vitest";

import { inProcessInspectionFacility } from "./in-process-inspection-facility";
import {
	createSessionOrchestrator,
} from "./session-orchestrator";
import type {
	SessionCommand,
	SessionOrchestrator,
} from "./session-orchestrator";

const FIXED_SCOPE_TIME = "2026-08-30T08:00:00.000Z";
const FIXED_ANSWER_TIME = "2026-08-30T08:05:00.000Z";

const createEligibleSession = (): SessionOrchestrator => {
	const session = createSessionOrchestrator({
		rulePack: itr1Ay202627RulePack20260826,
		documents: inProcessInspectionFacility(),
	});
	session.send({
		kind: "answer-eligibility-question",
		questionId: itr1Ay202627RulePack20260826.question.id,
		answer: "yes",
		executionContext: { answerTime: FIXED_SCOPE_TIME },
	});
	return session;
};

const selectDocument = (
	displayName: string,
	bytes: Uint8Array<ArrayBuffer>,
): SessionCommand => ({
	kind: "select-source-documents",
	documents: [
		{
			displayName,
			readBytes: () => Promise.resolve(bytes),
		},
	],
});

const waitFor = async (
	predicate: () => boolean,
	budgetMs = 20_000,
): Promise<void> => {
	const deadline = Date.now() + budgetMs;
	for (;;) {
		if (predicate()) {
			return;
		}
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for the questionnaire session");
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
};

const waitForExtraction = async (session: SessionOrchestrator): Promise<void> =>
	waitFor(() => {
		const snapshot = session.getSnapshot();
		return (
			snapshot.kind === "document-intake" &&
			snapshot.extractions[0]?.status === "done"
		);
	});

const waitForExtractions = async (
	session: SessionOrchestrator,
	count: number,
): Promise<void> =>
	waitFor(() => {
		const snapshot = session.getSnapshot();
		return (
			snapshot.kind === "document-intake" &&
			snapshot.extractions.length === count &&
			snapshot.extractions.every((record) => record.status === "done")
		);
	});

const answerQuestion = (
	questionId: "bank-interest-savings-account-total" | "bank-interest-deposits-total",
	value: string,
): SessionCommand => ({
	kind: "answer-missing-fact-question",
	questionId,
	value,
	executionContext: { answerTime: FIXED_ANSWER_TIME },
});

describe("progressive missing-fact questionnaire", () => {
	test("derives only the pinned questions still missing after accepted evidence", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"tax-credit-statement.txt",
				utf8Bytes(createForm26AsTextFixture()),
			),
		);
		await waitForExtraction(session);

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected the documents workflow");
		}
		expect(snapshot.questionnaire.questions.map((question) => question.id)).toEqual([
			"bank-interest-savings-account-total",
			"bank-interest-deposits-total",
		]);
		expect(snapshot.questionnaire.questions[0]).toMatchObject({
			whyRequired: expect.stringContaining("Section 56"),
			affectedResult: {
				resultId: "refund-or-payable-estimate",
				label: "Estimated refund or amount payable",
			},
		});
		expect(snapshot.factAnswers).toEqual([]);
		expect(JSON.stringify(snapshot.questionnaire.questions)).not.toMatch(
			/"(value|answer)"/,
		);

		session.stop();
	});

	test("removes questions whose facts accepted source evidence supplies", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"annual-information-statement.json",
				utf8Bytes(createAisJsonBankInterestFixture()),
			),
		);
		await waitForExtraction(session);

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind === "document-intake") {
			expect(snapshot.questionnaire.questions).toEqual([]);
			expect(snapshot.factAnswers).toEqual([]);
		}

		session.stop();
	});

	test("does not offer a question as a substitute for resolving conflicted evidence", async () => {
		const session = createEligibleSession();
		session.send({
			kind: "select-source-documents",
			documents: [
				{
					displayName: "annual-information-statement.json",
					readBytes: () =>
						Promise.resolve(utf8Bytes(createAisJsonBankInterestFixture())),
				},
				{
					displayName: "annual-information-statement.csv",
					readBytes: () =>
						Promise.resolve(
							utf8Bytes(
								createAisCsvBankInterestFixture({
									bankInterestRows: [
										{
											recordCategory: "SAVINGS_ACCOUNT",
											institutionName: "OpenITR Synthetic Bank",
											maskedAccountNumber: "XXXXXX0001",
											interestAmount: "9,000.00",
										},
										{
											recordCategory: "DEPOSITS",
											institutionName:
												"OpenITR Synthetic Co-operative Bank",
											maskedAccountNumber: "XXXXXX0002",
											interestAmount: "45,678.90",
										},
									],
								}),
							),
						),
				},
			],
		});
		await waitForExtractions(session, 2);

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind === "document-intake") {
			expect(snapshot.factConflicts.map((conflict) => conflict.factKey)).toEqual([
				"bank-interest.savings-account",
			]);
			expect(snapshot.questionnaire.questions).toEqual([]);
		}

		session.stop();
	});

	test("stores a valid answer as an attested fact with session time and question revision", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"tax-credit-statement.txt",
				utf8Bytes(createForm26AsTextFixture()),
			),
		);
		await waitForExtraction(session);

		session.send(answerQuestion("bank-interest-savings-account-total", "4850.250"));

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected the documents workflow");
		}
		expect(snapshot.factAnswers).toEqual([
			{
				answerId:
					"fact-answer:itr1-ay2026-27.2026-08-26:bank-interest-savings-account-total:4850.25:2026-08-30T08:05:00.000Z",
				questionId: "bank-interest-savings-account-total",
				questionRevision: "2026-08-26",
				factKey: "bank-interest.savings-account",
				value: "4850.25",
				origin: {
					kind: "attested-answer",
					rulePackId: "itr1-ay2026-27.2026-08-26",
				},
				answeredAt: FIXED_ANSWER_TIME,
			},
		]);
		expect(snapshot.questionnaire.questions.map((question) => question.id)).toEqual([
			"bank-interest-deposits-total",
		]);
		expect(snapshot.estimateComputation).toMatchObject({
			kind: "blocked",
			issues: expect.arrayContaining([
				expect.objectContaining({
					code: "FACT_BANK_INTEREST_EVIDENCE_REQUIRED",
					affectedFactKeys: ["bank-interest.deposits"],
				}),
			]),
		});

		session.stop();
	});

	test("recomputes after the final answer without retaining a stale missing-interest issue", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"tax-credit-statement.txt",
				utf8Bytes(createForm26AsTextFixture()),
			),
		);
		await waitForExtraction(session);

		session.send(answerQuestion("bank-interest-savings-account-total", "4850.25"));
		session.send(answerQuestion("bank-interest-deposits-total", "12000"));

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected the documents workflow");
		}
		expect(snapshot.questionnaire.questions).toEqual([]);
		expect(snapshot.factAnswers).toHaveLength(2);
		const bankInterestIssues =
			snapshot.estimateComputation?.kind === "blocked"
				? snapshot.estimateComputation.issues.filter(
						(issue) => issue.code === "FACT_BANK_INTEREST_EVIDENCE_REQUIRED",
					)
				: [];
		expect(bankInterestIssues).toEqual([]);

		session.stop();
	});

	test("stores answers in pinned question order regardless of answer order", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"tax-credit-statement.txt",
				utf8Bytes(createForm26AsTextFixture()),
			),
		);
		await waitForExtraction(session);

		session.send(answerQuestion("bank-interest-deposits-total", "12000"));
		session.send(answerQuestion("bank-interest-savings-account-total", "4850.25"));

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind === "document-intake") {
			expect(snapshot.factAnswers.map((answer) => answer.questionId)).toEqual([
				"bank-interest-savings-account-total",
				"bank-interest-deposits-total",
			]);
		}

		session.stop();
	});

	test("removing a recorded answer restores its question and recomputes the missing fact", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"tax-credit-statement.txt",
				utf8Bytes(createForm26AsTextFixture()),
			),
		);
		await waitForExtraction(session);
		session.send(answerQuestion("bank-interest-savings-account-total", "4850.25"));

		const answered = session.getSnapshot();
		if (answered.kind !== "document-intake") {
			throw new Error("Expected the documents workflow");
		}
		const answer = answered.factAnswers[0];
		if (answer === undefined) {
			throw new Error("Expected a recorded answer");
		}
		session.send({ kind: "remove-missing-fact-answer", answerId: answer.answerId });

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind === "document-intake") {
			expect(snapshot.factAnswers).toEqual([]);
			expect(snapshot.questionnaire.questions.map((question) => question.id)).toEqual([
				"bank-interest-savings-account-total",
				"bank-interest-deposits-total",
			]);
			expect(snapshot.estimateComputation).toMatchObject({
				kind: "blocked",
				issues: expect.arrayContaining([
					expect.objectContaining({
						affectedFactKeys: [
							"bank-interest.deposits",
							"bank-interest.savings-account",
						],
					}),
				]),
			});
		}

		session.stop();
	});

	test("later evidence and conflict resolution supersede answers without double-counting", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"tax-credit-statement.txt",
				utf8Bytes(createForm26AsTextFixture()),
			),
		);
		await waitForExtraction(session);
		session.send(answerQuestion("bank-interest-savings-account-total", "100"));
		session.send(answerQuestion("bank-interest-deposits-total", "200"));

		session.send({
			kind: "select-source-documents",
			documents: [
				{
					displayName: "salary-certificate.pdf",
					readBytes: () => Promise.resolve(createForm16SalaryPdfFixture()),
				},
				{
					displayName: "annual-information-statement.json",
					readBytes: () =>
						Promise.resolve(utf8Bytes(createAisJsonBankInterestFixture())),
				},
				{
					displayName: "annual-information-statement.csv",
					readBytes: () =>
						Promise.resolve(
							utf8Bytes(
								createAisCsvBankInterestFixture({
									bankInterestRows: [
										{
											recordCategory: "SAVINGS_ACCOUNT",
											institutionName: "OpenITR Synthetic Bank",
											maskedAccountNumber: "XXXXXX0001",
											interestAmount: "9,000.00",
										},
										{
											recordCategory: "DEPOSITS",
											institutionName:
												"OpenITR Synthetic Co-operative Bank",
											maskedAccountNumber: "XXXXXX0002",
											interestAmount: "45,678.90",
										},
									],
								}),
							),
						),
				},
			],
		});
		await waitForExtractions(session, 4);
		const conflicted = session.getSnapshot();
		if (conflicted.kind !== "document-intake") {
			throw new Error("Expected the documents workflow");
		}
		const conflict = conflicted.factConflicts.find(
			(candidate) => candidate.factKey === "bank-interest.savings-account",
		);
		if (conflict === undefined) {
			throw new Error("Expected a savings-account conflict");
		}
		session.send({
			kind: "resolve-fact-conflict",
			groupId: conflict.groupId,
			choice: { kind: "attested", value: "8000" },
			reason: "The bank confirmed 8,000 by letter.",
			executionContext: { recordedAt: FIXED_ANSWER_TIME },
		});

		const snapshot = session.getSnapshot();
		expect(snapshot.kind).toBe("document-intake");
		if (snapshot.kind !== "document-intake") {
			throw new Error("Expected the documents workflow");
		}
		expect(snapshot.factAnswers).toHaveLength(2);
		expect(snapshot.questionnaire.questions).toEqual([]);
		expect(snapshot.estimateComputation?.kind).toBe("computed");
		if (snapshot.estimateComputation?.kind === "computed") {
			expect(snapshot.estimateComputation.summary.bankInterestTotal).toBe(
				"53678.9",
			);
			expect(
				snapshot.estimateComputation.attestedFactContributions,
			).toEqual([
				expect.objectContaining({
					origin: expect.objectContaining({ kind: "fact-resolution" }),
					factKey: "bank-interest.savings-account",
					value: "8000",
				}),
			]);
		}

		session.stop();
	});

	test("rejects invalid input without changing domain facts", async () => {
		const session = createEligibleSession();
		session.send(
			selectDocument(
				"tax-credit-statement.txt",
				utf8Bytes(createForm26AsTextFixture()),
			),
		);
		await waitForExtraction(session);
		const before = session.getSnapshot();

		expect(() =>
			session.send(answerQuestion("bank-interest-savings-account-total", "1,200")),
		).toThrow("invalid-value");
		expect(session.getSnapshot()).toEqual(before);
		session.stop();
	});
});
