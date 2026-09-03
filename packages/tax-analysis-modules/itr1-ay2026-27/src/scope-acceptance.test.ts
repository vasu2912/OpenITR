import { parseFactKey, parseIsoTimestamp, parseSourceId } from "@openitr/model";
import type { ScopeFact } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260826 } from "./revisions/2026-08-26/rule-pack";
import { itr1Ay202627RulePack20260903 as pack } from "./revisions/2026-09-03/rule-pack";
import { parseItr1ScopeQuestionAnswer } from "./scope-analysis";

const answerTime = parseIsoTimestamp("2099-01-01T00:00:00.000Z");
const notification = "cbdt-notification-45-2026";
const instructions = "itr1-instructions-ay2021-22";
const validation = "itr1-validation-rules-ay2026-27";
const reproducedRule12 = "itat-rule12-excerpt-dbs-2023";

type ScopeCase = Readonly<{
	ruleId: string;
	factKey: string;
	answer: string;
	sourceId: string;
	location: string;
}>;

const exclusion = ({
	suffix,
	factKey,
	sourceId,
	location,
}: Readonly<{
	suffix: string;
	factKey: string;
	sourceId: string;
	location: string;
}>): ScopeCase => ({
	ruleId: `ITR1-SCOPE-${suffix}`,
	factKey: `scope.${factKey}`,
	answer: "no",
	sourceId,
	location,
});

// This table is independent of the manifest's operator/limit definitions.
// The source review records why each of these conditions belongs in #38.
const requiredCases: readonly ScopeCase[] = [
	{ ruleId: "ITR1-SCOPE-INDIVIDUAL", factKey: "scope.taxpayer-is-individual", answer: "yes", sourceId: notification, location: "Gazette page 16" },
	{ ruleId: "ITR1-SCOPE-RESIDENT-OTHER-THAN-RNOR", factKey: "scope.taxpayer-resident-other-than-rnor", answer: "yes", sourceId: notification, location: "Gazette page 16" },
	{ ruleId: "ITR1-SCOPE-TOTAL-INCOME-50-LAKH", factKey: "scope.total-income", answer: "5000000", sourceId: notification, location: "Gazette page 18" },
	{ ruleId: "ITR1-SCOPE-HOUSE-PROPERTIES", factKey: "scope.house-property-count", answer: "2", sourceId: notification, location: "Gazette page 16" },
	{ ruleId: "ITR1-SCOPE-SECTION-112A-LTCG", factKey: "scope.section112a-ltcg", answer: "125000", sourceId: notification, location: "Gazette page 16" },
	exclusion({ suffix: "OTHER-CAPITAL-GAINS", factKey: "other-capital-gains", sourceId: instructions, location: "3B(c)" }),
	{ ruleId: "ITR1-SCOPE-AGRICULTURE", factKey: "scope.agriculture-income", answer: "5000", sourceId: notification, location: "Gazette page 16" },
	exclusion({ suffix: "BUSINESS-PROFESSION", factKey: "business-profession-income", sourceId: instructions, location: "3B(a)" }),
	exclusion({ suffix: "LOTTERY", factKey: "lottery-income", sourceId: instructions, location: "3B(d)(i)" }),
	exclusion({ suffix: "RACEHORSE", factKey: "racehorse-income", sourceId: instructions, location: "3B(d)(ii)" }),
	exclusion({ suffix: "115BBDA", factKey: "special-rate-115bbda-income", sourceId: instructions, location: "3B(d)(iii)" }),
	exclusion({ suffix: "115BBE", factKey: "special-rate-115bbe-income", sourceId: instructions, location: "3B(d)(iii)" }),
	exclusion({ suffix: "ONLINE-GAMES", factKey: "special-rate-online-games-income", sourceId: validation, location: "Category B" }),
	exclusion({ suffix: "VDA", factKey: "special-rate-vda-income", sourceId: validation, location: "Category B" }),
	exclusion({ suffix: "OTHER-SPECIAL-RATE", factKey: "other-special-rate-income-excluding-112a", sourceId: validation, location: "Category B" }),
	exclusion({ suffix: "COMPANY-DIRECTOR", factKey: "company-director", sourceId: reproducedRule12, location: "(IE)" }),
	exclusion({ suffix: "UNLISTED-EQUITY", factKey: "unlisted-equity-held", sourceId: reproducedRule12, location: "(IF)" }),
	exclusion({ suffix: "FOREIGN-ASSETS", factKey: "foreign-assets-interest", sourceId: reproducedRule12, location: "(I)" }),
	exclusion({ suffix: "FOREIGN-SIGNING", factKey: "foreign-signing-authority", sourceId: reproducedRule12, location: "(IA)" }),
	exclusion({ suffix: "FOREIGN-INCOME", factKey: "foreign-source-income", sourceId: reproducedRule12, location: "(IB)" }),
	exclusion({ suffix: "194N", factKey: "tds-section-194n", sourceId: reproducedRule12, location: "(VII)" }),
	exclusion({ suffix: "DEFERRED-ESOP", factKey: "deferred-esop-tax", sourceId: reproducedRule12, location: "(VIII)" }),
	exclusion({ suffix: "BROUGHT-FORWARD-LOSSES", factKey: "brought-forward-losses", sourceId: instructions, location: "3C(a)" }),
	exclusion({ suffix: "CARRY-FORWARD-LOSSES", factKey: "carry-forward-losses", sourceId: instructions, location: "3C(a)" }),
	exclusion({ suffix: "OTHER-SOURCE-LOSS", factKey: "other-source-loss", sourceId: instructions, location: "3C(b)" }),
	exclusion({ suffix: "SECTION-5A", factKey: "section5a-apportionment", sourceId: instructions, location: "3B(e)" }),
	exclusion({ suffix: "FOREIGN-TAX-RELIEF", factKey: "foreign-tax-relief", sourceId: reproducedRule12, location: "(II)" }),
	exclusion({ suffix: "OTHER-SOURCE-DEDUCTIONS", factKey: "other-source-deductions", sourceId: instructions, location: "3C(d)" }),
	exclusion({ suffix: "OTHER-PERSON-TDS", factKey: "other-person-tds", sourceId: reproducedRule12, location: "(IG)" }),
];

