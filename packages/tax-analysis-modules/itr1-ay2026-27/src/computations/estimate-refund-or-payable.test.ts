import {
	parseExactMoney,
	parseFactKey,
	parseIsoTimestamp,
	parseQuestionId,
	parseRuleId,
	parseSha256Digest,
	subtractExactMoney,
} from "@openitr/model";
import type {
	AttestedAnswer,
	BankInterestObservation,
	SalaryObservation,
	TdsObservation,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260824b } from "../revisions/2026-08-24b/rule-pack";
import {
	SALARY_FACT_KEYS,
	computeNewRegimeSalaryScenario,
} from "./new-regime-salary";
import type { AcceptedSalaryDocumentFacts } from "./new-regime-salary";
import {
	computeRefundOrAmountPayableEstimate,
	estimateRefundOrAmountPayableFromSalaryScenario,
} from "./estimate-refund-or-payable";
import type {
	AcceptedBankInterestDocumentFacts,
	AcceptedTdsDocumentFacts,
	RefundOrAmountPayableEstimate,
} from "./estimate-refund-or-payable";

const salaryDocumentId = parseSha256Digest("ab".repeat(32));
const aisDocumentId = parseSha256Digest("cd".repeat(32));
const form26asDocumentId = parseSha256Digest("ef".repeat(32));

const residentAnswer = (): AttestedAnswer => ({
	questionId: parseQuestionId("itr1-resident-individual"),
	value: "yes",
	label: "Yes",
	answeredAt: parseIsoTimestamp("2026-08-23T09:00:00.000Z"),
	rulePackId: itr1Ay202627RulePack20260824b.identity.id,
});

const salaryObservation = ({
	factKey,
	wholeRupees,
}: Readonly<{ factKey: string; wholeRupees: number }>): SalaryObservation => ({
	observationId: `${factKey}@${salaryDocumentId}`,
	factKey: parseFactKey(factKey),
	sourceDocumentId: salaryDocumentId,
	adapterId: "form16-pdf",
	adapterVersion: "1",
	originalText: `${factKey}: Rs ${wholeRupees}`,
	normalizedValue: wholeRupees,
	transformationSteps: [],
	evidence: {
		kind: "pdf-page-region",
		page: 1,
		x: 72,
		y: 600,
		width: 200,
		height: 12,
	},
	ruleCitation: {
		ruleId: parseRuleId("FORM16-PARTA-SALARY-TAXABLE-TOTAL"),
		description: "Form 16 Part A field definition",
	},
});

const bankInterestObservation = ({
	factKey,
	amount,
	pointer,
}: Readonly<{
	factKey: string;
	amount: string;
	pointer: string;
}>): BankInterestObservation => ({
	observationId: `${factKey}@${aisDocumentId}:${pointer}`,
	factKey: parseFactKey(factKey),
	sourceDocumentId: aisDocumentId,
	adapterId: "ais-json",
	adapterVersion: "1",
	originalValue: JSON.stringify(amount),
	normalizedValue: parseExactMoney(amount),
	transformationSteps: [],
	evidence: { kind: "json-pointer", pointer },
	ruleCitation: {
		ruleId: parseRuleId("AIS-BANK-INTEREST-SAVINGS-ACCOUNT"),
		description: "AIS bank-interest record",
	},
});

const tdsDepositedObservation = ({
	amount,
	lineNumber,
	serialNumber,
	deductorTan,
}: Readonly<{
	amount: string;
	lineNumber: number;
	serialNumber: string;
	deductorTan: string;
}>): TdsObservation => ({
	observationId: `tds.tds-deposited@${form26asDocumentId}:${lineNumber}-${lineNumber}`,
	factKey: parseFactKey("tds.tds-deposited"),
	sourceDocumentId: form26asDocumentId,
	adapterId: "form26as-text",
	adapterVersion: "1",
	originalValue: amount,
	normalizedValue: parseExactMoney(amount),
	transformationSteps: [],
	evidence: {
		kind: "text-line-range",
		firstLine: lineNumber,
		lastLine: lineNumber,
	},
	ruleCitation: {
		ruleId: parseRuleId("FORM26AS-PARTI-TDS-DEPOSITED"),
		description: "Form 26AS Part I column definition",
	},
	record: {
		serialNumber,
		deductorName: "OpenITR Synthetic Employer",
		deductorTan,
		firstLine: lineNumber,
		lastLine: lineNumber,
		amountPaidCreditedRaw: undefined,
		taxDeductedRaw: undefined,
		tdsDepositedRaw: amount,
	},
});

