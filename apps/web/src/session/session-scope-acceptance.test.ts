import {
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm16APdfFixture,
	createForm26AsTextFixture,
	createPrefilledItr1JsonFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { itr1Ay202627RulePack20260906 as pack } from "@openitr/itr1-ay2026-27";
import { afterEach, describe, expect, test } from "vitest";

import { inProcessInspectionFacility } from "./in-process-inspection-facility";
import { createSessionOrchestrator } from "./session-orchestrator";
import type { SessionOrchestrator } from "./session-orchestrator";

const answerTime = "2099-01-01T00:00:00.000Z";
const sessions: SessionOrchestrator[] = [];
afterEach(() => {
	for (const session of sessions) session.stop();
	sessions.length = 0;
});

const start = (answer: "yes" | "no" = "yes"): SessionOrchestrator => {
	const session = createSessionOrchestrator({ rulePack: pack, documents: inProcessInspectionFacility() });
	sessions.push(session);
	session.send({ kind: "answer-eligibility-question", questionId: pack.question.id, answer, executionContext: { answerTime } });
	return session;
};

const answer = ({ session, questionId, value }: Readonly<{ session: SessionOrchestrator; questionId: string; value: string }>): void => {
	session.send({ kind: "answer-analysis-scope-question", questionId, value, executionContext: { answerTime } });
};

const completeScope = ({
	session,
	overrides = {},
}: Readonly<{ session: SessionOrchestrator; overrides?: Readonly<Record<string, string>> }>): void => {
	if (pack.analysisScope === undefined) throw new Error("Complete scope catalog missing");
	for (const question of pack.analysisScope.questions) {
		if (question.requiresRuleId === undefined) continue;
		const value = question.id === "scope-individual" || question.id === "scope-resident-other-than-rnor"
			? "yes"
			: question.answerSchema.kind === "boolean" ? "no"
				: question.id === "scope-total-income" ? "900000" : "0";
		answer({ session, questionId: question.id, value: overrides[question.id] ?? value });
	}
};

const scopeOf = (session: SessionOrchestrator) => {
	const snapshot = session.getSnapshot();
	if (snapshot.kind === "awaiting-scope-answer" || snapshot.analysisScope === undefined) {
		throw new Error("Expected complete scope evaluation");
	}
	return snapshot.analysisScope;
};

const documentsOf = (session: SessionOrchestrator) => {
	const snapshot = session.getSnapshot();
	if (snapshot.kind !== "document-intake") throw new Error("Expected document intake");
	return snapshot;
};

const select = ({ session, displayName, bytes }: Readonly<{ session: SessionOrchestrator; displayName: string; bytes: Uint8Array<ArrayBuffer> }>): void => {
	session.send({ kind: "select-source-documents", documents: [{ displayName, readBytes: () => Promise.resolve(bytes) }] });
};

const waitForExtractions = async ({ session, count }: Readonly<{ session: SessionOrchestrator; count: number }>): Promise<void> => {
	await expect.poll(() => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake" && snapshot.extractions.length === count && snapshot.extractions.every((record) => record.status === "done");
	}, { timeout: 10_000 }).toBe(true);
};

const selectSalaryAndCredits = async (session: SessionOrchestrator): Promise<void> => {
	select({ session, displayName: "synthetic-salary.pdf", bytes: createForm16SalaryPdfFixture() });
	select({ session, displayName: "synthetic-credits.txt", bytes: utf8Bytes(createForm26AsTextFixture()) });
	await waitForExtractions({ session, count: 2 });
};

const answerBankAmount = ({ session, questionId, value }: Readonly<{ session: SessionOrchestrator; questionId: string; value: string }>): void => {
	session.send({ kind: "answer-missing-fact-question", questionId, value, executionContext: { answerTime } });
};

