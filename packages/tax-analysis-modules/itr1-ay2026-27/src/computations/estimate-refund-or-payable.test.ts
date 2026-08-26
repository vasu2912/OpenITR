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
	FactKey,
	NonSalaryIncomeObservation,
	SalaryObservation,
	TaxPaymentObservation,
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
	AcceptedNonSalaryIncomeDocumentFacts,
	AcceptedTdsDocumentFacts,
	AcceptedTaxPaymentDocumentFacts,
	RefundOrAmountPayableEstimate,
} from "./estimate-refund-or-payable";

const salaryDocumentId = parseSha256Digest("ab".repeat(32));
const aisDocumentId = parseSha256Digest("cd".repeat(32));
const form26asDocumentId = parseSha256Digest("ef".repeat(32));
const form16aDocumentId = parseSha256Digest("9a".repeat(32));
const epayDocumentId = parseSha256Digest("7c".repeat(32));

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
		medium: "text",
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

const form16aIncomeObservation = ({
	factKey,
	amount,
	row,
}: Readonly<{ factKey: string; amount: string; row: number }>): NonSalaryIncomeObservation => ({
	observationId: `${factKey}@${form16aDocumentId}:1:${row}`,
	factKey: parseFactKey(factKey),
	sourceDocumentId: form16aDocumentId,
	adapterId: "form16a-pdf",
	adapterVersion: "1",
	originalText: `${row} | certificate summary row`,
	normalizedValue: parseExactMoney(amount),
	transformationSteps: [],
	evidence: {
		kind: "pdf-page-region",
		page: 1,
		x: 72,
		y: 600 - row * 16,
		width: 300,
		height: 12,
	},
	ruleCitation: {
		ruleId: parseRuleId("FORM16A-INCOME-INTEREST-OTHER-THAN-SECURITIES"),
		description: "Form 16A summary record fact.",
	},
});

// The reviewed Form 16A certificate mirrors the synthetic adapter's output:
// a 1,20,000 interest receipt and a 25,000 dividend receipt, with 12,000 of
// TDS deposited against the interest row.
const reviewedForm16aIncomeDocument =
	(): AcceptedNonSalaryIncomeDocumentFacts => ({
		documentId: form16aDocumentId,
		observations: [
			form16aIncomeObservation({
				factKey: "non-salary-income.dividends",
				amount: "25000",
				row: 2,
			}),
			form16aIncomeObservation({
				factKey: "non-salary-income.interest-other-than-securities",
				amount: "120000",
				row: 1,
			}),
		],
	});

const form16aTdsDocument = (): AcceptedTdsDocumentFacts => ({
	documentId: form16aDocumentId,
	observations: [
		{
			...tdsDepositedObservation({
				amount: "12000",
				lineNumber: 9,
				serialNumber: "1",
				deductorTan: "MUMA12345B",
			}),
			sourceDocumentId: form16aDocumentId,
			observationId: `tds.tds-deposited@${form16aDocumentId}:1:1`,
			evidence: {
				kind: "pdf-page-region",
				page: 1,
				x: 72,
				y: 584,
				width: 300,
				height: 12,
			},
			record: {
				medium: "pdf",
				page: 1,
				rowNumber: 1,
				serialNumber: "1",
				deductorName: "OpenITR Synthetic Payers Private Limited",
				deductorTan: "MUMA12345B",
				amountPaidCreditedRaw: "1,20,000.00",
				taxDeductedRaw: "12,000.00",
				tdsDepositedRaw: "12,000.00",
			},
		},
	],
});

