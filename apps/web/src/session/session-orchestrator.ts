import {
	computeSourceDocumentIdentity,
	createExtractionRejectionOutcome,
	createInspectionFailedOutcome,
	parseExactMoney,
	parseFactKey,
	parseIsoTimestamp,
} from "@openitr/model";
import type {
	AnalysisScopeEvaluation,
	AttestedAnswer,
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
	ScopeFact,
	ScopeRulePack,
	SelectedSourceFile,
	Sha256Digest,
} from "@openitr/model";
import {
	computeNewRegimeSalaryScenario,
	deriveItr1AnalysisScopeFacts,
	knownScopeFact,
	parseItr1ScopeQuestionAnswer,
	itr1EstimateIsBlockedByScopeFacts,
} from "@openitr/itr1-ay2026-27";
import type {
	AttestedFactContribution,
	NewRegimeSalaryComputation,
} from "@openitr/itr1-ay2026-27";
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
import {
	deriveMissingFactQuestions,
	evaluateFactAnswerAttempt,
} from "@openitr/question-engine";
import type {
	AttestedAnswerFact,
	MissingFactQuestionnaire,
} from "@openitr/question-engine";
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
	| Readonly<{
			kind: "answer-missing-fact-question";
			questionId: string;
			value: string;
			executionContext: Readonly<{ answerTime: string }>;
	  }>
	| Readonly<{
			kind: "answer-analysis-scope-question";
			questionId: string;
			value: string;
			executionContext: Readonly<{ answerTime: string }>;
		}>
	| Readonly<{
			kind: "remove-missing-fact-answer";
			answerId: string;
	  }>
	| Readonly<{
			kind: "remove-fact-resolution";
			resolutionId: string;
	  }>
	| Readonly<{ kind: "reset" }>;

export type PendingRecomputation =
	| Readonly<{ kind: "idle" }>
	| Readonly<{ kind: "pending" }>;

type PendingRecomputationState =
	| Readonly<{ kind: "idle" }>
	| Readonly<{
			kind: "pending";
			generation: number;
			affectedResultIds: readonly string[];
	  }>;

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
	questionnaire: MissingFactQuestionnaire;
	factAnswers: readonly AttestedAnswerFact[];
	analysisScope?: AnalysisScopeEvaluation;
	salaryComputation: NewRegimeSalaryComputation | undefined;
	estimateComputation: RefundOrAmountPayableEstimate | undefined;
	pendingRecomputation: PendingRecomputation;
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

type AnswerDecision = Readonly<{
	answer: AttestedAnswerFact;
	affectedResultIds: readonly string[];
}>;

type ResolutionDecision = Readonly<{
	resolution: FactResolution;
	affectedResultIds: readonly string[];
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
	resolutionDecisions: readonly ResolutionDecision[];
	answerDecisions: readonly AnswerDecision[];
	analysisScopeFacts: readonly ScopeFact[];
	analysisScopeEvaluation: AnalysisScopeEvaluation | undefined;
	reconciliation: ReconciliationResult;
	questionnaire: MissingFactQuestionnaire;
	salaryComputation: NewRegimeSalaryComputation | undefined;
	estimateComputation: RefundOrAmountPayableEstimate | undefined;
	recomputationGeneration: number;
	pendingRecomputation: PendingRecomputationState;
}>;

const emptyReconciliation: ReconciliationResult = Object.freeze({
	acceptedFacts: Object.freeze([]),
	conflicts: Object.freeze([]),
});

const emptyQuestionnaireOf = (
	rulePack: ScopeRulePack,
): MissingFactQuestionnaire =>
	Object.freeze({
		rulePackId: rulePack.identity.id,
		rulePackRevision: rulePack.identity.revision,
		questions: Object.freeze([]),
	});

const scopeFactsFromEligibility = (
	rulePack: ScopeRulePack,
	completion: CompletedScopeCheck,
): readonly ScopeFact[] => {
	if (rulePack.evaluateAnalysisScope === undefined) {
		return [];
	}
	const origin = {
		kind: "attested-answer" as const,
		questionId: completion.answer.questionId,
		questionRevision: rulePack.identity.revision,
		answeredAt: completion.answer.answeredAt,
		rulePackId: rulePack.identity.id,
	};
	const facts: ScopeFact[] = [];
	if (completion.answer.value === "yes") {
		facts.push(
			knownScopeFact({
				factKey: parseFactKey("scope.taxpayer-resident-other-than-rnor"),
				value: { kind: "boolean", value: true },
				origin,
			}),
			knownScopeFact({
				factKey: parseFactKey("scope.taxpayer-is-individual"),
				value: { kind: "boolean", value: true },
				origin,
			}),
		);
	}
	return Object.freeze(facts);
};

