import {
	compareExactMoney,
	parseExactMoney,
} from "@openitr/model";
import type {
	exactMoneyFromWholeRupees,
	FactKey,
	IsoTimestamp,
	Sha256Digest,
} from "@openitr/model";

// One canonical observation offered for reconciliation: the exact money
// value an adapter normalized out of a source document, plus the identity
// of the observation and the document it was read from.
export type CanonicalFactCandidate = Readonly<{
	observationId: string;
	sourceDocumentId: Sha256Digest;
	value: ReturnType<typeof exactMoneyFromWholeRupees>;
}>;

// Every canonical observation of one tax fact. The group id is the "same
// fact" identity across sources: the fact key itself for income and TDS
// facts, or the fact key together with one challan identity for tax
// payments, so several distinct payments share a fact key without sharing
// a group.
export type CanonicalFactGroup = Readonly<{
	groupId: string;
	factKey: FactKey;
	candidates: readonly CanonicalFactCandidate[];
}>;

// One downstream result that can be blocked by unresolved conflicts, named
// so a conflict card can say what stops computing.
export type AffectedResult = Readonly<{
	resultId: string;
	label: string;
}>;

// Which groups each downstream result consumes. A conflict in any required
// group blocks that result until it is resolved.
export type ResultFactRequirement = Readonly<{
	result: AffectedResult;
	requiredGroupIds: readonly string[];
}>;

// A stored session fact recording how the taxpayer resolved one conflict.
// It never replaces or edits the original observations; it names the chosen
// or attested value, every candidate the decision overruled, and why. The
// overruled set is what keeps the decision honest: a source the taxpayer
// never saw cannot be silently bound by it.
export type FactResolution = Readonly<{
	resolutionId: string;
	groupId: string;
	factKey: FactKey;
	choice:
		| Readonly<{
				kind: "observed";
				observationId: string;
				value: ReturnType<typeof exactMoneyFromWholeRupees>;
		  }>
		| Readonly<{
				kind: "attested";
				value: ReturnType<typeof exactMoneyFromWholeRupees>;
		  }>;
	decidedAgainst: readonly {
		observationId: string;
		value: ReturnType<typeof exactMoneyFromWholeRupees>;
	}[];
	reason: string;
	recordedAt: IsoTimestamp;
}>;

export type ReconciliationInput = Readonly<{
	groups: readonly CanonicalFactGroup[];
	resolutions: readonly FactResolution[];
	// Fact keys whose conflicts the taxpayer may resolve by attesting a
	// value instead of selecting an observed one.
	attestableFactKeys: readonly FactKey[];
	resultRequirements: readonly ResultFactRequirement[];
}>;

// One decided fact ready for analysis: the value to use, the observation
// that carries it into typed computations (undefined for attested values,
// which have no observation), every agreeing observation as provenance,
// and whether the value came straight from evidence or from a resolution.
export type AcceptedCanonicalFact = Readonly<{
	groupId: string;
	factKey: FactKey;
	value: ReturnType<typeof exactMoneyFromWholeRupees>;
	representativeObservationId: string | undefined;
	agreeingCandidates: readonly CanonicalFactCandidate[];
	origin:
		| Readonly<{ kind: "observed" }>
		| Readonly<{
				kind: "resolved-observed" | "resolved-attested";
				resolutionId: string;
		  }>;
}>;

// An unresolved disagreement: every competing source named, everything the
// dispute blocks named, and whether the taxpayer may attest a value.
export type UnresolvedFactConflict = Readonly<{
	conflictId: string;
	groupId: string;
	factKey: FactKey;
	attestationPermitted: boolean;
	candidates: readonly CanonicalFactCandidate[];
	affectedResults: readonly AffectedResult[];
}>;

export type ReconciliationResult = Readonly<{
	acceptedFacts: readonly AcceptedCanonicalFact[];
	conflicts: readonly UnresolvedFactConflict[];
}>;

