import type {
	AssessmentYear,
	FactKey,
	FinancialYear,
	IsoTimestamp,
	IssueCode,
	QuestionId,
	RuleId,
	RulePackId,
	Sha256Digest,
	SourceId,
	TaxAnalysisModuleId,
	TaxFormId,
} from "./primitives";
import type {
	CompiledTaxConstants,
	RulePackManifestTaxConstants,
} from "./rules/tax-constants";
import type {
	AnalysisScopeCatalog,
	AnalysisScopeEvaluation,
	RulePackManifestAnalysisScopeRecord,
} from "./scope-analysis";

export * from "./primitives";
export * from "./money/exact-money";
export * from "./rules/tax-constants";
export * from "./documents/compute-source-document-id";
export * from "./documents/inspection-outcome";
export * from "./documents/candidate-document";
export * from "./documents/observation";
export * from "./documents/extraction";
export * from "./scope-analysis";

export type EligibilityAnswerValue = "yes" | "no";

export type AnswerOption<
	Value extends EligibilityAnswerValue = EligibilityAnswerValue,
> = Readonly<{
	value: Value;
	label: string;
}>;

export type RuleSourceReference = Readonly<{
	sourceId: SourceId;
	location: string;
}>;

export type EligibilityQuestion = Readonly<{
	id: QuestionId;
	prompt: string;
	helpText: string;
	answers: readonly [AnswerOption<"yes">, AnswerOption<"no">];
	suppliesFact: FactKey;
	requiresRuleId: RuleId;
	answerSchema: Readonly<{
		kind: "choice";
		values: readonly [EligibilityAnswerValue, EligibilityAnswerValue];
	}>;
	visibility: Readonly<{ kind: "always" }>;
	blockingEffect: Readonly<{
		kind: "block-on-answer";
		answer: "no";
		issueCode: IssueCode;
	}>;
	sourceReference: RuleSourceReference;
}>;

export type RuleCitation = Readonly<{
	id: RuleId;
	citation: string;
	sourceUrl: string;
}>;

export type ScopeIssue = Readonly<{
	code: IssueCode;
	severity: "blocking" | "review" | "warning" | "information";
	affectedFacts: readonly FactKey[];
	sourceReferences: readonly RuleSourceReference[];
	recoveryAction: string;
}>;

export type ScopeCheckResult =
	| Readonly<{
			kind: "supported";
			title: string;
			explanation: string;
			rule: RuleCitation;
	  }>
	| Readonly<{
			kind: "unsupported";
			title: string;
			explanation: string;
			rule: RuleCitation;
			issue: ScopeIssue;
	  }>;

// One missing-fact question compiled from a rule pack: what to ask, which
// cited rule requires the fact, the typed answer schema, why the fact is
// needed, and every result the answer can change. The question carries no
// value: an unanswered question stays unknown until the taxpayer answers it
// or accepted evidence supplies the fact instead.
export type FactAnswerSchema =
	| Readonly<{
			kind: "exact-money";
			minimumWholeRupees: number;
			maximumWholeRupees: number | null;
	  }>
	| Readonly<{ kind: "boolean" }>;

export type FactQuestionVisibility =
	| Readonly<{ kind: "always" }>
	| Readonly<{
			kind: "fact-boolean-equals";
			factKey: FactKey;
			value: boolean;
	  }>
	| Readonly<{
			kind: "fact-money-greater-than";
			factKey: FactKey;
			wholeRupees: number;
	  }>;

export type FactQuestion = Readonly<{
	id: QuestionId;
	prompt: string;
	helpText: string;
	requiresRuleId: RuleId;
	suppliesFact: FactKey;
	whyRequired: string;
	affectedResult: Readonly<{
		resultId: string;
		label: string;
	}>;
	answerSchema: FactAnswerSchema;
	visibility?: FactQuestionVisibility;
	sourceReference: RuleSourceReference;
}>;

export type AttestedAnswer = Readonly<{
	questionId: QuestionId;
	value: EligibilityAnswerValue;
	label: string;
	answeredAt: IsoTimestamp;
	rulePackId: RulePackId;
}>;

export type CompletedScopeCheck = Readonly<{
	question: Pick<EligibilityQuestion, "id" | "prompt">;
	answer: AttestedAnswer;
	result: ScopeCheckResult;
	// Present only for revisions that publish the full executable scope.
	analysisScope?: AnalysisScopeEvaluation;
}>;

export type RulePackIdentity = Readonly<{
	id: RulePackId;
	form: TaxFormId;
	financialYear: FinancialYear;
	assessmentYear: AssessmentYear;
	revision: string;
	officialSourceRevisionIds: readonly SourceId[];
	sourceManifestSha256: Sha256Digest;
	compiledPackSha256: Sha256Digest;
	minimumEngineContractVersion: string;
}>;

export type OfficialSource = Readonly<{
	id: SourceId;
	title: string;
	authority: string;
	url: string;
	releaseDate: string;
	retrievedDate: string;
	contentSha256: Sha256Digest;
	redistributionStatus: "not-redistributed";
}>;

export type ScopeRulePack = Readonly<{
	identity: RulePackIdentity;
	officialSources: readonly OfficialSource[];
	question: EligibilityQuestion;
	// Missing-fact questions this pack permits, in pinned catalog order.
	// Empty for packs authored before the questionnaire existed.
	questions: readonly FactQuestion[];
	taxConstants: CompiledTaxConstants | undefined;
	// Newer packs may publish the complete scope catalog. This remains optional
	// so older revisions retain their exact compiled representation.
	analysisScope?: AnalysisScopeCatalog;
	evaluate(
		input: Readonly<{
			answer: EligibilityAnswerValue;
			answeredAt: IsoTimestamp;
		}>,
	): CompletedScopeCheck;
	evaluateAnalysisScope?: (input: Readonly<{
		facts: readonly import("./scope-analysis").ScopeFact[];
	}>) => import("./scope-analysis").AnalysisScopeEvaluation;
}>;

