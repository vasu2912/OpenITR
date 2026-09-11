import type {
	AnalysisScopeEvaluation,
	DocumentExtractionRecord,
	FactKey,
	ScopeFact,
} from "@openitr/model";
import type { ComputationTraceNode } from "@openitr/itr1-ay2026-27";
import type {
	AcceptedCanonicalFact,
	FactResolution,
	UnresolvedFactConflict,
} from "@openitr/fact-reconciliation";
import type { AttestedAnswerFact } from "@openitr/question-engine";

export type FinalReviewTopicId =
	| "taxpayer-profile"
	| "salary"
	| "house-property"
	| "other-income"
	| "gains"
	| "deductions"
	| "taxes-paid";

export type FinalReviewOriginKind =
	| "source-observation"
	| "user-attestation"
	| "conflict-resolution"
	| "derived";

export type FinalReviewFact = Readonly<{
	id: string;
	factKey: string;
	value: string;
	originKind: FinalReviewOriginKind;
	origin: string;
	evidence: string;
	transformation: string;
	downstreamUses: readonly string[];
	targetId: string | undefined;
}>;

export type FinalReviewOpenItem = Readonly<{
	id: string;
	kind:
		| "unresolved-question"
		| "unresolved-conflict"
		| "unsupported-condition"
		| "warning";
	label: string;
	affectedResults: readonly string[];
	targetId: string | undefined;
}>;

export type FinalReview = Readonly<{
	topics: readonly Readonly<{
		id: FinalReviewTopicId;
		label: string;
		facts: readonly FinalReviewFact[];
	}>[];
	openItems: readonly FinalReviewOpenItem[];
}>;

export type FinalReviewInput = Readonly<{
	acceptedFacts: readonly AcceptedCanonicalFact[];
	answers: readonly AttestedAnswerFact[];
	resolutions: readonly FactResolution[];
	extractions: readonly DocumentExtractionRecord[];
	derivedNodes: readonly ComputationTraceNode[];
	missingQuestions: readonly Readonly<{
		id: string;
		factKey: FactKey;
		prompt: string;
		affectedResult: Readonly<{ label: string }>;
	}>[];
	conflicts: readonly UnresolvedFactConflict[];
	analysisScope: AnalysisScopeEvaluation | undefined;
	computationIssues: readonly Readonly<{
		id: string;
		label: string;
		affectedResults: readonly string[];
	}>[];
}>;

const TOPICS: readonly Readonly<{
	id: FinalReviewTopicId;
	label: string;
}>[] = Object.freeze([
	{ id: "taxpayer-profile", label: "Taxpayer profile" },
	{ id: "salary", label: "Salary" },
	{ id: "house-property", label: "House property" },
	{ id: "other-income", label: "Other income" },
	{ id: "gains", label: "Gains" },
	{ id: "deductions", label: "Deductions" },
	{ id: "taxes-paid", label: "Taxes paid" },
]);

type DoneExtraction = Extract<DocumentExtractionRecord, { status: "done" }>;
type SourceObservation =
	| DoneExtraction["observations"][number]
	| DoneExtraction["bankInterestObservations"][number]
	| DoneExtraction["nonSalaryIncomeObservations"][number]
	| DoneExtraction["tdsObservations"][number]
	| DoneExtraction["taxPaymentObservations"][number];

