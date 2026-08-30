import {
	parseAssessmentYear,
	parseFactKey,
	parseFinancialYear,
	parseIsoTimestamp,
	parseIssueCode,
	parseQuestionId,
	parseRuleId,
	parseRulePackId,
	parseSha256Digest,
	parseSourceId,
	parseTaxFormId,
} from "@openitr/model";
import type {
	CompletedScopeCheck,
	FactQuestion,
	RulePackIdentity,
	ScopeRulePack,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	deriveMissingFactQuestions,
	evaluateFactAnswerAttempt,
} from "./index";
import type { AcceptedQuestionFact } from "./index";

// ---------------------------------------------------------------------------
// Fixtures: a synthetic rule pack carrying two permitted missing-fact
// questions, plus helpers to build accepted facts and prior answers.
// ---------------------------------------------------------------------------

const SYNTHETIC_IDENTITY: RulePackIdentity = {
	id: parseRulePackId("test-module.2099-01-01"),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	revision: "2099-01-01",
	officialSourceRevisionIds: [],
	sourceManifestSha256: parseSha256Digest("aa".repeat(32)),
	compiledPackSha256: parseSha256Digest("bb".repeat(32)),
	minimumEngineContractVersion: "1",
};

const savingsQuestion: FactQuestion = {
	id: parseQuestionId("bank-interest-savings-account-total"),
	prompt: "How much savings-account interest did you receive in FY 2025-26?",
	helpText: "Check your bank statements or the bank's annual summary.",
	requiresRuleId: parseRuleId("ITR1-INTEREST-INCOME-SECTION-56"),
	suppliesFact: parseFactKey("bank-interest.savings-account"),
	whyRequired:
		"Section 56 charges savings-account interest as income from other sources, and no selected source document has supplied this total yet.",
	affectedResult: {
		resultId: "refund-or-payable-estimate",
		label: "Estimated refund or amount payable",
	},
	answerSchema: {
		kind: "exact-money",
		minimumWholeRupees: 0,
		maximumWholeRupees: 10000000,
	},
	sourceReference: {
		sourceId: parseSourceId("income-tax-act-1961"),
		location: "Section 56(2)(i)",
	},
};

const depositsQuestion: FactQuestion = {
	...savingsQuestion,
	id: parseQuestionId("bank-interest-deposits-total"),
	prompt: "How much interest on deposits did you receive in FY 2025-26?",
	suppliesFact: parseFactKey("bank-interest.deposits"),
};

const syntheticRulePack = (options?: {
	questions?: readonly FactQuestion[];
	revision?: string;
}): ScopeRulePack => ({
	identity:
		options?.revision === undefined
			? SYNTHETIC_IDENTITY
			: { ...SYNTHETIC_IDENTITY, revision: options.revision },
	officialSources: [],
	question: {
		id: parseQuestionId("synthetic-resident-individual"),
		prompt: "Synthetic scope question?",
		helpText: "Synthetic help text.",
		answers: [
			{ value: "yes", label: "Yes" },
			{ value: "no", label: "No" },
		],
		suppliesFact: parseFactKey("taxpayer.residential-status"),
		requiresRuleId: parseRuleId("TEST-SYNTHETIC-RULE"),
		answerSchema: { kind: "choice", values: ["yes", "no"] },
		visibility: { kind: "always" },
		blockingEffect: {
			kind: "block-on-answer",
			answer: "no",
			issueCode: parseIssueCode("RULE_TEST_SYNTHETIC_UNSUPPORTED"),
		},
		sourceReference: {
			sourceId: parseSourceId("synthetic-test-source"),
			location: "Section 1",
		},
	},
	questions: Object.freeze(options?.questions ?? [savingsQuestion, depositsQuestion]),
	taxConstants: undefined,
	evaluate: () => {
		throw new Error("The scope check is not exercised by these tests");
	},
});