const taxPaymentObservation = ({
	amount = "45670",
	factKey = "tax-payment.self-assessment-tax",
	bsrCode = "0004321",
	challanSerialNumber = "00517",
	paymentDate = "26/03/2026",
	documentId = epayDocumentId,
}: Readonly<{
	amount?: string;
	factKey?: string;
	bsrCode?: string;
	challanSerialNumber?: string;
	paymentDate?: string;
	documentId?: typeof epayDocumentId;
}> = {}): TaxPaymentObservation => ({
	observationId: `${factKey}@${documentId}:cin-${bsrCode}-${challanSerialNumber}`,
	factKey: parseFactKey(factKey),
	sourceDocumentId: documentId,
	adapterId: "epay-tax-receipt-pdf",
	adapterVersion: "1",
	originalValue: `Rs ${amount}`,
	normalizedValue: parseExactMoney(amount),
	transformationSteps: [],
	evidence: {
		kind: "pdf-page-region",
		page: 1,
		x: 72,
		y: 544,
		width: 220,
		height: 12,
	},
	ruleCitation: {
		ruleId: parseRuleId("EPAY-TAX-RECEIPT-SELF-ASSESSMENT-TAX"),
		description: "e-Pay Tax receipt fact for a paid challan.",
	},
	record: {
		medium: "pdf",
		page: 1,
		taxpayerName: "OpenITR Synthetic Taxpayer",
		taxpayerPan: "PANPD9999E",
		assessmentYear: "2026-27",
		bsrCode,
		challanSerialNumber,
		paymentDateDayMonthYear: paymentDate,
		typeOfPaymentCode: factKey === "tax-payment.advance-tax" ? "100" : "300",
		typeOfPaymentLabel:
			factKey === "tax-payment.advance-tax"
				? "(100) Advance Tax"
				: "(300) Self Assessment Tax",
		bankReferenceNumber: "OPENITRBNK1234567",
		totalAmountRaw: `Rs ${amount}`,
	},
});

const computeReviewedEstimate = (
	overrides: Partial<{
		salaryDocuments: readonly AcceptedSalaryDocumentFacts[];
		bankInterestDocuments: readonly AcceptedBankInterestDocumentFacts[];
		nonSalaryIncomeDocuments: readonly AcceptedNonSalaryIncomeDocumentFacts[];
		tdsDocuments: readonly AcceptedTdsDocumentFacts[];
		taxPaymentDocuments: readonly AcceptedTaxPaymentDocumentFacts[];
		withheldFactKeys: readonly FactKey[];
		answer: AttestedAnswer;
	}> = {},
): RefundOrAmountPayableEstimate =>
	computeRefundOrAmountPayableEstimate({
		rulePack: itr1Ay202627RulePack20260824b,
		residentAnswer: overrides.answer ?? residentAnswer(),
		salaryDocuments: overrides.salaryDocuments ?? [reviewedSalaryDocument()],
		bankInterestDocuments:
			overrides.bankInterestDocuments ?? [reviewedBankInterestDocument()],
		nonSalaryIncomeDocuments: overrides.nonSalaryIncomeDocuments ?? [],
		tdsDocuments: overrides.tdsDocuments ?? [reviewedTdsDocument()],
		taxPaymentDocuments: overrides.taxPaymentDocuments ?? [],
		...(overrides.withheldFactKeys === undefined
			? {}
			: { withheldFactKeys: overrides.withheldFactKeys }),
	});

describe("facts withheld by unresolved conflicts", () => {
	test("blocks and names every withheld fact instead of estimating on a disputed base", () => {
		const estimate = computeReviewedEstimate({
			withheldFactKeys: [
				parseFactKey("bank-interest.savings-account"),
				parseFactKey("tds.tds-deposited"),
			],
		});

		expect(estimate.kind).toBe("blocked");
		if (estimate.kind !== "blocked") {
			return;
		}
		const conflicted = estimate.issues.find(
			(issue) => String(issue.code) === "FACT_TAX_FACT_CONFLICTED",
		);
		expect(conflicted).toBeDefined();
		expect(conflicted?.severity).toBe("blocking");
		expect(conflicted?.affectedFactKeys.map(String)).toEqual([
			"bank-interest.savings-account",
			"tds.tds-deposited",
		]);
		expect(conflicted?.recoveryAction).toMatch(/resolve/i);
	});

	test("a resolved fact set with no withheld keys estimates normally", () => {
		const estimate = computeReviewedEstimate({
			withheldFactKeys: [],
		});

		expect(estimate.kind).toBe("computed");
	});
});