// Why a resolution attempt was refused. The orchestrator surfaces these as
// errors; the review UI prevents them before submitting.
export type ResolutionRejection =
	| "conflict-not-found"
	| "observation-not-offered"
	| "attestation-not-permitted"
	| "invalid-attested-value"
	| "reason-required";

export type ResolutionAttempt =
	| Readonly<{ kind: "accepted"; resolution: FactResolution }>
	| Readonly<{ kind: "rejected"; rejection: ResolutionRejection }>;

export type ResolutionAttemptInput = Readonly<{
	reconciliation: ReconciliationResult;
	groupId: string;
	choice:
		| Readonly<{ kind: "observed"; observationId: string }>
		| Readonly<{ kind: "attested"; value: string }>;
	reason: string;
	recordedAt: IsoTimestamp;
	attestableFactKeys: readonly FactKey[];
}>;

const conflictOf = (
	reconciliation: ReconciliationResult,
	groupId: string,
): UnresolvedFactConflict | undefined =>
	reconciliation.conflicts.find((conflict) => conflict.groupId === groupId);

const resolutionIdOf = ({
	groupId,
	choice,
	recordedAt,
	reason,
}: Readonly<{
	groupId: string;
	choice: FactResolution["choice"];
	recordedAt: IsoTimestamp;
	reason: string;
}>): string => {
	const choicePart =
		choice.kind === "observed"
			? `observed:${choice.observationId}`
			: `attested:${choice.value}`;
	return `fact-resolution:${groupId}:${choicePart}:${recordedAt}:${reason}`;
};

// Validate one resolution attempt against the current reconciliation. A
// value may be selected only from the candidates the conflict currently
// offers; a value may be attested only where the fact key permits
// attestation; and every accepted resolution carries a non-blank reason.
export const evaluateResolutionAttempt = (
	input: ResolutionAttemptInput,
): ResolutionAttempt => {
	if (input.reason.trim().length === 0) {
		return Object.freeze({ kind: "rejected", rejection: "reason-required" });
	}
	const conflict = conflictOf(input.reconciliation, input.groupId);
	if (conflict === undefined) {
		return Object.freeze({
			kind: "rejected",
			rejection: "conflict-not-found",
		});
	}
	if (input.choice.kind === "observed") {
		const requestedObservationId = input.choice.observationId;
		const selected = conflict.candidates.find(
			(candidate) => candidate.observationId === requestedObservationId,
		);
		if (selected === undefined) {
			return Object.freeze({
				kind: "rejected",
				rejection: "observation-not-offered",
			});
		}
		const decidedAgainst = conflict.candidates
			.filter((candidate) => candidate !== selected)
			.map((candidate) => ({
				observationId: candidate.observationId,
				value: candidate.value,
			}));
		return Object.freeze({
			kind: "accepted",
			resolution: Object.freeze({
				resolutionId: resolutionIdOf({
					groupId: input.groupId,
					choice: {
						kind: "observed",
						observationId: selected.observationId,
						value: selected.value,
					},
					recordedAt: input.recordedAt,
					reason: input.reason,
				}),
				groupId: input.groupId,
				factKey: conflict.factKey,
				choice: Object.freeze({
					kind: "observed",
					observationId: selected.observationId,
					value: selected.value,
				}),
				decidedAgainst: Object.freeze(decidedAgainst.map((entry) =>
					Object.freeze(entry),
				)),
				reason: input.reason,
				recordedAt: input.recordedAt,
			}),
		});
	}
	if (!conflict.attestationPermitted) {
		return Object.freeze({
			kind: "rejected",
			rejection: "attestation-not-permitted",
		});
	}
	let attestedValue;
	try {
		attestedValue = parseExactMoney(input.choice.value);
	} catch {
		return Object.freeze({
			kind: "rejected",
			rejection: "invalid-attested-value",
		});
	}
	return Object.freeze({
		kind: "accepted",
		resolution: Object.freeze({
			resolutionId: resolutionIdOf({
				groupId: input.groupId,
				choice: { kind: "attested", value: attestedValue },
				recordedAt: input.recordedAt,
				reason: input.reason,
			}),
			groupId: input.groupId,
			factKey: conflict.factKey,
			choice: Object.freeze({ kind: "attested", value: attestedValue }),
			decidedAgainst: Object.freeze(
				conflict.candidates.map((candidate) =>
					Object.freeze({
						observationId: candidate.observationId,
						value: candidate.value,
					}),
				),
			),
			reason: input.reason,
			recordedAt: input.recordedAt,
		}),
	});
};

