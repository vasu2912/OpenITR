import {
	parseFactKey,
	parseAssessmentYear,
	parseDocumentKind,
	parseFinancialYear,
	parseIsoTimestamp,
	parseExactMoney,
	parseQuestionId,
	parseRuleId,
	parseRulePackId,
	parseSha256Digest,
	parseSourceId,
	parseTaxFormId,
} from "@openitr/model";
import type {
	AnalysisScopeCatalog,
	RulePackIdentity,
	ScopeFact,
	ScopeFactValue,
	ScopeRule,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	deriveItr1AnalysisScopeFacts,
	evaluateItr1AnalysisScope,
	itr1EstimateIsBlockedByScopeFacts,
	parseItr1ScopeQuestionAnswer,
} from "./scope-analysis";
import { itr1Ay202627CompiledRulePack20260903 } from "./revisions/2026-09-03/rule-pack";

const packIdentity: RulePackIdentity = {
	id: parseRulePackId("test-ay2026-27.2026-09-03"),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	revision: "2026-09-03",
	officialSourceRevisionIds: [parseSourceId("test-source")],
	sourceManifestSha256: parseSha256Digest("a1".repeat(32)),
	compiledPackSha256: parseSha256Digest("b2".repeat(32)),
	minimumEngineContractVersion: "1",
};

const rule = (condition: ScopeRule["condition"]): ScopeRule => ({
	id: parseRuleId("TEST-SCOPE-RULE"),
	factKey: parseFactKey("scope.test-fact"),
	condition,
	citation: {
		id: parseRuleId("TEST-SCOPE-RULE"),
		citation: "Test source, section 1",
		sourceId: parseSourceId("test-source"),
		sourceUrl: "https://fixture.openitr.test/source.pdf",
		sourceLocation: "Test source, section 1",
	},
	supportedTitle: "Supported",
	supportedExplanation: "The condition is inside the analysis envelope.",
	unsupportedTitle: "Outside scope",
	unsupportedExplanation: "The condition is outside the analysis envelope.",
	unknownExplanation: "This exact fact is still needed.",
	blockedExplanation: "The fact cannot be evaluated safely.",
	recoveryAction: "Review the evidence or answer the question.",
});

const catalog = (condition: ScopeRule["condition"]): AnalysisScopeCatalog => ({
	facts: [
		{
			key: parseFactKey("scope.test-fact"),
			label: "Test fact",
			schema: { kind: "boolean" },
		},
	],
	rules: [rule(condition)],
	questions: [],
	documentExpectations: [],
	educationalLimitations: ["This is an educational analysis only."],
});

const known = (fact: ScopeFact): ScopeFact => fact;