describe("refund or payable estimate", () => {
	test("estimates a refund when accepted taxes paid exceed the liability on combined income", () => {
		const estimate = computeRefundOrAmountPayableEstimate({
			rulePack: itr1Ay202627RulePack20260824b,
			residentAnswer: residentAnswer(),
			salaryDocuments: [reviewedSalaryDocument()],
			bankInterestDocuments: [reviewedBankInterestDocument()],
			nonSalaryIncomeDocuments: [],
			tdsDocuments: [reviewedTdsDocument()],
			taxPaymentDocuments: [],
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
			nonSalaryIncomeTotal: "0",
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

		expect(nodeById("derived.taxes-paid-total")).toEqual(
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
			nonSalaryIncomeDocuments: [],
			tdsDocuments: [oneDeposit()],
			taxPaymentDocuments: [],
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
			nonSalaryIncomeTotal: "0",
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
			nonSalaryIncomeDocuments: [],
			tdsDocuments: [balancedTds()],
			taxPaymentDocuments: [],
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
						medium: "text",
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

	test("accepts interest observations spread across two AIS exports once reconciliation has picked representatives", () => {
		const secondAisDocumentId = parseSha256Digest("11".repeat(32));
		const savingsOnly = (): AcceptedBankInterestDocumentFacts => ({
			documentId: aisDocumentId,
			observations: reviewedBankInterestDocument().observations.filter(
				(observation) =>
					observation.factKey ===
					parseFactKey("bank-interest.savings-account"),
			),
		});
		const depositsOnly = (): AcceptedBankInterestDocumentFacts => ({
			documentId: secondAisDocumentId,
			observations: reviewedBankInterestDocument().observations.filter(
				(observation) =>
					observation.factKey === parseFactKey("bank-interest.deposits"),
			),
		});

		const estimate = computeReviewedEstimate({
			bankInterestDocuments: [savingsOnly(), depositsOnly()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}
		expect(estimate.summary.bankInterestTotal).toBe("53569.15");
	});

	test("still blocks when two Form 26AS exports both contribute deposits", () => {
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

describe("accepted Form 16A evidence feeds the income and tax-paid totals", () => {
	test("adds accepted non-salary gross receipts to total income before rounding", () => {
		// 975000 salary + 53569.15 interest + 145000 receipts = 1173569.15,
		// rounded once under section 288A to 1173570. Slab tax 57357 is fully
		// rebated under section 87A, so the certificate's deposits decide the
		// refund.
		const estimate = computeReviewedEstimate({
			nonSalaryIncomeDocuments: [reviewedForm16aIncomeDocument()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}
		expect(estimate.summary.nonSalaryIncomeTotal).toBe("145000");
		expect(estimate.summary.totalIncome).toBe("1173570");
		expect(estimate.summary.incomeTaxBeforeAdjustments).toBe("57357");
		expect(estimate.summary.rebateApplied).toBe("57357");
		expect(estimate.summary.finalTaxLiability).toBe("0");
		expect(estimate.outcome).toEqual({
			kind: "estimated-refund",
			difference: "61250",
		});

		const nonSalaryNode = estimate.nodes.find(
			(candidate) => candidate.nodeId === "derived.non-salary-income-total",
		);
		expect(nonSalaryNode).toEqual(
			expect.objectContaining({
				ruleId: parseRuleId("ITR1-INTEREST-INCOME-SECTION-56"),
				unroundedValue: "145000",
				roundedValue: "145000",
			}),
		);
		const aggregate = estimate.nodes.find(
			(candidate) => candidate.nodeId === "derived.total-income-aggregate",
		);
		expect(aggregate?.inputs).toContainEqual({
			kind: "node",
			nodeId: "derived.non-salary-income-total",
			value: "145000",
		});
	});

	test("feeds taxes paid from certificate deposits when the certificate is the only TDS document", () => {
		const estimate = computeReviewedEstimate({
			nonSalaryIncomeDocuments: [reviewedForm16aIncomeDocument()],
			tdsDocuments: [form16aTdsDocument()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}
		expect(estimate.summary.taxesPaid).toBe("12000");
		expect(estimate.outcome).toEqual({
			kind: "estimated-refund",
			difference: "12000",
		});
	});

	test("accepts two certificates whose gross receipts reconciliation has separated per fact key", () => {
		const secondCertificateId = parseSha256Digest("9b".repeat(32));
		const secondCertificate = (): AcceptedNonSalaryIncomeDocumentFacts => ({
			documentId: secondCertificateId,
			observations: [
				form16aIncomeObservation({
					factKey: "non-salary-income.dividends",
					amount: "25000",
					row: 1,
				}),
				form16aIncomeObservation({
					factKey: "non-salary-income.interest-other-than-securities",
					amount: "120000",
					row: 2,
				}),
			],
		});

		const estimate = computeReviewedEstimate({
			nonSalaryIncomeDocuments: [secondCertificate()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}
		expect(estimate.summary.nonSalaryIncomeTotal).toBe("145000");
	});

	test("never demands a certificate: absent non-salary evidence alone keeps the estimate computable", () => {
		const estimate = computeReviewedEstimate();

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
		}
		expect(estimate.summary.nonSalaryIncomeTotal).toBe("0");
	});

	test("lists income evidence separately from tax-paid evidence in its sources", () => {
		const estimate = computeReviewedEstimate({
			nonSalaryIncomeDocuments: [reviewedForm16aIncomeDocument()],
			tdsDocuments: [form16aTdsDocument()],
		});

		expect(estimate.kind).toBe("computed");
		if (estimate.kind !== "computed") {
			return;
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
				role: "non-salary-income",
				factKey: "non-salary-income.dividends",
				sourceDocumentId: form16aDocumentId,
				observationIds: [
					`non-salary-income.dividends@${form16aDocumentId}:1:2`,
				],
			},
			{
				role: "non-salary-income",
				factKey: "non-salary-income.interest-other-than-securities",
				sourceDocumentId: form16aDocumentId,
				observationIds: [
					`non-salary-income.interest-other-than-securities@${form16aDocumentId}:1:1`,
				],
			},
			{
				role: "taxes-paid",
				factKey: "tds.tds-deposited",
				sourceDocumentId: form16aDocumentId,
				observationIds: [`tds.tds-deposited@${form16aDocumentId}:1:1`],
			},
		]);
	});
});

describe("accepted e-Pay Tax receipts", () => {
	test("adds an accepted receipt to taxes paid and names the receipt that changed the estimate", () => {
		const estimate = computeReviewedEstimate({
			taxPaymentDocuments: [
				{
					documentId: epayDocumentId,
					observations: [taxPaymentObservation()],
				},
			],
		});
		if (estimate.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}

		// 61,250 of accepted TDS deposits plus the 45,670 challan payment.
		expect(estimate.summary.taxesPaid).toBe("106920");
		expect(estimate.outcome).toEqual({
			kind: "estimated-refund",
			difference: "106920",
		});
		expect(estimate.acceptedTaxPayments).toEqual([
			{
				sourceDocumentId: epayDocumentId,
				factKey: "tax-payment.self-assessment-tax",
				amount: "45670",
				challanReference:
					"BSR 0004321 · Serial 00517 · dated 26/03/2026",
			},
		]);

		const taxesPaidNode = estimate.nodes.find(
			(candidate) => candidate.nodeId === "derived.taxes-paid-total",
		);
		expect(taxesPaidNode).toBeDefined();
		expect(taxesPaidNode?.inputs).toContainEqual({
			kind: "fact",
			factKey: "tax-payment.self-assessment-tax",
			value: "45670",
		});
	});

	test("counts every distinct challan when several receipts are selected", () => {
		const estimate = computeReviewedEstimate({
			taxPaymentDocuments: [
				{
					documentId: epayDocumentId,
					observations: [taxPaymentObservation()],
				},
				{
					documentId: parseSha256Digest("7d".repeat(32)),
					observations: [
						taxPaymentObservation({
							factKey: "tax-payment.advance-tax",
							bsrCode: "0004322",
							challanSerialNumber: "00612",
							paymentDate: "15/06/2025",
							amount: "15000",
						}),
					],
				},
			],
		});
		if (estimate.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}

		expect(estimate.summary.taxesPaid).toBe("121920");
		expect(
			estimate.acceptedTaxPayments.map((receipt) =>
				receipt.challanReference,
			),
		).toEqual([
			"BSR 0004322 · Serial 00612 · dated 15/06/2025",
			"BSR 0004321 · Serial 00517 · dated 26/03/2026",
		]);
	});

	// Duplicate-challan guarding lives in fact reconciliation: agreeing
	// reprints of one challan coalesce to one payment, and differing amounts
	// for one challan become a resolvable conflict that arrives here as a
	// withheld fact key. The estimate itself no longer scans identities.

	test("lists each accepted receipt among the estimate's evidence sources", () => {
		const estimate = computeReviewedEstimate({
			taxPaymentDocuments: [
				{
					documentId: epayDocumentId,
					observations: [taxPaymentObservation()],
				},
			],
		});
		if (estimate.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}

		expect(estimate.sources).toContainEqual({
			role: "tax-payments",
			factKey: "tax-payment.self-assessment-tax",
			sourceDocumentId: epayDocumentId,
			observationIds: [
				`tax-payment.self-assessment-tax@${epayDocumentId}:cin-0004321-00517`,
			],
		});
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
			nonSalaryIncomeDocuments: [],
			tdsDocuments,
			taxPaymentDocuments: [],
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
			nonSalaryIncomeDocuments: [],
			tdsDocuments,
			taxPaymentDocuments: [],
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
			(candidate) => candidate.nodeId === "derived.taxes-paid-total",
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
