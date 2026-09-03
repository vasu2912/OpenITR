import type {
	CompiledRulePack,
	CompletedScopeCheck,
	EligibilityAnswerValue,
	ScopeRulePack,
} from "@openitr/model";

import { evaluateItr1AnalysisScope } from "./scope-analysis";

const answerLabel = (
	answer: EligibilityAnswerValue,
	compiled: CompiledRulePack,
): string => {
	const option = compiled.scopeCheck.question.answers.find(
		(candidate) => candidate.value === answer,
	);
	if (option === undefined) {
		throw new Error(`Unknown eligibility answer: ${answer}`);
	}
	return option.label;
};

export const createScopeRulePack = ({
	compiled,
}: Readonly<{ compiled: CompiledRulePack }>): ScopeRulePack => {
	const { scopeCheck } = compiled;
	const analysisScope = compiled.analysisScope;

	const evaluate: ScopeRulePack["evaluate"] = ({ answer, answeredAt }) =>
		Object.freeze({
			question: Object.freeze({
				id: scopeCheck.question.id,
				prompt: scopeCheck.question.prompt,
			}),
			answer: Object.freeze({
				questionId: scopeCheck.question.id,
				value: answer,
				label: answerLabel(answer, compiled),
				answeredAt,
				rulePackId: compiled.identity.id,
			}),
			result: scopeCheck.results[answer],
		}) satisfies CompletedScopeCheck;

	const base = {
		identity: compiled.identity,
		officialSources: compiled.officialSources,
		question: scopeCheck.question,
		questions: compiled.missingFactQuestions ?? Object.freeze([]),
		taxConstants: compiled.taxConstants,
		evaluate,
	};
	if (analysisScope === undefined) {
		return Object.freeze(base);
	}
	return Object.freeze({
		...base,
		analysisScope,
		evaluateAnalysisScope: ({ facts }: Readonly<{ facts: readonly import("@openitr/model").ScopeFact[] }>) =>
			evaluateItr1AnalysisScope({
				catalog: analysisScope,
				rulePackIdentity: compiled.identity,
				facts,
			}),
	});
};