const topicOf = (factKey: string): FinalReviewTopicId => {
	if (
		factKey.startsWith("salary.") ||
		factKey.includes("salary-income") ||
		factKey.includes("salary-total") ||
		factKey.includes("salary-pension")
	) {
		return "salary";
	}
	if (factKey.startsWith("house-property.") || factKey.includes("house-property")) {
		return "house-property";
	}
	if (
		factKey.startsWith("capital-gains.") ||
		factKey.includes("section112a")
	) {
		return "gains";
	}
	if (factKey.startsWith("deductions.") || factKey.includes("deduction")) {
		return "deductions";
	}
	if (
		factKey.startsWith("tds.") ||
		factKey.startsWith("tax-payment.") ||
		factKey.includes("-tds") ||
		factKey.includes("tax-liability") ||
		factKey.includes("taxes-paid") ||
		factKey.includes("income-tax") ||
		factKey.includes("rebate") ||
		factKey.includes("surcharge") ||
		factKey.includes("cess")
	) {
		return "taxes-paid";
	}
	if (
		factKey.startsWith("bank-interest.") ||
		factKey.startsWith("non-salary-income.") ||
		factKey.includes("other-sources") ||
		factKey.includes("agricultur")
	) {
		return "other-income";
	}
	return "taxpayer-profile";
};

const observationsOf = (
	extractions: readonly DocumentExtractionRecord[],
): readonly SourceObservation[] =>
	extractions.flatMap((record) =>
		record.status === "done"
			? [
					...record.observations,
					...record.bankInterestObservations,
					...record.nonSalaryIncomeObservations,
					...record.tdsObservations,
					...record.taxPaymentObservations,
				]
			: [],
	);

const evidenceText = (observation: SourceObservation): string => {
	const { evidence } = observation;
	switch (evidence.kind) {
		case "pdf-page-region":
			return `PDF page ${evidence.page}, region x ${evidence.x}, y ${evidence.y}, width ${Math.round(evidence.width)}, height ${Math.round(evidence.height)}`;
		case "json-pointer":
			return `JSON Pointer ${evidence.pointer}`;
		case "text-line-range":
			return `Text lines ${evidence.firstLine} to ${evidence.lastLine}`;
		case "spreadsheet-cell":
			return `Spreadsheet ${evidence.sheet}, cell ${evidence.cell}`;
		case "csv-record-column":
			return `CSV line ${evidence.line}, column ${evidence.columnHeader}`;
		default: {
			const _exhaustive: never = evidence;
			return String(_exhaustive);
		}
	}
};

const displayValue = (value: AttestedAnswerFact["value"] | string): string =>
	typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);

const scopeFactValue = (fact: ScopeFact): string => {
	if (fact.state !== "known") return fact.reason;
	switch (fact.value.kind) {
		case "boolean":
			return fact.value.value ? "Yes" : "No";
		case "exact-money":
			return String(fact.value.value);
		case "whole-number":
			return String(fact.value.value);
		case "choice":
			return fact.value.value;
		default: {
			const _exhaustive: never = fact.value;
			return _exhaustive;
		}
	}
};

const scopeFactPresentation = (
	fact: Extract<ScopeFact, { state: "known" }>,
): Pick<
	FinalReviewFact,
	"originKind" | "origin" | "evidence" | "transformation" | "targetId"
> => {
	switch (fact.origin.kind) {
		case "observation":
			return {
				originKind: "source-observation",
				origin: `Source observation ${String(fact.origin.sourceId)}`,
				evidence: `${String(fact.origin.sourceDocumentId)} · ${fact.origin.location}`,
				transformation: "Recorded as a typed scope fact.",
				targetId: undefined,
			};
		case "attested-answer":
			return {
				originKind: "user-attestation",
				origin: `Answered through question ${String(fact.origin.questionId)}`,
				evidence: `Question revision ${fact.origin.questionRevision}; recorded ${fact.origin.answeredAt}`,
				transformation: "Recorded as a typed scope answer.",
				targetId: `scope-question-${String(fact.origin.questionId)}`,
			};
		case "resolution":
			return {
				originKind: "conflict-resolution",
				origin: `Conflict resolution ${fact.origin.resolutionId}`,
				evidence: fact.origin.location,
				transformation: "Recorded as the resolved scope fact.",
				targetId: `resolution-${fact.origin.resolutionId}`,
			};
		case "derived":
			return {
				originKind: "derived",
				origin: `Derived by rule ${String(fact.origin.ruleId)}`,
				evidence: `Inputs ${fact.origin.inputFactKeys.map(String).join(", ")}`,
				transformation: `Rule pack ${String(fact.origin.rulePackId)}`,
				targetId: undefined,
			};
		default: {
			const _exhaustive: never = fact.origin;
			return _exhaustive;
		}
	}
};