const catalog = pack.analysisScope;
const evaluate = pack.evaluateAnalysisScope;
if (catalog === undefined || evaluate === undefined) {
	throw new Error("The released scope pack must expose its complete executable catalog");
}

const answerFact = ({ factKey, answer }: Pick<ScopeCase, "factKey" | "answer">): ScopeFact => {
	const question = catalog.questions.find((candidate) => candidate.factKey === factKey);
	if (question === undefined) throw new Error(`Missing declared question for ${factKey}`);
	return parseItr1ScopeQuestionAnswer({
		question,
		rawValue: answer,
		answeredAt: answerTime,
		rulePackIdentity: pack.identity,
	});
};

const supportedFacts = (): readonly ScopeFact[] => requiredCases.map(
	({ factKey, answer }) => answerFact({ factKey, answer }),
);

describe("complete scope acceptance against the released pack", () => {
	test("supports the combined upper boundaries with unresolved checklist facts", () => {
		const result = evaluate({ facts: supportedFacts() });
		expect(result.kind).toBe("supported");
		expect(result.decisions).toHaveLength(requiredCases.length);
		expect(result.decisions.every((decision) => decision.kind === "supported")).toBe(true);
		expect(result.questions.length).toBeGreaterThan(0);
		expect(result.questions.every((question) => question.requiresRuleId === undefined)).toBe(true);
		expect(result.checklist).toEqual(expect.arrayContaining([
			expect.objectContaining({ id: "house-property-evidence", status: "needed" }),
			expect.objectContaining({ id: "section112a-evidence", status: "needed" }),
			expect.objectContaining({ id: "agriculture-evidence", status: "needed" }),
		]));
		expect(result.checklist).not.toContainEqual(expect.objectContaining({ id: "tax-payment-evidence", status: "needed" }));
	});

	test.each(requiredCases)("keeps $ruleId unknown when its fact alone is missing", ({ ruleId, factKey }) => {
		const result = evaluate({ facts: supportedFacts().filter((fact) => fact.factKey !== factKey) });
		expect(result.kind).toBe("unknown");
		const decision = result.decisions.find((candidate) => candidate.rule.id === ruleId);
		expect(decision).toMatchObject({
			kind: "unknown",
			factKey,
			fact: { state: "unknown", factKey },
			rulePackIdentity: pack.identity,
		});
		expect(decision?.explanation).toContain(factKey);
		expect(result.questions.some((question) => question.factKey === factKey)).toBe(true);
		expect(result.decisions.filter((candidate) => candidate.rule.id !== ruleId).every((candidate) => candidate.kind === "supported")).toBe(true);
	});

	describe.each(["blocked", "unsupported"] as const)("%s evidence", (state) => {
		test.each(requiredCases)("does not turn unavailable $ruleId evidence into a known exclusion", ({ ruleId, factKey, sourceId }) => {
			const reason = `The evidence for ${factKey} is ${state}; review the original source.`;
			const fact: ScopeFact = {
				factKey: parseFactKey(factKey), state, reason,
				sourceReferences: [{ sourceId: parseSourceId(sourceId), location: "Synthetic unavailable evidence, page 1" }],
			};
			const result = evaluate({ facts: [...supportedFacts().filter((candidate) => candidate.factKey !== factKey), fact] });
			expect(result.kind).toBe("blocked");
			expect(result.decisions.find((candidate) => candidate.rule.id === ruleId)).toMatchObject({
				kind: "blocked", fact, explanation: reason, rulePackIdentity: pack.identity,
			});
		});
	});

	test.each(requiredCases)("keeps the attestation and reviewed source on $ruleId", ({ ruleId, factKey, sourceId, location }) => {
		const facts = supportedFacts();
		const decision = evaluate({ facts }).decisions.find((candidate) => candidate.rule.id === ruleId);
		expect(decision?.fact).toEqual(facts.find((fact) => fact.factKey === factKey));
		expect(decision?.fact).toMatchObject({
			state: "known",
			origin: { kind: "attested-answer", answeredAt: answerTime, questionRevision: "2026-09-03", rulePackId: pack.identity.id },
		});
		expect(decision?.rulePackIdentity).toEqual(pack.identity);
		expect(decision?.rule.sourceId).toBe(sourceId);
		expect(`${decision?.rule.citation} ${decision?.rule.sourceLocation}`).toContain(location);
		const source = pack.officialSources.find((candidate) => candidate.id === sourceId);
		expect(source).toBeDefined();
		expect(decision?.rule.sourceUrl).toBe(source?.url);
		expect(pack.identity.officialSourceRevisionIds).toContain(sourceId);
		expect(decision).not.toHaveProperty("educationalLimitations");
	});

	test.each([
		[notification, "b7ca15d6ca15c16ac8ad8c62cce86bc4b50b9208bcc07370298bff8515911964"],
		[validation, "fd0e447af6c0a6ed43c29697722c4d469f42d5e7a0bad54e21bd4600803a100a"],
		[instructions, "71e97ccf824b2db33e9e4c3f2a904dae960dfb002bd0eec3c43f83b6dbb28d71"],
		[reproducedRule12, "d2b4cf8153c5c7fed9531907a75d6cf2bdce419da77488a7b8dce015d9d2a7e9"],
	])("pins the downloaded official artifact %s", (sourceId, digest) => {
		expect(pack.officialSources.find((source) => source.id === sourceId)?.contentSha256).toBe(digest);
	});

	test("retains the previously shipped identity and partial-scope contract", () => {
		expect(itr1Ay202627RulePack20260826.identity).toMatchObject({
			id: "itr1-ay2026-27.2026-08-26",
			sourceManifestSha256: "63df0accc6b324bb71463cc554ae02d434822c89c509fab20d9b2c0f99fce6cc",
			compiledPackSha256: "bea40cf3cd87f32b7d5631cc4fb828b76911d24749a62e51c9ea760986cd59fc",
		});
		expect(itr1Ay202627RulePack20260826).not.toHaveProperty("analysisScope");
		expect(itr1Ay202627RulePack20260826.evaluate({ answer: "yes", answeredAt: answerTime })).not.toHaveProperty("analysisScope");
	});

	test("leaves existing tax computations and permitted missing-fact questions unchanged", () => {
		expect(pack.taxConstants).toEqual(itr1Ay202627RulePack20260826.taxConstants);
		expect(pack.questions).toEqual(itr1Ay202627RulePack20260826.questions);
	});

	test("preserves known exclusions, missing facts, and blocked evidence in the same result", () => {
		const replacements = ["scope.company-director", "scope.total-income", "scope.house-property-count"];
		const blocked: ScopeFact = {
			factKey: parseFactKey("scope.total-income"),
			state: "blocked",
			reason: "Conflicting total-income evidence requires an explicit resolution.",
			sourceReferences: [],
		};
		const result = evaluate({ facts: [
			...supportedFacts().filter((fact) => !replacements.includes(fact.factKey)),
			answerFact({ factKey: "scope.company-director", answer: "yes" }),
			blocked,
		] });
		expect(result.kind).toBe("blocked");
		expect(result.decisions).toEqual(expect.arrayContaining([
			expect.objectContaining({ factKey: "scope.company-director", kind: "unsupported" }),
			expect.objectContaining({ factKey: "scope.house-property-count", kind: "unknown" }),
			expect.objectContaining({ factKey: "scope.total-income", kind: "blocked", fact: blocked }),
			expect.objectContaining({ factKey: "scope.taxpayer-is-individual", kind: "supported" }),
		]));
	});

	test("replays the complete result without depending on unique-fact order", () => {
		const first = evaluate({ facts: supportedFacts() });
		expect(evaluate({ facts: supportedFacts() })).toEqual(first);
		expect(evaluate({ facts: [...supportedFacts()].reverse() })).toEqual(first);
	});

	test("uses non-blocking presence questions instead of separate gross-income ceilings", () => {
		const compositionQuestions = catalog.questions.filter((question) => question.requiresRuleId === undefined);
		expect(compositionQuestions.length).toBeGreaterThan(0);
		for (const question of compositionQuestions) {
			expect(question.answerSchema.kind).toBe("boolean");
			expect(catalog.rules.some((rule) => rule.factKey === question.factKey)).toBe(false);
		}
		const facts = [...supportedFacts(), ...compositionQuestions.map((question) => answerFact({ factKey: question.factKey, answer: "yes" }))];
		expect(evaluate({ facts }).kind).toBe("supported");
	});

	test("keeps filing claims out of decision wording and limitations separate", () => {
		const scenarios = [
			supportedFacts(),
			[],
			[...supportedFacts().filter((fact) => fact.factKey !== "scope.company-director"), answerFact({ factKey: "scope.company-director", answer: "yes" })],
		];
		for (const facts of scenarios) {
			const result = evaluate({ facts });
			for (const decision of result.decisions) {
				const wording = `${decision.title} ${decision.explanation} ${decision.recoveryAction ?? ""}`;
				expect(wording).not.toMatch(/\b(?:you (?:can|may|are eligible to) file|filing[- ]ready|upload[- ]ready|portal[- ]accepted|government[- ]approved)\b/iu);
			}
			expect(result.educationalLimitations.join(" ")).toContain("not permission to file");
			expect(result.educationalLimitations.join(" ")).toContain("not an official eligibility determination");
		}
	});

	test("keeps ordinary tax-credit evidence relevant when section 194N does not apply", () => {
		const result = evaluate({ facts: [
			...supportedFacts(),
			answerFact({ factKey: "scope.salary-pension-income", answer: "yes" }),
			answerFact({ factKey: "scope.bank-interest-income", answer: "no" }),
			answerFact({ factKey: "scope.allowed-other-sources-income", answer: "no" }),
		] });
		expect(result.kind).toBe("supported");
		expect(result.checklist).toContainEqual(expect.objectContaining({ id: "tax-credit-evidence" }));
		expect(result.checklist.find((item) => item.id === "tax-credit-evidence")?.detail).toMatch(/if you made.*e-Pay Tax/i);
	});

	test("explains calculation boundaries separately from supported scope decisions", () => {
		const result = evaluate({ facts: supportedFacts() });
		expect(result.kind).toBe("supported");
		expect(result.calculationLimitations).toEqual(expect.arrayContaining([
			expect.objectContaining({ factKey: "scope.house-property-count" }),
			expect.objectContaining({ factKey: "scope.section112a-ltcg" }),
			expect.objectContaining({ factKey: "scope.agriculture-income" }),
			expect.objectContaining({ factKey: "scope.allowed-other-sources-income" }),
		]));
		for (const limitation of result.calculationLimitations) {
			expect(limitation.explanation).toContain(String(limitation.factKey));
		}
	});
});
