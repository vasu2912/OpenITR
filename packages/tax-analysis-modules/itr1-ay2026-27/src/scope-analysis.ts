import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	parseExactMoney,
	parseIsoTimestamp,
	parseFactKey,
	parseRuleId,
} from "@openitr/model";
import type {
	AnalysisScopeCatalog,
	AnalysisScopeEvaluation,
	ExactMoney,
	FactKey,
	ScopeChecklistItem,
	ScopeDecision,
	ScopeFact,
	ScopeFactValue,
	ScopeRule,
	ScopeRuleCondition,
	ScopeQuestion,
	RulePackId,
	RulePackIdentity,
	EvaluateAnalysisScopeInput,
} from "@openitr/model";

const zero = exactMoneyFromWholeRupees(0);

const LEGACY_SAVINGS_INTEREST_FACT = parseFactKey(
	"bank-interest.savings-account",
);
const LEGACY_DEPOSIT_INTEREST_FACT = parseFactKey("bank-interest.deposits");
const SCOPE_BANK_INTEREST_FACT = parseFactKey("scope.bank-interest-income");
const SCOPE_PROPERTY_COUNT_FACT = parseFactKey("scope.house-property-count");
const SCOPE_SECTION_112A_FACT = parseFactKey("scope.section112a-ltcg");
const SCOPE_AGRICULTURE_FACT = parseFactKey("scope.agriculture-income");
const SCOPE_OTHER_SOURCES_FACT = parseFactKey(
	"scope.allowed-other-sources-income",
);

export type Itr1LegacyInterestFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney;
}>;

const valuesForLegacyFact = ({
	factKey,
	acceptedFacts,
	attestedFacts,
}: Readonly<{
	factKey: FactKey;
	acceptedFacts: readonly Itr1LegacyInterestFact[];
	attestedFacts: readonly Itr1LegacyInterestFact[];
}>): readonly Itr1LegacyInterestFact[] => {
	const accepted = acceptedFacts.filter((fact) => fact.factKey === factKey);
	return accepted.length > 0
		? accepted
		: attestedFacts.filter((fact) => fact.factKey === factKey);
};

const acceptedValuesForLegacyFact = ({
	factKey,
	acceptedFacts,
}: Readonly<{
	factKey: FactKey;
	acceptedFacts: readonly Itr1LegacyInterestFact[];
}>): readonly Itr1LegacyInterestFact[] =>
	acceptedFacts.filter((fact) => fact.factKey === factKey);

