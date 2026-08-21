import { parseIsoTimestamp } from "@openitr/model";
import type {
	CompletedScopeCheck,
	EligibilityAnswerValue,
	IsoTimestamp,
	ScopeCheckSessionSnapshot,
	ScopeRulePack,
} from "@openitr/model";
import { createActor, setup } from "xstate";

export type SessionCommand = Readonly<{
	kind: "answer-eligibility-question";
	questionId: string;
	answer: EligibilityAnswerValue;
}>;

export type SessionOrchestrator = Readonly<{
	getSnapshot(): ScopeCheckSessionSnapshot;
	send(command: SessionCommand): void;
	stop(): void;
	subscribe(listener: () => void): () => void;
}>;

type SessionContext = Readonly<{
	rulePack: ScopeRulePack;
	answerTime: IsoTimestamp;
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

const createSessionMachine = ({
	rulePack,
	answerTime,
}: Readonly<{ rulePack: ScopeRulePack; answerTime: IsoTimestamp }>) => {
	const sessionSetup = setup<SessionContext, SessionEvent>({});
	return sessionSetup.createMachine({
		context: {
			rulePack,
			answerTime,
			scopeCheck: { kind: "awaiting-answer" },
		},
		initial: "awaiting-answer",
		states: {
			"awaiting-answer": {
				on: {
					"answer-eligibility-question": {
						actions: sessionSetup.assign({
							scopeCheck: ({ context, event }) => ({
								kind: "complete",
								completion: context.rulePack.evaluate({
									answer: event.answer,
									answeredAt: context.answerTime,
								}),
							}),
						}),
						target: "complete",
					},
				},
			},
			complete: {
				type: "final",
			},
		},
	});
};

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
	rulePack,
	executionContext,
}: Readonly<{
	rulePack: ScopeRulePack;
	executionContext: Readonly<{ answerTime: string }>;
}>): SessionOrchestrator => {
	const answerTime = parseIsoTimestamp(executionContext.answerTime);
	const actor = createActor(createSessionMachine({ rulePack, answerTime }));
	actor.start();

	let actorSnapshot = actor.getSnapshot();
	let sessionSnapshot = toSessionSnapshot(actorSnapshot.context);
	const listeners = new Set<() => void>();
	const actorSubscription = actor.subscribe((nextActorSnapshot) => {
		if (nextActorSnapshot === actorSnapshot) {
			return;
		}
		actorSnapshot = nextActorSnapshot;
		sessionSnapshot = toSessionSnapshot(nextActorSnapshot.context);
		for (const listener of listeners) {
			listener();
		}
	});
	const getSnapshot = () => sessionSnapshot;
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	return {
		getSnapshot,
		send: (command) => {
			const snapshot = getSnapshot();
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
		stop: () => {
			actorSubscription.unsubscribe();
			actor.stop();
			listeners.clear();
		},
		subscribe,
	};
};