const evaluateAnalysisScopeOf = (
	{ rulePack, facts }: Readonly<{ rulePack: ScopeRulePack; facts: readonly ScopeFact[]; }>,
): AnalysisScopeEvaluation | undefined =>
	rulePack.evaluateAnalysisScope?.({ facts });

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

const ESTIMATE_AFFECTED_RESULT: AffectedResult = Object.freeze({
	resultId: "refund-or-payable-estimate",
	label: "Estimated refund or amount payable",
});

const activeEstimateResultIds = (
	extractions: readonly DocumentExtractionRecord[],
): readonly string[] =>
	extractions.some(
		(record) =>
			record.status === "done" &&
			(record.observations.length > 0 ||
				record.bankInterestObservations.length > 0 ||
				record.nonSalaryIncomeObservations.length > 0 ||
				record.tdsObservations.length > 0 ||
				record.taxPaymentObservations.length > 0),
	)
		? [ESTIMATE_AFFECTED_RESULT.resultId]
		: [];

type SliceComputationInput = Readonly<{
	rulePack: ScopeRulePack;
	scopeCheck: SessionContext["scopeCheck"];
	extractions: readonly DocumentExtractionRecord[];
	resolutions: readonly FactResolution[];
	answers: readonly AttestedAnswerFact[];
	analysisScopeFacts: readonly ScopeFact[];
	documentsStageEntered?: boolean;
}>;

// Fact keys whose conflicts the taxpayer may resolve by attesting a value.
// Tax-payment facts are excluded on purpose: attesting a payment without
// receipt evidence would invent taxes paid. Non-salary certificate rows are
// additive receipts with no cross-document identity, so they never form
// conflicts, and salary facts stay outside reconciliation because that
// slice analyses one employer document.
const ATTESTABLE_FACT_KEYS = [
	parseFactKey("bank-interest.savings-account"),
	parseFactKey("bank-interest.deposits"),
] as const;

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
// A bank-interest group identifies by fact key plus the printed institution
// and masked account, because one export can report several accounts per
// category and those are distinct facts that add up; the same account
// reported by two export formats is one fact observed twice. A challan
// payment identifies by its printed BSR code, serial number, and date, so
// several payments share one fact key while agreeing reprints of one
// payment share one group. Observations that the record's own review
// issues dispute never form groups: the review path already excludes them
// downstream, so a resolution could never unblock anything.
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
		const disputedFactKeys = new Set(
			record.issues.flatMap((issue) => [...issue.affectedFactKeys]),
		);
		for (const observation of record.bankInterestObservations) {
			if (disputedFactKeys.has(observation.factKey)) {
				continue;
			}
			addObservation(
				observation.factKey,
				`${String(observation.factKey)}|${observation.record.institutionName}|${observation.record.maskedAccountNumber}`,
				observation,
			);
		}
		for (const observation of record.taxPaymentObservations) {
			if (disputedFactKeys.has(observation.factKey)) {
				continue;
			}
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

// The observations each reconciled computation may see: representatives of
// accepted groups only, so conflicted values are withheld and agreeing
// duplicates never count twice. TDS and non-salary slices keep their own
// additive rules in the estimate and salary observations stay governed by
// the Form 16 checks.
const representativeFilterOf = (
	reconciliation: ReconciliationResult,
): ((observation: {
	observationId: string;
}) => boolean) => {
	const representatives = new Set(
		reconciliation.acceptedFacts.flatMap((fact) =>
			fact.representativeObservationId === undefined
				? []
				: [fact.representativeObservationId],
		),
	);
	return (observation) => representatives.has(observation.observationId);
};

const currentResidentAnswerOf = (
	{ scopeCheck, analysisScopeFacts }: Readonly<{ scopeCheck: SessionContext["scopeCheck"]; analysisScopeFacts: readonly ScopeFact[]; }>,
): AttestedAnswer => {
	if (scopeCheck.kind !== "complete") {
		throw new Error("A resident answer requires a completed scope check");
	}
	const residentFact = analysisScopeFacts.find(
		(fact) => fact.factKey === parseFactKey("scope.taxpayer-resident-other-than-rnor"),
	);
	if (
		residentFact?.state === "known" &&
		residentFact.value.kind === "boolean" &&
		residentFact.origin.kind === "attested-answer"
	) {
		const value = residentFact.value.value ? "yes" : "no";
		return Object.freeze({
			questionId: residentFact.origin.questionId,
			value,
			label: value === "yes" ? "Yes" : "No",
			answeredAt: residentFact.origin.answeredAt,
			rulePackId: residentFact.origin.rulePackId,
		});
	}
	return scopeCheck.completion.answer;
};

const computeSalaryScenario = ({
	rulePack,
	scopeCheck,
	extractions,
	analysisScopeFacts,
}: Pick<SliceComputationInput, "rulePack" | "scopeCheck" | "extractions" | "analysisScopeFacts">): NewRegimeSalaryComputation | undefined => {
	if (scopeCheck.kind !== "complete") {
		return undefined;
	}
	if (
		rulePack.analysisScope !== undefined &&
		evaluateAnalysisScopeOf({ rulePack, facts: analysisScopeFacts })?.kind !== "supported"
	) {
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
		residentAnswer: currentResidentAnswerOf({ scopeCheck, analysisScopeFacts }),
		salaryDocuments,
	});
};

