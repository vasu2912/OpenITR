import {
	addExactMoney,
	exactMoneyFromWholeRupees,
	parseFactKey,
	parseIsoTimestamp,
	parseQuestionId,
	parseRuleId,
	parseRulePackId,
	parseSha256Digest,
} from "@openitr/model";
import type {
	AttestedAnswer,
	FactKey,
	RulePackId,
	SalaryObservation,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack } from "../rule-pack";
import {
	computeNewRegimeSalaryScenario,
	SALARY_FACT_KEYS,
} from "./new-regime-salary";
import type { NewRegimeSalaryComputation } from "./new-regime-salary";

const documentId = parseSha256Digest("ab".repeat(32));

const residentAnswer = (): AttestedAnswer => ({
	questionId: parseQuestionId("itr1-resident-individual"),
	value: "yes",
	label: "Yes",
	answeredAt: parseIsoTimestamp("2026-08-23T09:00:00.000Z"),
	rulePackId: itr1Ay202627RulePack.identity.id,
});

let nextEvidenceY = 600;

const observation = ({
	factKey,
	wholeRupees,
}: Readonly<{ factKey: string; wholeRupees: number }>): SalaryObservation => ({
	observationId: `${factKey}@${documentId}`,
	factKey: parseFactKey(factKey),
	sourceDocumentId: documentId,
	adapterId: "form16-pdf",
	adapterVersion: "1",
	originalText: `${factKey}: Rs ${wholeRupees}`,
	normalizedValue: wholeRupees,
	transformationSteps: [],
	evidence: {
		kind: "pdf-page-region",
		page: 1,
		x: 72,
		y: nextEvidenceY,
		width: 200,
		height: 12,
	},
	ruleCitation: {
		ruleId: parseRuleId("FORM16-PARTA-SALARY-TAXABLE-TOTAL"),
		description: "Form 16 Part A field definition",
	},
});

const oneEmployerDocument = ({
	section17_1,
	exemptAllowances,
	taxableTotal,
}: Readonly<{
	section17_1: number;
	exemptAllowances: number;
	taxableTotal: number;
}>) => ({
	documentId,
	observations: [
		observation({
			factKey: SALARY_FACT_KEYS.section17_1,
			wholeRupees: section17_1,
		}),
		observation({
			factKey: SALARY_FACT_KEYS.exemptAllowancesSection10,
			wholeRupees: exemptAllowances,
		}),
		observation({
			factKey: SALARY_FACT_KEYS.taxableTotal,
			wholeRupees: taxableTotal,
		}),
	],
});

const computeOneEmployer = (
	salary: ReturnType<typeof oneEmployerDocument>,
	answer = residentAnswer(),
): NewRegimeSalaryComputation =>
	computeNewRegimeSalaryScenario({
		rulePack: itr1Ay202627RulePack,
		residentAnswer: answer,
		salaryDocuments: [salary],
	});

const nodeById = <T extends { nodeId: FactKey }>(
	nodes: readonly T[],
	nodeId: string,
): T => {
	const found = nodes.find((candidate) => candidate.nodeId === nodeId);
	if (found === undefined) {
		throw new Error(`Missing expected node in trace: ${nodeId}`);
	}
	return found;
};

