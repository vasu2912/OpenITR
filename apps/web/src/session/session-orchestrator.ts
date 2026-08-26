import {
	computeSourceDocumentIdentity,
	createExtractionRejectionOutcome,
	createInspectionFailedOutcome,
	parseExactMoney,
	parseFactKey,
	parseIsoTimestamp,
} from "@openitr/model";
import type {
	CandidateDocument,
	CompletedScopeCheck,
	DocumentExtractionOutcome,
	DocumentExtractionRecord,
	DocumentInspectionOutcome,
	EligibilityAnswerValue,
	FactKey,
	InspectableSourceDocument,
	IsoTimestamp,
	QuestionId,
	ScopeCheckSessionSnapshot,
	ScopeRulePack,
	SelectedSourceFile,
	Sha256Digest,
} from "@openitr/model";
import { computeNewRegimeSalaryScenario } from "@openitr/itr1-ay2026-27";
import type { NewRegimeSalaryComputation } from "@openitr/itr1-ay2026-27";
import {
	computeRefundOrAmountPayableEstimate,
	estimateRefundOrAmountPayableFromSalaryScenario,
} from "@openitr/itr1-ay2026-27";
import type { RefundOrAmountPayableEstimate } from "@openitr/itr1-ay2026-27";
import { createActor, setup } from "xstate";
import type { Subscription } from "xstate";
import {
	evaluateResolutionAttempt,
	reconcileCanonicalFacts,
} from "@openitr/fact-reconciliation";
import type {
	AffectedResult,
	CanonicalFactGroup,
	FactResolution,
	ReconciliationResult,
	UnresolvedFactConflict,
} from "@openitr/fact-reconciliation";

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
	| Readonly<{
			kind: "resolve-fact-conflict";
			groupId: string;
			choice:
				| Readonly<{ kind: "observed"; observationId: string }>
				| Readonly<{ kind: "attested"; value: string }>;
			reason: string;
			executionContext: Readonly<{ recordedAt: string }>;
	  }>
	| Readonly<{ kind: "reset" }>;

// One facility runs both worker-backed stages for a candidate document:
// inspection (identify or reject) and, for supported revisions, observation
// extraction.
export type DocumentProcessingFacility = Readonly<{
	inspect(
		input: InspectableSourceDocument,
		signal: AbortSignal,
	): Promise<DocumentInspectionOutcome>;
	extract(
		input: InspectableSourceDocument,
		signal: AbortSignal,
	): Promise<DocumentExtractionOutcome>;
}>;

export type DocumentIntakeSnapshot = Readonly<{
	kind: "document-intake";
	workflow: "documents";
	rulePackId: ScopeRulePack["identity"]["id"];
	completedScopeCheck: CompletedScopeCheck;
	documents: readonly CandidateDocument[];
	extractions: readonly DocumentExtractionRecord[];
	factConflicts: readonly UnresolvedFactConflict[];
	factResolutions: readonly FactResolution[];
	salaryComputation: NewRegimeSalaryComputation | undefined;
	estimateComputation: RefundOrAmountPayableEstimate | undefined;
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
	extractions: readonly DocumentExtractionRecord[];
	resolutions: readonly FactResolution[];
	salaryComputation: NewRegimeSalaryComputation | undefined;
	estimateComputation: RefundOrAmountPayableEstimate | undefined;
}>;

// Only observations that no review issue disputes are accepted facts. The
// computations themselves re-validate everything and fail closed on gaps.
const acceptedObservationsOf = <TObservation extends { factKey: FactKey }>(
	record: Extract<DocumentExtractionRecord, { status: "done" }>,
	observations: readonly TObservation[],
): readonly TObservation[] => {
	const disputedFactKeys = new Set(
		record.issues.flatMap((issue) => [...issue.affectedFactKeys]),
	);
	return observations.filter(
		(observation) => !disputedFactKeys.has(observation.factKey),
	);
};
// A done record joins a slice when its adapter produced at least one raw
// observation of that kind; the computation layer then judges every accepted
// value and fails closed on gaps or duplicates.
const sliceRecords = <
	TKey extends
		| "observations"
		| "bankInterestObservations"
		| "nonSalaryIncomeObservations"
		| "tdsObservations"
		| "taxPaymentObservations",