const computeEstimateScenario = ({
	rulePack,
	scopeCheck,
	extractions,
	answers,
	reconciliation,
	questionnaire,
	salaryComputation,
	analysisScopeFacts,
}: Omit<SliceComputationInput, "resolutions"> & {
	reconciliation: ReconciliationResult;
	questionnaire: MissingFactQuestionnaire;
	salaryComputation: NewRegimeSalaryComputation | undefined;
}): RefundOrAmountPayableEstimate | undefined => {
	if (scopeCheck.kind !== "complete") {
		return undefined;
	}
	if (
		rulePack.analysisScope !== undefined &&
		evaluateAnalysisScopeOf({ rulePack, facts: analysisScopeFacts })?.kind !== "supported"
	) {
		return undefined;
	}
	if (
		rulePack.analysisScope !== undefined &&
		itr1EstimateIsBlockedByScopeFacts(analysisScopeFacts)
	) {
		return undefined;
	}
	const residentAnswer = currentResidentAnswerOf({ scopeCheck, analysisScopeFacts });
	const withheldFactKeys = [
		...new Set(reconciliation.conflicts.map((conflict) => conflict.factKey)),
	].sort();
	// Attestations carry no observation, so their values reach the estimate
	// through an explicit contribution channel. Accepted evidence supersedes
	// an earlier question answer for the same fact and prevents double-counting.
	const supersededAnswerFactKeys = new Set(
		[
			...reconciliation.acceptedFacts.map((fact) => fact.factKey),
			...reconciliation.conflicts.map((conflict) => conflict.factKey),
		],
	);
	const resolutionContributions = reconciliation.acceptedFacts.flatMap(
		(fact) =>
			fact.origin.kind === "resolved-attested" &&
			fact.representativeObservationId === undefined
				? [
						{
							origin: {
								kind: "fact-resolution",
								resolutionId: fact.origin.resolutionId,
							},
							factKey: fact.factKey,
							value: fact.value,
						} satisfies AttestedFactContribution,
					]
				: [],
	);
	const answerContributions = answers
		.filter((answer) => !supersededAnswerFactKeys.has(answer.factKey))
		.map(
			(answer) =>
				({
					origin: {
						kind: "question-answer",
						answerId: answer.answerId,
					},
					factKey: answer.factKey,
					value: answer.value,
				}) satisfies AttestedFactContribution,
		);
	const attestedFactContributions = [
		...resolutionContributions,
		...answerContributions,
	];
	const unansweredFactKeys = questionnaire.questions.map(
		(question) => question.suppliesFact,
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
			residentAnswer,
			salaryScenario: salaryComputation,
			salaryDocuments: salaryRecords.map((record) =>
				toDocument(record, record.observations, false),
			),
			bankInterestDocuments: bankInterestRecords.map((record) =>
				toDocument(record, record.bankInterestObservations, true),
			),
			nonSalaryIncomeDocuments: nonSalaryIncomeRecords.map((record) =>
				toDocument(record, record.nonSalaryIncomeObservations, false),
			),
			tdsDocuments: tdsRecords.map((record) =>
				toDocument(record, record.tdsObservations, false),
			),
			taxPaymentDocuments: taxPaymentRecords.map((record) =>
				toDocument(record, record.taxPaymentObservations, true),
			),
			...(withheldFactKeys.length === 0 ? {} : { withheldFactKeys }),
			...(attestedFactContributions.length === 0
				? {}
				: { attestedFactContributions }),
			...(unansweredFactKeys.length === 0 ? {} : { unansweredFactKeys }),
		});
	}
	return computeRefundOrAmountPayableEstimate({
		rulePack,
		residentAnswer,
		salaryDocuments: salaryRecords.map((record) =>
			toDocument(record, record.observations, false),
		),
		bankInterestDocuments: bankInterestRecords.map((record) =>
			toDocument(record, record.bankInterestObservations, true),
		),
		nonSalaryIncomeDocuments: nonSalaryIncomeRecords.map((record) =>
			toDocument(record, record.nonSalaryIncomeObservations, false),
		),
		tdsDocuments: tdsRecords.map((record) =>
			toDocument(record, record.tdsObservations, false),
		),
		taxPaymentDocuments: taxPaymentRecords.map((record) =>
			toDocument(record, record.taxPaymentObservations, true),
		),
		...(withheldFactKeys.length === 0 ? {} : { withheldFactKeys }),
		...(attestedFactContributions.length === 0
			? {}
			: { attestedFactContributions }),
		...(unansweredFactKeys.length === 0 ? {} : { unansweredFactKeys }),
	});
};