const downstreamUsesOf = (
	factKey: string,
	nodes: readonly ComputationTraceNode[],
): readonly string[] =>
	Object.freeze(
		[
			...new Set(
				nodes
					.filter((node) =>
						node.inputs.some(
							(input) =>
								(input.kind === "fact" && String(input.factKey) === factKey) ||
								(input.kind === "node" && String(input.nodeId) === factKey),
						),
					)
					.map((node) => String(node.nodeId)),
			),
		].sort(),
	);

export const buildFinalReview = (input: FinalReviewInput): FinalReview => {
	const observations = observationsOf(input.extractions);
	const observationById = new Map(
		observations.map((observation) => [observation.observationId, observation]),
	);
	const resolutionById = new Map(
		input.resolutions.map((resolution) => [resolution.resolutionId, resolution]),
	);
	const facts: FinalReviewFact[] = [];

	for (const accepted of input.acceptedFacts) {
		const observationId =
			accepted.representativeObservationId ??
			accepted.agreeingCandidates[0]?.observationId;
		const observation =
			observationId === undefined
				? undefined
				: observationById.get(observationId);
		const resolution =
			accepted.origin.kind === "observed"
				? undefined
				: resolutionById.get(accepted.origin.resolutionId);
		const originKind: FinalReviewOriginKind =
			accepted.origin.kind === "observed"
				? "source-observation"
				: "conflict-resolution";
		facts.push(
			Object.freeze({
				id: `accepted-${accepted.groupId}`,
				factKey: String(accepted.factKey),
				value: String(accepted.value),
				originKind,
				origin:
					originKind === "source-observation"
						? `Accepted from ${accepted.agreeingCandidates.length} agreeing source observation${accepted.agreeingCandidates.length === 1 ? "" : "s"}`
						: `Conflict resolution recorded ${resolution?.recordedAt ?? "in this session"}: ${resolution?.reason ?? "reason unavailable"}`,
				evidence:
					observation === undefined
						? "User-attested conflict resolution; original competing observations remain in the conflict review."
						: evidenceText(observation),
				transformation:
					observation === undefined || observation.transformationSteps.length === 0
						? "No source normalization steps recorded."
						: observation.transformationSteps
								.map((step) => step.operation)
								.join(" → "),
				downstreamUses: downstreamUsesOf(
					String(accepted.factKey),
					input.derivedNodes,
				),
				targetId:
					resolution !== undefined
						? `resolution-${resolution.resolutionId}`
						: observationId === undefined
							? undefined
							: `observation-${observationId}`,
			}),
		);
	}

	for (const answer of input.answers) {
		facts.push(
			Object.freeze({
				id: `answer-${answer.answerId}`,
				factKey: String(answer.factKey),
				value: displayValue(answer.value),
				originKind: "user-attestation",
				origin: `Answered through question ${answer.questionId}`,
				evidence: `Question revision ${answer.questionRevision}; recorded ${answer.answeredAt}`,
				transformation: "Recorded as the typed answer value without source extraction.",
				downstreamUses: downstreamUsesOf(
					String(answer.factKey),
					input.derivedNodes,
				),
				targetId: `answer-${answer.answerId}`,
			}),
		);
	}

	for (const node of input.derivedNodes) {
		facts.push(
			Object.freeze({
				id: `derived-${String(node.nodeId)}`,
				factKey: String(node.nodeId),
				value: String(node.roundedValue),
				originKind: "derived",
				origin: `Derived by rule ${String(node.ruleId)} from revision ${node.rulePackRevision}`,
				evidence: `${node.inputs.length} recorded input${node.inputs.length === 1 ? "" : "s"} in the computation trace`,
				transformation: `${node.operation}${node.roundingMode === undefined ? "" : `; ${node.roundingMode}`}`,
				downstreamUses: downstreamUsesOf(
					String(node.nodeId),
					input.derivedNodes,
				),
				targetId: undefined,
			}),
		);
	}

	for (const decision of input.analysisScope?.decisions ?? []) {
		if (decision.fact.state !== "known") continue;
		const presentation = scopeFactPresentation(decision.fact);
		facts.push(
			Object.freeze({
				id: `scope-${decision.id}`,
				factKey: String(decision.factKey),
				value: scopeFactValue(decision.fact),
				...presentation,
				evidence: `${presentation.evidence} · Rule location ${decision.rule.sourceLocation}`,
				downstreamUses: Object.freeze([decision.title]),
				targetId: presentation.targetId ?? `scope-decision-${decision.id}`,
			}),
		);
	}

	const decidedScopeFactKeys = new Set(
		(input.analysisScope?.decisions ?? []).map((decision) =>
			String(decision.factKey),
		),
	);
	for (const answered of input.analysisScope?.answeredQuestions ?? []) {
		if (
			answered.fact.state !== "known" ||
			decidedScopeFactKeys.has(String(answered.fact.factKey))
		) {
			continue;
		}
		const presentation = scopeFactPresentation(answered.fact);
		facts.push(
			Object.freeze({
				id: `scope-answer-${String(answered.question.id)}`,
				factKey: String(answered.fact.factKey),
				value: scopeFactValue(answered.fact),
				...presentation,
				downstreamUses: downstreamUsesOf(
					String(answered.fact.factKey),
					input.derivedNodes,
				),
			}),
		);
	}

	const topics = TOPICS.map((topic) =>
		Object.freeze({
			...topic,
			facts: Object.freeze(
				facts
					.filter((fact) => topicOf(fact.factKey) === topic.id)
					.sort((left, right) => left.factKey.localeCompare(right.factKey)),
			),
		}),
	);
	const openItems: FinalReviewOpenItem[] = [
		...input.missingQuestions.map((question) =>
			Object.freeze({
				id: `question-${question.id}`,
				kind: "unresolved-question" as const,
				label: question.prompt,
				affectedResults: Object.freeze([question.affectedResult.label]),
				targetId: `question-${question.id}`,
			}),
		),
		...input.conflicts.map((conflict) =>
			Object.freeze({
				id: conflict.conflictId,
				kind: "unresolved-conflict" as const,
				label: `Resolve ${String(conflict.factKey)}`,
				affectedResults: Object.freeze(
					conflict.affectedResults.map((result) => result.label),
				),
				targetId: `conflict-${conflict.conflictId}`,
			}),
		),
		...(input.analysisScope?.decisions ?? [])
			.filter((decision) => decision.kind !== "supported")
			.map((decision) =>
				Object.freeze({
					id: `scope-${decision.id}`,
					kind: "unsupported-condition" as const,
					label: `${decision.title}: ${decision.explanation}`,
					affectedResults: Object.freeze(["ITR-1 analysis scope"]),
					targetId: `scope-decision-${decision.id}`,
				}),
			),
		...(input.analysisScope?.calculationLimitations ?? []).map((limitation) =>
			Object.freeze({
				id: `limitation-${String(limitation.factKey)}`,
				kind: "warning" as const,
				label: limitation.explanation,
				affectedResults: Object.freeze(["Tax calculations"]),
				targetId: "scope-calculation-limits-heading",
			}),
		),
		...input.computationIssues.map((issue) =>
			Object.freeze({
				id: issue.id,
				kind: "warning" as const,
				label: issue.label,
				affectedResults: Object.freeze([...issue.affectedResults]),
				targetId: undefined,
			}),
		),
	];

	return Object.freeze({
		topics: Object.freeze(topics),
		openItems: Object.freeze(openItems),
	});
};
