type BrandedString<Name extends string> = string & {
	readonly __brand: Name;
};

export type FactKey = BrandedString<"FactKey">;
export type FinancialYear = BrandedString<"FinancialYear">;
export type IsoTimestamp = BrandedString<"IsoTimestamp">;
export type IssueCode = BrandedString<"IssueCode">;
export type QuestionId = BrandedString<"QuestionId">;
export type RuleId = BrandedString<"RuleId">;
export type RulePackId = BrandedString<"RulePackId">;
export type Sha256Digest = BrandedString<"Sha256Digest">;
export type SourceId = BrandedString<"SourceId">;
export type AssessmentYear = BrandedString<"AssessmentYear">;
export type TaxAnalysisModuleId = BrandedString<"TaxAnalysisModuleId">;
export type TaxFormId = BrandedString<"TaxFormId">;

const isFactKey = (value: string): value is FactKey =>
	/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(value);

const isConsecutiveYearRange = (value: string): boolean => {
	const match = /^(\d{4})-(\d{2})$/.exec(value);
	if (match === null) {
		return false;
	}
	const startYear = match[1];
	const endYear = match[2];
	if (startYear === undefined || endYear === undefined) {
		return false;
	}
	return (Number(startYear) + 1) % 100 === Number(endYear);
};

const isFinancialYear = (value: string): value is FinancialYear =>
	isConsecutiveYearRange(value);

const isIsoTimestamp = (value: string): value is IsoTimestamp => {
	const parsed = Date.parse(value);
	return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
};

const isIssueCode = (value: string): value is IssueCode =>
	/^(?:FILE|DOCUMENT|FACT|QUESTION|RULE|VALIDATION|ANALYSIS)_[A-Z0-9_]+$/.test(
		value,
	);

const isQuestionId = (value: string): value is QuestionId =>
	/^[a-z][a-z0-9-]+$/.test(value);

const isRuleId = (value: string): value is RuleId =>
	/^[A-Z][A-Z0-9-]+$/.test(value);

const isRulePackId = (value: string): value is RulePackId =>
	/^[a-z][a-z0-9-]*\.[a-z0-9.-]+$/.test(value);

const isSha256Digest = (value: string): value is Sha256Digest =>
	/^[a-f0-9]{64}$/.test(value);

const isSourceId = (value: string): value is SourceId =>
	/^[a-z][a-z0-9-]+$/.test(value);

const isAssessmentYear = (value: string): value is AssessmentYear =>
	isConsecutiveYearRange(value);

const isTaxAnalysisModuleId = (
	value: string,
): value is TaxAnalysisModuleId => /^[a-z][a-z0-9-]+$/.test(value);

const isTaxFormId = (value: string): value is TaxFormId =>
	/^[A-Z][A-Z0-9-]+$/.test(value);

export const parseFactKey = (value: string): FactKey => {
	if (!isFactKey(value)) {
		throw new Error(`Invalid fact key: ${value}`);
	}
	return value;
};

export const parseFinancialYear = (value: string): FinancialYear => {
	if (!isFinancialYear(value)) {
		throw new Error(`Invalid financial year: ${value}`);
	}
	return value;
};

export const parseIsoTimestamp = (value: string): IsoTimestamp => {
	if (!isIsoTimestamp(value)) {
		throw new Error(`Invalid ISO timestamp: ${value}`);
	}
	return value;
};

export const parseIssueCode = (value: string): IssueCode => {
	if (!isIssueCode(value)) {
		throw new Error(`Invalid issue code: ${value}`);
	}
	return value;
};

export const parseQuestionId = (value: string): QuestionId => {
	if (!isQuestionId(value)) {
		throw new Error(`Invalid question ID: ${value}`);
	}
	return value;
};

export const parseRuleId = (value: string): RuleId => {
	if (!isRuleId(value)) {
		throw new Error(`Invalid rule ID: ${value}`);
	}
	return value;
};

export const parseRulePackId = (value: string): RulePackId => {
	if (!isRulePackId(value)) {
		throw new Error(`Invalid rule-pack ID: ${value}`);
	}
	return value;
};

export const parseSha256Digest = (value: string): Sha256Digest => {
	if (!isSha256Digest(value)) {
		throw new Error(`Invalid SHA-256 digest: ${value}`);
	}
	return value;
};

export const parseSourceId = (value: string): SourceId => {
	if (!isSourceId(value)) {
		throw new Error(`Invalid source ID: ${value}`);
	}
	return value;
};

export const parseAssessmentYear = (value: string): AssessmentYear => {
	if (!isAssessmentYear(value)) {
		throw new Error(`Invalid assessment year: ${value}`);
	}
	return value;
};

export const parseTaxAnalysisModuleId = (
	value: string,
): TaxAnalysisModuleId => {
	if (!isTaxAnalysisModuleId(value)) {
		throw new Error(`Invalid tax-analysis module ID: ${value}`);
	}
	return value;
};

export const parseTaxFormId = (value: string): TaxFormId => {
	if (!isTaxFormId(value)) {
		throw new Error(`Invalid tax form ID: ${value}`);
	}
	return value;
};

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