const completedScopeCheck = (
	rulePack: ScopeRulePack,
	resultKind: "supported" | "unsupported" = "supported",
): CompletedScopeCheck => ({
	question: {
		id: rulePack.question.id,
		prompt: rulePack.question.prompt,
	},
	answer: {
		questionId: rulePack.question.id,
		value: resultKind === "supported" ? "yes" : "no",
		label: resultKind === "supported" ? "Yes" : "No",
		answeredAt: FIXED_ANSWERED_AT,
		rulePackId: rulePack.identity.id,
	},
	result:
		resultKind === "supported"
			? {
					kind: "supported",
					title: "Synthetic supported result",
					explanation: "Synthetic supported explanation.",
					rule: {
						id: parseRuleId("TEST-SYNTHETIC-RULE"),
						citation: "Synthetic citation.",
						sourceUrl: "https://fixture.openitr.test/rule",
					},
				}
			: {
					kind: "unsupported",
					title: "Synthetic unsupported result",
					explanation: "Synthetic unsupported explanation.",
					rule: {
						id: parseRuleId("TEST-SYNTHETIC-RULE"),
						citation: "Synthetic citation.",
						sourceUrl: "https://fixture.openitr.test/rule",
					},
					issue: {
						code: parseIssueCode("RULE_TEST_SYNTHETIC_UNSUPPORTED"),
						severity: "blocking",
						affectedFacts: [parseFactKey("taxpayer.residential-status")],
						sourceReferences: [],
						recoveryAction: "Stop the synthetic analysis.",
					},
				},
});

const observedFact = (
	factKey: string,
): AcceptedQuestionFact => ({
	factKey: parseFactKey(factKey),
});

const FIXED_ANSWERED_AT = parseIsoTimestamp("2099-01-01T00:05:00.000Z");

const derivationInput = (overrides?: {
	rulePack?: ScopeRulePack;
	scopeCheck?: CompletedScopeCheck;
	acceptedFacts?: readonly AcceptedQuestionFact[];
	conflictedFacts?: readonly AcceptedQuestionFact[];
	applicableResultIds?: readonly string[];
	answers?: Parameters<typeof deriveMissingFactQuestions>[0]["answers"];
}) => {
	const rulePack = overrides?.rulePack ?? syntheticRulePack();
	return {
		rulePack,
		scopeCheck: overrides?.scopeCheck ?? completedScopeCheck(rulePack),
		acceptedFacts: Object.freeze(overrides?.acceptedFacts ?? []),
		conflictedFacts: Object.freeze(overrides?.conflictedFacts ?? []),
		applicableResultIds: Object.freeze(
			overrides?.applicableResultIds ?? ["refund-or-payable-estimate"],
		),
		answers: Object.freeze(overrides?.answers ?? []),
	};
};

