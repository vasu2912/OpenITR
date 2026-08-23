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

export * from "./primitives";
export * from "./documents/compute-source-document-id";
export * from "./documents/inspection-outcome";
export * from "./documents/candidate-document";
export * from "./documents/observation";
export * from "./documents/extraction";

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
	evaluate(
		input: Readonly<{
			answer: EligibilityAnswerValue;
			answeredAt: IsoTimestamp;
		}>,
	): CompletedScopeCheck;
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
	  }>;