describe("one-employer new-regime salary scenario", () => {
	test("computes an inspectable zero-rebate-wiped liability for the reviewed Form 16 fixture", () => {
		const result = computeOneEmployer(
			oneEmployerDocument({
				section17_1: 1200000,
				exemptAllowances: 150000,
				taxableTotal: 1050000,
			}),
		);

		expect(result.kind).toBe("computed");
		if (result.kind !== "computed") {
			return;
		}

		expect(result.scenario).toBe("one-employer-new-regime-salary-fy-2025-26");
		expect(result.rulePackRevision).toBe(
			itr1Ay202627RulePack.identity.revision,
		);

		const salaryTotal = nodeById(result.nodes, "derived.salary-total");
		expect(salaryTotal.ruleId).toBe(parseRuleId("ITR1-SALARY-INCOME-SECTION-15"));
		expect(salaryTotal.unroundedValue).toBe("1200000");
		expect(salaryTotal.roundedValue).toBe("1200000");

		const afterExemptions = nodeById(
			result.nodes,
			"derived.salary-after-section-10-exemptions",
		);
		expect(afterExemptions.unroundedValue).toBe("1050000");

		const afterDeduction = nodeById(
			result.nodes,
			"derived.salary-standard-deduction-adjusted",
		);
		expect(afterDeduction.ruleId).toBe(
			parseRuleId("ITR1-NR-STANDARD-DEDUCTION-16IA"),
		);
		expect(afterDeduction.roundedValue).toBe("975000");

		const totalIncome = nodeById(
			result.nodes,
			"derived.total-income-rounded-section-288a",
		);
		expect(totalIncome.ruleId).toBe(
			parseRuleId("ITR1-TOTAL-INCOME-ROUNDING-288A"),
		);
		expect(totalIncome.roundingMode).toBe("nearest-multiple-half-up");
		expect(totalIncome.roundedValue).toBe("975000");

		expect(
			result.nodes
				.filter((candidate) =>
					candidate.nodeId.startsWith("derived.slab-band-tax-"),
				)
				.map((band) => band.roundedValue),
		).toEqual(["0", "20000", "17500"]);

		const slabTax = nodeById(
			result.nodes,
			"derived.income-tax-before-adjustments",
		);
		expect(slabTax.ruleId).toBe(parseRuleId("ITR1-NR-SLAB-TAX-115BAC"));
		expect(slabTax.roundedValue).toBe("37500");

		const rebate = nodeById(result.nodes, "derived.rebate-section-87a");
		expect(rebate.ruleId).toBe(parseRuleId("ITR1-NR-REBATE-SECTION-87A"));
		expect(rebate.roundedValue).toBe("37500");
		expect(rebate.inputs.some((entry) => entry.kind === "user-answer")).toBe(
			true,
		);

		expect(
			nodeById(result.nodes, "derived.marginal-relief-section-87a")
				.roundedValue,
		).toBe("0");
		expect(nodeById(result.nodes, "derived.surcharge").roundedValue).toBe(
			"0",
		);
		expect(
			nodeById(result.nodes, "derived.health-and-education-cess")
				.roundedValue,
		).toBe("0");

		const liability = nodeById(
			result.nodes,
			"derived.total-tax-liability-rounded-section-288b",
		);
		expect(liability.ruleId).toBe(parseRuleId("ITR1-TAX-ROUNDING-288B"));
		expect(liability.roundedValue).toBe("0");

		expect(result.summary).toEqual({
			salaryTotal: "1200000",
			taxableIncome: "975000",
			incomeTaxBeforeAdjustments: "37500",
			rebateApplied: "37500",
			marginalReliefApplied: "0",
			surcharge: "0",
			cess: "0",
			finalTaxLiability: "0",
		});
	});

	test("records rule-pack revision, unrounded and rounded results on every node", () => {
		const result = computeOneEmployer(
			oneEmployerDocument({
				section17_1: 1700000,
				exemptAllowances: 100000,
				taxableTotal: 1600000,
			}),
		);

		expect(result.kind).toBe("computed");
		if (result.kind !== "computed") {
			return;
		}

		expect(result.nodes.length).toBeGreaterThanOrEqual(9);
		for (const entry of result.nodes) {
			expect(entry.ruleId).toMatch(/^[A-Z][A-Z0-9-]+$/);
			expect(entry.rulePackRevision).toBe(
				itr1Ay202627RulePack.identity.revision,
			);
			expect(entry.unroundedValue).toMatch(/^\d+(?:\.\d+)?$/);
			expect(entry.roundedValue).toMatch(/^\d+(?:\.\d+)?$/);
			expect(entry.operation.length).toBeGreaterThan(0);
			expect(entry.inputs.length).toBeGreaterThan(0);
		}

		expect(nodeById(result.nodes, "derived.health-and-education-cess")).toEqual(
			expect.objectContaining({
				ruleId: parseRuleId("ITR1-NR-CESS"),
				unroundedValue: "4350",
				roundedValue: "4350",
			}),
		);
		expect(
			nodeById(
				result.nodes,
				"derived.total-tax-liability-rounded-section-288b",
			).roundedValue,
		).toBe("113100");
	});
});