const deriveSessionReview = (
	input: SliceComputationInput,
): Readonly<{
	reconciliation: ReconciliationResult;
	questionnaire: MissingFactQuestionnaire;
}> => {
	const { rulePack, scopeCheck, extractions, resolutions, answers } = input;
	const reconciliation = reconcileSessionFacts({ extractions, resolutions });
	const questionnaire =
		scopeCheck.kind === "complete"
			? deriveMissingFactQuestions({
					rulePack,
					scopeCheck: scopeCheck.completion,
					acceptedFacts: reconciliation.acceptedFacts,
					conflictedFacts: reconciliation.conflicts,
					applicableResultIds: input.documentsStageEntered === true
						? [ESTIMATE_AFFECTED_RESULT.resultId]
						: activeEstimateResultIds(extractions),
					answers,
				})
			: emptyQuestionnaireOf(rulePack);
	return { reconciliation, questionnaire };
};

// One derivation per source-document event: reconciliation runs once, the
// salary scenario runs once, and every snapshot field is built from those
// results, so the cards can never disagree.
const deriveSessionReviewAndSalary = (
	input: SliceComputationInput,
): Readonly<{
	reconciliation: ReconciliationResult;
	questionnaire: MissingFactQuestionnaire;
	salaryComputation: NewRegimeSalaryComputation | undefined;
}> => {
	const { rulePack, scopeCheck, extractions } = input;
	const review = deriveSessionReview(input);
	return {
		...review,
			salaryComputation: computeSalaryScenario({
				rulePack,
				scopeCheck,
				extractions,
				analysisScopeFacts: input.analysisScopeFacts,
			}),
	};
};

const deriveSessionComputations = (
	input: SliceComputationInput,
): Readonly<{
	reconciliation: ReconciliationResult;
	questionnaire: MissingFactQuestionnaire;
	salaryComputation: NewRegimeSalaryComputation | undefined;
	estimateComputation: RefundOrAmountPayableEstimate | undefined;
}> => {
	const { rulePack, scopeCheck, extractions, answers } = input;
	const derived = deriveSessionReviewAndSalary(input);
	const analysisScopeFacts = deriveItr1AnalysisScopeFacts({
		baseFacts: input.analysisScopeFacts,
		acceptedFacts: derived.reconciliation.acceptedFacts,
		attestedFacts: answers,
		rulePackId: rulePack.identity.id,
	});
	const estimateComputation = computeEstimateScenario({
		rulePack,
		scopeCheck,
		extractions,
		analysisScopeFacts,
		answers,
		reconciliation: derived.reconciliation,
		questionnaire: derived.questionnaire,
		salaryComputation: derived.salaryComputation,
	});
	return {
		...derived,
		estimateComputation,
	};
};

const pendingRecomputationFor = ({
	generation,
	affectedResultIds,
}: Readonly<{
	generation: number;
	affectedResultIds: readonly string[];
}>): PendingRecomputationState =>
	Object.freeze({
		kind: "pending",
		generation,
		affectedResultIds: Object.freeze([...affectedResultIds]),
	});

const answersOf = (
	decisions: readonly AnswerDecision[],
): readonly AttestedAnswerFact[] => decisions.map((decision) => decision.answer);

const resolutionsOf = (
	decisions: readonly ResolutionDecision[],
): readonly FactResolution[] => decisions.map((decision) => decision.resolution);

const deriveDecisionComputations = ({
	context,
	answerDecisions,
	resolutionDecisions,
	affectedResultIds,
}: Readonly<{
	context: SessionContext;
	answerDecisions: readonly AnswerDecision[];
	resolutionDecisions: readonly ResolutionDecision[];
	affectedResultIds: readonly string[];
}>): Pick<
	SessionContext,
	| "answerDecisions"
	| "analysisScopeFacts"
	| "analysisScopeEvaluation"
	| "resolutionDecisions"
	| "reconciliation"
	| "questionnaire"
	| "salaryComputation"
	| "estimateComputation"
	| "recomputationGeneration"
	| "pendingRecomputation"