// Existing #36 asks separately for savings-account and deposit interest. The
// complete scope catalog asks only whether permitted bank interest exists, so
// this adapter derives a presence fact without collecting a duplicate total.
// A positive known category is enough to establish presence. A zero in one
// category is not a zero aggregate while the other category is unresolved.
export const deriveItr1AnalysisScopeFacts = ({
	baseFacts,
	acceptedFacts,
	attestedFacts,
	rulePackId,
}: Readonly<{
	baseFacts: readonly ScopeFact[];
	acceptedFacts: readonly Itr1LegacyInterestFact[];
	attestedFacts: readonly Itr1LegacyInterestFact[];
	rulePackId: RulePackId;
}>): readonly ScopeFact[] => {
	const explicitScopeFact = baseFacts.find(
		(fact) => fact.factKey === SCOPE_BANK_INTEREST_FACT,
	);
	const explicitAttestation =
		explicitScopeFact?.state === "known" &&
		explicitScopeFact.origin.kind !== "derived"
			? explicitScopeFact
			: explicitScopeFact?.state === "blocked"
				? explicitScopeFact.conflictingFacts?.find(
						(fact): fact is Extract<ScopeFact, { state: "known" }> =>
							fact.state === "known" && fact.origin.kind === "attested-answer",
					)
				: undefined;
	const factsWithoutStaleDerived =
		explicitScopeFact?.state === "known" &&
		explicitScopeFact.origin.kind === "derived"
			? baseFacts.filter((fact) => fact.factKey !== SCOPE_BANK_INTEREST_FACT)
			: explicitScopeFact?.state === "blocked" &&
				  explicitAttestation !== undefined
				? baseFacts
						.filter((fact) => fact.factKey !== SCOPE_BANK_INTEREST_FACT)
						.concat(explicitAttestation)
				: baseFacts;

	const savings = valuesForLegacyFact({
		factKey: LEGACY_SAVINGS_INTEREST_FACT,
		acceptedFacts,
		attestedFacts,
	});
	const deposits = valuesForLegacyFact({
		factKey: LEGACY_DEPOSIT_INTEREST_FACT,
		acceptedFacts,
		attestedFacts,
	});
	if (savings.length === 0 && deposits.length === 0) {
		return factsWithoutStaleDerived;
	}

	const hasPositiveInterest = [savings, deposits].some((facts) =>
		facts.some((fact) => compareExactMoney(fact.value, zero) > 0),
	);
	const allAccountTotalsAreAttested =
		acceptedValuesForLegacyFact({
			factKey: LEGACY_SAVINGS_INTEREST_FACT,
			acceptedFacts,
		}).length === 0 &&
		acceptedValuesForLegacyFact({
			factKey: LEGACY_DEPOSIT_INTEREST_FACT,
			acceptedFacts,
		}).length === 0;
	const bothAttestedCategoriesAreKnownZero =
		allAccountTotalsAreAttested &&
		savings.length > 0 &&
		deposits.length > 0 &&
		!hasPositiveInterest;
	if (!hasPositiveInterest && !bothAttestedCategoriesAreKnownZero) {
		return factsWithoutStaleDerived;
	}

	const inputFactKeys = Object.freeze(
		[savings[0]?.factKey, deposits[0]?.factKey].filter(
			(factKey): factKey is FactKey => factKey !== undefined,
		),
	);
	const derived = knownScopeFact({
		factKey: SCOPE_BANK_INTEREST_FACT,
		value: { kind: "boolean", value: hasPositiveInterest },
		origin: {
			kind: "derived",
			ruleId: parseRuleId("ITR1-INTEREST-INCOME-SECTION-56"),
			inputFactKeys,
			rulePackId,
		},
	});
	if (
		explicitAttestation !== undefined &&
		explicitAttestation.value.kind === "boolean" &&
		explicitAttestation.value.value !== hasPositiveInterest
	) {
		return Object.freeze([
			...factsWithoutStaleDerived.filter(
				(fact) => fact.factKey !== SCOPE_BANK_INTEREST_FACT,
			),
			Object.freeze({
				factKey: SCOPE_BANK_INTEREST_FACT,
				state: "blocked" as const,
				reason:
					"The explicit bank-interest presence answer conflicts with accepted bank-interest evidence. Review the evidence and answer before continuing.",
				sourceReferences: Object.freeze([]),
				conflictingFacts: Object.freeze([explicitAttestation, derived]),
			}),
		]);
	}
	if (explicitAttestation !== undefined) {
		return factsWithoutStaleDerived;
	}
	return Object.freeze([
		...factsWithoutStaleDerived.filter(
			(fact) => fact.factKey !== SCOPE_BANK_INTEREST_FACT,
		),
		derived,
	]);
};

const knownPositive = (fact: ScopeFact | undefined): boolean => {
	if (fact?.state !== "known") {
		return false;
	}
	switch (fact.value.kind) {
		case "exact-money":
			return compareExactMoney(fact.value.value, zero) > 0;
		case "whole-number":
			return fact.value.value > 0;
		case "boolean":
			return fact.value.value;
		case "choice":
			return false;
		default: {
			const _exhaustive: never = fact.value;
			return _exhaustive;
		}
	}
};

// The current estimate engine covers the salary and reviewed bank-interest
// slices only. These permitted scope categories are intentionally supported
// by the envelope, but a positive value must keep the result limited until a
// matching calculation is implemented.
export const itr1EstimateIsBlockedByScopeFacts = (
	facts: readonly ScopeFact[],
): boolean => estimateLimitationsOf(facts).length > 0;

const estimateLimitationsOf = (
	facts: readonly ScopeFact[],
): AnalysisScopeEvaluation["calculationLimitations"] => {
	const factsByKey = new Map(facts.map((fact) => [fact.factKey, fact]));
	return Object.freeze(
		[
			SCOPE_PROPERTY_COUNT_FACT,
			SCOPE_SECTION_112A_FACT,
			SCOPE_AGRICULTURE_FACT,
			SCOPE_OTHER_SOURCES_FACT,
			SCOPE_BANK_INTEREST_FACT,
		].flatMap((factKey) => {
			const fact = factsByKey.get(factKey);
			if (fact?.state === "blocked" || fact?.state === "unsupported") {
				return [
					{
						factKey,
						explanation: `The estimate is withheld because ${factKey} is unresolved. ${fact.reason}`,
					},
				];
			}
			if (
				factKey === SCOPE_OTHER_SOURCES_FACT &&
				(fact === undefined || fact.state !== "known")
			) {
				return [
					{
						factKey,
						explanation: `The estimate is withheld until ${factKey} establishes whether other permitted income needs a calculation outside the current salary and reviewed-interest slices.`,
					},
				];
			}
			return factKey !== SCOPE_BANK_INTEREST_FACT && knownPositive(fact)
				? [
						{
							factKey,
							explanation: `The estimate is withheld because ${factKey} needs a calculation outside the current salary and reviewed-interest slices. This calculation boundary does not change the cited scope decision.`,
						},
					]
				: [];
		}),
	);
};

