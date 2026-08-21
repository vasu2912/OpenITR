import { getItr1Ay202627RulePack } from "@openitr/itr1-ay2026-27";
import type {
	CompletedScopeCheck,
	EligibilityAnswerValue,
	ScopeCheckSessionSnapshot,
	ScopeRulePack,
} from "@openitr/model";
import { assign, createActor, setup } from "xstate";

export type SessionCommand = Readonly<{
	kind: "answer-eligibility-question";
	questionId: string;
	answer: EligibilityAnswerValue;
}>;

export type SessionOrchestrator = Readonly<{
	getSnapshot(): ScopeCheckSessionSnapshot;
	send(command: SessionCommand): void;
	stop(): void;
}>;

type SessionContext = Readonly<{
	rulePack: ScopeRulePack;
	scopeCheck:
		| Readonly<{ kind: "awaiting-answer" }>
		| Readonly<{
				kind: "complete";
				completion: CompletedScopeCheck;
		  }>;
}>;

type SessionEvent = Readonly<{
	type: "answer-eligibility-question";
	answer: EligibilityAnswerValue;
}>;

const createSessionMachine = (rulePack: ScopeRulePack) =>
	setup({
		types: {
			context: {} as SessionContext,
			events: {} as SessionEvent,
		},
		actions: {
			recordAnswer: assign({
				scopeCheck: ({ context, event }) => ({
					kind: "complete",
					completion: context.rulePack.evaluate(event.answer),
				}),
			}),
		},
	}).createMachine({
		context: {
			rulePack,
			scopeCheck: { kind: "awaiting-answer" },
		},
		initial: "awaiting-answer",
		states: {
			"awaiting-answer": {
				on: {
					"answer-eligibility-question": {
						actions: "recordAnswer",
						target: "complete",
					},
				},
			},
			complete: {
				type: "final",
			},
		},
	});

const toSessionSnapshot = (context: SessionContext): ScopeCheckSessionSnapshot => {
	switch (context.scopeCheck.kind) {
		case "awaiting-answer":
			return {
				kind: "awaiting-scope-answer",
				workflow: "eligibility",
				rulePackId: context.rulePack.identity.id,
				question: context.rulePack.question,
			};
		case "complete":
			return {
				kind: "scope-check-complete",
				workflow: "eligibility",
				rulePackId: context.rulePack.identity.id,
				...context.scopeCheck.completion,
			};
		default: {
			const _exhaustive: never = context.scopeCheck;
			return _exhaustive;
		}
	}
};

export const createSessionOrchestrator = ({
	rulePackId,
}: Readonly<{ rulePackId: string }>): SessionOrchestrator => {
	const rulePack = getItr1Ay202627RulePack(rulePackId);
	if (rulePack === undefined) {
		throw new Error(`Unknown rule pack: ${rulePackId}`);
	}

	const actor = createActor(createSessionMachine(rulePack));
	actor.start();

	return {
		getSnapshot: () => toSessionSnapshot(actor.getSnapshot().context),
		send: (command) => {
			const snapshot = toSessionSnapshot(actor.getSnapshot().context);
			if (snapshot.kind !== "awaiting-scope-answer") {
				return;
			}
			if (snapshot.question.id !== command.questionId) {
				throw new Error(`Unknown eligibility question: ${command.questionId}`);
			}

			actor.send({
				type: "answer-eligibility-question",
				answer: command.answer,
			});
		},
		stop: () => actor.stop(),
	};
};
