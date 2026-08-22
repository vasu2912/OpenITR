import { compileRulePack } from "@openitr/rulepack-compiler";
import type {
	RulePackManifest,
	ScopeRulePack,
} from "@openitr/model";

import { createScopeRulePack } from "@openitr/itr1-ay2026-27";

const SYNTHETIC_SOURCE_SHA256 = "a1".repeat(32);

const syntheticManifest = ({
	rulePackId,
	packRevision,
}: Readonly<{ rulePackId: string; packRevision: string }>): RulePackManifest => ({
	rulePackId,
	form: "ITR-1",
	financialYear: "2025-26",
	assessmentYear: "2026-27",
	packRevision,
	engineContractVersion: "1",
	officialSources: [
		{
			id: "synthetic-test-source",
			title: "Synthetic test source (never a real authority)",
			authority: "OpenITR test fixtures",
			url: "https://fixture.openitr.test/synthetic-source.pdf",
			releaseDate: "2025-12-31",
			retrievedDate: "2099-01-01",
			contentSha256: SYNTHETIC_SOURCE_SHA256,
			redistributionStatus: "not-redistributed",
		},
	],
	supportedRules: [
		{
			id: "TEST-SYNTHETIC-RULE",
			citation: `Synthetic test source (${packRevision}), section 1`,
			sourceId: "synthetic-test-source",
			sourceLocation: `Synthetic test source (${packRevision}), section 1`,
		},
	],
	scopeCheck: {
		questionId: "test-synthetic-question",
		prompt: `Synthetic question for pack revision ${packRevision}?`,
		helpText: "Synthetic help text for test fixtures.",
		requiresRuleId: "TEST-SYNTHETIC-RULE",
		suppliesFactKey: "test.synthetic-fact",
		blockingIssueCode: "RULE_TEST_SYNTHETIC_UNSUPPORTED",
		supportedResult: {
			title: `Supported by ${packRevision}`,
			explanation: `You answered Yes under synthetic pack revision ${packRevision}.`,
		},
		unsupportedResult: {
			title: `Not supported by ${packRevision}`,
			explanation: `You answered No under synthetic pack revision ${packRevision}.`,
			recoveryAction: "Synthetic recovery action.",
		},
	},
});

export const createSyntheticRulePack = ({
	rulePackId,
	packRevision,
}: Readonly<{ rulePackId: string; packRevision: string }>): Promise<ScopeRulePack> =>
	compileRulePack({
		manifest: syntheticManifest({ rulePackId, packRevision }),
	}).then((compiled) => createScopeRulePack({ compiled }));

export const firstSyntheticRevision = {
	rulePackId: "itr1-ay2026-27.2099-01-01",
	packRevision: "2099-01-01",
} as const;

export const secondSyntheticRevision = {
	rulePackId: "itr1-ay2026-27.2099-02-02",
	packRevision: "2099-02-02",
} as const;
