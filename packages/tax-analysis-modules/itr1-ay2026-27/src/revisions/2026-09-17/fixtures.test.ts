import { describe, expect, it } from "vitest";

import { itr1Ay202627CompiledRulePack20260915 } from "../2026-09-15/rule-pack";
import { itr1Ay202627CompiledRulePack20260917 } from "./rule-pack";

const questionContract = (
	question: NonNullable<
		typeof itr1Ay202627CompiledRulePack20260917.analysisScope
	>["questions"][number],
) => ({
	id: question.id,
	factKey: question.factKey,
	requiresRuleId: question.requiresRuleId,
	whyRequired: question.whyRequired,
	answerSchema: question.answerSchema,
	sourceReference: question.sourceReference,
});

describe("2026-09-17 plain-language scope questions", () => {
	it("makes the simpler questions canonical without changing their tax contract", () => {
		expect(itr1Ay202627CompiledRulePack20260917.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-09-17",
			revision: "2026-09-17",
			sourceManifestSha256:
				"80631c1cfc0dc33dd0b0c8b1b6f8d712df7397a586c4598eb1dee3dfd90e7577",
			compiledPackSha256:
				"c23a813dfb55c24fd5526c4d81bafef79e3322682b2900492f4bf0c1a6657252",
		});
		const previousScope = itr1Ay202627CompiledRulePack20260915.analysisScope;
		const currentScope = itr1Ay202627CompiledRulePack20260917.analysisScope;
		expect(previousScope).toBeDefined();
		expect(currentScope).toBeDefined();
		if (previousScope === undefined || currentScope === undefined) return;

		expect(currentScope.questions.map(questionContract)).toEqual(
			previousScope.questions.map(questionContract),
		);
		expect(
			currentScope.questions.every((question, index) => {
				const previous = previousScope.questions[index];
				return (
					previous !== undefined &&
					(question.prompt !== previous.prompt ||
						question.helpText !== previous.helpText)
				);
			}),
		).toBe(true);
		expect(
			currentScope.questions.find(
				(question) => question.id === "scope-total-income",
			),
		).toMatchObject({
			prompt: "What was your total income for FY 2025-26?",
			helpText:
				"Enter the total income that belongs in your return. Include eligible long-term gains from listed shares, equity funds, or business-trust units (section 112A). Do not use only the amount from one salary document.",
		});

		expect(itr1Ay202627CompiledRulePack20260917.scopeCheck.question).toEqual({
			...itr1Ay202627CompiledRulePack20260915.scopeCheck.question,
			prompt:
				"For FY 2025-26, were you an individual with the tax status 'Resident and ordinarily resident' in India?",
			helpText:
				"Choose No if you were not an individual, or if your status was Non-resident or Resident but not ordinarily resident (RNOR).",
		});
	});
});