describe("accepted-fact enforcement fails closed", () => {
	const otherPackId = parseRulePackId("other-module.2099-01-01");
	const answerFor = (rulePackId: RulePackId): AttestedAnswer => ({
		...residentAnswer(),
		rulePackId,
	});
	const issueCodesOf = (result: NewRegimeSalaryComputation) =>
		result.kind === "blocked"
			? result.issues.map((issue) => String(issue.code))
			: [];
	const reviewedFixture = oneEmployerDocument({
		section17_1: 1200000,
		exemptAllowances: 150000,
		taxableTotal: 1050000,
	});

	test("blocks when no accepted employer document exists", () => {
		const result = computeNewRegimeSalaryScenario({
			rulePack: itr1Ay202627RulePack,
			residentAnswer: residentAnswer(),
			salaryDocuments: [],
		});

		expect(result.kind).toBe("blocked");
		expect(issueCodesOf(result)).toContain("FACT_SALARY_EMPLOYER_DOCUMENT_REQUIRED");
	});

	test("blocks when more than one employer document is supplied", () => {
		const secondDocumentId = parseSha256Digest("cd".repeat(32));
		const secondDocument = {
			documentId: secondDocumentId,
			observations: [
				observation({
					factKey: SALARY_FACT_KEYS.section17_1,
					wholeRupees: 900000,
				}),
			],
		};
		const result = computeNewRegimeSalaryScenario({
			rulePack: itr1Ay202627RulePack,
			residentAnswer: residentAnswer(),
			salaryDocuments: [reviewedFixture, secondDocument],
		});

		expect(result.kind).toBe("blocked");
		expect(issueCodesOf(result)).toContain(
			"FACT_SALARY_MULTIPLE_EMPLOYER_DOCUMENTS",
		);
	});

	test("blocks with the missing fact key when a Part A field never arrived", () => {
		const incomplete = {
			documentId,
			observations: [
				observation({
					factKey: SALARY_FACT_KEYS.section17_1,
					wholeRupees: 1200000,
				}),
			],
		};
		const result = computeOneEmployer(incomplete);

		expect(result.kind).toBe("blocked");
		if (result.kind !== "blocked") {
			return;
		}
		const missingKeys = result.issues
			.filter((issue) => String(issue.code) === "FACT_SALARY_FIELD_MISSING")
			.flatMap((issue) => [...issue.affectedFactKeys]);
		expect(missingKeys).toContain(SALARY_FACT_KEYS.exemptAllowancesSection10);
		expect(missingKeys).toContain(SALARY_FACT_KEYS.taxableTotal);
	});

	test("blocks when an observation for one fact key appears twice", () => {
		const duplicated = {
			documentId,
			observations: [
				...reviewedFixture.observations,
				observation({
					factKey: SALARY_FACT_KEYS.section17_1,
					wholeRupees: 1200000,
				}),
			],
		};
		const result = computeOneEmployer(duplicated);

		expect(result.kind).toBe("blocked");
		if (result.kind !== "blocked") {
			return;
		}
		const duplicatedIssue = result.issues.find(
			(issue) => String(issue.code) === "FACT_SALARY_FIELD_DUPLICATED",
		);
		expect(duplicatedIssue?.affectedFactKeys).toEqual([
			SALARY_FACT_KEYS.section17_1,
		]);
	});

	test("blocks when the printed taxable total contradicts the component facts", () => {
		const inconsistent = oneEmployerDocument({
			section17_1: 1200000,
			exemptAllowances: 150000,
			taxableTotal: 999999,
		});
		const result = computeOneEmployer(inconsistent);

		expect(result.kind).toBe("blocked");
		if (result.kind !== "blocked") {
			return;
		}
		expect(String(result.issues[0]?.code)).toBe(
			"FACT_SALARY_TOTAL_MISMATCH",
		);
		expect(result.issues[0]?.severity).toBe("blocking");
	});

	test("blocks when the residency answer was pinned to another rule pack", () => {
		const result = computeOneEmployer(reviewedFixture, answerFor(otherPackId));

		expect(result.kind).toBe("blocked");
		expect(issueCodesOf(result)).toContain("QUESTION_RULE_PACK_MISMATCH");
	});

	test("blocks when the pinned rule pack lacks new-regime constants", () => {
		const barePack = {
			identity: {
				id: otherPackId,
				revision: "2099-01-01",
			},
			taxConstants: undefined,
		};
		const result = computeNewRegimeSalaryScenario({
			rulePack: barePack,
			residentAnswer: answerFor(otherPackId),
			salaryDocuments: [reviewedFixture],
		});

		expect(result.kind).toBe("blocked");
		expect(issueCodesOf(result)).toContain(
			"RULE_NEW_REGIME_CONSTANTS_MISSING",
		);
	});
});

