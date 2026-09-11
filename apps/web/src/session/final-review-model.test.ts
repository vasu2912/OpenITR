import { exactMoneyFromWholeRupees, parseFactKey } from "@openitr/model";
import type {
	DocumentExtractionRecord,
	SalaryObservation,
} from "@openitr/model";
import type {
	AcceptedCanonicalFact,
	FactResolution,
} from "@openitr/fact-reconciliation";
import type { AttestedAnswerFact } from "@openitr/question-engine";
import { describe, expect, test } from "vitest";

import { buildFinalReview } from "./final-review-model";
import type { FinalReviewInput } from "./final-review-model";

const documentId = "a".repeat(64) as SalaryObservation["sourceDocumentId"];
const salaryObservation: SalaryObservation = {
	observationId: "salary-observation-1",
	factKey: parseFactKey("salary.section-17-1"),
	sourceDocumentId: documentId,
	adapterId: "form16",
	adapterVersion: "1",
	originalText: "Rs 12,00,000",
	normalizedValue: 1_200_000,
	transformationSteps: [],
	evidence: {
		kind: "pdf-page-region",
		page: 1,
		x: 10,
		y: 20,
		width: 30,
		height: 10,
	},
	ruleCitation: {
		ruleId: "FORM16-SALARY" as SalaryObservation["ruleCitation"]["ruleId"],
		description: "Salary under section 17(1)",
	},
	record: { kind: "form16", deductorTan: "SYNTO1234E" },
};

const extraction = {
	candidateKey: 1,
	documentId,
	status: "done",
	observations: [salaryObservation],
	bankInterestObservations: [],
	nonSalaryIncomeObservations: [],
	tdsObservations: [],
	taxPaymentObservations: [],
	issues: [],
	pages: [],
} satisfies DocumentExtractionRecord;

const acceptedSalary = {
	groupId: "salary.section-17-1",
	factKey: salaryObservation.factKey,
	value: exactMoneyFromWholeRupees(1_200_000),
	representativeObservationId: salaryObservation.observationId,
	agreeingCandidates: [
		{
			observationId: salaryObservation.observationId,
			sourceDocumentId: documentId,
			value: exactMoneyFromWholeRupees(1_200_000),
		},
	],
	origin: { kind: "observed" },
} satisfies AcceptedCanonicalFact;

const seniorAnswer = {
	answerId: "answer-senior",
	questionId: "taxpayer-senior-citizen",
	factKey: parseFactKey("taxpayer.senior-citizen"),
	value: false,
	questionRevision: "2026-09-15",
	answeredAt: "2099-01-01T00:00:00.000Z",
	origin: {
		kind: "attested-answer",
		questionId: "taxpayer-senior-citizen",
		questionRevision: "2026-09-15",
		answeredAt: "2099-01-01T00:00:00.000Z",
		rulePackId: "itr1-ay2026-27.2026-09-15",
	},
} as unknown as AttestedAnswerFact;

const bankInterestResolution = {
	resolutionId: "bank-interest-resolution",
	groupId: "bank-interest.savings",
	factKey: parseFactKey("bank-interest.savings"),
	choice: {
		kind: "attested",
		value: exactMoneyFromWholeRupees(5_000),
	},
	decidedAgainst: [],
	reason: "Confirmed against the bank statement",
	recordedAt: "2099-01-01T00:00:00.000Z",
} as unknown as FactResolution;

const resolvedBankInterest = {
	groupId: bankInterestResolution.groupId,
	factKey: bankInterestResolution.factKey,
	value: bankInterestResolution.choice.value,
	representativeObservationId: undefined,
	agreeingCandidates: [],
	origin: {
		kind: "resolved-attested",
		resolutionId: bankInterestResolution.resolutionId,
	},
} satisfies AcceptedCanonicalFact;