const candidateOrder = (
	left: CanonicalFactCandidate,
	right: CanonicalFactCandidate,
): number =>
	left.sourceDocumentId < right.sourceDocumentId
		? -1
		: left.sourceDocumentId > right.sourceDocumentId
		? 1
		: left.observationId < right.observationId
		? -1
		: left.observationId > right.observationId
		? 1
		: 0;

const sortedCandidates = (
	candidates: readonly CanonicalFactCandidate[],
): readonly CanonicalFactCandidate[] =>
	[...candidates].sort(candidateOrder);

// Split one group's candidates into classes of equal value, preserving the
// deterministic candidate order inside each class and across classes.
const valueClassesOf = (
	candidates: readonly CanonicalFactCandidate[],
): readonly (readonly CanonicalFactCandidate[])[] => {
	const classes: CanonicalFactCandidate[][] = [];
	for (const candidate of sortedCandidates(candidates)) {
		const matching = classes.find(
			(cls) =>
				compareExactMoney(cls[0]?.value ?? candidate.value, candidate.value) === 0,
		);
		if (matching === undefined) {
			classes.push([candidate]);
			continue;
		}
		matching.push(candidate);
	}
	return classes.map((cls) => Object.freeze([...cls]));
};

const affectedResultsFor = ({
	groupId,
	resultRequirements,
}: Readonly<{
	groupId: string;
	resultRequirements: readonly ResultFactRequirement[];
}>): readonly AffectedResult[] =>
	resultRequirements
		.filter((requirement) =>
			requirement.requiredGroupIds.includes(groupId),
		)
		.map((requirement) => requirement.result)
		.sort((left, right) =>
			left.resultId < right.resultId ? -1 : left.resultId > right.resultId ? 1 : 0,
		);

const conflictIdOf = ({
	groupId,
	candidates,
}: Readonly<{
	groupId: string;
	candidates: readonly CanonicalFactCandidate[];
}>): string =>
	`fact-conflict:${groupId}:${candidates
		.map((candidate) => candidate.observationId)
		.join("+")}`;

// A stored resolution applies to the current reconciliation only when its
// group still exists, its selected observation is still offered at the
// value the resolution recorded, or its choice was attested under a fact
// key that still permits attestation. Anything else stays inert: the
// resolution is kept as session history but decides nothing now.
const resolutionCovers = ({
	resolution,
	candidate,
}: Readonly<{
	resolution: FactResolution;
	candidate: CanonicalFactCandidate;
}>): boolean =>
	(resolution.choice.kind === "observed" &&
		resolution.choice.observationId === candidate.observationId &&
		resolution.choice.value === candidate.value) ||
	resolution.decidedAgainst.some(
		(entry) =>
			entry.observationId === candidate.observationId &&
			entry.value === candidate.value,
	);

const applicableResolutionOf = ({
	group,
	resolutions,
	attestableFactKeys,
}: Readonly<{
	group: CanonicalFactGroup;
	resolutions: readonly FactResolution[];
	attestableFactKeys: readonly FactKey[];
}>): FactResolution | undefined => {
	// Later resolutions for one group supersede earlier ones, so scan from
	// the newest. An older resolution that no longer matches stays stored
	// history and never shadows a fresh decision.
	const candidates = [...group.candidates];
	for (const resolution of [...resolutions].reverse()) {
		if (resolution.groupId !== group.groupId) {
			continue;
		}
		if (resolution.factKey !== group.factKey) {
			continue;
		}
		const coversEveryCandidate = candidates.every((candidate) =>
			resolutionCovers({ resolution, candidate }),
		);
		if (!coversEveryCandidate) {
			continue;
		}
		if (resolution.choice.kind === "observed") {
			const recordedChoice = resolution.choice;
			const selected = candidates.find(
				(candidate) =>
					candidate.observationId === recordedChoice.observationId &&
					candidate.value === recordedChoice.value,
			);
			if (selected === undefined) {
				continue;
			}
			return resolution;
		}
		const stillPermitted = attestableFactKeys.some(
			(factKey) => factKey === group.factKey,
		);
		if (stillPermitted) {
			return resolution;
		}
		return undefined;
	}
	return undefined;
};