describe("deriveMissingFactQuestions", () => {
	test("asks a permitted question while no evidence or answer supplies its fact, naming why and what it can affect", () => {
		const questionnaire = deriveMissingFactQuestions(
			derivationInput({ rulePack: syntheticRulePack({ questions: [savingsQuestion] }) }),
		);

		expect(questionnaire.rulePackId).toBe("test-module.2099-01-01");
		expect(questionnaire.questions).toHaveLength(1);
		const asked = questionnaire.questions[0];
		expect(asked?.id).toBe("bank-interest-savings-account-total");
		expect(asked?.prompt).toContain("savings-account interest");
		expect(asked?.requiresRuleId).toBe("ITR1-INTEREST-INCOME-SECTION-56");
		expect(asked?.whyRequired).toContain("Section 56");
		expect(asked?.affectedResult).toEqual({
			resultId: "refund-or-payable-estimate",
			label: "Estimated refund or amount payable",
		});
		expect(asked?.answerSchema).toEqual({
			kind: "exact-money",
			minimumWholeRupees: 0,
			maximumWholeRupees: 10000000,
		});
	});

	test("asks no missing-fact questions when the pinned scope check is unsupported", () => {
		const rulePack = syntheticRulePack();
		const questionnaire = deriveMissingFactQuestions(
			derivationInput({
				rulePack,
				scopeCheck: completedScopeCheck(rulePack, "unsupported"),
			}),
		);

		expect(questionnaire.questions).toEqual([]);
	});

	test("drops only the question whose fact accepted evidence already supplies", () => {
		const questionnaire = deriveMissingFactQuestions(
			derivationInput({
				acceptedFacts: [observedFact("bank-interest.savings-account")],
			}),
		);

		expect(questionnaire.questions.map((question) => question.id)).toEqual([
			"bank-interest-deposits-total",
		]);
	});

	test("asks no question for a fact whose accepted evidence is conflicted", () => {
		const questionnaire = deriveMissingFactQuestions(
			derivationInput({
				conflictedFacts: [observedFact("bank-interest.savings-account")],
			}),
		);

		expect(questionnaire.questions.map((question) => question.id)).toEqual([
			"bank-interest-deposits-total",
		]);
	});

	test("asks only questions that can affect an active result", () => {
		const questionnaire = deriveMissingFactQuestions(
			derivationInput({ applicableResultIds: [] }),
		);

		expect(questionnaire.questions).toEqual([]);
	});

	test("keeps every question dropped once each fact is supplied by evidence", () => {
		const questionnaire = deriveMissingFactQuestions(
			derivationInput({
				acceptedFacts: [
					observedFact("bank-interest.savings-account"),
					observedFact("bank-interest.deposits"),
				],
			}),
		);

		expect(questionnaire.questions).toEqual([]);
	});

	test("stops asking a question this session has already answered", () => {
		const priorAnswer = evaluateFactAnswerAttempt({
			...derivationInput(),
			questionId: "bank-interest-savings-account-total",
			rawValue: "4800.50",
			answeredAt: FIXED_ANSWERED_AT,
		});
		if (priorAnswer.kind !== "accepted") {
			throw new Error("Fixture setup produced an unexpected rejection");
		}

		const questionnaire = deriveMissingFactQuestions(
			derivationInput({ answers: [priorAnswer.answer] }),
		);

		expect(questionnaire.questions.map((question) => question.id)).toEqual([
			"bank-interest-deposits-total",
		]);
	});

	test("never invents values for unanswered questions", () => {
		const questionnaire = deriveMissingFactQuestions(derivationInput());

		for (const question of questionnaire.questions) {
			expect(Object.values(question)).not.toContain("0");
			expect(JSON.stringify(question)).not.toMatch(/"(value|answer)"/);
		}
	});

	test("produces identical output for identical inputs in any accepted-fact order", () => {
		const facts = [
			observedFact("bank-interest.deposits"),
			observedFact("unrelated.salary-gross"),
		];
		const first = deriveMissingFactQuestions(
			derivationInput({ acceptedFacts: facts }),
		);
		const second = deriveMissingFactQuestions(
			derivationInput({ acceptedFacts: [...facts].reverse() }),
		);

		expect(first).toEqual(second);
	});

	test("presents questions in the pinned catalog order regardless of input order", () => {
		const questionnaire = deriveMissingFactQuestions(
			derivationInput({
				rulePack: syntheticRulePack({
					questions: [depositsQuestion, savingsQuestion],
				}),
			}),
		);

		expect(questionnaire.questions.map((question) => question.id)).toEqual([
			"bank-interest-deposits-total",
			"bank-interest-savings-account-total",
		]);
	});
});