>(
	extractions: readonly DocumentExtractionRecord[],
	observationField: TKey,
): readonly Extract<
	DocumentExtractionRecord,
	{ status: "done" }
>[] =>
	extractions.filter(
		(record): record is Extract<DocumentExtractionRecord, { status: "done" }> =>
			record.status === "done" && record[observationField].length > 0,
	);

type SliceComputationInput = Readonly<{
	rulePack: ScopeRulePack;
	scopeCheck: SessionContext["scopeCheck"];
	extractions: readonly DocumentExtractionRecord[];
	resolutions: readonly FactResolution[];
}>;

// Fact keys whose conflicts the taxpayer may resolve by attesting a value.
// Tax-payment facts are excluded on purpose: attesting a payment without
// receipt evidence would invent taxes paid, and salary facts stay outside
// reconciliation because that slice analyses one employer document.
const ATTESTABLE_FACT_KEYS = [
	parseFactKey("bank-interest.savings-account"),
	parseFactKey("bank-interest.deposits"),
	parseFactKey("non-salary-income.dividends"),
	parseFactKey("non-salary-income.interest-other-than-securities"),
] as const;

const ESTIMATE_AFFECTED_RESULT: AffectedResult = Object.freeze({
	resultId: "refund-or-payable-estimate",
	label: "Estimated refund or amount payable",
});

const upsertGroup = (
	groups: Map<string, CanonicalFactGroup>,
	group: CanonicalFactGroup,
): void => {
	const existing = groups.get(group.groupId);
	if (existing === undefined) {
		groups.set(group.groupId, group);
		return;
	}
	groups.set(group.groupId, {
		...existing,
		candidates: [...existing.candidates, ...group.candidates],
	});
};

// Collect every reconciled fact group from the done extraction records.
// Income facts identify by fact key because each supported export prints at
// most one record per category; a challan payment identifies by its printed
// BSR code, serial number, and date, so several payments share one fact key
// while agreeing reprints of one payment share one group.
const collectFactGroups = (
	extractions: readonly DocumentExtractionRecord[],
): readonly CanonicalFactGroup[] => {
	const groups = new Map<string, CanonicalFactGroup>();
	const addObservation = (
		factKey: FactKey,
		groupId: string,
		observation: {
			observationId: string;
			sourceDocumentId: Sha256Digest;
			normalizedValue: ReturnType<typeof parseExactMoney>;
		},
	): void => {
		upsertGroup(groups, {
			groupId,
			factKey,
			candidates: [
				{
					observationId: observation.observationId,
					sourceDocumentId: observation.sourceDocumentId,
					value: observation.normalizedValue,
				},
			],
		});
	};
	for (const record of extractions) {
		if (record.status !== "done") {
			continue;
		}
		for (const observation of record.bankInterestObservations) {
			addObservation(
				observation.factKey,
				String(observation.factKey),
				observation,
			);
		}
		for (const observation of record.nonSalaryIncomeObservations) {
			addObservation(
				observation.factKey,
				String(observation.factKey),
				observation,
			);
		}
		for (const observation of record.taxPaymentObservations) {
			addObservation(
				observation.factKey,
				`${String(observation.factKey)}|${observation.record.bsrCode}|${observation.record.challanSerialNumber}|${observation.record.paymentDateDayMonthYear}`,
				observation,
			);
		}
	}
	return [...groups.values()].sort((left, right) =>
		left.groupId < right.groupId ? -1 : left.groupId > right.groupId ? 1 : 0,
	);
};

// One reconciliation per session event. Equivalent observations collapse to
// one accepted value with all sources as provenance; disagreements surface
// as conflicts naming every source and the results they block; recorded
// resolutions decide conflicts until the evidence changes again.
const reconcileSessionFacts = ({
	extractions,
	resolutions,
}: Readonly<{
	extractions: readonly DocumentExtractionRecord[];
	resolutions: readonly FactResolution[];
}>): ReconciliationResult => {
	const groups = collectFactGroups(extractions);
	return reconcileCanonicalFacts({
		groups,
		resolutions,
		attestableFactKeys: ATTESTABLE_FACT_KEYS,
		resultRequirements: [
			{
				result: ESTIMATE_AFFECTED_RESULT,
				requiredGroupIds: groups.map((group) => group.groupId),
			},
		],
	});
};

