import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	parseExactMoney,
} from "@openitr/model";
import type {
	CompletedScopeCheck,
	ExactMoney,
	FactKey,
	IsoTimestamp,
	QuestionId,
	RulePackId,
	ScopeRulePack,
} from "@openitr/model";

export type AcceptedQuestionFact = Readonly<{
	factKey: FactKey;
}>;

// One missing-fact question the pinned rule pack permits right now, with
// everything a view needs to render it: what to ask, why the rule requires
// the fact, and which result the answer can change. A question here carries
// no value: until the taxpayer answers, the fact stays unknown.
export type ApplicableFactQuestion = ScopeRulePack["questions"][number];

// The derived questionnaire result for one session state. React views render
// this; they never decide applicability themselves.
export type MissingFactQuestionnaire = Readonly<{
	rulePackId: RulePackId;
	rulePackRevision: string;
	questions: readonly ApplicableFactQuestion[];
}>;

// One accepted answer stored as a permitted user-attested fact. It keeps its
// attested origin (never an observation), the session answer time, and the
// revision of the pack that pinned the question wording.
export type AttestedAnswerFact = Readonly<{
	answerId: string;
	questionId: QuestionId;
	questionRevision: string;
	factKey: FactKey;
	value: ExactMoney | boolean;
	origin: Readonly<{ kind: "attested-answer"; rulePackId: RulePackId }>;
	answeredAt: IsoTimestamp;
}>;

// Why an answer attempt was refused. The orchestrator surfaces these as
// errors before any domain fact changes; the review UI prevents them.
export type FactAnswerRejection =
	| "question-not-defined"
	| "question-not-applicable"
	| "invalid-value"
	| "value-out-of-range";

export type FactAnswerAttempt =
	| Readonly<{ kind: "accepted"; answer: AttestedAnswerFact }>
	| Readonly<{
			kind: "rejected";
			rejection: FactAnswerRejection;
			questionId: QuestionId | string;
	  }>;

export type QuestionnaireInput = Readonly<{
	rulePack: ScopeRulePack;
	scopeCheck: CompletedScopeCheck;
	acceptedFacts: readonly AcceptedQuestionFact[];
	conflictedFacts: readonly AcceptedQuestionFact[];
	applicableResultIds: readonly string[];
	answers: readonly AttestedAnswerFact[];
}>;

export type FactAnswerAttemptInput = QuestionnaireInput & Readonly<{
	questionId: string;
	rawValue: string;
	answeredAt: IsoTimestamp;
}>;

const suppliedFactKeysOf = (
	acceptedFacts: readonly AcceptedQuestionFact[],
): Set<FactKey> => new Set(acceptedFacts.map((fact) => fact.factKey));

const answeredQuestionIdsOf = (
	answers: readonly AttestedAnswerFact[],
): Set<QuestionId> => new Set(answers.map((answer) => answer.questionId));

const scopePermitsQuestions = (
	rulePack: ScopeRulePack,
	scopeCheck: CompletedScopeCheck,
): boolean =>
	scopeCheck.answer.rulePackId === rulePack.identity.id &&
	scopeCheck.result.kind === "supported";

const isApplicable = (
	{
		question,
		suppliedFactKeys,
		answeredQuestionIds,
		conflictedFactKeys,
		applicableResultIds,
		answersByFact,
	}: Readonly<{
		question: ScopeRulePack["questions"][number];
		suppliedFactKeys: ReadonlySet<FactKey>;
		answeredQuestionIds: ReadonlySet<QuestionId>;
		conflictedFactKeys: ReadonlySet<FactKey>;
		applicableResultIds: ReadonlySet<string>;
		answersByFact: ReadonlyMap<FactKey, ExactMoney | boolean>;
	}>,
): boolean => {
	const visibility = question.visibility ?? { kind: "always" as const };
	let visible: boolean;
	switch (visibility.kind) {
		case "always":
			visible = true;
			break;
		case "fact-boolean-equals":
			visible = answersByFact.get(visibility.factKey) === visibility.value;
			break;
		case "fact-money-greater-than": {
			const value = answersByFact.get(visibility.factKey);
			visible =
				typeof value === "string" &&
				compareExactMoney(
					value,
					exactMoneyFromWholeRupees(visibility.wholeRupees),
				) > 0;
			break;
		}
	}
	return (
		visible &&
		!suppliedFactKeys.has(question.suppliesFact) &&
		!answeredQuestionIds.has(question.id) &&
		!conflictedFactKeys.has(question.suppliesFact) &&
		applicableResultIds.has(question.affectedResult.resultId)
	);
};

const answerIdOf = ({
	rulePackId,
	questionId,
	value,
	answeredAt,
}: Readonly<{
	rulePackId: RulePackId;
	questionId: QuestionId;
	value: ExactMoney | boolean;
	answeredAt: IsoTimestamp;
}>): string =>
	`fact-answer:${rulePackId}:${questionId}:${value}:${answeredAt}`;

