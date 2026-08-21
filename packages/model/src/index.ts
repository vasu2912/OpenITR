export type EligibilityAnswerValue = "yes" | "no";

export type EligibilityQuestion = Readonly<{
	id: string;
	prompt: string;
	helpText: string;
	answers: readonly Readonly<{
		value: EligibilityAnswerValue;
		label: string;
	}>[];
}>;

export type RuleCitation = Readonly<{
	id: string;
	citation: string;
	sourceUrl: string;
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
	  }>;

export type CompletedScopeCheck = Readonly<{
	question: Pick<EligibilityQuestion, "id" | "prompt">;
	answer: Readonly<{
		value: EligibilityAnswerValue;
		label: string;
	}>;
	result: ScopeCheckResult;
}>;

export type RulePackIdentity = Readonly<{
	id: string;
	form: "ITR-1";
	financialYear: "2025-26";
	assessmentYear: "2026-27";
	revision: string;
	officialSourceRevisionIds: readonly string[];
	sourceManifestSha256: string;
	compiledPackSha256: string;
	minimumEngineContractVersion: string;
}>;

export type OfficialSource = Readonly<{
	id: string;
	title: string;
	authority: string;
	url: string;
	releaseDate: string;
	retrievedDate: string;
	contentSha256: string;
	redistributionStatus: "not-redistributed";
	location: string;
}>;

export type ScopeRulePack = Readonly<{
	identity: RulePackIdentity;
	officialSources: readonly OfficialSource[];
	question: EligibilityQuestion;
	evaluate(answer: EligibilityAnswerValue): CompletedScopeCheck;
}>;

export type ScopeCheckSessionSnapshot =
	| Readonly<{
			kind: "awaiting-scope-answer";
			workflow: "eligibility";
			rulePackId: string;
			question: EligibilityQuestion;
	  }>
	| Readonly<{
			kind: "scope-check-complete";
			workflow: "eligibility";
			rulePackId: string;
			question: Pick<EligibilityQuestion, "id" | "prompt">;
			answer: CompletedScopeCheck["answer"];
			result: ScopeCheckResult;
	  }>;