// The reviewed fixture trio mirrors the synthetic adapters' outputs: a Form 16
// with 12,00,000 salary and 1,50,000 exempt allowances, an AIS export with
// savings and deposit interest records, and a Form 26AS with two deposited
// TDS records. Worked expectations below are computed by hand from these
// numbers alone.
const reviewedSalaryDocument = (): AcceptedSalaryDocumentFacts => ({
	documentId: salaryDocumentId,
	observations: [
		salaryObservation({
			factKey: SALARY_FACT_KEYS.section17_1,
			wholeRupees: 1200000,
		}),
		salaryObservation({
			factKey: SALARY_FACT_KEYS.exemptAllowancesSection10,
			wholeRupees: 150000,
		}),
		salaryObservation({
			factKey: SALARY_FACT_KEYS.taxableTotal,
			wholeRupees: 1050000,
		}),
	],
});

const reviewedBankInterestDocument =
	(): AcceptedBankInterestDocumentFacts => ({
		documentId: aisDocumentId,
		observations: [
			bankInterestObservation({
				factKey: "bank-interest.savings-account",
				amount: "7890.25",
				pointer: "/interestInformation/bankInterest/0",
			}),
			bankInterestObservation({
				factKey: "bank-interest.deposits",
				amount: "45678.90",
				pointer: "/interestInformation/bankInterest/1",
			}),
		],
	});

const reviewedTdsDocument = (): AcceptedTdsDocumentFacts => ({
	documentId: form26asDocumentId,
	observations: [
		tdsDepositedObservation({
			amount: "48750",
			lineNumber: 7,
			serialNumber: "1",
			deductorTan: "MUMA12345B",
		}),
		tdsDepositedObservation({
			amount: "12500",
			lineNumber: 8,
			serialNumber: "2",
			deductorTan: "PUNE23456C",
		}),
	],
});

const computeReviewedEstimate = (
	overrides: Partial<{
		salaryDocuments: readonly AcceptedSalaryDocumentFacts[];
		bankInterestDocuments: readonly AcceptedBankInterestDocumentFacts[];
		tdsDocuments: readonly AcceptedTdsDocumentFacts[];
		answer: AttestedAnswer;
	}> = {},
): RefundOrAmountPayableEstimate =>
	computeRefundOrAmountPayableEstimate({
		rulePack: itr1Ay202627RulePack20260824b,
		residentAnswer: overrides.answer ?? residentAnswer(),
		salaryDocuments: overrides.salaryDocuments ?? [reviewedSalaryDocument()],
		bankInterestDocuments:
			overrides.bankInterestDocuments ?? [reviewedBankInterestDocument()],
		tdsDocuments: overrides.tdsDocuments ?? [reviewedTdsDocument()],
	});