const factLabelOf = ({
	catalog,
	factKey,
}: Readonly<{
	catalog: AnalysisScopeCatalog;
	factKey: ScopeDecision["factKey"];
}>): string =>
	catalog.facts.find((fact) => fact.key === factKey)?.label ?? String(factKey);

const unknownFactOf = ({
	catalog,
	factKey,
}: Readonly<{
	catalog: AnalysisScopeCatalog;
	factKey: ScopeDecision["factKey"];
}>): ScopeFact =>
	Object.freeze({
		factKey,
		state: "unknown" as const,
		reason: `The fact ${factLabelOf({ catalog, factKey })} (${String(factKey)}) has not been supplied by evidence or an attested answer.`,
	});

const sameValue = ({
	left,
	right,
}: Readonly<{ left: ScopeFactValue; right: ScopeFactValue }>): boolean =>
	left.kind === right.kind && left.value === right.value;

const sourceReferencesOf = (fact: ScopeFact) => {
	if (fact.state === "known" && fact.origin.kind === "observation") {
		return [{ sourceId: fact.origin.sourceId, location: fact.origin.location }];
	}
	if (fact.state === "unsupported" || fact.state === "blocked") {
		return fact.sourceReferences;
	}
	return [];
};

const typeMismatch = ({
	rule,
	fact,
}: Readonly<{ rule: ScopeRule; fact: ScopeFact }>): ScopeDecision["kind"] => {
	if (fact.state !== "known") {
		return fact.state === "unsupported" || fact.state === "blocked"
			? "blocked"
			: "unknown";
	}
	switch (rule.condition.kind) {
		case "must-be-true":
		case "must-be-false":
			return fact.value.kind === "boolean" ? "supported" : "blocked";
		case "at-most-exact-money":
			return fact.value.kind === "exact-money" ? "supported" : "blocked";
		case "at-most-whole-number":
			return fact.value.kind === "whole-number" ? "supported" : "blocked";
		default: {
			const _exhaustive: never = rule.condition;
			return _exhaustive;
		}
	}
};

const satisfiesCondition = ({
	condition,
	value,
}: Readonly<{
	condition: ScopeRuleCondition;
	value: ScopeFactValue;
}>): boolean => {
	switch (condition.kind) {
		case "must-be-true":
			return value.kind === "boolean" && value.value;
		case "must-be-false":
			return value.kind === "boolean" && !value.value;
		case "at-most-exact-money":
			return (
				value.kind === "exact-money" &&
				compareExactMoney(value.value, condition.limit) <= 0
			);
		case "at-most-whole-number":
			return value.kind === "whole-number" && value.value <= condition.limit;
		default: {
			const _exhaustive: never = condition;
			return _exhaustive;
		}
	}
};

const decisionResultOf = ({
	rule,
	fact,
}: Readonly<{ rule: ScopeRule; fact: ScopeFact }>): Pick<
	ScopeDecision,
	"kind" | "title" | "explanation" | "recoveryAction"
> => {
	const preliminaryKind = typeMismatch({ rule, fact });
	if (preliminaryKind === "unknown") {
		return {
			kind: "unknown",
			title: "More information is needed",
			explanation: `${rule.unknownExplanation} Missing fact key: ${String(rule.factKey)}.`,
			recoveryAction: undefined,
		};
	}
	if (preliminaryKind === "blocked") {
		return {
			kind: "blocked",
			title: "Scope check is blocked",
			explanation:
				fact.state === "known" ? rule.blockedExplanation : fact.reason,
			recoveryAction: rule.recoveryAction,
		};
	}
	if (fact.state !== "known") {
		return {
			kind: "blocked",
			title: "Scope check is blocked",
			explanation: fact.reason,
			recoveryAction: rule.recoveryAction,
		};
	}
	if (satisfiesCondition({ condition: rule.condition, value: fact.value })) {
		return {
			kind: "supported",
			title: rule.supportedTitle,
			explanation: rule.supportedExplanation,
			recoveryAction: undefined,
		};
	}
	return {
		kind: "unsupported",
		title: rule.unsupportedTitle,
		explanation: rule.unsupportedExplanation,
		recoveryAction: rule.recoveryAction,
	};
};