describe("complete scope through the public session workflow", () => {
	test("does not read documents while the complete scope is still unknown", async () => {
		const session = start();
		let reads = 0;
		session.send({ kind: "select-source-documents", documents: [{
			displayName: "synthetic-credits.txt",
			readBytes: () => { reads += 1; return Promise.resolve(utf8Bytes(createForm26AsTextFixture())); },
		}] });
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(reads).toBe(0);
		expect(session.getSnapshot().kind).toBe("scope-check-complete");
		expect(scopeOf(session).kind).toBe("unknown");
	});

	test("does not infer a residence fact from No to a combined individual/residence question", () => {
		const session = start("no");
		const residence = scopeOf(session).decisions.find((decision) => decision.factKey === "scope.taxpayer-resident-other-than-rnor");
		// No can mean a non-individual taxpayer. It does not prove non-residence.
		expect(residence?.fact.state).toBe("unknown");
	});

	test("recomputes retained evidence when an exclusion is corrected", async () => {
		const session = start();
		completeScope({ session });
		await selectSalaryAndCredits(session);
		expect(documentsOf(session).salaryComputation?.kind).toBe("computed");
		const extractions = documentsOf(session).extractions;
		answerBankAmount({ session, questionId: "bank-interest-savings-account-total", value: "0" });
		answer({ session, questionId: "scope-company-director", value: "yes" });
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(scopeOf(session).kind).toBe("unsupported");
		expect(documentsOf(session).salaryComputation).toBeUndefined();
		expect(documentsOf(session).estimateComputation).toBeUndefined();
		expect(documentsOf(session).extractions).toEqual(extractions);
		answer({ session, questionId: "scope-company-director", value: "no" });
		await expect.poll(() => documentsOf(session).salaryComputation?.kind).toBe("computed");
		expect(scopeOf(session).kind).toBe("supported");
		expect(documentsOf(session).extractions).toEqual(extractions);
	});

	test("uses corrected individual and residence facts instead of a superseded initial No", async () => {
		const session = start("no");
		completeScope({ session });
		await selectSalaryAndCredits(session);
		expect(scopeOf(session).kind).toBe("supported");
		const corrected = documentsOf(session).salaryComputation;
		expect(corrected?.kind).toBe("computed");
		const original = start();
		completeScope({ session: original });
		await selectSalaryAndCredits(original);
		const baseline = documentsOf(original).salaryComputation;
		expect(baseline?.kind).toBe("computed");
		if (corrected?.kind === "computed" && baseline?.kind === "computed") {
			expect(corrected.summary).toEqual(baseline.summary);
		}
	});

	test("late document completion cannot restore computations after an exclusion answer", async () => {
		const session = start();
		completeScope({ session });
		let releaseRead: (bytes: Uint8Array<ArrayBuffer>) => void = () => { throw new Error("Read promise not initialized"); };
		const delayedBytes = new Promise<Uint8Array<ArrayBuffer>>((resolve) => { releaseRead = resolve; });
		session.send({ kind: "select-source-documents", documents: [{ displayName: "synthetic-salary.pdf", readBytes: () => delayedBytes }] });
		answer({ session, questionId: "scope-company-director", value: "yes" });
		releaseRead(createForm16SalaryPdfFixture());
		await waitForExtractions({ session, count: 1 });
		expect(scopeOf(session).kind).toBe("unsupported");
		expect(documentsOf(session).salaryComputation).toBeUndefined();
		expect(documentsOf(session).estimateComputation).toBeUndefined();
	});

	test.each([
		["scope-section112a-ltcg", "1"],
		["scope-agriculture", "1"],
	])("does not present a complete estimate for unimplemented %s income", async (questionId, value) => {
		const session = start();
		completeScope({ session, overrides: { [questionId]: value } });
		await selectSalaryAndCredits(session);
		answerBankAmount({ session, questionId: "bank-interest-savings-account-total", value: "0" });
		answerBankAmount({ session, questionId: "bank-interest-deposits-total", value: "0" });
		await expect.poll(() => documentsOf(session).pendingRecomputation.kind).toBe("idle");
		expect(scopeOf(session).kind).toBe("supported");
		expect(documentsOf(session).estimateComputation?.kind).not.toBe("computed");
	});

	test("analyzes one self-occupied property with a cited old/new-regime trace", async () => {
		const session = start();
		completeScope({ session, overrides: { "scope-house-property-count": "1" } });
		await selectSalaryAndCredits(session);
		let snapshot = documentsOf(session);
		expect(snapshot.housePropertyComputation).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_HOUSE_PROPERTY_OWNERSHIP_MISSING" },
		});
		expect(snapshot.questionnaire.questions.map((question) => question.id)).toContain(
			"house-property-1-owned-by-taxpayer",
		);

		for (const [questionId, value] of [
			["house-property-1-owned-by-taxpayer", "yes"],
			["house-property-1-self-occupied", "yes"],
			["house-property-1-interest", "250000"],
			["house-property-1-acquisition-or-construction", "yes"],
			["house-property-1-loan-date", "yes"],
			["house-property-1-completion-period", "yes"],
			["house-property-1-interest-certificate", "yes"],
		] as const) {
			answerBankAmount({ session, questionId, value });
		}
		snapshot = documentsOf(session);
		expect(snapshot.housePropertyComputation).toMatchObject({
			kind: "computed",
			properties: [{
				annualValue: "0",
				interestDeduction: "200000",
				income: { kind: "loss", amount: "200000" },
				newRegimeInterestDeduction: "0",
				newRegimeIncome: { kind: "income", amount: "0" },
			}],
		});
		if (snapshot.housePropertyComputation?.kind === "computed") {
			expect(snapshot.housePropertyComputation.properties[0]?.trace.map((node) => node.ruleId)).toEqual([
				"ITR1-SELF-OCCUPIED-ANNUAL-VALUE-SECTION-23",
				"ITR1-OR-SELF-OCCUPIED-INTEREST-SECTION-24B",
			]);
			expect(snapshot.housePropertyComputation.properties[0]?.newRegimeTrace[1]?.ruleId).toBe(
				"ITR1-NR-SELF-OCCUPIED-INTEREST-DISALLOWED-115BAC",
			);
		}
		expect(snapshot.factAnswers).toHaveLength(7);
		expect(snapshot.factAnswers.every((fact) => fact.origin.rulePackId === pack.identity.id)).toBe(true);
	});

	test("calculates two let-out properties and removes only one property's dependent answers", async () => {
		const session = start();
		completeScope({ session, overrides: { "scope-house-property-count": "2" } });
		await selectSalaryAndCredits(session);
		for (const propertyNumber of [1, 2] as const) {
			for (const [suffix, value] of [
				["owned-by-taxpayer", "yes"],
				["self-occupied", "no"],
				["interest", propertyNumber === 1 ? "50000" : "30000"],
				["expected-rent", "240000"],
				["actual-rent", propertyNumber === 1 ? "300000" : "180000"],
				["vacancy-reduced-rent", propertyNumber === 1 ? "no" : "yes"],
				["municipal-taxes", propertyNumber === 1 ? "20000" : "10000"],
			] as const) {
				answerBankAmount({ session, questionId: `house-property-${propertyNumber}-${suffix}`, value });
			}
		}
		let snapshot = documentsOf(session);
		expect(snapshot.housePropertyComputation).toMatchObject({
			kind: "computed",
			properties: [
				{ propertyNumber: 1, income: { kind: "income", amount: "146000" } },
				{ propertyNumber: 2, income: { kind: "income", amount: "89000" } },
			],
			combined: { kind: "income", amount: "235000" },
		});
		const owner = snapshot.factAnswers.find(
			(answer) => answer.questionId === "house-property-1-owned-by-taxpayer",
		);
		if (owner === undefined) throw new Error("Expected owner answer");
		session.send({ kind: "remove-missing-fact-answer", answerId: owner.answerId });
		snapshot = documentsOf(session);
		expect(snapshot.factAnswers.some((answer) =>
			answer.questionId.startsWith("house-property-1-") && answer.questionId !== "house-property-1-owned-by-taxpayer",
		)).toBe(false);
		expect(snapshot.factAnswers.filter((answer) => answer.questionId.startsWith("house-property-2-"))).toHaveLength(7);
		expect(snapshot.questionnaire.questions.map((question) => question.id)).toContain(
			"house-property-1-owned-by-taxpayer",
		);
	});

	test("uses accepted other-source evidence and asks only for the missing family pension", async () => {
		const session = start();
		completeScope({ session });
		answer({ session, questionId: "scope-other-sources", value: "yes" });
		select({ session, displayName: "synthetic-form16a.pdf", bytes: createForm16APdfFixture() });
		await waitForExtractions({ session, count: 1 });

		let snapshot = documentsOf(session);
		expect(
			snapshot.questionnaire.questions
				.filter((question) => question.affectedResult.resultId === "other-sources")
				.map((question) => question.id),
		).toEqual(["other-sources-family-pension"]);
		expect(snapshot.otherSourcesComputation).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_OTHER_SOURCES_FAMILY_PENSION_MISSING" },
		});

		answerBankAmount({ session, questionId: "other-sources-family-pension", value: "90000" });
		snapshot = documentsOf(session);
		expect(snapshot.otherSourcesComputation).toMatchObject({
			kind: "computed",
			categories: [
				{ kind: "dividends", amount: "25000" },
				{ kind: "other-interest", amount: "120000" },
				{ kind: "family-pension", amount: "90000" },
			],
			oldRegime: { familyPensionDeduction: "15000", total: "220000" },
			newRegime: { familyPensionDeduction: "25000", total: "210000" },
		});
		const form16a = snapshot.extractions[0];
		if (form16a?.status !== "done") throw new Error("Expected accepted Form 16A evidence");
		expect(form16a.nonSalaryIncomeObservations.map((observation) => String(observation.factKey)).sort()).toEqual([
			"non-salary-income.dividends",
			"non-salary-income.interest-other-than-securities",
		]);
		expect(snapshot.factAnswers.find((answer) => answer.factKey === "non-salary-income.family-pension")?.origin.kind).toBe("attested-answer");
		const familyPensionAnswer = snapshot.factAnswers.find((answer) => answer.factKey === "non-salary-income.family-pension");
		if (familyPensionAnswer === undefined) throw new Error("Expected family-pension answer");
		session.send({ kind: "remove-missing-fact-answer", answerId: familyPensionAnswer.answerId });
		snapshot = documentsOf(session);
		expect(snapshot.otherSourcesComputation).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_OTHER_SOURCES_FAMILY_PENSION_MISSING" },
		});
		expect(snapshot.questionnaire.questions.filter((question) => question.affectedResult.resultId === "other-sources").map((question) => question.id)).toEqual(["other-sources-family-pension"]);
	});

	test("does not repeat a bank-interest question after accepted AIS facts resolve it", async () => {
		const session = start();
		completeScope({ session });
		select({ session, displayName: "synthetic-ais.json", bytes: utf8Bytes(createAisJsonBankInterestFixture()) });
		await waitForExtractions({ session, count: 1 });
		expect(documentsOf(session).questionnaire.questions).toEqual([]);
		expect(scopeOf(session).questions.some((question) => question.factKey.includes("bank-interest"))).toBe(false);
	});

	test("does not treat one zero savings record as zero interest from every account", async () => {
		const session = start();
		completeScope({ session });
		select({ session, displayName: "synthetic-partial-ais.json", bytes: utf8Bytes(createAisJsonBankInterestFixture({ bankInterestRecords: [{
			recordCategory: "SAVINGS_ACCOUNT", institutionName: "Synthetic Bank", maskedAccountNumber: "XXXXXX0001", interestAmount: "0",
		}] })) });
		await waitForExtractions({ session, count: 1 });
		expect(documentsOf(session).questionnaire.questions.map((question) => question.id)).toContain("bank-interest-deposits-total");
		expect(scopeOf(session).questions.some((question) => question.factKey.includes("bank-interest"))).toBe(true);
	});

	test("removing the only AIS source restores its unresolved interest questions", async () => {
		const session = start();
		completeScope({ session });
		select({ session, displayName: "synthetic-ais.json", bytes: utf8Bytes(createAisJsonBankInterestFixture()) });
		await waitForExtractions({ session, count: 1 });
		expect(scopeOf(session).questions.some((question) => question.factKey === "scope.bank-interest-income")).toBe(false);
		const extraction = documentsOf(session).extractions[0];
		if (extraction === undefined) throw new Error("Expected AIS extraction");
		session.send({ kind: "remove-source-document", documentId: extraction.documentId });
		await expect.poll(() => scopeOf(session).questions.some((question) => question.factKey === "scope.bank-interest-income")).toBe(true);
		expect(documentsOf(session).questionnaire.questions).toHaveLength(2);
	});

	test("a zero account cannot hide positive interest from another accepted account", async () => {
		const session = start();
		completeScope({ session });
		select({ session, displayName: "synthetic-multiple-accounts.json", bytes: utf8Bytes(createAisJsonBankInterestFixture({ bankInterestRecords: [
			{ recordCategory: "SAVINGS_ACCOUNT", institutionName: "Synthetic Bank", maskedAccountNumber: "XXXXXX0001", interestAmount: "0" },
			{ recordCategory: "SAVINGS_ACCOUNT", institutionName: "Synthetic Bank", maskedAccountNumber: "XXXXXX0002", interestAmount: "100" },
			{ recordCategory: "DEPOSITS", institutionName: "Synthetic Bank", maskedAccountNumber: "XXXXXX0003", interestAmount: "0" },
		] })) });
		await waitForExtractions({ session, count: 1 });
		const extraction = documentsOf(session).extractions[0];
		if (extraction?.status !== "done") throw new Error("Expected completed AIS extraction");
		expect(extraction.bankInterestObservations).toHaveLength(3);
		expect(scopeOf(session).checklist).toContainEqual(expect.objectContaining({ id: "bank-interest-evidence" }));
	});

	test.each(["source-first", "answer-first"] as const)("keeps conflicting bank presence recoverable with %s input", async (order) => {
		const session = start();
		completeScope({ session });
		if (order === "answer-first") answer({ session, questionId: "scope-bank-interest", value: "no" });
		select({ session, displayName: "synthetic-ais.json", bytes: utf8Bytes(createAisJsonBankInterestFixture()) });
		await waitForExtractions({ session, count: 1 });
		if (order === "source-first") answer({ session, questionId: "scope-bank-interest", value: "no" });
		expect(scopeOf(session).unresolvedFacts).toContainEqual(expect.objectContaining({ factKey: "scope.bank-interest-income", state: "blocked" }));
		expect(scopeOf(session).questions.map((question) => question.id)).toContain("scope-bank-interest");
		const extractions = documentsOf(session).extractions;
		answer({ session, questionId: "scope-bank-interest", value: "yes" });
		expect(scopeOf(session).unresolvedFacts.some((fact) => fact.factKey === "scope.bank-interest-income")).toBe(false);
		expect(documentsOf(session).extractions).toEqual(extractions);
	});

	test("does not reject gross salary over the ceiling when supplied total income remains below it", async () => {
		const session = start();
		completeScope({ session, overrides: { "scope-total-income": "4900000" } });
		select({ session, displayName: "synthetic-prefilled.json", bytes: utf8Bytes(createPrefilledItr1JsonFixture({
			salaryInformation: { section17_1Salary: "6000000", exemptAllowancesSection10: "1050000", taxableSalaryTotal: "4950000" },
			tdsOnSalary: [],
		})) });
		await waitForExtractions({ session, count: 1 });
		expect(scopeOf(session).kind).toBe("supported");
		const computation = documentsOf(session).salaryComputation;
		expect(computation?.kind).toBe("computed");
		if (computation?.kind === "computed") expect(computation.summary.salaryTotal).toBe("6000000");
	});

	test("rejects malformed answers without changing the facts or scope result", () => {
		const session = start();
		const before = session.getSnapshot();
		for (const [questionId, value] of [
			["scope-total-income", ""], ["scope-total-income", "-1"], ["scope-total-income", "not-money"],
			["scope-house-property-count", "1.5"], ["scope-house-property-count", "9007199254740992"],
			["scope-company-director", "maybe"], ["not-a-question", "yes"],
		] as const) {
			expect(() => answer({ session, questionId, value })).toThrow();
			expect(session.getSnapshot()).toEqual(before);
		}
	});

	test("reset removes scope answers and restores missing facts under the pinned pack", () => {
		const session = start();
		completeScope({ session });
		expect(scopeOf(session).kind).toBe("supported");
		session.send({ kind: "reset" });
		expect(session.getSnapshot().kind).toBe("awaiting-scope-answer");
		session.send({ kind: "answer-eligibility-question", questionId: pack.question.id, answer: "yes", executionContext: { answerTime } });
		expect(scopeOf(session).kind).toBe("unknown");
		expect(scopeOf(session).decisions.find((decision) => decision.factKey === "scope.total-income")?.fact.state).toBe("unknown");
	});
});