// Reconcile every group's canonical observations into accepted facts and
// unresolved conflicts. Pure and deterministic: the same input always
// produces the same result, whatever order the sources arrived in.
export const reconcileCanonicalFacts = (
	input: ReconciliationInput,
): ReconciliationResult => {
	const attestableFactKeys = new Set<FactKey>(input.attestableFactKeys);
	const acceptedFacts: AcceptedCanonicalFact[] = [];
	const conflicts: UnresolvedFactConflict[] = [];

	const orderedGroups = [...input.groups].sort((left, right) =>
		left.groupId < right.groupId ? -1 : left.groupId > right.groupId ? 1 : 0,
	);

	for (const group of orderedGroups) {
		const candidates = sortedCandidates(group.candidates);
		if (candidates.length === 0) {
			continue;
		}
		const classes = valueClassesOf(candidates);
		// A resolution decides something only while a genuine disagreement
		// exists. Once every remaining source agrees, the fact is observed
		// again and any earlier resolution stays stored history.
		const resolution =
			classes.length > 1
				? applicableResolutionOf({
						group,
						resolutions: input.resolutions,
						attestableFactKeys: input.attestableFactKeys,
					})
				: undefined;

		if (classes.length === 1) {
			const agreeing = classes[0] ?? [];
			const representative = agreeing[0];
			if (representative === undefined) {
				continue;
			}
			acceptedFacts.push(
				Object.freeze({
					groupId: group.groupId,
					factKey: group.factKey,
					value: representative.value,
					representativeObservationId: representative.observationId,
					agreeingCandidates: Object.freeze(agreeing),
					origin: Object.freeze({ kind: "observed" }),
				}),
			);
			continue;
		}

		if (resolution !== undefined) {
			const choice = resolution.choice;
			if (choice.kind === "observed") {
				const selectedObservationId = choice.observationId;
				const selected = candidates.find(
					(candidate) => candidate.observationId === selectedObservationId,
				);
				if (selected !== undefined) {
					acceptedFacts.push(
						Object.freeze({
							groupId: group.groupId,
							factKey: group.factKey,
							value: selected.value,
							representativeObservationId: selected.observationId,
							agreeingCandidates: Object.freeze([selected]),
							origin: Object.freeze({
								kind: "resolved-observed",
								resolutionId: resolution.resolutionId,
							}),
						}),
					);
					continue;
				}
			} else if (attestableFactKeys.has(group.factKey)) {
				acceptedFacts.push(
					Object.freeze({
						groupId: group.groupId,
						factKey: group.factKey,
						value: resolution.choice.value,
						representativeObservationId: undefined,
						agreeingCandidates: Object.freeze([]),
						origin: Object.freeze({
							kind: "resolved-attested",
							resolutionId: resolution.resolutionId,
						}),
					}),
				);
				continue;
			}
		}

		conflicts.push(
			Object.freeze({
				conflictId: conflictIdOf({ groupId: group.groupId, candidates }),
				groupId: group.groupId,
				factKey: group.factKey,
				attestationPermitted: attestableFactKeys.has(group.factKey),
				candidates: Object.freeze(candidates),
				affectedResults: Object.freeze(
					affectedResultsFor({
						groupId: group.groupId,
						resultRequirements: input.resultRequirements,
					}),
				),
			}),
		);
	}

	return Object.freeze({
		acceptedFacts: Object.freeze(acceptedFacts),
		conflicts: Object.freeze(conflicts),
	});
};