const input = {
	acceptedFacts: [acceptedSalary, resolvedBankInterest],
	answers: [seniorAnswer],
	resolutions: [bankInterestResolution],
	extractions: [extraction],
	derivedNodes: [
		{
			nodeId: parseFactKey("derived.old-regime-salary-income"),
			rulePackRevision: "2026-09-15",
			ruleId: "OLD-SALARY" as never,
			operation: "sum-of-accepted-observations",
			inputs: [
				{
					kind: "fact",
					factKey: salaryObservation.factKey,
					value: exactMoneyFromWholeRupees(1_200_000),
				},
			],
			unroundedValue: exactMoneyFromWholeRupees(1_200_000),
			roundedValue: exactMoneyFromWholeRupees(1_200_000),
		},
	],
	missingQuestions: [
		{
			id: "missing-deduction",
			factKey: parseFactKey("deductions.80c"),
			prompt: "Enter section 80C",
			affectedResult: { resultId: "old-regime", label: "Old regime" },
		},
	],
	conflicts: [],
	analysisScope: undefined,
	computationIssues: [],
} as unknown as FinalReviewInput;

describe("final review model", () => {
	test("groups facts and preserves origin, evidence, transformation, and downstream use", () => {
		const review = buildFinalReview(input);
		const salary = review.topics.find((topic) => topic.id === "salary");
		const profile = review.topics.find(
			(topic) => topic.id === "taxpayer-profile",
		);
		const otherIncome = review.topics.find(
			(topic) => topic.id === "other-income",
		);

		expect(salary?.facts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					factKey: "salary.section-17-1",
					originKind: "source-observation",
					evidence: expect.stringContaining("page 1"),
					targetId: "observation-salary-observation-1",
					downstreamUses: ["derived.old-regime-salary-income"],
				}),
				expect.objectContaining({
					factKey: "derived.old-regime-salary-income",
					originKind: "derived",
					transformation: expect.stringContaining(
						"sum-of-accepted-observations",
					),
				}),
			]),
		);
		expect(profile?.facts).toContainEqual(
			expect.objectContaining({
				factKey: "taxpayer.senior-citizen",
				originKind: "user-attestation",
				targetId: "answer-answer-senior",
			}),
		);
		expect(otherIncome?.facts).toContainEqual(
			expect.objectContaining({
				factKey: "bank-interest.savings",
				originKind: "conflict-resolution",
				targetId: "resolution-bank-interest-resolution",
			}),
		);
		expect(review.openItems).toContainEqual(
			expect.objectContaining({
				kind: "unresolved-question",
				affectedResults: ["Old regime"],
			}),
		);
	});

	test("keeps unsupported conditions, limitations, and affected calculations visible", () => {
		const review = buildFinalReview({
			...input,
			analysisScope: {
				decisions: [
					{
						id: "foreign-assets",
						factKey: parseFactKey("taxpayer.foreign-assets"),
						fact: {
							factKey: parseFactKey("taxpayer.foreign-assets"),
							state: "unsupported",
							reason: "Foreign assets require a different return form.",
							sourceReferences: [],
						},
						kind: "unsupported",
						title: "Foreign assets are outside scope",
						explanation: "This analysis cannot cover foreign assets.",
						recoveryAction: "Use the appropriate return form.",
						rule: { sourceLocation: "ITR-1 instructions" },
						rulePackIdentity: {},
					},
				],
				calculationLimitations: [
					{
						factKey: parseFactKey("salary.relief"),
						explanation: "Relief is not calculated.",
					},
				],
				answeredQuestions: [],
			} as never,
			computationIssues: [
				{
					id: "old-regime-blocked",
					label: "Supply the missing age category.",
					affectedResults: ["Old regime"],
				},
			],
		});

		expect(review.openItems).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "unsupported-condition",
					affectedResults: ["ITR-1 analysis scope"],
				}),
				expect.objectContaining({
					kind: "warning",
					label: "Relief is not calculated.",
				}),
				expect.objectContaining({
					kind: "warning",
					affectedResults: ["Old regime"],
				}),
			]),
		);
	});
});