const checklistFor = ({
	catalog,
	factsByKey,
	decisions,
}: Readonly<{
	catalog: AnalysisScopeCatalog;
	factsByKey: ReadonlyMap<ScopeDecision["factKey"], ScopeFact>;
	decisions: readonly ScopeDecision[];
}>): readonly ScopeChecklistItem[] => {
	const decisionsByFact = new Map(
		decisions.map((decision) => [decision.factKey, decision]),
	);
	return Object.freeze(
		catalog.documentExpectations.flatMap((expectation) => {
			const relatedFacts = expectation.factKeys.map((factKey) =>
				factsByKey.get(factKey),
			);
			const relatedDecisions = expectation.factKeys.map((factKey) =>
				decisionsByFact.get(factKey),
			);
			const hasUnknown = relatedFacts.some(
				(fact) => fact === undefined || fact.state === "unknown",
			);
			const hasPositiveKnownFact = relatedFacts.some(knownPositive);
			const hasKnownObservedFact = relatedFacts.some(
				(fact) =>
					fact?.state === "known" &&
					fact.origin.kind === "observation" &&
					fact.origin.coverage === "complete",
			);
			const hasBlocked = relatedDecisions.some(
				(decision) => decision?.kind === "blocked",
			);
			const hasUnsupported = relatedDecisions.some(
				(decision) => decision?.kind === "unsupported",
			);
			// An explicit zero is a complete answer for an optional income
			// category, so it must not trigger an irrelevant document request.
			const relevant =
				hasUnknown ||
				hasPositiveKnownFact ||
				hasKnownObservedFact ||
				hasBlocked;
			if (!relevant && !hasUnsupported) {
				return [];
			}
			const status =
				hasKnownObservedFact && !hasUnknown && !hasBlocked
					? ("satisfied" as const)
					: ("needed" as const);
			return [
				Object.freeze({
					kind: "document" as const,
					id: expectation.id,
					label: expectation.label,
					status,
					detail: expectation.purpose,
				}),
			];
		}),
	);
};

const overallKindOf = (
	decisions: readonly ScopeDecision[],
): AnalysisScopeEvaluation["kind"] => {
	if (decisions.some((decision) => decision.kind === "blocked")) {
		return "blocked";
	}
	if (decisions.some((decision) => decision.kind === "unsupported")) {
		return "unsupported";
	}
	if (decisions.some((decision) => decision.kind === "unknown")) {
		return "unknown";
	}
	return "supported";
};

export const evaluateItr1AnalysisScope = ({
	catalog,
	rulePackIdentity,
	facts,
}: EvaluateAnalysisScopeInput): AnalysisScopeEvaluation => {
	const factsByKey = new Map<ScopeDecision["factKey"], ScopeFact>();
	for (const fact of facts) {
		const previous = factsByKey.get(fact.factKey);
		if (previous === undefined) {
			factsByKey.set(fact.factKey, fact);
			continue;
		}
		if (
			previous.state !== "known" ||
			fact.state !== "known" ||
			!sameValue({ left: previous.value, right: fact.value })
		) {
			factsByKey.set(
				fact.factKey,
				Object.freeze({
					factKey: fact.factKey,
					state: "blocked" as const,
					reason: `Conflicting or unavailable sources leave ${String(fact.factKey)} unresolved. Review the cited evidence and record an explicit resolution.`,
					sourceReferences: Object.freeze([
						...sourceReferencesOf(previous),
						...sourceReferencesOf(fact),
					]),
					conflictingFacts: Object.freeze([previous, fact]),
				}),
			);
		}
	}
	const decisions = Object.freeze(
		catalog.rules.map((rule) => {
			const fact =
				factsByKey.get(rule.factKey) ??
				unknownFactOf({ catalog, factKey: rule.factKey });
			return Object.freeze({
				id: `scope-decision:${rule.id}:${String(rule.factKey)}`,
				factKey: rule.factKey,
				fact,
				...decisionResultOf({ rule, fact }),
				rule: rule.citation,
				rulePackIdentity,
			});
		}),
	);
	const questions = Object.freeze(
		catalog.questions.filter((question) => {
			const fact = factsByKey.get(question.factKey);
			return (
				fact === undefined ||
				fact.state === "unknown" ||
				fact.state === "blocked"
			);
		}),
	);
	const unresolvedFacts = Object.freeze(
		catalog.questions.flatMap((question) => {
			const fact = factsByKey.get(question.factKey);
			if (fact === undefined) {
				return [unknownFactOf({ catalog, factKey: question.factKey })];
			}
			return fact.state === "known" ? [] : [fact];
		}),
	);
	const answeredQuestions = Object.freeze(
		catalog.questions.flatMap((question) => {
			const fact = factsByKey.get(question.factKey);
			return fact?.state === "known" ? [Object.freeze({ question, fact })] : [];
		}),
	);
	return Object.freeze({
		kind: overallKindOf(decisions),
		calculationLimitations: estimateLimitationsOf([...factsByKey.values()]),
		decisions,
		checklist: checklistFor({ catalog, factsByKey, decisions }),
		questions,
		answeredQuestions,
		unresolvedFacts,
		educationalLimitations: catalog.educationalLimitations,
	});
};

