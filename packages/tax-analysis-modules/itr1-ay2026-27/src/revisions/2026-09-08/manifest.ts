import type { RulePackManifest } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260907 } from "../2026-09-07/manifest";

const rules = Object.freeze({
	exemptReporting: Object.freeze({
		id: "ITR1-AGRICULTURAL-INCOME-EXEMPT-REPORTING",
		citation:
			"Notification No. 45/2026, Form ITR-1 D20, agricultural income is exempt income reported only for reporting purposes",
		sourceId: "cbdt-notification-45-2026",
		sourceLocation: "Form ITR-1 D20, Gazette page 19",
	}),
	limit: Object.freeze({
		id: "ITR1-AGRICULTURAL-INCOME-LIMIT",
		citation:
			"CBDT e-Filing ITR 1 Validation Rules AY 2026-27, rule 29, agricultural income shown as exempt cannot exceed five thousand rupees",
		sourceId: "itr1-validation-rules-ay2026-27",
		sourceLocation: "Category A rule 29, page 6",
	}),
});

const priorScope = itr1Ay202627RulePackManifest20260907.analysisScope;
const priorConstants = itr1Ay202627RulePackManifest20260907.taxConstants;
if (priorScope === undefined || priorConstants === undefined) {
	throw new Error("The prior rule pack has no analysis scope or tax constants");
}

const agriculturePresenceFact = Object.freeze({
	key: "scope.agriculture-income-present",
	label: "agricultural-income presence",
	schema: Object.freeze({ kind: "boolean" as const }),
});

const agriculturePresenceQuestion = Object.freeze({
	id: "scope-agriculture-present",
	factKey: agriculturePresenceFact.key,
	prompt: "Did you receive any agricultural income during FY 2025-26?",
	helpText:
		"Answer Yes when evidence or your records indicate agricultural income. OpenITR asks for the amount only when this answer or accepted evidence indicates that income.",
	whyRequired:
		"This composition fact controls whether the agricultural-income amount is needed. A blank answer remains unknown and does not become zero.",
	answerSchema: Object.freeze({ kind: "boolean" as const }),
});

export const itr1Ay202627RulePackManifest20260908 = Object.freeze({
	...itr1Ay202627RulePackManifest20260907,
	rulePackId: "itr1-ay2026-27.2026-09-08",
	packRevision: "2026-09-08",
	supportedRules: Object.freeze([
		...itr1Ay202627RulePackManifest20260907.supportedRules,
		...Object.values(rules),
	]),
	missingFactQuestions: Object.freeze([
		...(itr1Ay202627RulePackManifest20260907.missingFactQuestions ?? []),
		Object.freeze({
			id: "agricultural-income-amount",
			prompt: "What was your agricultural income for FY 2025-26?",
			helpText:
				"Enter the supported amount from your records. Do not enter zero for a blank or unknown amount.",
			requiresRuleId: rules.limit.id,
			suppliesFactKey: "scope.agriculture-income",
			whyRequired:
				"The pinned ITR-1 rule permits agricultural income only up to five thousand rupees and reports the supported amount as exempt income.",
			affectedResult: Object.freeze({
				resultId: "agricultural-income",
				label: "Agricultural-income explanation",
			}),
			answerSchema: Object.freeze({
				kind: "exact-money" as const,
				minimumWholeRupees: 0,
				maximumWholeRupees: null,
			}),
			visibility: Object.freeze({ kind: "always" as const }),
		}),
	]),
	analysisScope: Object.freeze({
		...priorScope,
		facts: Object.freeze([...priorScope.facts, agriculturePresenceFact]),
		rules: Object.freeze(
			priorScope.rules.filter(
				(rule) => rule.id !== "ITR1-SCOPE-AGRICULTURE",
			),
		),
		questions: Object.freeze(
			priorScope.questions.map((question) =>
				question.id === "scope-agriculture"
					? agriculturePresenceQuestion
					: question,
			),
		),
	}),
	taxConstants: Object.freeze({
		...priorConstants,
		agriculturalIncome: Object.freeze({
			itr1LimitWholeRupees: 5_000,
			exemptReportingRuleId: rules.exemptReporting.id,
			itr1LimitRuleId: rules.limit.id,
		}),
	}),
}) satisfies RulePackManifest;
