import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack } from "./rule-pack";

describe("ITR-1 AY 2026-27 rule pack", () => {
	test("is immutable at runtime", () => {
		expect({
			pack: Object.isFrozen(itr1Ay202627RulePack),
			identity: Object.isFrozen(itr1Ay202627RulePack.identity),
			sources: Object.isFrozen(itr1Ay202627RulePack.officialSources),
			question: Object.isFrozen(itr1Ay202627RulePack.question),
			answers: Object.isFrozen(itr1Ay202627RulePack.question.answers),
		}).toEqual({
			pack: true,
			identity: true,
			sources: true,
			question: true,
			answers: true,
		});
	});
});