// The observations each computation may see: representatives of accepted
// groups only, so conflicted values are withheld and agreeing duplicates
// never count twice. TDS deposits keep their own single-export rule in the
// estimate and salary observations stay governed by the Form 16 checks.
const representativeFilterOf = (
	reconciliation: ReconciliationResult,
): ((observation: {
	observationId: string;
	factKey: FactKey;
}) => boolean) => {
	const representatives = new Set(
		reconciliation.acceptedFacts.flatMap((fact) =>
			fact.representativeObservationId === undefined
				? []
				: [fact.representativeObservationId],
		),
	);
	const unreconciledFactKeys = new Set([
		parseFactKey("tds.tds-deposited"),
	]);
	return (observation) =>
		unreconciledFactKeys.has(observation.factKey) ||
		representatives.has(observation.observationId);
};

const computeSalaryScenario = ({
	rulePack,
	scopeCheck,
	extractions,
}: Omit<SliceComputationInput, "resolutions">): NewRegimeSalaryComputation | undefined => {
	if (scopeCheck.kind !== "complete") {
		return undefined;
	}
	const doneRecords = sliceRecords(extractions, "observations");
	if (doneRecords.length === 0) {
		return undefined;
	}
	const salaryDocuments = doneRecords.map((record) => ({
		documentId: record.documentId,
		observations: acceptedObservationsOf(record, record.observations),
	}));
	return computeNewRegimeSalaryScenario({
		rulePack,
		residentAnswer: scopeCheck.completion.answer,
		salaryDocuments,
	});
};

const computeEstimateScenario = ({
	rulePack,
	scopeCheck,
	extractions,
	resolutions,
	salaryComputation,
}: SliceComputationInput & {
	salaryComputation: NewRegimeSalaryComputation | undefined;
}): RefundOrAmountPayableEstimate | undefined => {
	if (scopeCheck.kind !== "complete") {
		return undefined;
	}
	const reconciliation = reconcileSessionFacts({ extractions, resolutions });
	const withheldFactKeys = [
		...new Set(reconciliation.conflicts.map((conflict) => conflict.factKey)),
	].sort();
	// Attested resolutions carry no observation, so their values reach the
	// estimate through an explicit contribution channel instead.
	const resolvedFactContributions = reconciliation.acceptedFacts.flatMap(
		(fact) =>
			fact.origin.kind === "resolved-attested" &&
			fact.representativeObservationId === undefined
				? [
						{
							resolutionId: fact.origin.resolutionId,
							factKey: fact.factKey,
							value: fact.value,
						},
					]
				: [],
	);
	const isRepresentative = representativeFilterOf(reconciliation);
	const salaryRecords = sliceRecords(extractions, "observations");
	const bankInterestRecords = sliceRecords(
		extractions,
		"bankInterestObservations",
	);
	const nonSalaryIncomeRecords = sliceRecords(
		extractions,
		"nonSalaryIncomeObservations",
	);
	const tdsRecords = sliceRecords(extractions, "tdsObservations");
	const taxPaymentRecords = sliceRecords(
		extractions,
		"taxPaymentObservations",
	);
	if (
		salaryRecords.length === 0 &&
		bankInterestRecords.length === 0 &&
		nonSalaryIncomeRecords.length === 0 &&
		tdsRecords.length === 0 &&
		taxPaymentRecords.length === 0
	) {
		return undefined;
	}
	const toDocument = <
		TObservation extends { factKey: FactKey; observationId: string },
	>(
		record: Extract<DocumentExtractionRecord, { status: "done" }>,
		observations: readonly TObservation[],
		reconciled: boolean,
	): {
		documentId: Sha256Digest;
		observations: readonly TObservation[];
	} => ({
		documentId: record.documentId,
		observations: acceptedObservationsOf(
			record,
			reconciled ? observations.filter(isRepresentative) : observations,
		),
	});
	if (salaryComputation !== undefined) {
		return estimateRefundOrAmountPayableFromSalaryScenario({
			rulePack,
			residentAnswer: scopeCheck.completion.answer,
			salaryScenario: salaryComputation,
			salaryDocuments: salaryRecords.map((record) =>
				toDocument(record, record.observations, false),
			),
			bankInterestDocuments: bankInterestRecords.map((record) =>
				toDocument(record, record.bankInterestObservations, true),
			),
			nonSalaryIncomeDocuments: nonSalaryIncomeRecords.map((record) =>
				toDocument(record, record.nonSalaryIncomeObservations, true),
			),
			tdsDocuments: tdsRecords.map((record) =>
				toDocument(record, record.tdsObservations, false),
			),
			taxPaymentDocuments: taxPaymentRecords.map((record) =>
				toDocument(record, record.taxPaymentObservations, true),
			),
			...(withheldFactKeys.length === 0 ? {} : { withheldFactKeys }),
			...(resolvedFactContributions.length === 0
				? {}
				: { resolvedFactContributions }),
		});
	}
	return computeRefundOrAmountPayableEstimate({
		rulePack,
		residentAnswer: scopeCheck.completion.answer,
		salaryDocuments: salaryRecords.map((record) =>
			toDocument(record, record.observations, false),
		),
		bankInterestDocuments: bankInterestRecords.map((record) =>
			toDocument(record, record.bankInterestObservations, true),
		),
		nonSalaryIncomeDocuments: nonSalaryIncomeRecords.map((record) =>
			toDocument(record, record.nonSalaryIncomeObservations, true),
		),
		tdsDocuments: tdsRecords.map((record) =>
			toDocument(record, record.tdsObservations, false),
		),
		taxPaymentDocuments: taxPaymentRecords.map((record) =>
			toDocument(record, record.taxPaymentObservations, true),
		),
		...(withheldFactKeys.length === 0 ? {} : { withheldFactKeys }),
		...(resolvedFactContributions.length === 0
			? {}
			: { resolvedFactContributions }),
	});
};

