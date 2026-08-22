import {
	computeSourceDocumentIdentity,
	createInspectionFailedOutcome,
	parseIsoTimestamp,
} from "@openitr/model";
import type {
	CandidateDocument,
	CompletedScopeCheck,
	DocumentInspectionOutcome,
	EligibilityAnswerValue,
	InspectableSourceDocument,
	IsoTimestamp,
	QuestionId,
	ScopeCheckSessionSnapshot,
	ScopeRulePack,
	SelectedSourceFile,
	Sha256Digest,
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
	| Readonly<{
			kind: "select-source-documents";
			documents: readonly SelectedSourceFile[];
	  }>
	| Readonly<{ kind: "remove-source-document"; documentId: Sha256Digest }>
	| Readonly<{ kind: "cancel-document-inspection"; documentId: Sha256Digest }>
	| Readonly<{ kind: "reset" }>;

export type SourceDocumentInspectionFacility = Readonly<{
	inspect(
		input: InspectableSourceDocument,
		signal: AbortSignal,
	): Promise<DocumentInspectionOutcome>;
}>;

export type DocumentIntakeSnapshot = Readonly<{
	kind: "document-intake";
	workflow: "documents";
	rulePackId: ScopeRulePack["identity"]["id"];
	completedScopeCheck: CompletedScopeCheck;
	documents: readonly CandidateDocument[];
}>;

export type SessionOrchestratorSnapshot =
	| ScopeCheckSessionSnapshot
	| DocumentIntakeSnapshot;

export type SessionOrchestrator = Readonly<{
	getSnapshot(): SessionOrchestratorSnapshot;
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
	documentsStageEntered: boolean;
	documents: readonly CandidateDocument[];
}>;

type SessionEvent =
	| Readonly<{
			type: "answer-eligibility-question";
			answer: EligibilityAnswerValue;
			answeredAt: IsoTimestamp;
	  }>
	| Readonly<{
			type: "add-document-candidate";
			candidateKey: number;
			documentId: Sha256Digest;
			displayName: string;
	  }>
	| Readonly<{
			type: "document-inspection-started";
			candidateKey: number;
	  }>
	| Readonly<{
			type: "document-inspection-settled";
			candidateKey: number;
			outcome: DocumentInspectionOutcome;
	  }>
	| Readonly<{
			type: "document-inspection-cancelled";
			candidateKey: number;
	  }>
	| Readonly<{ type: "document-removed"; candidateKey: number }>;

const replaceCandidate = (
	documents: readonly CandidateDocument[],
	candidateKey: number,
	update: (candidate: CandidateDocument) => CandidateDocument,
): readonly CandidateDocument[] =>
	documents.map((candidate) =>
		candidate.candidateKey === candidateKey
			? update(candidate)
			: candidate,
	);

const withStatus = (
	candidate: CandidateDocument,
	status: "queued" | "inspecting" | "cancelled" | "removed",
): CandidateDocument => ({
	candidateKey: candidate.candidateKey,
	documentId: candidate.documentId,
	displayName: candidate.displayName,
	status,
});

const createSessionMachine = ({
	rulePack,
}: Readonly<{ rulePack: ScopeRulePack }>) => {
	const sessionSetup = setup({
		types: {
			context: {} as SessionContext,
			events: {} as SessionEvent,
		},
	});
	return sessionSetup.createMachine({
		context: {
			rulePack,
			scopeCheck: { kind: "awaiting-answer" },
			documentsStageEntered: false,
			documents: [],
		},
		initial: "awaiting-answer",
		states: {
			"awaiting-answer": {
				on: {
					"answer-eligibility-question": {
						actions: sessionSetup.assign({
							scopeCheck: ({ context, event }) => {
								if (event.type !== "answer-eligibility-question") {
									return context.scopeCheck;
								}
								return {
									kind: "complete",
									completion: context.rulePack.evaluate({
										answer: event.answer,
										answeredAt: event.answeredAt,
									}),
								};
							},
						}),
						target: "complete",
					},
				},
			},
			complete: {
				on: {
					"add-document-candidate": {
						actions: sessionSetup.assign({
							documentsStageEntered: ({ context }) =>
								context.scopeCheck.kind === "complete",
							documents: ({ context, event }) => {
								if (
									context.scopeCheck.kind !== "complete" ||
									event.type !== "add-document-candidate"
								) {
									return context.documents;
								}
								return [
									...context.documents,
									{
										candidateKey: event.candidateKey,
										documentId: event.documentId,
										displayName: event.displayName,
										status: "queued",
									} satisfies CandidateDocument,
								];
							},
						}),
					},
					"document-inspection-started": {
						guard: ({ context, event }) =>
							event.type === "document-inspection-started" &&
							context.documents.some(
								(candidate) =>
									candidate.candidateKey === event.candidateKey &&
									candidate.status === "queued",
							),
						actions: sessionSetup.assign({
							documents: ({ context, event }) => {
								if (event.type !== "document-inspection-started") {
									return context.documents;
								}
								return replaceCandidate(
									context.documents,
									event.candidateKey,
									(candidate) => withStatus(candidate, "inspecting"),
								);
							},
						}),
					},
					"document-inspection-settled": {
						guard: ({ context, event }) =>
							event.type === "document-inspection-settled" &&
							context.documents.some(
								(candidate) =>
									candidate.candidateKey === event.candidateKey &&
									candidate.status === "inspecting",
							),
						actions: sessionSetup.assign({
							documents: ({ context, event }) => {
								if (event.type !== "document-inspection-settled") {
									return context.documents;
								}
								return replaceCandidate(
									context.documents,
									event.candidateKey,
									(candidate) => {
										if (event.outcome.kind === "identified") {
											return {
												candidateKey: candidate.candidateKey,
												documentId: candidate.documentId,
												displayName: candidate.displayName,
												status: "identified",
												identification: {
													documentKind:
														event.outcome.document.documentKind,
													templateRevision:
														event.outcome.document.templateRevision,
													adapterId:
														event.outcome.adapter.adapterId,
													adapterVersion:
														event.outcome.adapter.adapterVersion,
												},
											} satisfies CandidateDocument;
										}
										return {
											candidateKey: candidate.candidateKey,
											documentId: candidate.documentId,
											displayName: candidate.displayName,
											status: "rejected",
											rejection: event.outcome.rejection,
											issue: event.outcome.issue,
										} satisfies CandidateDocument;
									},
								);
							},
						}),
					},
					"document-inspection-cancelled": {
						guard: ({ context, event }) =>
							event.type === "document-inspection-cancelled" &&
							context.documents.some(
								(candidate) =>
									candidate.candidateKey === event.candidateKey &&
									(candidate.status === "inspecting" ||
										candidate.status === "queued"),
							),
						actions: sessionSetup.assign({
							documents: ({ context, event }) => {
								if (event.type !== "document-inspection-cancelled") {
									return context.documents;
								}
								return replaceCandidate(
									context.documents,
									event.candidateKey,
									(candidate) => withStatus(candidate, "cancelled"),
								);
							},
						}),
					},
					"document-removed": {
						guard: ({ context, event }) =>
							event.type === "document-removed" &&
							context.documents.some(
								(candidate) =>
									candidate.candidateKey === event.candidateKey &&
									candidate.status !== "removed",
							),
						actions: sessionSetup.assign({
							documents: ({ context, event }) => {
								if (event.type !== "document-removed") {
									return context.documents;
								}
								return replaceCandidate(
									context.documents,
									event.candidateKey,
									(candidate) => withStatus(candidate, "removed"),
								);
							},
						}),
					},
				},
			},
		},
	});
};

type SessionMachine = ReturnType<typeof createSessionMachine>;
type SessionActor = ReturnType<typeof createActor<SessionMachine>>;
type SessionActorSnapshot = ReturnType<SessionActor["getSnapshot"]>;

const toSessionSnapshot = (
	context: SessionContext,
): SessionOrchestratorSnapshot => {
	switch (context.scopeCheck.kind) {
		case "awaiting-answer":
			return {
				kind: "awaiting-scope-answer",
				workflow: "eligibility",
				rulePackId: context.rulePack.identity.id,
				question: context.rulePack.question,
			};
		case "complete":
			if (!context.documentsStageEntered) {
				return {
					kind: "scope-check-complete",
					workflow: "eligibility",
					rulePackId: context.rulePack.identity.id,
					...context.scopeCheck.completion,
				};
			}
			return {
				kind: "document-intake",
				workflow: "documents",
				rulePackId: context.rulePack.identity.id,
				completedScopeCheck: context.scopeCheck.completion,
				documents: context.documents,
			};
		default: {
			const _exhaustive: never = context.scopeCheck;
			return _exhaustive;
		}
	}
};

const isAbortError = (error: unknown): boolean =>
	error instanceof Error && error.name === "AbortError";

export const createSessionOrchestrator = ({
	rulePack,
	inspection,
}: Readonly<{
	rulePack: ScopeRulePack;
	inspection: SourceDocumentInspectionFacility;
}>): SessionOrchestrator => {
	const listeners = new Set<() => void>();
	const activeControllers = new Map<number, AbortController>();
	let nextCandidateKey = 1;
	let actor: SessionActor;
	let actorSubscription: Subscription;
	let actorSnapshot: SessionActorSnapshot;
	let sessionSnapshot: SessionOrchestratorSnapshot;
	let isStopped = false;

	const notifyListeners = () => {
		for (const listener of listeners) {
			listener();
		}
	};

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
			notifyListeners();
		});
		nextActor.start();
		actor = nextActor;
		actorSubscription = subscription;
		actorSnapshot = nextActor.getSnapshot();
		sessionSnapshot = toSessionSnapshot(actorSnapshot.context);
	};

	startSessionActor();

	const stopCurrentActor = () => {
		actorSubscription.unsubscribe();
		actor.stop();
	};

	const getSnapshot = () => sessionSnapshot;
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	const releaseInspection = (candidateKey: number) => {
		const controller = activeControllers.get(candidateKey);
		if (controller !== undefined) {
			controller.abort();
		}
		activeControllers.delete(candidateKey);
	};

	const startInspection = (
		file: SelectedSourceFile,
		documentId: Sha256Digest,
		candidateKey: number,
	) => {
		const controller = new AbortController();
		activeControllers.set(candidateKey, controller);
		actor.send({
			type: "document-inspection-started",
			candidateKey,
		});
		const input: InspectableSourceDocument =
			file.suppliedMediaType === undefined
				? {
						identity: documentId,
						displayName: file.displayName,
						bytes: file.bytes,
					}
				: {
						identity: documentId,
						displayName: file.displayName,
						suppliedMediaType: file.suppliedMediaType,
						bytes: file.bytes,
					};
		void inspection
			.inspect(input, controller.signal)
			.then((outcome) => {
				actor.send({
					type: "document-inspection-settled",
					candidateKey,
					outcome,
				});
			})
			.catch((error: unknown) => {
				if (isAbortError(error)) {
					actor.send({
						type: "document-inspection-cancelled",
						candidateKey,
					});
					return;
				}
				actor.send({
					type: "document-inspection-settled",
					candidateKey,
					outcome: createInspectionFailedOutcome(documentId),
				});
			})
			.finally(() => {
				if (activeControllers.get(candidateKey) === controller) {
					activeControllers.delete(candidateKey);
				}
			});
	};

	const handleSelectDocuments = (files: readonly SelectedSourceFile[]) => {
		const current = getSnapshot();
		if (
			current.kind !== "scope-check-complete" &&
			current.kind !== "document-intake"
		) {
			return;
		}
		void (async () => {
			for (const file of files) {
				const identity = await computeSourceDocumentIdentity({
					bytes: file.bytes,
				});
				const latest = getSnapshot();
				const alreadyPresent =
					latest.kind === "document-intake" &&
					latest.documents.some(
						(candidate) =>
							candidate.documentId === identity.contentSha256 &&
							candidate.status !== "removed",
					);
				if (alreadyPresent) {
					continue;
				}
				const candidateKey = nextCandidateKey;
				nextCandidateKey += 1;
				actor.send({
					type: "add-document-candidate",
					candidateKey,
					documentId: identity.contentSha256,
					displayName: file.displayName,
				});
				startInspection(file, identity.contentSha256, candidateKey);
			}
		})();
	};

	const resolveActiveCandidateKey = (
		documentId: Sha256Digest,
	): number | undefined => {
		const current = getSnapshot();
		if (current.kind !== "document-intake") {
			return undefined;
		}
		return current.documents.find(
			(candidate) =>
				candidate.documentId === documentId && candidate.status !== "removed",
		)?.candidateKey;
	};

	return {
		getSnapshot,
		subscribe,
		send: (command) => {
			if (isStopped) {
				return;
			}
			switch (command.kind) {
				case "reset":
					for (const candidateKey of [...activeControllers.keys()]) {
						releaseInspection(candidateKey);
					}
					stopCurrentActor();
					startSessionActor();
					return;
				case "answer-eligibility-question": {
					const snapshot = getSnapshot();
					if (snapshot.kind !== "awaiting-scope-answer") {
						return;
					}
					if (snapshot.question.id !== command.questionId) {
						throw new Error(
							`Unknown eligibility question: ${command.questionId}`,
						);
					}

					actor.send({
						type: "answer-eligibility-question",
						answer: command.answer,
						answeredAt: parseIsoTimestamp(command.executionContext.answerTime),
					});
					return;
				}
				case "select-source-documents":
					handleSelectDocuments(command.documents);
					return;
				case "remove-source-document": {
					const candidateKey = resolveActiveCandidateKey(
						command.documentId,
					);
					if (candidateKey === undefined) {
						return;
					}
					releaseInspection(candidateKey);
					actor.send({ type: "document-removed", candidateKey });
					return;
				}
				case "cancel-document-inspection": {
					const candidateKey = resolveActiveCandidateKey(
						command.documentId,
					);
					if (candidateKey === undefined) {
						return;
					}
					releaseInspection(candidateKey);
					actor.send({
						type: "document-inspection-cancelled",
						candidateKey,
					});
					return;
				}
				default: {
					const _exhaustive: never = command;
					return _exhaustive;
				}
			}
		},
		stop: () => {
			isStopped = true;
			for (const candidateKey of [...activeControllers.keys()]) {
				releaseInspection(candidateKey);
			}
			stopCurrentActor();
			listeners.clear();
		},
	};
};