export type TaxAnalysisModuleArtifactIdentity = Readonly<{
	id: TaxAnalysisModuleId;
	compiledModuleSha256: Sha256Digest;
}>;

export type RedistributionStatus =
	| "not-redistributed"
	| "redistributed-with-permission";

export type RulePackManifestSourceRecord = Readonly<{
	id: string;
	title: string;
	authority: string;
	url: string;
	releaseDate: string;
	retrievedDate: string;
	contentSha256: string;
	redistributionStatus: RedistributionStatus;
}>;

export type RulePackManifestRuleRecord = Readonly<{
	id: string;
	citation: string;
	sourceId: string;
	sourceLocation: string;
}>;

export type RulePackManifestScopeCheckRecord = Readonly<{
	questionId: string;
	prompt: string;
	helpText: string;
	requiresRuleId: string;
	suppliesFactKey: string;
	blockingIssueCode: string;
	supportedResult: Readonly<{
		title: string;
		explanation: string;
	}>;
	unsupportedResult: Readonly<{
		title: string;
		explanation: string;
		recoveryAction: string;
	}>;
}>;

export type RulePackManifestFactQuestionRecord = Readonly<{
	id: string;
	prompt: string;
	helpText: string;
	requiresRuleId: string;
	suppliesFactKey: string;
	whyRequired: string;
	affectedResult: Readonly<{
		resultId: string;
		label: string;
	}>;
	answerSchema:
		| Readonly<{
				kind: "exact-money";
				minimumWholeRupees: number;
				maximumWholeRupees: number | null;
		  }>
		| Readonly<{ kind: "boolean" }>;
	visibility?:
		| Readonly<{ kind: "always" }>
		| Readonly<{
				kind: "fact-boolean-equals";
				factKey: string;
				value: boolean;
		  }>
		| Readonly<{
				kind: "fact-money-greater-than";
				factKey: string;
				wholeRupees: number;
		  }>;
}>;

export type RulePackManifest = Readonly<{
	rulePackId: string;
	form: string;
	financialYear: string;
	assessmentYear: string;
	packRevision: string;
	engineContractVersion: string;
	officialSources: readonly RulePackManifestSourceRecord[];
	supportedRules: readonly RulePackManifestRuleRecord[];
	scopeCheck: RulePackManifestScopeCheckRecord;
	// Missing-fact questions the pack permits for the documents workflow.
	// Optional so every revision compiled before questions existed keeps its
	// exact compiled identity.
	missingFactQuestions?: readonly RulePackManifestFactQuestionRecord[];
	analysisScope?: RulePackManifestAnalysisScopeRecord;
	taxConstants?: RulePackManifestTaxConstants;
}>;

export type CompiledRulePack = Readonly<{
	identity: RulePackIdentity;
	officialSources: readonly OfficialSource[];
	supportedRuleIds: readonly RuleId[];
	ruleCitations: Readonly<Record<RuleId, RuleCitation>>;
	scopeCheck: Readonly<{
		question: EligibilityQuestion;
		results: Readonly<
			Record<EligibilityAnswerValue, ScopeCheckResult>
		>;
	}>;
	// Present only when the authored manifest declared missing-fact
	// questions, so packs compiled before questions existed keep their
	// exact compiled identity.
	missingFactQuestions?: readonly FactQuestion[];
	analysisScope?: AnalysisScopeCatalog;
	taxConstants?: CompiledTaxConstants;
}>;

export type RulePackRevisionEntry = Readonly<{
	identity: RulePackIdentity;
	load(): Promise<ScopeRulePack>;
}>;

export type RulePackRevisionRegistry = Readonly<{
	moduleId: TaxAnalysisModuleId;
	revisions: readonly RulePackRevisionEntry[];
	select(rulePackId: RulePackId): Promise<ScopeRulePack>;
}>;

export const createRulePackRevisionRegistry = ({
	moduleId,
	revisions,
}: Readonly<{
	moduleId: TaxAnalysisModuleId;
	revisions: readonly RulePackRevisionEntry[];
}>): RulePackRevisionRegistry => {
	const seenRulePackIds = new Set<string>();
	for (const revision of revisions) {
		if (seenRulePackIds.has(revision.identity.id)) {
			throw new Error(
				`Duplicate rule-pack revision in registry: ${revision.identity.id}`,
			);
		}
		seenRulePackIds.add(revision.identity.id);
	}

	const frozenRevisions = Object.freeze([...revisions]);
	return Object.freeze({
		moduleId,
		revisions: frozenRevisions,
		select: async (rulePackId) => {
			const revision = frozenRevisions.find(
				(candidate) => candidate.identity.id === rulePackId,
			);
			if (revision === undefined) {
				throw new Error(`Unknown rule-pack revision: ${rulePackId}`);
			}
			return revision.load();
		},
	});
};

export type TaxAnalysisModuleArtifact = Readonly<{
	identity: TaxAnalysisModuleArtifactIdentity;
	rulePackRevisions: RulePackRevisionRegistry;
}>;

export type ScopeCheckSessionSnapshot =
	| Readonly<{
			kind: "awaiting-scope-answer";
			workflow: "eligibility";
			rulePackId: RulePackId;
			question: EligibilityQuestion;
	  }>
	| Readonly<{
			kind: "scope-check-complete";
			workflow: "eligibility";
			rulePackId: RulePackId;
			question: Pick<EligibilityQuestion, "id" | "prompt">;
			answer: AttestedAnswer;
			result: ScopeCheckResult;
			analysisScope?: AnalysisScopeEvaluation;
	  }>;