> => {
	const answers = answersOf(answerDecisions);
	const resolutions = resolutionsOf(resolutionDecisions);
	const review = deriveSessionReview({
		rulePack: context.rulePack,
		scopeCheck: context.scopeCheck,
		extractions: context.extractions,
		resolutions,
		answers,
		analysisScopeFacts: context.analysisScopeFacts,
		documentsStageEntered: context.documentsStageEntered,
	});
	const analysisScopeFacts = deriveItr1AnalysisScopeFacts({
		baseFacts: context.analysisScopeFacts,
		acceptedFacts: review.reconciliation.acceptedFacts,
		attestedFacts: answers,
		rulePackId: context.rulePack.identity.id,
	});
	const analysisScopeEvaluation = evaluateAnalysisScopeOf(
		{ rulePack: context.rulePack, facts: analysisScopeFacts },
	);
	const affectsEstimate = affectedResultIds.includes(
		ESTIMATE_AFFECTED_RESULT.resultId,
	);
	if (!affectsEstimate) {
		return {
			answerDecisions,
			analysisScopeFacts,
			analysisScopeEvaluation,
			resolutionDecisions,
			...review,
			salaryComputation: context.salaryComputation,
			estimateComputation: context.estimateComputation,
			recomputationGeneration: context.recomputationGeneration,
			pendingRecomputation: context.pendingRecomputation,
		};
	}
	const generation = context.recomputationGeneration + 1;
	const shouldDefer =
		context.estimateComputation?.kind === "computed" ||
		context.pendingRecomputation.kind === "pending";
	return {
		answerDecisions,
		analysisScopeFacts,
		analysisScopeEvaluation,
		resolutionDecisions,
		...review,
		salaryComputation: context.salaryComputation,
		estimateComputation: shouldDefer
			? undefined
			: computeEstimateScenario({
					rulePack: context.rulePack,
					scopeCheck: context.scopeCheck,
					extractions: context.extractions,
					answers,
					reconciliation: review.reconciliation,
					questionnaire: review.questionnaire,
					salaryComputation: context.salaryComputation,
					analysisScopeFacts,
				}),
		recomputationGeneration: generation,
		pendingRecomputation: shouldDefer
			? pendingRecomputationFor({ generation, affectedResultIds })
			: { kind: "idle" },
	};
};

const settlePendingRecomputation = (
	context: SessionContext,
): Pick<SessionContext, "estimateComputation" | "pendingRecomputation"> => {
	if (context.pendingRecomputation.kind !== "pending") {
		return {
			estimateComputation: context.estimateComputation,
			pendingRecomputation: context.pendingRecomputation,
		};
	}
	return {
		estimateComputation: context.pendingRecomputation.affectedResultIds.includes(
			ESTIMATE_AFFECTED_RESULT.resultId,
		)
			? computeEstimateScenario({
					rulePack: context.rulePack,
					scopeCheck: context.scopeCheck,
					extractions: context.extractions,
					answers: answersOf(context.answerDecisions),
					reconciliation: context.reconciliation,
					questionnaire: context.questionnaire,
					salaryComputation: context.salaryComputation,
					analysisScopeFacts: context.analysisScopeFacts,
				})
			: context.estimateComputation,
		pendingRecomputation: { kind: "idle" },
	};
};

const deriveSourceComputations = ({
	context,
	extractions,
}: Readonly<{
	context: SessionContext;
	extractions: readonly DocumentExtractionRecord[];
}>): Pick<
	SessionContext,
	| "extractions"
	| "analysisScopeFacts"
	| "analysisScopeEvaluation"
	| "reconciliation"
	| "questionnaire"
	| "salaryComputation"
	| "estimateComputation"
	| "recomputationGeneration"
	| "pendingRecomputation"
