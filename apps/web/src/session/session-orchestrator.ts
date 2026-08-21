import { parseIsoTimestamp } from "@openitr/model";
import type {
	CompletedScopeCheck,
	EligibilityAnswerValue,
	IsoTimestamp,
	QuestionId,
	ScopeCheckSessionSnapshot,
	ScopeRulePack,
} from "@openitr/model";
import { createActor, setup } from "xstate";
import type { Subscription } from "xstate";

export type SessionCommand =
	| Readonly<{
			kind: "answer-eligibility-question";
			questionId: QuestionId;
			answer: EligibilityAnswerValue;
			executionContext: Readonly<{ answerTime: string }>;
	  }>
	| Readonly<{ kind: "reset" }>;

export type SessionOrchestrator = Readonly<{
	getSnapshot(): ScopeCheckSessionSnapshot;
	send(command: SessionCommand): void;
	stop(): void;
	subscribe(listener: () => void): () => void;
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
	answeredAt: IsoTimestamp;
}>;

const createSessionMachine = ({
	rulePack,
}: Readonly<{ rulePack: ScopeRulePack }>) => {
	const sessionSetup = setup<SessionContext, SessionEvent>({});
	return sessionSetup.createMachine({
		context: {
			rulePack,
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
									answeredAt: event.answeredAt,
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

type SessionMachine = ReturnType<typeof createSessionMachine>;
type SessionActor = ReturnType<typeof createActor<SessionMachine>>;
type SessionActorSnapshot = ReturnType<SessionActor["getSnapshot"]>;

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
}: Readonly<{
	rulePack: ScopeRulePack;
}>): SessionOrchestrator => {
	const listeners = new Set<() => void>();
	let actor: SessionActor;
	let actorSubscription: Subscription;
	let actorSnapshot: SessionActorSnapshot;
	let sessionSnapshot: ScopeCheckSessionSnapshot;
	let isStopped = false;

	const startSessionActor = () => {
		const nextActor: SessionActor = createActor(
			createSessionMachine({ rulePack }),
		);
		const subscription = nextActor.subscribe((nextActorSnapshot) => {
			if (nextActorSnapshot === actorSnapshot) {
				return;
			}
			actorSnapshot = nextActorSnapshot;
			sessionSnapshot = toSessionSnapshot(nextActorSnapshot.context);
			for (const listener of listeners) {
				listener();
			}
		});
		nextActor.start();
		actor = nextActor;
		actorSubscription = subscription;
		actorSnapshot = nextActor.getSnapshot();
		sessionSnapshot = toSessionSnapshot(actorSnapshot.context);
	};

	startSessionActor();

	const getSnapshot = () => sessionSnapshot;
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	return {
		getSnapshot,
		send: (command) => {
			if (isStopped) {
				return;
			}
			if (command.kind === "reset") {
				actorSubscription.unsubscribe();
				actor.stop();
				startSessionActor();
				return;
			}

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
				answeredAt: parseIsoTimestamp(command.executionContext.answerTime),
			});
		},
		stop: () => {
			isStopped = true;
			actorSubscription.unsubscribe();
			actor.stop();
			listeners.clear();
		},
		subscribe,
	};
};