describe("evaluateFactAnswerAttempt", () => {
	test("accepts an in-range answer as a user-attested fact with time and question revision", () => {
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput(),
			questionId: "bank-interest-savings-account-total",
			rawValue: "4850.25",
			answeredAt: FIXED_ANSWERED_AT,
		});

		if (attempt.kind !== "accepted") {
			throw new Error(`Expected acceptance, got: ${attempt.kind}`);
		}
		expect(attempt.answer).toEqual({
			answerId:
				"fact-answer:test-module.2099-01-01:bank-interest-savings-account-total:4850.25:2099-01-01T00:05:00.000Z",
			questionId: "bank-interest-savings-account-total",
			questionRevision: "2099-01-01",
			factKey: "bank-interest.savings-account",
			value: "4850.25",
			origin: { kind: "attested-answer", rulePackId: "test-module.2099-01-01" },
			answeredAt: FIXED_ANSWERED_AT,
		});
	});

	test("records the revision of the pack the session pinned, not a latest revision", () => {
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput({
				rulePack: syntheticRulePack({ questions: [savingsQuestion], revision: "2099-02-02" }),
			}),
			questionId: "bank-interest-savings-account-total",
			rawValue: "10",
			answeredAt: FIXED_ANSWERED_AT,
		});

		if (attempt.kind !== "accepted") {
			throw new Error(`Expected acceptance, got: ${attempt.kind}`);
		}
		expect(attempt.answer.questionRevision).toBe("2099-02-02");
	});

	test("rejects a value that is not a canonical non-negative amount without producing a fact", () => {
		for (const rawValue of ["", "abc", "-5", "1,200", "12.5.5", "NaN"]) {
			const attempt = evaluateFactAnswerAttempt({
				...derivationInput(),
				questionId: "bank-interest-savings-account-total",
				rawValue,
				answeredAt: FIXED_ANSWERED_AT,
			});

			expect(attempt).toEqual({
				kind: "rejected",
				rejection: "invalid-value",
				questionId: "bank-interest-savings-account-total",
			});
		}
	});

	test("rejects an out-of-range value above the schema maximum", () => {
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput(),
			questionId: "bank-interest-savings-account-total",
			rawValue: "10000000.01",
			answeredAt: FIXED_ANSWERED_AT,
		});

		expect(attempt).toMatchObject({ kind: "rejected", rejection: "value-out-of-range" });
	});

	test("rejects an out-of-range value below the schema minimum", () => {
		const pack = syntheticRulePack({
			questions: [
				{
					...savingsQuestion,
					answerSchema: {
						kind: "exact-money",
						minimumWholeRupees: 1,
						maximumWholeRupees: 10000000,
					},
				},
			],
		});
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput({ rulePack: pack }),
			questionId: "bank-interest-savings-account-total",
			rawValue: "0",
			answeredAt: FIXED_ANSWERED_AT,
		});

		expect(attempt).toMatchObject({ kind: "rejected", rejection: "value-out-of-range" });
	});

	test("accepts an exact amount when the schema has no maximum", () => {
		const pack = syntheticRulePack({
			questions: [
				{
					...savingsQuestion,
					answerSchema: {
						kind: "exact-money",
						minimumWholeRupees: 0,
						maximumWholeRupees: null,
					},
				},
			],
		});
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput({ rulePack: pack }),
			questionId: "bank-interest-savings-account-total",
			rawValue: "10000000.01",
			answeredAt: FIXED_ANSWERED_AT,
		});

		expect(attempt).toMatchObject({ kind: "accepted" });
	});

	test("refuses an unknown question id", () => {
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput(),
			questionId: "no-such-question",
			rawValue: "100",
			answeredAt: FIXED_ANSWERED_AT,
		});

		expect(attempt).toMatchObject({ kind: "rejected", rejection: "question-not-defined" });
	});

	test("refuses a question whose fact accepted evidence already supplies", () => {
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput({
				acceptedFacts: [observedFact("bank-interest.savings-account")],
			}),
			questionId: "bank-interest-savings-account-total",
			rawValue: "100",
			answeredAt: FIXED_ANSWERED_AT,
		});

		expect(attempt).toMatchObject({ kind: "rejected", rejection: "question-not-applicable" });
	});

	test("refuses a question this session has already answered", () => {
		const first = evaluateFactAnswerAttempt({
			...derivationInput(),
			questionId: "bank-interest-savings-account-total",
			rawValue: "5000",
			answeredAt: FIXED_ANSWERED_AT,
		});
		if (first.kind !== "accepted") {
			throw new Error("Fixture setup produced an unexpected rejection");
		}
		const second = evaluateFactAnswerAttempt({
			...derivationInput({ answers: [first.answer] }),
			questionId: "bank-interest-savings-account-total",
			rawValue: "6000",
			answeredAt: parseIsoTimestamp("2099-01-01T00:06:00.000Z"),
		});

		expect(second).toMatchObject({ kind: "rejected", rejection: "question-not-applicable" });
	});

	test("yields the same answer identity for the same inputs", () => {
		const run = () =>
			evaluateFactAnswerAttempt({
				...derivationInput(),
				questionId: "bank-interest-savings-account-total",
				rawValue: "4850.25",
				answeredAt: FIXED_ANSWERED_AT,
			});

		expect(run()).toEqual(run());
	});

	test("canonicalizes an equivalent value spelling to one identity", () => {
		const attempt = evaluateFactAnswerAttempt({
			...derivationInput(),
			questionId: "bank-interest-savings-account-total",
			rawValue: "4850.250",
			answeredAt: FIXED_ANSWERED_AT,
		});

		if (attempt.kind !== "accepted") {
			throw new Error(`Expected acceptance, got: ${attempt.kind}`);
		}
		expect(attempt.answer.value).toBe("4850.25");
	});
});