// Every expectation below is an independently worked example: salary minus
// the pinned 75,000 standard deduction, rounded under section 288A, run over
// the FY 2025-26 new-regime schedule, adjusted, cess at four per cent, then
// rounded under section 288B. Statutory half-way ties never arise inside this
// scenario because section 288A fixes total income on a ten-rupee grid before
// any percentage step; the exact-tie behaviour is pinned at the money
// primitive level in packages/model/src/money/exact-money.test.ts.
describe("statutory boundaries across the new-regime scenario", () => {
	const scenario = (taxableTotal: number, answer = residentAnswer()) =>
		computeOneEmployer(
			oneEmployerDocument({
				section17_1: taxableTotal,
				exemptAllowances: 0,
				taxableTotal,
			}),
			answer,
		);
	const summaryOf = (
		taxableTotal: number,
		answer = residentAnswer(),
	): NewRegimeSalaryComputation extends infer T
		? T extends { kind: "computed"; summary: infer S }
			? S
			: never
		: never => {
		const result = scenario(taxableTotal, answer);
		if (result.kind !== "computed") {
			throw new Error(`Expected computed result for ${taxableTotal}`);
		}
		return result.summary;
	};

	test.each([
		[
			"keeps zero liability when deductions absorb all salary",
			{
				taxableTotal: 75000,
				salaryTotal: "75000",
				taxableIncome: "0",
				incomeTaxBeforeAdjustments: "0",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "0",
				finalTaxLiability: "0",
			},
		],
		[
			"charges nothing at the exact nil-band ceiling of four lakh",
			{
				taxableTotal: 475000,
				salaryTotal: "475000",
				taxableIncome: "400000",
				incomeTaxBeforeAdjustments: "0",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "0",
				finalTaxLiability: "0",
			},
		],
		[
			"wipes one rupee above the five per cent threshold through section 87A",
			{
				taxableTotal: 475010,
				salaryTotal: "475010",
				taxableIncome: "400010",
				incomeTaxBeforeAdjustments: "0.5",
				rebateApplied: "0.5",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "0",
				finalTaxLiability: "0",
			},
		],
		[
			"applies the five per cent band fully at eight lakh before rebate erases it",
			{
				taxableTotal: 875000,
				salaryTotal: "875000",
				taxableIncome: "800000",
				incomeTaxBeforeAdjustments: "20000",
				rebateApplied: "20000",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "0",
				finalTaxLiability: "0",
			},
		],
		[
			"gives the full sixty-thousand rebate at the twelve-lakh limit",
			{
				taxableTotal: 1275000,
				salaryTotal: "1275000",
				taxableIncome: "1200000",
				incomeTaxBeforeAdjustments: "60000",
				rebateApplied: "60000",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "0",
				finalTaxLiability: "0",
			},
		],
		[
			"caps tax at ten rupees of excess just past twelve lakh via marginal relief",
			{
				taxableTotal: 1275010,
				salaryTotal: "1275010",
				taxableIncome: "1200010",
				incomeTaxBeforeAdjustments: "60001.5",
				rebateApplied: "0",
				marginalReliefApplied: "59991.5",
				surcharge: "0",
				cess: "0.4",
				finalTaxLiability: "10",
			},
		],
		[
			"rounds a paise fraction down at section 288B",
			{
				taxableTotal: 1408340,
				salaryTotal: "1408340",
				taxableIncome: "1333340",
				incomeTaxBeforeAdjustments: "80001",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "3200.04",
				finalTaxLiability: "83200",
			},
		],
		[
			"rounds a paise fraction up at section 288B",
			{
				taxableTotal: 1345610,
				salaryTotal: "1345610",
				taxableIncome: "1270610",
				incomeTaxBeforeAdjustments: "70591.5",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "2823.66",
				finalTaxLiability: "73420",
			},
		],
		[
			"taxes the fifteen per cent band edge at sixteen lakh exactly",
			{
				taxableTotal: 1675000,
				salaryTotal: "1675000",
				taxableIncome: "1600000",
				incomeTaxBeforeAdjustments: "120000",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "4800",
				finalTaxLiability: "124800",
			},
		],
		[
			"taxes the twenty per cent band edge at twenty lakh exactly",
			{
				taxableTotal: 2075000,
				salaryTotal: "2075000",
				taxableIncome: "2000000",
				incomeTaxBeforeAdjustments: "200000",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "8000",
				finalTaxLiability: "208000",
			},
		],
		[
			"taxes the twenty-five per cent band edge at twenty-four lakh exactly",
			{
				taxableTotal: 2475000,
				salaryTotal: "2475000",
				taxableIncome: "2400000",
				incomeTaxBeforeAdjustments: "300000",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "12000",
				finalTaxLiability: "312000",
			},
		],
		[
			"leaves fifty lakh free of surcharge",
			{
				taxableTotal: 5075000,
				salaryTotal: "5075000",
				taxableIncome: "5000000",
				incomeTaxBeforeAdjustments: "1080000",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "0",
				cess: "43200",
				finalTaxLiability: "1123200",
			},
		],
		[
			"limits surcharge to seven rupees ten rupees past fifty lakh",
			{
				taxableTotal: 5075010,
				salaryTotal: "5075010",
				taxableIncome: "5000010",
				incomeTaxBeforeAdjustments: "1080003",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "7",
				cess: "43200.4",
				finalTaxLiability: "1123210",
			},
		],
		[
			"applies ten per cent surcharge at exactly one crore rupees",
			{
				taxableTotal: 10075000,
				salaryTotal: "10075000",
				taxableIncome: "10000000",
				incomeTaxBeforeAdjustments: "2580000",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "258000",
				cess: "113520",
				finalTaxLiability: "2951520",
			},
		],
		[
			"eases fifteen per cent surcharge into marginal relief ten rupees past one crore",
			{
				taxableTotal: 10075010,
				salaryTotal: "10075010",
				taxableIncome: "10000010",
				incomeTaxBeforeAdjustments: "2580003",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "258007",
				cess: "113520.4",
				finalTaxLiability: "2951530",
			},
		],
		[
			"eases twenty per cent surcharge into marginal relief ten rupees past two crore",
			{
				taxableTotal: 20075010,
				salaryTotal: "20075010",
				taxableIncome: "20000010",
				incomeTaxBeforeAdjustments: "5580003",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "837007",
				cess: "256680.4",
				finalTaxLiability: "6673690",
			},
		],
		[
			"keeps twenty per cent surcharge at exactly five crore before the top tier starts",
			{
				taxableTotal: 50075000,
				salaryTotal: "50075000",
				taxableIncome: "50000000",
				incomeTaxBeforeAdjustments: "14580000",
				rebateApplied: "0",
				marginalReliefApplied: "0",
				surcharge: "2916000",
				cess: "699840",
				finalTaxLiability: "18195840",
			},
		],
	])("%s", (_label, expected) => {
		expect(summaryOf(expected.taxableTotal)).toEqual({
			salaryTotal: expected.salaryTotal,
			taxableIncome: expected.taxableIncome,
			incomeTaxBeforeAdjustments: expected.incomeTaxBeforeAdjustments,
			rebateApplied: expected.rebateApplied,
			marginalReliefApplied: expected.marginalReliefApplied,
			surcharge: expected.surcharge,
			cess: expected.cess,
			finalTaxLiability: expected.finalTaxLiability,
		});
	});

	test("rounds eleven lakh ninety-nine thousand nine hundred ninety-five up to the twelve-lakh rebate line", () => {
		const result = scenario(1274995);
		if (result.kind !== "computed") {
			throw new Error("Expected a computed result");
		}
		const roundedIncome = nodeById(
			result.nodes,
			"derived.total-income-rounded-section-288a",
		);
		expect(roundedIncome.unroundedValue).toBe("1199995");
		expect(roundedIncome.roundedValue).toBe("1200000");
		expect(result.summary.rebateApplied).toBe("60000");
		expect(result.summary.finalTaxLiability).toBe("0");
	});

	test("skips the rebate with a cited reason for a recorded non-resident answer", () => {
		const result = scenario(
			1050000,
			Object.freeze({
				...residentAnswer(),
				value: "no" as const,
				label: "No",
			}),
		);

		if (result.kind !== "computed") {
			throw new Error("Expected a computed result");
		}
		const rebate = nodeById(result.nodes, "derived.rebate-section-87a");
		expect(rebate.unroundedValue).toBe("0");
		expect(rebate.note).toContain("resident individuals");
		const relief = nodeById(
			result.nodes,
			"derived.marginal-relief-section-87a",
		);
		expect(relief.note).toContain("residence requirement");

		expect(result.summary.incomeTaxBeforeAdjustments).toBe("37500");
		expect(result.summary.finalTaxLiability).toBe("39000");
	});
});