// Derive the applicable missing-fact questions for one session state. Pure
// and deterministic: the catalog order of the pinned pack decides question
// order, and identical inputs always produce an identical result whatever
// order the facts or answers arrived in.
export const deriveMissingFactQuestions = (
	input: QuestionnaireInput,
): MissingFactQuestionnaire => {
	const suppliedFactKeys = suppliedFactKeysOf(input.acceptedFacts);
	const answeredQuestionIds = answeredQuestionIdsOf(input.answers);
	const conflictedFactKeys = suppliedFactKeysOf(input.conflictedFacts);
	const applicableResultIds = new Set(input.applicableResultIds);
	const answersByFact = new Map(
		input.answers.map((answer) => [answer.factKey, answer.value] as const),
	);
	const questions = scopePermitsQuestions(input.rulePack, input.scopeCheck)
		? input.rulePack.questions
		: [];
	return Object.freeze({
		rulePackId: input.rulePack.identity.id,
		rulePackRevision: input.rulePack.identity.revision,
		questions: Object.freeze(
			questions.filter((question) =>
				isApplicable({
					question,
					suppliedFactKeys,
					answeredQuestionIds,
					conflictedFactKeys,
					applicableResultIds,
					answersByFact,
				}),
			),
		),
	});
};

// Validate one answer attempt against the current derivation. A value is
// accepted only when the pinned pack defines the question, the question is
// still applicable here, and the raw value parses inside the schema bounds.
// A rejected attempt produces no fact, so invalid input never changes
// domain state.
export const evaluateFactAnswerAttempt = (
	input: FactAnswerAttemptInput,
): FactAnswerAttempt => {
	const question = input.rulePack.questions.find(
		(candidate) => candidate.id === input.questionId,
	);
	if (question === undefined) {
		return Object.freeze({
			kind: "rejected",
			rejection: "question-not-defined",
			questionId: input.questionId,
		});
	}
	if (
		!scopePermitsQuestions(input.rulePack, input.scopeCheck) ||
		!isApplicable({
			question,
			suppliedFactKeys: suppliedFactKeysOf(input.acceptedFacts),
			answeredQuestionIds: answeredQuestionIdsOf(input.answers),
			conflictedFactKeys: suppliedFactKeysOf(input.conflictedFacts),
			applicableResultIds: new Set(input.applicableResultIds),
			answersByFact: new Map(
				input.answers.map((answer) => [answer.factKey, answer.value] as const),
			),
		})
	) {
		return Object.freeze({
			kind: "rejected",
			rejection: "question-not-applicable",
			questionId: question.id,
		});
	}

	let value: ExactMoney | boolean;
	switch (question.answerSchema.kind) {
		case "boolean":
			if (input.rawValue === "yes") value = true;
			else if (input.rawValue === "no") value = false;
			else {
				return Object.freeze({
					kind: "rejected",
					rejection: "invalid-value",
					questionId: question.id,
				});
			}
			break;
		case "exact-money": {
			try {
				value = parseExactMoney(input.rawValue.trim());
			} catch {
				return Object.freeze({
					kind: "rejected",
					rejection: "invalid-value",
					questionId: question.id,
				});
			}
			const { minimumWholeRupees, maximumWholeRupees } = question.answerSchema;
			if (
				compareExactMoney(value, exactMoneyFromWholeRupees(minimumWholeRupees)) < 0 ||
				(maximumWholeRupees !== null &&
					compareExactMoney(value, exactMoneyFromWholeRupees(maximumWholeRupees)) > 0)
			) {
				return Object.freeze({
					kind: "rejected",
					rejection: "value-out-of-range",
					questionId: question.id,
				});
			}
			break;
		}
	}

	return Object.freeze({
		kind: "accepted",
		answer: Object.freeze({
			answerId: answerIdOf({
				rulePackId: input.rulePack.identity.id,
				questionId: question.id,
				value,
				answeredAt: input.answeredAt,
			}),
			questionId: question.id,
			questionRevision: input.rulePack.identity.revision,
			factKey: question.suppliesFact,
			value,
			origin: Object.freeze({
				kind: "attested-answer",
				rulePackId: input.rulePack.identity.id,
			}),
			answeredAt: input.answeredAt,
		}),
	});
};

export const removeFactAnswerAndDependents = ({
	rulePack,
	answers,
	answerId,
}: Readonly<{
	rulePack: ScopeRulePack;
	answers: readonly AttestedAnswerFact[];
	answerId: string;
}>): readonly AttestedAnswerFact[] => {
	const removedFactKeys = new Set<FactKey>();
	const target = answers.find((answer) => answer.answerId === answerId);
	if (target === undefined) return answers;
	removedFactKeys.add(target.factKey);

	let changed = true;
	while (changed) {
		changed = false;
		for (const answer of answers) {
			const question = rulePack.questions.find(
				(candidate) => candidate.id === answer.questionId,
			);
			const dependency =
				question?.visibility?.kind === "fact-boolean-equals" ||
				question?.visibility?.kind === "fact-money-greater-than"
					? question.visibility.factKey
					: undefined;
			if (
				dependency !== undefined &&
				removedFactKeys.has(dependency) &&
				!removedFactKeys.has(answer.factKey)
			) {
				removedFactKeys.add(answer.factKey);
				changed = true;
			}
		}
	}
	return Object.freeze(
		answers.filter((answer) => !removedFactKeys.has(answer.factKey)),
	);
};