// One derivation per session event: the salary scenario runs once and both
// snapshot fields are built from it, so the two cards can never disagree.
const deriveSessionComputations = ({
	rulePack,
	scopeCheck,
	extractions,
	resolutions,
}: SliceComputationInput): {
	salaryComputation: NewRegimeSalaryComputation | undefined;
	estimateComputation: RefundOrAmountPayableEstimate | undefined;
} => {
	const salaryComputation = computeSalaryScenario({
		rulePack,
		scopeCheck,
		extractions,
	});
	const estimateComputation = computeEstimateScenario({
		rulePack,
		scopeCheck,
		extractions,
		resolutions,
		salaryComputation,
	});
	return { salaryComputation, estimateComputation };
};

const buildInspectableInput = (
	file: SelectedSourceFile,
	identity: Sha256Digest,
	bytes: Uint8Array<ArrayBuffer>,
): InspectableSourceDocument =>
	file.suppliedMediaType === undefined
		? { identity, displayName: file.displayName, bytes }
		: {
				identity,
				displayName: file.displayName,
				suppliedMediaType: file.suppliedMediaType,
				bytes,
			};

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
	| Readonly<{ type: "document-removed"; candidateKey: number }>
	| Readonly<{
			type: "document-extraction-started";
			candidateKey: number;
			documentId: Sha256Digest;
	  }>
	| Readonly<{
			type: "document-extraction-settled";
			candidateKey: number;
			outcome: DocumentExtractionOutcome;
	  }>
	| Readonly<{ type: "document-extraction-cancelled"; candidateKey: number }>
	| Readonly<{
			type: "fact-conflict-resolved";
			resolution: FactResolution;
	  }>;

const replaceExtractionRecord = (
	extractions: readonly DocumentExtractionRecord[],
	candidateKey: number,
	update: (record: DocumentExtractionRecord) => DocumentExtractionRecord,
): readonly DocumentExtractionRecord[] =>
	extractions.map((record) =>
		record.candidateKey === candidateKey ? update(record) : record,
	);

const replaceCandidate = (
	documents: readonly CandidateDocument[],
	candidateKey: number,
	update: (candidate: CandidateDocument) => CandidateDocument,
): readonly CandidateDocument[] =>
	documents.map((candidate) =>
		candidate.candidateKey === candidateKey ? update(candidate) : candidate,
	);