describe("refund or payable estimate", () => {
	test("estimates a refund when accepted taxes paid exceed the liability on combined income", () => {
		const estimate = computeRefundOrAmountPayableEstimate({
			rulePack: itr1Ay202627RulePack20260824b,
			residentAnswer: residentAnswer(),
			salaryDocuments: [reviewedSalaryDocument()],
			bankInterestDocuments: [reviewedBankInterestDocument()],
			tdsDocuments: [reviewedTdsDocument()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}

		expect(estimate.scenario).toBe(
			"one-person-new-regime-refund-or-payable-fy-2025-26",
		);
		expect(estimate.rulePackRevision).toBe(
			itr1Ay202627RulePack20260824b.identity.revision,
		);
		expect(estimate.outcome).toEqual({
			kind: "estimated-refund",
			difference: "61250",
		});
		expect(estimate.summary).toEqual({
			salaryAdjustedIncome: "975000",
			bankInterestTotal: "53569.15",
			totalIncome: "1028570",
			incomeTaxBeforeAdjustments: "42857",
			rebateApplied: "42857",
			marginalReliefApplied: "0",
			surcharge: "0",
			cess: "0",
			finalTaxLiability: "0",
			taxesPaid: "61250",
		});
	});

	test("cites every estimate step back to its rule, revision, and accepted facts", () => {
		const estimate = computeReviewedEstimate();
		if (estimate.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}

		const nodeById = (nodeId: string) => {
			const found = estimate.nodes.find(
				(candidate) => candidate.nodeId === nodeId,
			);
			if (found === undefined) {
				throw new Error(`missing expected trace node: ${nodeId}`);
			}
			return found;
		};

		expect(nodeById("derived.bank-interest-total")).toEqual(
			expect.objectContaining({
				ruleId: parseRuleId("ITR1-INTEREST-INCOME-SECTION-56"),
				unroundedValue: "53569.15",
			}),
		);
		const aggregate = nodeById("derived.total-income-aggregate");
		expect(aggregate.ruleId).toBe(
			parseRuleId("ITR1-INCOME-AGGREGATION-SECTION-14"),
		);
		expect(aggregate.inputs).toContainEqual({
			kind: "node",
			nodeId: "derived.salary-standard-deduction-adjusted",
			value: "975000",
		});
		expect(aggregate.note).toContain("Section 288A rounds total income once");

		const rounded = nodeById("derived.total-income-rounded-section-288a");
		expect(rounded.ruleId).toBe(
			parseRuleId("ITR1-TOTAL-INCOME-ROUNDING-288A"),
		);
		expect(rounded.roundedValue).toBe("1028570");

		expect(nodeById("derived.taxes-paid-tds-credit")).toEqual(
			expect.objectContaining({
				ruleId: parseRuleId("ITR1-TDS-CREDIT-SECTION-199"),
				unroundedValue: "61250",
			}),
		);

		for (const node of estimate.nodes) {
			expect(node.rulePackRevision).toBe(
				itr1Ay202627RulePack20260824b.identity.revision,
			);
		}

		expect(estimate.sources).toEqual([
			{
				role: "salary-income",
				factKey: "salary.exempt-allowances-section-10",
				sourceDocumentId: salaryDocumentId,
				observationIds: [
					`salary.exempt-allowances-section-10@${salaryDocumentId}`,
				],
			},
			{
				role: "salary-income",
				factKey: "salary.section-17-1",
				sourceDocumentId: salaryDocumentId,
				observationIds: [`salary.section-17-1@${salaryDocumentId}`],
			},
			{
				role: "salary-income",
				factKey: "salary.taxable-total",
				sourceDocumentId: salaryDocumentId,
				observationIds: [`salary.taxable-total@${salaryDocumentId}`],
			},
			{
				role: "bank-interest-income",
				factKey: "bank-interest.deposits",
				sourceDocumentId: aisDocumentId,
				observationIds: [
					`bank-interest.deposits@${aisDocumentId}:/interestInformation/bankInterest/1`,
				],
			},
			{
				role: "bank-interest-income",
				factKey: "bank-interest.savings-account",
				sourceDocumentId: aisDocumentId,
				observationIds: [
					`bank-interest.savings-account@${aisDocumentId}:/interestInformation/bankInterest/0`,
				],
			},
			{
				role: "taxes-paid",
				factKey: "tds.tds-deposited",
				sourceDocumentId: form26asDocumentId,
				observationIds: [
					`tds.tds-deposited@${form26asDocumentId}:7-7`,
					`tds.tds-deposited@${form26asDocumentId}:8-8`,
				],
			},
		]);
	});

	test("estimates an amount payable when the liability exceeds accepted taxes paid", () => {
		const higherSalary = (): AcceptedSalaryDocumentFacts => ({
			documentId: salaryDocumentId,
			observations: [
				salaryObservation({
					factKey: SALARY_FACT_KEYS.section17_1,
					wholeRupees: 1700000,
				}),
				salaryObservation({
					factKey: SALARY_FACT_KEYS.exemptAllowancesSection10,
					wholeRupees: 100000,
				}),
				salaryObservation({
					factKey: SALARY_FACT_KEYS.taxableTotal,
					wholeRupees: 1600000,
				}),
			],
		});
		const savingsOnly = (): AcceptedBankInterestDocumentFacts => ({
			documentId: aisDocumentId,
			observations: [
				bankInterestObservation({
					factKey: "bank-interest.savings-account",
					amount: "20000",
					pointer: "/interestInformation/bankInterest/0",
				}),
			],
		});
		const oneDeposit = (): AcceptedTdsDocumentFacts => ({
			documentId: form26asDocumentId,
			observations: [
				tdsDepositedObservation({
					amount: "48750",
					lineNumber: 7,
					serialNumber: "1",
					deductorTan: "MUMA12345B",
				}),
			],
		});

		const estimate = computeRefundOrAmountPayableEstimate({
			rulePack: itr1Ay202627RulePack20260824b,
			residentAnswer: residentAnswer(),
			salaryDocuments: [higherSalary()],
			bankInterestDocuments: [savingsOnly()],
			tdsDocuments: [oneDeposit()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}
		expect(estimate.outcome).toEqual({
			kind: "estimated-amount-payable",
			difference: "67470",
		});
		expect(estimate.summary).toEqual({
			salaryAdjustedIncome: "1525000",
			bankInterestTotal: "20000",
			totalIncome: "1545000",
			incomeTaxBeforeAdjustments: "111750",
			rebateApplied: "0",
			marginalReliefApplied: "0",
			surcharge: "0",
			cess: "4470",
			finalTaxLiability: "116220",
			taxesPaid: "48750",
		});
	});

	test("reports balanced when taxes paid equal the liability exactly", () => {
		const balancedTds = (): AcceptedTdsDocumentFacts => ({
			documentId: form26asDocumentId,
			observations: [
				tdsDepositedObservation({
					amount: "100000",
					lineNumber: 7,
					serialNumber: "1",
					deductorTan: "MUMA12345B",
				}),
				tdsDepositedObservation({
					amount: "16220",
					lineNumber: 8,
					serialNumber: "2",
					deductorTan: "PUNE23456C",
				}),
			],
		});
		const higherSalary = (): AcceptedSalaryDocumentFacts => ({
			documentId: salaryDocumentId,
			observations: [
				salaryObservation({
					factKey: SALARY_FACT_KEYS.section17_1,
					wholeRupees: 1700000,
				}),
				salaryObservation({
					factKey: SALARY_FACT_KEYS.exemptAllowancesSection10,
					wholeRupees: 100000,
				}),
				salaryObservation({
					factKey: SALARY_FACT_KEYS.taxableTotal,
					wholeRupees: 1600000,
				}),
			],
		});
		const savingsOnly = (): AcceptedBankInterestDocumentFacts => ({
			documentId: aisDocumentId,
			observations: [
				bankInterestObservation({
					factKey: "bank-interest.savings-account",
					amount: "20000",
					pointer: "/interestInformation/bankInterest/0",
				}),
			],
		});

		const estimate = computeRefundOrAmountPayableEstimate({
			rulePack: itr1Ay202627RulePack20260824b,
			residentAnswer: residentAnswer(),
			salaryDocuments: [higherSalary()],
			bankInterestDocuments: [savingsOnly()],
			tdsDocuments: [balancedTds()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}
		expect(estimate.outcome).toEqual({ kind: "balanced" });
		expect(estimate.summary.finalTaxLiability).toBe("116220");
		expect(estimate.summary.taxesPaid).toBe("116220");
	});
});

describe("blocked estimates fail closed and name what needs review", () => {
	const issueCodesOf = (estimate: RefundOrAmountPayableEstimate) =>
		estimate.kind === "blocked"
			? estimate.issues.map((issue) => String(issue.code))
			: [];

	test("blocks when no accepted bank-interest facts exist", () => {
		const estimate = computeReviewedEstimate({ bankInterestDocuments: [] });

		expect(estimate.kind).toBe("blocked");
		expect(issueCodesOf(estimate)).toEqual([
			"FACT_BANK_INTEREST_EVIDENCE_REQUIRED",
		]);
	});

	test("blocks when an AIS export yielded no undisputed interest records", () => {
		const emptyAis = (): AcceptedBankInterestDocumentFacts => ({
			documentId: aisDocumentId,
			observations: [],
		});
		const estimate = computeReviewedEstimate({
			bankInterestDocuments: [emptyAis()],
		});

		expect(issueCodesOf(estimate)).toEqual([
			"FACT_BANK_INTEREST_EVIDENCE_REQUIRED",
		]);
	});

	test("blocks when no accepted tax-deducted-at-source facts exist", () => {
		const estimate = computeReviewedEstimate({ tdsDocuments: [] });

		expect(issueCodesOf(estimate)).toEqual(["FACT_TDS_EVIDENCE_REQUIRED"]);
	});

	test("blocks when a Form 26AS prints records but no deposited column at all", () => {
		const paidOnly = (): AcceptedTdsDocumentFacts => ({
			documentId: form26asDocumentId,
			observations: [
				{
					...tdsDepositedObservation({
						amount: "50000",
						lineNumber: 7,
						serialNumber: "1",
						deductorTan: "MUMA12345B",
					}),
					factKey: parseFactKey("tds.tax-deducted"),
					observationId: `tds.tax-deducted@${form26asDocumentId}:7-7`,
					record: {
						serialNumber: "1",
						deductorName: "OpenITR Synthetic Employer",
						deductorTan: "MUMA12345B",
						firstLine: 7,
						lastLine: 7,
						amountPaidCreditedRaw: undefined,
						taxDeductedRaw: "50000",
						tdsDepositedRaw: undefined,
					},
				},
			],
		});
		const estimate = computeReviewedEstimate({ tdsDocuments: [paidOnly()] });

		expect(estimate.kind).toBe("blocked");
		expect(issueCodesOf(estimate)).toEqual(["FACT_TDS_EVIDENCE_REQUIRED"]);
	});

	test("blocks when two AIS exports could double-count interest", () => {
		const secondAisDocumentId = parseSha256Digest("11".repeat(32));
		const secondExport = (): AcceptedBankInterestDocumentFacts => ({
			documentId: secondAisDocumentId,
			observations: [
				bankInterestObservation({
					factKey: "bank-interest.savings-account",
					amount: "1000",
					pointer: "/interestInformation/bankInterest/0",
				}),
			],
		});
		const estimate = computeReviewedEstimate({
			bankInterestDocuments: [reviewedBankInterestDocument(), secondExport()],
		});

		expect(issueCodesOf(estimate)).toEqual([
			"FACT_BANK_INTEREST_MULTIPLE_DOCUMENTS",
		]);
	});

	test("blocks when two Form 26AS exports could double-count deposits", () => {
		const second26asDocumentId = parseSha256Digest("22".repeat(32));
		const secondExport = (): AcceptedTdsDocumentFacts => ({
			documentId: second26asDocumentId,
			observations: [
				tdsDepositedObservation({
					amount: "5000",
					lineNumber: 7,
					serialNumber: "1",
					deductorTan: "MUMA12345B",
				}),
			],
		});
		const estimate = computeReviewedEstimate({
			tdsDocuments: [reviewedTdsDocument(), secondExport()],
		});

		expect(issueCodesOf(estimate)).toEqual(["FACT_TDS_MULTIPLE_DOCUMENTS"]);
	});

	test("merges salary-slice blocking issues with the other missing slices", () => {
		const estimate = computeReviewedEstimate({
			salaryDocuments: [],
			tdsDocuments: [],
		});

		expect(estimate.kind).toBe("blocked");
		const codes = issueCodesOf(estimate);
		expect(codes).toContain("FACT_SALARY_EMPLOYER_DOCUMENT_REQUIRED");
		expect(codes).toContain("FACT_TDS_EVIDENCE_REQUIRED");
		expect(codes).not.toContain("FACT_BANK_INTEREST_EVIDENCE_REQUIRED");
	});

	test("propagates a printed-total mismatch from the salary slice instead of estimating", () => {
		const inconsistent = (): AcceptedSalaryDocumentFacts => ({
			documentId: salaryDocumentId,
			observations: [
				salaryObservation({
					factKey: SALARY_FACT_KEYS.section17_1,
					wholeRupees: 1200000,
				}),
				salaryObservation({
					factKey: SALARY_FACT_KEYS.exemptAllowancesSection10,
					wholeRupees: 150000,
				}),
				salaryObservation({
					factKey: SALARY_FACT_KEYS.taxableTotal,
					wholeRupees: 999999,
				}),
			],
		});
		const estimate = computeReviewedEstimate({ salaryDocuments: [inconsistent()] });

		expect(estimate.kind).toBe("blocked");
		expect(issueCodesOf(estimate)).toEqual(["FACT_SALARY_TOTAL_MISMATCH"]);
	});
});

describe("determinism of accepted facts, rule pack, and trace", () => {
	test("replays byte-identical estimates for identical facts", () => {
		const first = computeReviewedEstimate();
		const second = computeReviewedEstimate();

		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(structuredClone(first)).toEqual(first);
	});

	test("derives the same estimate from a precomputed salary scenario as from raw documents", () => {
		const salaryDocuments = [reviewedSalaryDocument()];
		const bankInterestDocuments = [reviewedBankInterestDocument()];
		const tdsDocuments = [reviewedTdsDocument()];
		const answer = residentAnswer();

		const direct = computeRefundOrAmountPayableEstimate({
			rulePack: itr1Ay202627RulePack20260824b,
			residentAnswer: answer,
			salaryDocuments,
			bankInterestDocuments,
			tdsDocuments,
		});
		const sharedSalary = estimateRefundOrAmountPayableFromSalaryScenario({
			rulePack: itr1Ay202627RulePack20260824b,
			residentAnswer: answer,
			salaryScenario: computeNewRegimeSalaryScenario({
				rulePack: itr1Ay202627RulePack20260824b,
				residentAnswer: answer,
				salaryDocuments,
			}),
			salaryDocuments,
			bankInterestDocuments,
			tdsDocuments,
		});

		expect(JSON.stringify(sharedSalary)).toBe(JSON.stringify(direct));
	});

	test("keeps the summary consistent with its own trace nodes", () => {
		const estimate = computeReviewedEstimate();
		if (estimate.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}

		const liabilityNode = estimate.nodes.find(
			(candidate) =>
				candidate.nodeId === "derived.total-tax-liability-rounded-section-288b",
		);
		expect(estimate.summary.finalTaxLiability).toBe(
			liabilityNode?.roundedValue,
		);
		const taxesPaidNode = estimate.nodes.find(
			(candidate) => candidate.nodeId === "derived.taxes-paid-tds-credit",
		);
		expect(estimate.summary.taxesPaid).toBe(taxesPaidNode?.roundedValue);

		if (estimate.outcome.kind === "estimated-refund") {
			expect(estimate.outcome.difference).toBe(
				subtractExactMoney(
					estimate.summary.taxesPaid,
					estimate.summary.finalTaxLiability,
				),
			);
		}
	});
});