describe("determinism of facts, rule pack, and trace", () => {
	const runScenario = () =>
		computeOneEmployer(
			oneEmployerDocument({
				section17_1: 2475010,
				exemptAllowances: 0,
				taxableTotal: 2475010,
			}),
		);

	test("replays byte-identical results for identical facts and rule pack", () => {
		const first = runScenario();
		const second = runScenario();

		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(structuredClone(first)).toEqual(first);
	});

	test("ignores the answer timestamp because it is not a computation input", () => {
		const earlier = computeOneEmployer(
			oneEmployerDocument({
				section17_1: 1275010,
				exemptAllowances: 0,
				taxableTotal: 1275010,
			}),
			Object.freeze({
				...residentAnswer(),
				answeredAt: parseIsoTimestamp("2026-01-01T00:00:00.000Z"),
			}),
		);
		const later = runScenario();

		if (earlier.kind !== "computed" || later.kind !== "computed") {
			throw new Error("Expected computed results");
		}
		expect(later.rulePackRevision).toBe(earlier.rulePackRevision);
	});

	test("keeps the trace internally consistent with its summary", () => {
		const result = runScenario();
		if (result.kind !== "computed") {
			throw new Error("Expected a computed result");
		}

		const liabilityNode = nodeById(
			result.nodes,
			"derived.total-tax-liability-rounded-section-288b",
		);
		expect(result.summary.finalTaxLiability).toBe(
			liabilityNode.roundedValue,
		);

		const bandNodes = result.nodes.filter((candidate) =>
			candidate.nodeId.startsWith("derived.slab-band-tax-"),
		);
		bandNodes.forEach((band, index) => {
			expect(band.nodeId).toBe(
				parseFactKey(`derived.slab-band-tax-${index + 1}`),
			);
		});
		const bandedTotal = bandNodes
			.map((band) => band.roundedValue)
			.reduce(addExactMoney, exactMoneyFromWholeRupees(0));
		expect(bandedTotal).toBe(result.summary.incomeTaxBeforeAdjustments);
	});
});