export const knownScopeFact = (input: {
	factKey: ScopeDecision["factKey"];
	value: ScopeFactValue;
	origin: Extract<ScopeFact, { state: "known" }>["origin"];
}): ScopeFact =>
	Object.freeze({
		factKey: input.factKey,
		state: "known" as const,
		value: input.value,
		origin: input.origin,
	});

export const unknownScopeFact = (factKey: string): ScopeFact =>
	Object.freeze({
		factKey: parseFactKey(factKey),
		state: "unknown" as const,
		reason: `The fact ${factKey} is not yet known.`,
	});

// Raw browser/CLI values cross this boundary once. The evaluator only accepts
// the resulting typed fact, so malformed values cannot turn into an ordinary
// unsupported tax decision.
export const parseItr1ScopeQuestionAnswer = ({
	question,
	rawValue,
	answeredAt,
	rulePackIdentity,
}: Readonly<{
	question: ScopeQuestion;
	rawValue: string;
	answeredAt: string;
	rulePackIdentity: RulePackIdentity;
}>): ScopeFact => {
	const parsedAnsweredAt = parseIsoTimestamp(answeredAt);
	const valueText = rawValue.trim();
	if (valueText.length === 0) {
		throw new Error(`Answer for ${question.id} cannot be empty`);
	}
	let value: ScopeFactValue;
	switch (question.answerSchema.kind) {
		case "boolean":
			if (
				valueText !== "yes" &&
				valueText !== "no" &&
				valueText !== "true" &&
				valueText !== "false"
			) {
				throw new Error(`Answer for ${question.id} must be yes or no`);
			}
			value = {
				kind: "boolean",
				value: valueText === "yes" || valueText === "true",
			};
			break;
		case "exact-money": {
			const amount = parseExactMoney(valueText);
			if (
				compareExactMoney(
					amount,
					exactMoneyFromWholeRupees(question.answerSchema.minimumWholeRupees),
				) < 0 ||
				(question.answerSchema.maximumWholeRupees !== null &&
					compareExactMoney(
						amount,
						exactMoneyFromWholeRupees(question.answerSchema.maximumWholeRupees),
					) > 0)
			) {
				throw new Error(
					`Answer for ${question.id} is outside its accepted amount range`,
				);
			}
			value = { kind: "exact-money", value: amount };
			break;
		}
		case "whole-number": {
			if (!/^\d+$/.test(valueText)) {
				throw new Error(`Answer for ${question.id} must be a whole number`);
			}
			const number = Number(valueText);
			if (
				!Number.isSafeInteger(number) ||
				number < question.answerSchema.minimum ||
				(question.answerSchema.maximum !== null &&
					number > question.answerSchema.maximum)
			) {
				throw new Error(
					`Answer for ${question.id} is outside its accepted whole-number range`,
				);
			}
			value = { kind: "whole-number", value: number };
			break;
		}
		case "choice":
			if (!question.answerSchema.values.includes(valueText)) {
				throw new Error(
					`Answer for ${question.id} is not one of its accepted choices`,
				);
			}
			value = { kind: "choice", value: valueText };
			break;
		default: {
			const _exhaustive: never = question.answerSchema;
			return _exhaustive;
		}
	}
	return knownScopeFact({
		factKey: parseFactKey(String(question.factKey)),
		value,
		origin: {
			kind: "attested-answer",
			questionId: question.id,
			questionRevision: rulePackIdentity.revision,
			answeredAt: parsedAnsweredAt,
			rulePackId: rulePackIdentity.id,
		},
	});
};