describe("ITR-1 executable analysis scope", () => {
	const fullCatalog = itr1Ay202627CompiledRulePack20260903.analysisScope;
	if (fullCatalog === undefined) {
		throw new Error("The 2026-09-03 revision must publish a full scope catalog");
	}
	const expectedFactKeys = [
		"scope.taxpayer-is-individual",
		"scope.taxpayer-resident-other-than-rnor",
		"scope.total-income",
		"scope.house-property-count",
		"scope.section112a-ltcg",
		"scope.other-capital-gains",
		"scope.agriculture-income",
		"scope.salary-pension-income",
		"scope.bank-interest-income",
		"scope.allowed-other-sources-income",
		"scope.business-profession-income",
		"scope.lottery-income",
		"scope.racehorse-income",
		"scope.special-rate-115bbda-income",
		"scope.special-rate-115bbe-income",
		"scope.special-rate-online-games-income",
		"scope.special-rate-vda-income",
		"scope.other-special-rate-income-excluding-112a",
		"scope.company-director",
		"scope.unlisted-equity-held",
		"scope.foreign-assets-interest",
		"scope.foreign-signing-authority",
		"scope.foreign-source-income",
		"scope.tds-section-194n",
		"scope.deferred-esop-tax",
		"scope.brought-forward-losses",
		"scope.carry-forward-losses",
		"scope.other-source-loss",
		"scope.section5a-apportionment",
		"scope.foreign-tax-relief",
		"scope.other-source-deductions",
		"scope.other-person-tds",
	] as const;
	const expectedRuleIds = [
		"ITR1-SCOPE-INDIVIDUAL",
		"ITR1-SCOPE-RESIDENT-OTHER-THAN-RNOR",
		"ITR1-SCOPE-TOTAL-INCOME-50-LAKH",
		"ITR1-SCOPE-HOUSE-PROPERTIES",
		"ITR1-SCOPE-SECTION-112A-LTCG",
		"ITR1-SCOPE-OTHER-CAPITAL-GAINS",
		"ITR1-SCOPE-AGRICULTURE",
		"ITR1-SCOPE-BUSINESS-PROFESSION",
		"ITR1-SCOPE-LOTTERY",
		"ITR1-SCOPE-RACEHORSE",
		"ITR1-SCOPE-115BBDA",
		"ITR1-SCOPE-115BBE",
		"ITR1-SCOPE-ONLINE-GAMES",
		"ITR1-SCOPE-VDA",
		"ITR1-SCOPE-OTHER-SPECIAL-RATE",
		"ITR1-SCOPE-COMPANY-DIRECTOR",
		"ITR1-SCOPE-UNLISTED-EQUITY",
		"ITR1-SCOPE-FOREIGN-ASSETS",
		"ITR1-SCOPE-FOREIGN-SIGNING",
		"ITR1-SCOPE-FOREIGN-INCOME",
		"ITR1-SCOPE-194N",
		"ITR1-SCOPE-DEFERRED-ESOP",
		"ITR1-SCOPE-BROUGHT-FORWARD-LOSSES",
		"ITR1-SCOPE-CARRY-FORWARD-LOSSES",
		"ITR1-SCOPE-OTHER-SOURCE-LOSS",
		"ITR1-SCOPE-SECTION-5A",
		"ITR1-SCOPE-FOREIGN-TAX-RELIEF",
		"ITR1-SCOPE-OTHER-SOURCE-DEDUCTIONS",
		"ITR1-SCOPE-OTHER-PERSON-TDS",
	] as const;

	test("keeps the approved fact and rule inventory explicit", () => {
		expect(fullCatalog.facts.map((fact) => String(fact.key))).toEqual(expectedFactKeys);
		expect(fullCatalog.rules.map((rule) => String(rule.id))).toEqual(expectedRuleIds);
		expect(fullCatalog.questions.map((question) => String(question.id))).toContain("scope-other-sources");
		expect(fullCatalog.questions.find((question) => question.id === "scope-salary-pension")?.requiresRuleId).toBeUndefined();
	});

	const attestedFactsFor = (
		overrides: Readonly<Record<string, ScopeFact["state"] | ScopeFactValue>> = {},
	): ScopeFact[] =>
		fullCatalog.facts.map((fact) => {
			const override = overrides[String(fact.key)];
			const value: ScopeFactValue =
				override !== undefined && typeof override === "object"
					? override.kind === "exact-money"
						? { ...override, value: parseExactMoney(override.value) }
						: override
					: fact.schema.kind === "boolean"
						? { kind: "boolean" as const, value: String(fact.key) === "scope.taxpayer-is-individual" || String(fact.key) === "scope.taxpayer-resident-other-than-rnor" }
						: fact.schema.kind === "exact-money"
							? { kind: "exact-money" as const, value: parseExactMoney("0") }
							: { kind: "whole-number" as const, value: 2 };
			return {
				factKey: fact.key,
				state: "known",
				value,
				origin: {
					kind: "attested-answer",
					questionId: parseQuestionId("scope-test-question"),
					questionRevision: packIdentity.revision,
					answeredAt: parseIsoTimestamp("2026-09-03T00:00:00.000Z"),
					rulePackId: packIdentity.id,
				},
			} satisfies ScopeFact;
		});

	test("evaluates every approved boundary with exact threshold semantics", () => {
		const evaluate = (overrides: Readonly<Record<string, ScopeFact["state"] | ScopeFactValue>>) =>
			evaluateItr1AnalysisScope({ catalog: fullCatalog, rulePackIdentity: packIdentity, facts: attestedFactsFor(overrides) });
		const decision = (id: string, evaluation: ReturnType<typeof evaluate>) => evaluation.decisions.find((candidate) => String(candidate.rule.id) === id);
		for (const [amount, expected] of [["4999999.99", "supported"], ["5000000", "supported"], ["5000000.01", "unsupported"]] as const) {
			expect(decision("ITR1-SCOPE-TOTAL-INCOME-50-LAKH", evaluate({ "scope.total-income": { kind: "exact-money", value: parseExactMoney(amount) } }))?.kind).toBe(expected);
		}
		for (const [amount, expected] of [["124999.99", "supported"], ["125000", "supported"], ["125000.01", "unsupported"]] as const) {
			expect(decision("ITR1-SCOPE-SECTION-112A-LTCG", evaluate({ "scope.section112a-ltcg": { kind: "exact-money", value: parseExactMoney(amount) } }))?.kind).toBe(expected);
		}
		for (const [amount, expected] of [["4999.99", "supported"], ["5000", "supported"], ["5000.01", "unsupported"]] as const) {
			expect(decision("ITR1-SCOPE-AGRICULTURE", evaluate({ "scope.agriculture-income": { kind: "exact-money", value: parseExactMoney(amount) } }))?.kind).toBe(expected);
		}
		for (const [count, expected] of [[0, "supported"], [1, "supported"], [2, "supported"], [3, "unsupported"]] as const) {
			expect(decision("ITR1-SCOPE-HOUSE-PROPERTIES", evaluate({ "scope.house-property-count": { kind: "whole-number", value: count } }))?.kind).toBe(expected);
		}
		expect(decision("ITR1-SCOPE-INDIVIDUAL", evaluate({ "scope.taxpayer-is-individual": { kind: "boolean", value: false } }))?.kind).toBe("unsupported");
		expect(decision("ITR1-SCOPE-RESIDENT-OTHER-THAN-RNOR", evaluate({ "scope.taxpayer-resident-other-than-rnor": { kind: "boolean", value: false } }))?.kind).toBe("unsupported");
		const excludedFactRules = [
			["scope.other-capital-gains", "ITR1-SCOPE-OTHER-CAPITAL-GAINS"],
			["scope.business-profession-income", "ITR1-SCOPE-BUSINESS-PROFESSION"],
			["scope.lottery-income", "ITR1-SCOPE-LOTTERY"],
			["scope.racehorse-income", "ITR1-SCOPE-RACEHORSE"],
			["scope.special-rate-115bbda-income", "ITR1-SCOPE-115BBDA"],
			["scope.special-rate-115bbe-income", "ITR1-SCOPE-115BBE"],
			["scope.special-rate-online-games-income", "ITR1-SCOPE-ONLINE-GAMES"],
			["scope.special-rate-vda-income", "ITR1-SCOPE-VDA"],
			["scope.other-special-rate-income-excluding-112a", "ITR1-SCOPE-OTHER-SPECIAL-RATE"],
			["scope.company-director", "ITR1-SCOPE-COMPANY-DIRECTOR"],
			["scope.unlisted-equity-held", "ITR1-SCOPE-UNLISTED-EQUITY"],
			["scope.foreign-assets-interest", "ITR1-SCOPE-FOREIGN-ASSETS"],
			["scope.foreign-signing-authority", "ITR1-SCOPE-FOREIGN-SIGNING"],
			["scope.foreign-source-income", "ITR1-SCOPE-FOREIGN-INCOME"],
			["scope.tds-section-194n", "ITR1-SCOPE-194N"],
			["scope.deferred-esop-tax", "ITR1-SCOPE-DEFERRED-ESOP"],
			["scope.brought-forward-losses", "ITR1-SCOPE-BROUGHT-FORWARD-LOSSES"],
			["scope.carry-forward-losses", "ITR1-SCOPE-CARRY-FORWARD-LOSSES"],
			["scope.other-source-loss", "ITR1-SCOPE-OTHER-SOURCE-LOSS"],
			["scope.section5a-apportionment", "ITR1-SCOPE-SECTION-5A"],
			["scope.foreign-tax-relief", "ITR1-SCOPE-FOREIGN-TAX-RELIEF"],
			["scope.other-source-deductions", "ITR1-SCOPE-OTHER-SOURCE-DEDUCTIONS"],
			["scope.other-person-tds", "ITR1-SCOPE-OTHER-PERSON-TDS"],
		] as const;
		for (const [key, ruleId] of excludedFactRules) {
			expect(decision(ruleId, evaluate({ [key]: { kind: "boolean", value: true } }))?.kind).toBe("unsupported");
		}
		expect(decision("ITR1-SCOPE-SECTION-112A-LTCG", evaluate({ "scope.section112a-ltcg": { kind: "exact-money", value: parseExactMoney("125000") }, "scope.other-special-rate-income-excluding-112a": { kind: "boolean", value: false } }))?.kind).toBe("supported");
	});

	test("pins every scope decision to its compiled rule and official source", () => {
		const compiled = itr1Ay202627CompiledRulePack20260903;
		for (const scopeRule of fullCatalog.rules) {
			const citation = compiled.ruleCitations[scopeRule.id];
			expect(citation).toMatchObject({
				id: scopeRule.id,
				citation: scopeRule.citation.citation,
				sourceUrl: scopeRule.citation.sourceUrl,
			});
		}
		const evaluation = evaluateItr1AnalysisScope({ catalog: fullCatalog, rulePackIdentity: compiled.identity, facts: [] });
		for (const decision of evaluation.decisions) {
			expect(decision.rulePackIdentity).toEqual(compiled.identity);
			expect(decision.rule.sourceId).toBeTruthy();
			expect(decision.rule.sourceLocation).toBeTruthy();
		}
	});

	test("keeps malformed answers at the typed input boundary", () => {
		const question = fullCatalog.questions.find((candidate) => candidate.id === "scope-total-income");
		if (question === undefined) throw new Error("scope-total-income question missing");
		expect(() => parseItr1ScopeQuestionAnswer({ question, rawValue: "not-money", answeredAt: "2026-09-03T00:00:00.000Z", rulePackIdentity: packIdentity })).toThrow();
	});

	test("preserves conflicting fact candidates and observation provenance", () => {
		const factKey = parseFactKey("scope.test-fact");
		const left: ScopeFact = {
			factKey,
			state: "known",
			value: { kind: "boolean", value: true },
			origin: { kind: "observation", sourceId: parseSourceId("test-source"), sourceDocumentId: parseSha256Digest("c3".repeat(32)), location: "page 1" },
		};
		const right: ScopeFact = { ...left, value: { kind: "boolean", value: false }, origin: { kind: "observation", sourceId: parseSourceId("test-source"), sourceDocumentId: parseSha256Digest("d4".repeat(32)), location: "page 2" } };
		const evaluation = evaluateItr1AnalysisScope({ catalog: catalog({ kind: "must-be-true" }), rulePackIdentity: packIdentity, facts: [left, right] });
		expect(evaluation.decisions[0]?.fact).toMatchObject({ state: "blocked", sourceReferences: [{ location: "page 1" }, { location: "page 2" }] });
		expect(evaluation.decisions[0]?.fact).toHaveProperty("conflictingFacts", [left, right]);
	});

	test("uses composition and evidence state for the tailored checklist", () => {
		const checklistCatalog: AnalysisScopeCatalog = {
			facts: [
				{ key: parseFactKey("scope.salary"), label: "salary", schema: { kind: "exact-money", minimumWholeRupees: 0, maximumWholeRupees: null } },
				{ key: parseFactKey("scope.bank-interest"), label: "bank interest", schema: { kind: "exact-money", minimumWholeRupees: 0, maximumWholeRupees: null } },
				{ key: parseFactKey("scope.properties"), label: "properties", schema: { kind: "whole-number", minimum: 0, maximum: null } },
			],
			rules: [],
			questions: [],
			documentExpectations: [
				{ id: "salary-doc", label: "Salary evidence", documentKinds: [parseDocumentKind("form16-pdf")], factKeys: [parseFactKey("scope.salary")], parserSupport: "supported", purpose: "Review every employer." },
				{ id: "bank-doc", label: "Bank evidence", documentKinds: [parseDocumentKind("ais-json")], factKeys: [parseFactKey("scope.bank-interest")], parserSupport: "expected-only", purpose: "Review bank interest." },
				{ id: "property-doc", label: "Property evidence", documentKinds: [parseDocumentKind("prefilled-itr1-json")], factKeys: [parseFactKey("scope.properties")], parserSupport: "expected-only", purpose: "Review included properties." },
			],
			educationalLimitations: ["Educational analysis only."],
		};
		const evaluateChecklist = (facts: ScopeFact[]) => evaluateItr1AnalysisScope({ catalog: checklistCatalog, rulePackIdentity: packIdentity, facts });
		const origin = { kind: "attested-answer" as const, questionId: parseQuestionId("scope-test-question"), questionRevision: packIdentity.revision, answeredAt: parseIsoTimestamp("2026-09-03T00:00:00.000Z"), rulePackId: packIdentity.id };
		const knownAmount = (key: string, amount: string): ScopeFact => ({ factKey: parseFactKey(key), state: "known", value: { kind: "exact-money", value: parseExactMoney(amount) }, origin });
		const knownCount = (count: number): ScopeFact => ({ factKey: parseFactKey("scope.properties"), state: "known", value: { kind: "whole-number", value: count }, origin });
		expect(evaluateChecklist([knownAmount("scope.salary", "100")]).checklist).toEqual([expect.objectContaining({ id: "salary-doc", status: "needed" }), expect.objectContaining({ id: "bank-doc", status: "needed" }), expect.objectContaining({ id: "property-doc", status: "needed" })]);
		expect(evaluateChecklist([knownAmount("scope.salary", "100"), knownAmount("scope.bank-interest", "0"), knownCount(0)]).checklist).toEqual([expect.objectContaining({ id: "salary-doc", status: "needed" })]);
		expect(evaluateChecklist([knownAmount("scope.salary", "100"), knownCount(2)]).checklist).toEqual([expect.objectContaining({ id: "salary-doc", status: "needed" }), expect.objectContaining({ id: "bank-doc", status: "needed" }), expect.objectContaining({ id: "property-doc", status: "needed" })]);
	});

	test("uses presence questions for composition without collecting aggregate totals", () => {
		expect(fullCatalog.facts.find((fact) => fact.key === parseFactKey("scope.salary-pension-income"))?.schema).toEqual({ kind: "boolean" });
		expect(fullCatalog.facts.find((fact) => fact.key === parseFactKey("scope.bank-interest-income"))?.schema).toEqual({ kind: "boolean" });
		expect(fullCatalog.facts.find((fact) => fact.key === parseFactKey("scope.allowed-other-sources-income"))?.schema).toEqual({ kind: "boolean" });
		for (const id of ["scope-salary-pension", "scope-bank-interest", "scope-other-sources"]) {
			expect(fullCatalog.questions.find((question) => question.id === id)?.answerSchema).toEqual({ kind: "boolean" });
		}
	});

	test("blocks a generic estimate while permitted non-bank other-source presence is unresolved", () => {
		expect(itr1EstimateIsBlockedByScopeFacts([])).toBe(true);
	});

	test("derives bank-interest presence in the tax module from legacy facts without losing categories", () => {
		const savings = parseFactKey("bank-interest.savings-account");
		const deposits = parseFactKey("bank-interest.deposits");
		const scopeBank = parseFactKey("scope.bank-interest-income");
		const derived = deriveItr1AnalysisScopeFacts({
			baseFacts: [],
			acceptedFacts: [{ factKey: savings, value: parseExactMoney("100") }],
			attestedFacts: [{ factKey: deposits, value: parseExactMoney("25") }],
			rulePackId: packIdentity.id,
		});
		expect(derived).toContainEqual(expect.objectContaining({
			factKey: scopeBank,
			state: "known",
			value: { kind: "boolean", value: true },
			origin: { kind: "derived", ruleId: "ITR1-INTEREST-INCOME-SECTION-56", inputFactKeys: [savings, deposits], rulePackId: packIdentity.id },
		}));
	});

	test("keeps one zero legacy interest category unresolved until the other category is known", () => {
		const derived = deriveItr1AnalysisScopeFacts({
			baseFacts: [],
			acceptedFacts: [{ factKey: parseFactKey("bank-interest.savings-account"), value: parseExactMoney("0") }],
			attestedFacts: [],
			rulePackId: packIdentity.id,
		});
		expect(derived).not.toContainEqual(expect.objectContaining({ factKey: parseFactKey("scope.bank-interest-income") }));
	});

	test("does not let a zero accepted account hide another positive accepted account", () => {
		const derived = deriveItr1AnalysisScopeFacts({
			baseFacts: [],
			acceptedFacts: [
				{ factKey: parseFactKey("bank-interest.savings-account"), value: parseExactMoney("0") },
				{ factKey: parseFactKey("bank-interest.savings-account"), value: parseExactMoney("100") },
				{ factKey: parseFactKey("bank-interest.deposits"), value: parseExactMoney("0") },
			],
			attestedFacts: [],
			rulePackId: packIdentity.id,
		});
		expect(derived).toContainEqual(expect.objectContaining({
			factKey: parseFactKey("scope.bank-interest-income"),
			state: "known",
			value: { kind: "boolean", value: true },
		}));
	});

	test("allows both all-account zero attestations to establish no bank interest", () => {
		const derived = deriveItr1AnalysisScopeFacts({
			baseFacts: [],
			acceptedFacts: [],
			attestedFacts: [
				{ factKey: parseFactKey("bank-interest.savings-account"), value: parseExactMoney("0") },
				{ factKey: parseFactKey("bank-interest.deposits"), value: parseExactMoney("0") },
			],
			rulePackId: packIdentity.id,
		});
		expect(derived).toContainEqual(expect.objectContaining({
			factKey: parseFactKey("scope.bank-interest-income"),
			state: "known",
			value: { kind: "boolean", value: false },
		}));
	});

	test("blocks an explicit No that conflicts with accepted positive bank evidence", () => {
		const scopeBank = parseFactKey("scope.bank-interest-income");
		const explicit: ScopeFact = {
			factKey: parseFactKey("scope.bank-interest-income"),
			state: "known",
			value: { kind: "boolean", value: false },
			origin: {
				kind: "attested-answer",
				questionId: parseQuestionId("scope-bank-interest"),
				questionRevision: packIdentity.revision,
				answeredAt: parseIsoTimestamp("2026-09-03T00:00:00.000Z"),
				rulePackId: packIdentity.id,
			},
		};
		const derived = deriveItr1AnalysisScopeFacts({
			baseFacts: [explicit],
			acceptedFacts: [{ factKey: parseFactKey("bank-interest.savings-account"), value: parseExactMoney("100") }],
			attestedFacts: [{ factKey: parseFactKey("bank-interest.deposits"), value: parseExactMoney("25") }],
			rulePackId: packIdentity.id,
		});
		expect(derived).toEqual([
			expect.objectContaining({
				factKey: scopeBank,
				state: "blocked",
				conflictingFacts: [
					explicit,
					expect.objectContaining({
						factKey: scopeBank,
						state: "known",
						value: { kind: "boolean", value: true },
						origin: expect.objectContaining({ kind: "derived" }),
					}),
				],
			}),
		]);
	});

	test("does not retain a stale derived bank-interest presence after source facts disappear", () => {
		const stale: ScopeFact = {
			factKey: parseFactKey("scope.bank-interest-income"),
			state: "known",
			value: { kind: "boolean", value: true },
			origin: {
				kind: "derived",
				ruleId: parseRuleId("ITR1-INTEREST-INCOME-SECTION-56"),
				inputFactKeys: [parseFactKey("bank-interest.savings-account")],
				rulePackId: packIdentity.id,
			},
		};
		const derived = deriveItr1AnalysisScopeFacts({
			baseFacts: [stale],
			acceptedFacts: [],
			attestedFacts: [],
			rulePackId: packIdentity.id,
		});
		expect(derived).toEqual([]);
	});
	test("reports an unresolved fact as unknown and names its exact key", () => {
		const evaluation = evaluateItr1AnalysisScope({
			catalog: catalog({ kind: "must-be-true" }),
			rulePackIdentity: packIdentity,
			facts: [],
		});

		expect(evaluation.kind).toBe("unknown");
		expect(evaluation.decisions[0]).toMatchObject({
			kind: "unknown",
			factKey: "scope.test-fact",
			fact: { state: "unknown", factKey: "scope.test-fact" },
			rulePackIdentity: packIdentity,
		});
		expect(evaluation.questions).toEqual([]);
	});

	test("preserves a known attested fact origin on a supported decision", () => {
		const fact = known({
			factKey: parseFactKey("scope.test-fact"),
			state: "known",
			value: { kind: "boolean", value: true },
			origin: {
				kind: "attested-answer",
				questionId: parseQuestionId("scope-test-question"),
				questionRevision: "2026-09-03",
				answeredAt: parseIsoTimestamp("2026-09-03T00:00:00.000Z"),
				rulePackId: packIdentity.id,
			},
		});
		const evaluation = evaluateItr1AnalysisScope({
			catalog: catalog({ kind: "must-be-true" }),
			rulePackIdentity: packIdentity,
			facts: [fact],
		});

		expect(evaluation.kind).toBe("supported");
		expect(evaluation.decisions[0]?.fact).toEqual(fact);
		expect(evaluation.decisions[0]?.rulePackIdentity).toEqual(packIdentity);
	});

	test("reports an explicitly unsupported fact separately from unknown", () => {
		const evaluation = evaluateItr1AnalysisScope({
			catalog: catalog({ kind: "must-be-true" }),
			rulePackIdentity: packIdentity,
			facts: [
				{
					factKey: parseFactKey("scope.test-fact"),
					state: "known",
					value: { kind: "boolean", value: false },
					origin: {
						kind: "observation",
						sourceId: parseSourceId("test-source"),
						sourceDocumentId: parseSha256Digest("c3".repeat(32)),
						location: "page 1",
					},
				},
			],
		});

		expect(evaluation.kind).toBe("unsupported");
		expect(evaluation.decisions[0]?.kind).toBe("unsupported");
	});

	test("reports unavailable evidence as blocked", () => {
		const evaluation = evaluateItr1AnalysisScope({
			catalog: catalog({ kind: "must-be-true" }),
			rulePackIdentity: packIdentity,
			facts: [
				{
					factKey: parseFactKey("scope.test-fact"),
					state: "blocked",
					reason: "The selected source is not available.",
					sourceReferences: [],
				},
			],
		});

		expect(evaluation.kind).toBe("blocked");
		expect(evaluation.decisions[0]?.kind).toBe("blocked");
	});
});
