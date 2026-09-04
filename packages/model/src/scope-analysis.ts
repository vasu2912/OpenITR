import type {
	FactKey,
	IsoTimestamp,
	QuestionId,
	RuleId,
	RulePackId,
	Sha256Digest,
	SourceId,
} from "./primitives";
import type { DocumentKind } from "./documents/inspection-outcome";
import type { ExactMoney } from "./money/exact-money";
import type { RulePackIdentity, RuleSourceReference } from "./index";

// The full scope model is deliberately separate from the original one-question
// scope check. Older packs can keep their original compiled representation,
// while a newer pack can publish a complete, executable scope catalog.
export type ScopeFactSchema =
	| Readonly<{ kind: "boolean" }>
	| Readonly<{
			kind: "exact-money";
			minimumWholeRupees: number;
			maximumWholeRupees: number | null;
	  }>
	| Readonly<{
			kind: "whole-number";
			minimum: number;
			maximum: number | null;
	  }>
	| Readonly<{
			kind: "choice";
			values: readonly string[];
	  }>;

export type ScopeFactValue =
	| Readonly<{ kind: "boolean"; value: boolean }>
	| Readonly<{ kind: "exact-money"; value: ExactMoney }>
	| Readonly<{ kind: "whole-number"; value: number }>
	| Readonly<{ kind: "choice"; value: string }>;

export type ScopeFactOrigin =
	| Readonly<{
			kind: "observation";
			sourceId: SourceId;
			sourceDocumentId: Sha256Digest;
			location: string;
			// Observations default to partial coverage. A complete aggregate must
			// say so explicitly before satisfying a checklist item.
			coverage?: "complete" | "partial";
	  }>
	| Readonly<{
			kind: "attested-answer";
			questionId: QuestionId;
			questionRevision: string;
			answeredAt: IsoTimestamp;
			rulePackId: RulePackId;
	  }>
	| Readonly<{
			kind: "resolution";
			resolutionId: string;
			rulePackId: RulePackId;
			location: string;
	  }>
	| Readonly<{
			kind: "derived";
			ruleId: RuleId;
			inputFactKeys: readonly FactKey[];
			rulePackId: RulePackId;
	  }>;

// A fact keeps its uncertainty visible. In particular, a missing fact is not
// represented by a false boolean or a zero amount.
export type ScopeFact =
	| Readonly<{
			factKey: FactKey;
			state: "known";
			value: ScopeFactValue;
			origin: ScopeFactOrigin;
	  }>
	| Readonly<{
			factKey: FactKey;
			state: "unknown";
			reason: string;
	  }>
	| Readonly<{
			factKey: FactKey;
			state: "unsupported";
			reason: string;
			sourceReferences: readonly RuleSourceReference[];
	  }>
	| Readonly<{
			factKey: FactKey;
			state: "blocked";
			reason: string;
			sourceReferences: readonly RuleSourceReference[];
			conflictingFacts?: readonly ScopeFact[];
	  }>;

export type ScopeRuleCondition =
	| Readonly<{ kind: "must-be-true" }>
	| Readonly<{ kind: "must-be-false" }>
	| Readonly<{ kind: "at-most-exact-money"; limit: ExactMoney }>
	| Readonly<{ kind: "at-most-whole-number"; limit: number }>;

export type ScopeRuleCitation = Readonly<{
	id: RuleId;
	citation: string;
	sourceId: SourceId;
	sourceUrl: string;
	sourceLocation: string;
}>;

export type ScopeRule = Readonly<{
	id: RuleId;
	factKey: FactKey;
	condition: ScopeRuleCondition;
	citation: ScopeRuleCitation;
	supportedTitle: string;
	supportedExplanation: string;
	unsupportedTitle: string;
	unsupportedExplanation: string;
	unknownExplanation: string;
	blockedExplanation: string;
	recoveryAction: string;
}>;

// Rule-pack authoring types intentionally use strings. The compiler resolves
// them to branded identifiers and source records before a catalog can be
// loaded by the browser.
export type RulePackManifestScopeFactRecord = Readonly<{
	key: string;
	label: string;
	schema: ScopeFactSchema;
}>;

