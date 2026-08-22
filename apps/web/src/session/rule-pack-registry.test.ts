import {
	createRulePackRevisionRegistry,
	parseTaxAnalysisModuleId,
} from "@openitr/model";
import { parseRulePackId } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createSyntheticRulePack,
	firstSyntheticRevision,
	secondSyntheticRevision,
} from "./synthetic-rule-packs";

const moduleId = parseTaxAnalysisModuleId("test-scope-module");

describe("rule-pack revision registry", () => {
	test("selects either of two immutable revisions by rule-pack id", async () => {
		const first = await createSyntheticRulePack(firstSyntheticRevision);
		const second = await createSyntheticRulePack(secondSyntheticRevision);
		const registry = createRulePackRevisionRegistry({
			moduleId,
			revisions: [
				Object.freeze({
					identity: first.identity,
					load: async () => first,
				}),
				Object.freeze({
					identity: second.identity,
					load: async () => second,
				}),
			],
		});

		expect(Object.isFrozen(registry)).toBe(true);

		const selectedFirst = await registry.select(
			parseRulePackId(firstSyntheticRevision.rulePackId),
		);
		const selectedSecond = await registry.select(
			parseRulePackId(secondSyntheticRevision.rulePackId),
		);

		expect(selectedFirst.identity.id).toBe(firstSyntheticRevision.rulePackId);
		expect(selectedSecond.identity.id).toBe(secondSyntheticRevision.rulePackId);
		expect(selectedFirst.identity.compiledPackSha256).not.toBe(
			selectedSecond.identity.compiledPackSha256,
		);
	});

	test("rejects an unknown revision", async () => {
		const registry = createRulePackRevisionRegistry({
			moduleId,
			revisions: [],
		});

		await expect(
			registry.select(parseRulePackId("itr1-ay2026-27.2099-03-03")),
		).rejects.toThrow("Unknown rule-pack revision");
	});

	test("rejects duplicate revision identities at construction time", async () => {
		const first = await createSyntheticRulePack(firstSyntheticRevision);
		const entry = Object.freeze({
			identity: first.identity,
			load: async () => first,
		});

		expect(() =>
			createRulePackRevisionRegistry({
				moduleId,
				revisions: [entry, entry],
			}),
		).toThrow("Duplicate rule-pack revision in registry");
	});
});