const settleExtractionRecord = (
	record: DocumentExtractionRecord,
	outcome: DocumentExtractionOutcome,
): DocumentExtractionRecord =>
	outcome.kind === "extracted"
		? {
				candidateKey: record.candidateKey,
				documentId: record.documentId,
				status: "done",
				observations: outcome.observations,
				bankInterestObservations: outcome.bankInterestObservations,
				nonSalaryIncomeObservations: outcome.nonSalaryIncomeObservations,
				tdsObservations: outcome.tdsObservations,
				taxPaymentObservations: outcome.taxPaymentObservations,
				issues: outcome.issues,
				pages: outcome.pages,
			} satisfies DocumentExtractionRecord
		: {
				candidateKey: record.candidateKey,
				documentId: record.documentId,
				status: "failed",
				issue: outcome.issue,
			} satisfies DocumentExtractionRecord;

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
			extractions: [],
			resolutions: [],
			salaryComputation: undefined,
			estimateComputation: undefined,
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
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "document-removed") {
								return {};
							}
							const nextExtractions = context.extractions.filter(
								(record) => record.candidateKey !== event.candidateKey,
							);
							return {
								documents: replaceCandidate(
									context.documents,
									event.candidateKey,
									(candidate) => withStatus(candidate, "removed"),
								),
								extractions: nextExtractions,
								...deriveSessionComputations({
									rulePack: context.rulePack,
									scopeCheck: context.scopeCheck,
									extractions: nextExtractions,
									resolutions: context.resolutions,
								}),
							};
						}),
					},
					"document-extraction-started": {
						guard: ({ context, event }) =>
							event.type === "document-extraction-started" &&
							context.documents.some(
								(candidate) =>
									candidate.candidateKey === event.candidateKey &&
									candidate.status === "identified",
							) &&
							!context.extractions.some(
								(record) => record.candidateKey === event.candidateKey,
							),
						actions: sessionSetup.assign({
							extractions: ({ context, event }) => {
								if (event.type !== "document-extraction-started") {
									return context.extractions;
								}
								return [
									...context.extractions,
									{
										candidateKey: event.candidateKey,
										documentId: event.documentId,
										status: "extracting",
									} satisfies DocumentExtractionRecord,
								];
							},
						}),
					},
					"document-extraction-settled": {
						guard: ({ context, event }) =>
							event.type === "document-extraction-settled" &&
							context.extractions.some(
								(record) =>
									record.candidateKey === event.candidateKey &&
									record.status === "extracting",
							),
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "document-extraction-settled") {
								return {};
							}
							const nextExtractions = replaceExtractionRecord(
								context.extractions,
								event.candidateKey,
								(record) =>
									settleExtractionRecord(record, event.outcome),
							);
							return {
								extractions: nextExtractions,
								...deriveSessionComputations({
									rulePack: context.rulePack,
									scopeCheck: context.scopeCheck,
									extractions: nextExtractions,
									resolutions: context.resolutions,
								}),
							};
						}),
					},
					"document-extraction-cancelled": {
						guard: ({ context, event }) =>
							event.type === "document-extraction-cancelled" &&
							context.extractions.some(
								(record) =>
									record.candidateKey === event.candidateKey &&
									record.status === "extracting",
							),
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "document-extraction-cancelled") {
								return {};
							}
							const nextExtractions = context.extractions.filter(
								(record) => record.candidateKey !== event.candidateKey,
							);
							return {
								extractions: nextExtractions,
								...deriveSessionComputations({
									rulePack: context.rulePack,
									scopeCheck: context.scopeCheck,
									extractions: nextExtractions,
									resolutions: context.resolutions,
								}),
							};
						}),
					},
					"fact-conflict-resolved": {
						// A resolution is a new session fact, never an edit to the
						// evidence. The reconciliation re-runs on the next
						// derivation and decides whether it still applies.
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "fact-conflict-resolved") {
								return {};
							}
							return {
								resolutions: [...context.resolutions, event.resolution],
								...deriveSessionComputations({
									rulePack: context.rulePack,
									scopeCheck: context.scopeCheck,
									extractions: context.extractions,
									resolutions: [...context.resolutions, event.resolution],
								}),
							};
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
			extractions: context.extractions,
			factConflicts: reconcileSessionFacts({
				extractions: context.extractions,
				resolutions: context.resolutions,
			}).conflicts,
			factResolutions: context.resolutions,
			salaryComputation: context.salaryComputation,
			estimateComputation: context.estimateComputation,
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
	documents: facility,
}: Readonly<{
	rulePack: ScopeRulePack;
	documents: DocumentProcessingFacility;
}>): SessionOrchestrator => {
	const listeners = new Set<() => void>();
	const activeControllers = new Map<number, AbortController>();
	const activeExtractionControllers = new Map<number, AbortController>();
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

	const releaseCandidate = (candidateKey: number) => {
		for (const controllers of [activeControllers, activeExtractionControllers]) {
			const controller = controllers.get(candidateKey);
			if (controller !== undefined) {
				controller.abort();
			}
			controllers.delete(candidateKey);
		}
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
		void (async () => {
			const bytes = await file.readBytes();
			return facility.inspect(
				buildInspectableInput(file, documentId, bytes),
				controller.signal,
			);
		})()
			.then((outcome) => {
				actor.send({
					type: "document-inspection-settled",
					candidateKey,
					outcome,
				});
				if (outcome.kind === "identified") {
					startExtraction(file, documentId, candidateKey);
				}
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

	const startExtraction = (
		file: SelectedSourceFile,
		documentId: Sha256Digest,
		candidateKey: number,
	) => {
		const controller = new AbortController();
		activeExtractionControllers.set(candidateKey, controller);
		actor.send({
			type: "document-extraction-started",
			candidateKey,
			documentId,
		});
		void (async () => {
			const bytes = await file.readBytes();
			const rereadIdentity = await computeSourceDocumentIdentity({ bytes });
			if (rereadIdentity.contentSha256 !== documentId) {
				// The file changed between inspection and extraction; its
				// observations could never match the inspected identity.
				return createExtractionRejectionOutcome(
					"content-mismatch",
					documentId,
				);
			}
			return facility.extract(
				buildInspectableInput(file, documentId, bytes),
				controller.signal,
			);
		})()
			.then((outcome) => {
				actor.send({
					type: "document-extraction-settled",
					candidateKey,
					outcome,
				});
			})
			.catch((error: unknown) => {
				if (isAbortError(error)) {
					actor.send({
						type: "document-extraction-cancelled",
						candidateKey,
					});
					return;
				}
				actor.send({
					type: "document-extraction-settled",
					candidateKey,
					outcome: createExtractionRejectionOutcome(
						"extraction-failed",
						documentId,
					),
				});
			})
			.finally(() => {
				if (activeExtractionControllers.get(candidateKey) === controller) {
					activeExtractionControllers.delete(candidateKey);
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
				const identityBytes = await file.readBytes();
				const identity = await computeSourceDocumentIdentity({
					bytes: identityBytes,
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
					for (const candidateKey of [
						...activeControllers.keys(),
						...activeExtractionControllers.keys(),
					]) {
						releaseCandidate(candidateKey);
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
					releaseCandidate(candidateKey);
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
					releaseCandidate(candidateKey);
					actor.send({
						type: "document-inspection-cancelled",
						candidateKey,
					});
					return;
				}
				case "resolve-fact-conflict": {
					const snapshot = getSnapshot();
					if (snapshot.kind !== "document-intake") {
						return;
					}
					const reconciliation = reconcileSessionFacts({
						extractions: snapshot.extractions,
						resolutions: snapshot.factResolutions,
					});
					let recordedAt;
					try {
						recordedAt = parseIsoTimestamp(
							command.executionContext.recordedAt,
						);
					} catch {
						throw new Error(
							`Invalid resolution timestamp: ${command.executionContext.recordedAt}`,
						);
					}
					const attempt = evaluateResolutionAttempt({
						reconciliation,
						groupId: command.groupId,
						choice: command.choice,
						reason: command.reason,
						recordedAt,
						attestableFactKeys: ATTESTABLE_FACT_KEYS,
					});
					if (attempt.kind === "rejected") {
						throw new Error(
							`Rejected fact resolution (${command.groupId}): ${attempt.rejection}`,
						);
					}
					actor.send({
						type: "fact-conflict-resolved",
						resolution: attempt.resolution,
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
			for (const candidateKey of [
				...activeControllers.keys(),
				...activeExtractionControllers.keys(),
			]) {
				releaseCandidate(candidateKey);
			}
			stopCurrentActor();
			listeners.clear();
		},
	};
};