export type RulePackManifestScopeRuleRecord = Readonly<{
	id: string;
	factKey: string;
	condition:
		| Readonly<{ kind: "must-be-true" }>
		| Readonly<{ kind: "must-be-false" }>
		| Readonly<{ kind: "at-most-exact-money"; limit: string }>
		| Readonly<{ kind: "at-most-whole-number"; limit: number }>;
	citation: string;
	sourceId: string;
	sourceLocation: string;
	supportedTitle: string;
	supportedExplanation: string;
	unsupportedTitle: string;
	unsupportedExplanation: string;
	unknownExplanation: string;
	blockedExplanation: string;
	recoveryAction: string;
}>;

export type ScopeQuestionAnswerSchema = ScopeFactSchema;

export type ScopeQuestion = Readonly<{
	id: QuestionId;
	prompt: string;
	helpText: string;
	factKey: FactKey;
	requiresRuleId?: RuleId;
	whyRequired: string;
	answerSchema: ScopeQuestionAnswerSchema;
	sourceReference?: RuleSourceReference;
}>;

export type ScopeAnsweredQuestion = Readonly<{
	question: ScopeQuestion;
	fact: ScopeFact;
}>;

export type RulePackManifestScopeQuestionRecord = Readonly<{
	id: string;
	prompt: string;
	helpText: string;
	factKey: string;
	requiresRuleId?: string;
	whyRequired: string;
	answerSchema: ScopeQuestionAnswerSchema;
}>;

export type ScopeDocumentExpectation = Readonly<{
	id: string;
	label: string;
	documentKinds: readonly DocumentKind[];
	factKeys: readonly FactKey[];
	parserSupport: "supported" | "expected-only";
	purpose: string;
}>;

export type RulePackManifestScopeDocumentExpectationRecord = Readonly<{
	id: string;
	label: string;
	documentKinds: readonly string[];
	factKeys: readonly string[];
	parserSupport: "supported" | "expected-only";
	purpose: string;
}>;

export type RulePackManifestAnalysisScopeRecord = Readonly<{
	facts: readonly RulePackManifestScopeFactRecord[];
	rules: readonly RulePackManifestScopeRuleRecord[];
	questions: readonly RulePackManifestScopeQuestionRecord[];
	documentExpectations: readonly RulePackManifestScopeDocumentExpectationRecord[];
	educationalLimitations: readonly string[];
}>;

export type ScopeChecklistItem = Readonly<{
	kind: "document" | "question";
	id: string;
	label: string;
	status: "needed" | "satisfied" | "not-needed";
	detail: string;
}>;

export type AnalysisScopeCatalog = Readonly<{
	facts: readonly Readonly<{
		key: FactKey;
		label: string;
		schema: ScopeFactSchema;
	}>[];
	rules: readonly ScopeRule[];
	questions: readonly ScopeQuestion[];
	documentExpectations: readonly ScopeDocumentExpectation[];
	educationalLimitations: readonly string[];
}>;

export type ScopeDecision = Readonly<{
	id: string;
	factKey: FactKey;
	fact: ScopeFact;
	kind: "supported" | "unsupported" | "unknown" | "blocked";
	title: string;
	explanation: string;
	recoveryAction: string | undefined;
	rule: ScopeRuleCitation;
	rulePackIdentity: RulePackIdentity;
}>;

export type AnalysisScopeEvaluation = Readonly<{
	kind: "supported" | "unsupported" | "unknown" | "blocked";
	decisions: readonly ScopeDecision[];
	checklist: readonly ScopeChecklistItem[];
	questions: readonly ScopeQuestion[];
	answeredQuestions: readonly ScopeAnsweredQuestion[];
	// Unknown and blocked non-rule facts remain visible so optional
	// composition questions can be recovered without inventing decisions.
	unresolvedFacts: readonly ScopeFact[];
	calculationLimitations: readonly Readonly<{
		factKey: FactKey;
		explanation: string;
	}>[];
	educationalLimitations: readonly string[];
}>;

export type EvaluateAnalysisScopeInput = Readonly<{
	catalog: AnalysisScopeCatalog;
	rulePackIdentity: RulePackIdentity;
	facts: readonly ScopeFact[];
}>;