> => {
	const input: SliceComputationInput = {
		rulePack: context.rulePack,
		scopeCheck: context.scopeCheck,
		extractions,
		resolutions: resolutionsOf(context.resolutionDecisions),
		answers: answersOf(context.answerDecisions),
		analysisScopeFacts: context.analysisScopeFacts,
		documentsStageEntered: context.documentsStageEntered,
	};
	if (context.pendingRecomputation.kind === "pending") {
		const derived = deriveSessionReviewAndSalary(input);
		const analysisScopeFacts = deriveItr1AnalysisScopeFacts({
			baseFacts: context.analysisScopeFacts,
			acceptedFacts: derived.reconciliation.acceptedFacts,
			attestedFacts: input.answers,
			rulePackId: context.rulePack.identity.id,
		});
		return {
			extractions,
			analysisScopeFacts,
			analysisScopeEvaluation: evaluateAnalysisScopeOf(
				{ rulePack: context.rulePack, facts: analysisScopeFacts },
			),
			...derived,
			estimateComputation: undefined,
			recomputationGeneration: context.recomputationGeneration,
			pendingRecomputation: context.pendingRecomputation,
		};
	}
	const derived = deriveSessionComputations(input);
	const analysisScopeFacts = deriveItr1AnalysisScopeFacts({
		baseFacts: context.analysisScopeFacts,
		acceptedFacts: derived.reconciliation.acceptedFacts,
		attestedFacts: input.answers,
		rulePackId: context.rulePack.identity.id,
	});
	return {
		extractions,
		analysisScopeFacts,
		analysisScopeEvaluation: evaluateAnalysisScopeOf(
			{ rulePack: context.rulePack, facts: analysisScopeFacts },
		),
		...derived,
		recomputationGeneration: context.recomputationGeneration + 1,
		pendingRecomputation: { kind: "idle" },
	};
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
			decision: ResolutionDecision;
	  }>
	| Readonly<{
			type: "missing-fact-question-answered";
			decision: AnswerDecision;
	  }>
	| Readonly<{
			type: "analysis-scope-question-answered";
			fact: ScopeFact;
		}>
	| Readonly<{
			type: "missing-fact-answer-removed";
			decision: AnswerDecision;
	  }>
	| Readonly<{
			type: "fact-resolution-removed";
			decision: ResolutionDecision;
	  }>
	| Readonly<{
			type: "recomputation-scheduled";
			generation: number;
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
			resolutionDecisions: [],
			answerDecisions: [],
			analysisScopeFacts: [],
			analysisScopeEvaluation: undefined,
			reconciliation: emptyReconciliation,
			questionnaire: emptyQuestionnaireOf(rulePack),
			salaryComputation: undefined,
			estimateComputation: undefined,
			recomputationGeneration: 0,
			pendingRecomputation: { kind: "idle" },
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
							analysisScopeFacts: ({ context, event }) => {
								if (event.type !== "answer-eligibility-question") {
									return context.analysisScopeFacts;
								}
								const completion = context.rulePack.evaluate({
									answer: event.answer,
									answeredAt: event.answeredAt,
								});
								return deriveItr1AnalysisScopeFacts({
									baseFacts: scopeFactsFromEligibility(context.rulePack, completion),
									acceptedFacts: emptyReconciliation.acceptedFacts,
									attestedFacts: [],
									rulePackId: context.rulePack.identity.id,
								});
							},
							analysisScopeEvaluation: ({ context, event }) => {
								if (event.type !== "answer-eligibility-question") {
									return context.analysisScopeEvaluation;
								}
								const completion = context.rulePack.evaluate({
									answer: event.answer,
									answeredAt: event.answeredAt,
								});
								return evaluateAnalysisScopeOf(
									{ rulePack: context.rulePack, facts: deriveItr1AnalysisScopeFacts({
										baseFacts: scopeFactsFromEligibility(context.rulePack, completion),
										acceptedFacts: emptyReconciliation.acceptedFacts,
										attestedFacts: [],
										rulePackId: context.rulePack.identity.id,
									}) },
								);
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
								...deriveSourceComputations({
									context,
									extractions: nextExtractions,
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
								...deriveSourceComputations({
									context,
									extractions: nextExtractions,
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
							return deriveSourceComputations({
								context,
								extractions: nextExtractions,
							});
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
							const resolutionDecisions = [
								...context.resolutionDecisions,
								event.decision,
							];
							return deriveDecisionComputations({
								context,
								answerDecisions: context.answerDecisions,
								resolutionDecisions,
								affectedResultIds: event.decision.affectedResultIds,
							});
						}),
					},
					"missing-fact-question-answered": {
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "missing-fact-question-answered") {
								return {};
							}
							const answerDecisions = context.rulePack.questions.flatMap(
								(question) =>
									[...context.answerDecisions, event.decision].filter(
										(decision) => decision.answer.questionId === question.id,
									),
							);
							return deriveDecisionComputations({
								context,
								answerDecisions,
								resolutionDecisions: context.resolutionDecisions,
								affectedResultIds: event.decision.affectedResultIds,
							});
						}),
					},
					"analysis-scope-question-answered": {
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "analysis-scope-question-answered") {
								return {};
							}
							const nextBaseFacts = Object.freeze([
								...context.analysisScopeFacts.filter(
									(fact) => fact.factKey !== event.fact.factKey,
								),
								event.fact,
							]);
							const analysisScopeFacts = deriveItr1AnalysisScopeFacts({
								baseFacts: nextBaseFacts,
								acceptedFacts: context.reconciliation.acceptedFacts,
								attestedFacts: answersOf(context.answerDecisions),
								rulePackId: context.rulePack.identity.id,
							});
							const analysisScopeEvaluation = evaluateAnalysisScopeOf(
								{ rulePack: context.rulePack, facts: analysisScopeFacts },
							);
							if (analysisScopeEvaluation?.kind === "supported") {
								const derived = deriveSessionComputations({
									rulePack: context.rulePack,
									scopeCheck: context.scopeCheck,
									extractions: context.extractions,
									resolutions: resolutionsOf(context.resolutionDecisions),
									answers: answersOf(context.answerDecisions),
									analysisScopeFacts,
								});
								return {
									analysisScopeFacts,
									analysisScopeEvaluation,
									...derived,
									pendingRecomputation: { kind: "idle" as const },
								};
							}
							return {
								analysisScopeFacts,
								analysisScopeEvaluation,
								// A scope correction invalidates any prior result that
								// depended on the old envelope.
								salaryComputation: undefined,
								estimateComputation: undefined,
								pendingRecomputation: { kind: "idle" as const },
							};
						}),
					},
					"missing-fact-answer-removed": {
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "missing-fact-answer-removed") {
								return {};
							}
							const answerDecisions = context.answerDecisions.filter(
								(decision) =>
									decision.answer.answerId !== event.decision.answer.answerId,
							);
							return deriveDecisionComputations({
								context,
								answerDecisions,
								resolutionDecisions: context.resolutionDecisions,
								affectedResultIds: event.decision.affectedResultIds,
							});
						}),
					},
					"fact-resolution-removed": {
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "fact-resolution-removed") {
								return {};
							}
							const resolutionDecisions = context.resolutionDecisions.filter(
								(decision) =>
									decision.resolution.resolutionId !==
									event.decision.resolution.resolutionId,
							);
							return deriveDecisionComputations({
								context,
								answerDecisions: context.answerDecisions,
								resolutionDecisions,
								affectedResultIds: event.decision.affectedResultIds,
							});
						}),
					},
					"recomputation-scheduled": {
						guard: ({ context, event }) =>
							event.type === "recomputation-scheduled" &&
							context.pendingRecomputation.kind === "pending" &&
							context.pendingRecomputation.generation === event.generation,
						actions: sessionSetup.assign(({ context, event }) => {
							if (event.type !== "recomputation-scheduled") {
								return {};
							}
							return settlePendingRecomputation(context);
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
					...(context.analysisScopeEvaluation === undefined
						? {}
						: { analysisScope: context.analysisScopeEvaluation }),
				};
			}
		return {
			kind: "document-intake",
			workflow: "documents",
			rulePackId: context.rulePack.identity.id,
			completedScopeCheck: context.scopeCheck.completion,
			documents: context.documents,
			extractions: context.extractions,
			factConflicts: context.reconciliation.conflicts,
			factResolutions: resolutionsOf(context.resolutionDecisions),
			questionnaire: context.questionnaire,
			factAnswers: answersOf(context.answerDecisions),
			...(context.analysisScopeEvaluation === undefined
				? {}
				: { analysisScope: context.analysisScopeEvaluation }),
			salaryComputation: context.salaryComputation,
			estimateComputation: context.estimateComputation,
			pendingRecomputation:
				context.pendingRecomputation.kind === "pending"
					? { kind: "pending" }
					: { kind: "idle" },
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
	const recomputationTimers = new Set<ReturnType<typeof setTimeout>>();
	const RECOMPUTATION_DELAY_MS = 25;
	const resultIdsOf = (results: readonly AffectedResult[]): readonly string[] =>
		Object.freeze(
			[...new Set(results.map((result) => result.resultId))].sort(),
		);

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

	const schedulePendingRecomputation = (): void => {
		const pending = actor.getSnapshot().context.pendingRecomputation;
		if (pending.kind !== "pending") {
			return;
		}
		const targetActor = actor;
		const generation = pending.generation;
		const timer = setTimeout(() => {
			recomputationTimers.delete(timer);
			targetActor.send({
				type: "recomputation-scheduled",
				generation,
			});
		}, RECOMPUTATION_DELAY_MS);
		recomputationTimers.add(timer);
	};

	const cancelScheduledRecomputations = (): void => {
		for (const timer of recomputationTimers) {
			clearTimeout(timer);
		}
		recomputationTimers.clear();
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
		// The legacy one-question packs retain their historical workflow. A
		// complete-scope pack may enter document intake only after every
		// mandatory analysis-scope fact is supported; composition questions are
		// intentionally non-blocking and remain a checklist concern.
		if (
			rulePack.analysisScope !== undefined &&
			current.analysisScope?.kind !== "supported"
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
					cancelScheduledRecomputations();
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
				case "answer-analysis-scope-question": {
					const snapshot = getSnapshot();
					if (
						snapshot.kind !== "scope-check-complete" &&
						snapshot.kind !== "document-intake"
					) {
						return;
					}
					const question = rulePack.analysisScope?.questions.find(
						(candidate) => candidate.id === command.questionId,
					);
					if (question === undefined) {
						throw new Error(
							`Rejected scope answer (${command.questionId}): question-not-found`,
						);
					}
					let answeredAt: IsoTimestamp;
					try {
						answeredAt = parseIsoTimestamp(
							command.executionContext.answerTime,
						);
					} catch {
						throw new Error(
							`Invalid scope answer timestamp: ${command.executionContext.answerTime}`,
						);
					}
					let fact: ScopeFact;
					try {
						fact = parseItr1ScopeQuestionAnswer({
							question,
							rawValue: command.value,
							answeredAt,
							rulePackIdentity: rulePack.identity,
						});
					} catch (error: unknown) {
						throw new Error(
							`Rejected scope answer (${command.questionId}): ${
								error instanceof Error ? error.message : "invalid-value"
							}`,
						);
					}
					actor.send({ type: "analysis-scope-question-answered", fact });
					return;
				}
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
				case "answer-missing-fact-question": {
					const snapshot = getSnapshot();
					if (snapshot.kind !== "document-intake") {
						return;
					}
					const applicableQuestion = snapshot.questionnaire.questions.find(
						(question) => question.id === command.questionId,
					);
					if (applicableQuestion === undefined) {
						throw new Error(
							`Rejected fact answer (${command.questionId}): question-not-applicable`,
						);
					}
					const reconciliation = reconcileSessionFacts({
						extractions: snapshot.extractions,
						resolutions: snapshot.factResolutions,
					});
					let answeredAt;
					try {
						answeredAt = parseIsoTimestamp(
							command.executionContext.answerTime,
						);
					} catch {
						throw new Error(
							`Invalid answer timestamp: ${command.executionContext.answerTime}`,
						);
					}
					const attempt = evaluateFactAnswerAttempt({
						rulePack,
						scopeCheck: snapshot.completedScopeCheck,
						acceptedFacts: reconciliation.acceptedFacts,
						conflictedFacts: reconciliation.conflicts,
						applicableResultIds: activeEstimateResultIds(snapshot.extractions),
						answers: snapshot.factAnswers,
						questionId: command.questionId,
						rawValue: command.value,
						answeredAt,
					});
					if (attempt.kind === "rejected") {
						throw new Error(
							`Rejected fact answer (${command.questionId}): ${attempt.rejection}`,
						);
					}
					const affectedResultIds = Object.freeze([
						applicableQuestion.affectedResult.resultId,
					]);
					actor.send({
						type: "missing-fact-question-answered",
						decision: Object.freeze({
							answer: attempt.answer,
							affectedResultIds,
						}),
					});
					schedulePendingRecomputation();
					return;
				}
				case "remove-missing-fact-answer": {
					const snapshot = getSnapshot();
					if (snapshot.kind !== "document-intake") {
						return;
					}
					const decision = actor
						.getSnapshot()
						.context.answerDecisions.find(
							(candidate) => candidate.answer.answerId === command.answerId,
						);
					if (decision === undefined) {
						return;
					}
					actor.send({
						type: "missing-fact-answer-removed",
						decision,
					});
					schedulePendingRecomputation();
					return;
				}
				case "remove-fact-resolution": {
					const snapshot = getSnapshot();
					if (snapshot.kind !== "document-intake") {
						return;
					}
					const decision = actor
						.getSnapshot()
						.context.resolutionDecisions.find(
							(candidate) =>
								candidate.resolution.resolutionId === command.resolutionId,
						);
					if (decision === undefined) {
						return;
					}
					actor.send({
						type: "fact-resolution-removed",
						decision,
					});
					schedulePendingRecomputation();
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
					const conflict = reconciliation.conflicts.find(
						(candidate) => candidate.groupId === command.groupId,
					);
					if (conflict === undefined) {
						throw new Error(
							`Rejected fact resolution (${command.groupId}): conflict-not-found`,
						);
					}
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
					const affectedResultIds = resultIdsOf(conflict.affectedResults);
					actor.send({
						type: "fact-conflict-resolved",
						decision: Object.freeze({
							resolution: attempt.resolution,
							affectedResultIds,
						}),
					});
					schedulePendingRecomputation();
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
			cancelScheduledRecomputations();
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
