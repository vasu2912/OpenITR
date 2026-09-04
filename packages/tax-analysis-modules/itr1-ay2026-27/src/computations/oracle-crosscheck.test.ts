// Independent oracle: FY 2025-26 new regime implemented from scratch with
// BigInt sub-paise fixed-point arithmetic (scale 1e-6 rupees). Shares no code
// with the engine under test beyond the rule-pack constants it must read.
import { describe, expect, test } from "vitest";

import {
	computeNewRegimeSalaryScenario,
} from "./new-regime-salary";
import type { NewRegimeSalaryComputation } from "./new-regime-salary";
import { itr1Ay202627RulePack } from "../rule-pack";
import {
	parseFactKey,
	parseIsoTimestamp,
	parseQuestionId,
	parseSha256Digest,
} from "@openitr/model";

const SCALE = 1_000_000n; // sub-units per rupee
const TEN_RUPEES = 10n * SCALE;

const toSub = (canonical: string): bigint => {
	const negative = canonical.startsWith("-");
	const body = negative ? canonical.slice(1) : canonical;
	const [wholePart = "", fraction = ""] = body.split(".");
	if (!/^\d+$/.test(wholePart) || !/^\d{0,6}$/.test(fraction)) {
		throw new Error(`non-canonical amount: ${canonical}`);
	}
	const value =
		BigInt(wholePart) * SCALE +
		BigInt(fraction.padEnd(6, "0").slice(0, 6));
	return negative ? -value : value;
};

const bands: readonly { upper: bigint | null; pct: bigint }[] = [
	{ upper: 400000n * SCALE, pct: 0n },
	{ upper: 800000n * SCALE, pct: 5n },
	{ upper: 1200000n * SCALE, pct: 10n },
	{ upper: 1600000n * SCALE, pct: 15n },
	{ upper: 2000000n * SCALE, pct: 20n },
	{ upper: 2400000n * SCALE, pct: 25n },
	{ upper: null, pct: 30n },
];

const slabTax = (income: bigint): bigint => {
	let tax = 0n;
	let lower = 0n;
	for (const band of bands) {
		if (income <= lower) break;
		const width =
			band.upper === null || income < band.upper
				? income - lower
				: band.upper - lower;
		tax += (width * band.pct) / 100n; // exact: width*pct always divides? no—see below
		if (band.upper === null) break;
		lower = band.upper;
	}
	return tax;
};

// width*pct may not divide by 100 exactly in sub-units? width is in 1e-6
// rupees; width*5/100 keeps full precision only if divisible. Guard:
const exactPercent = (amount: bigint, pct: bigint): bigint => {
	const product = amount * pct;
	if (product % 100n !== 0n) {
		throw new Error(`oracle precision loss: ${amount} x ${pct}%`);
	}
	return product / 100n;
};

const slabTaxExact = (income: bigint): bigint => {
	let tax = 0n;
	let lower = 0n;
	for (const band of bands) {
		if (income <= lower) break;
		const width =
			band.upper === null || income < band.upper
				? income - lower
				: band.upper - lower;
		tax += exactPercent(width, band.pct);
		if (band.upper === null) break;
		lower = band.upper;
	}
	return tax;
};

void slabTax;

const round288 = (amount: bigint): bigint => {
	const remainder = ((amount % TEN_RUPEES) + TEN_RUPEES) % TEN_RUPEES;
	const base = amount - remainder;
	return remainder * 2n >= TEN_RUPEES ? base + TEN_RUPEES : base;
};

const surchargeFor = (income: bigint, taxAfterAdjustments: bigint): bigint => {
	const thresholds: readonly { above: bigint; pct: bigint }[] = [
		{ above: 5000000n * SCALE, pct: 10n },
		{ above: 10000000n * SCALE, pct: 15n },
		{ above: 20000000n * SCALE, pct: 20n },
		{ above: 50000000n * SCALE, pct: 25n },
	];
	let activeIndex = -1;
	for (const [index, tier] of thresholds.entries()) {
		if (income > tier.above) activeIndex = index;
	}
	if (activeIndex === -1) return 0n;
	const active = thresholds[activeIndex]!;
	const raw = exactPercent(taxAfterAdjustments, active.pct);
	const previous =
		activeIndex === 0 ? undefined : thresholds[activeIndex - 1];
	const taxAtThreshold = slabTaxExact(active.above);
	const surchargeAtPrevious =
		previous === undefined ? 0n : exactPercent(taxAtThreshold, previous.pct);
	const limit =
		income -
		active.above +
		taxAtThreshold +
		surchargeAtPrevious;
	return taxAfterAdjustments + raw > limit ? limit - taxAfterAdjustments : raw;
};

const oracleSummary = (
	salaryWholeRupees: bigint,
	resident: boolean,
): {
	taxableIncome: bigint;
	incomeTaxBeforeAdjustments: bigint;
	rebateApplied: bigint;
	marginalReliefApplied: bigint;
	surcharge: bigint;
	cess: bigint;
	finalTaxLiability: bigint;
} => {
	const afterExemptions = salaryWholeRupees * SCALE;
	const deduction = 75000n * SCALE;
	const beforeRounding = afterExemptions > deduction ? afterExemptions - deduction : 0n;
	const income = round288(beforeRounding);
	const slab = slabTaxExact(income);
	const rebateLimit = 1200000n * SCALE;
	const withinRebate = resident && income <= rebateLimit;
	const rebate = withinRebate ? (slab < 60000n * SCALE ? slab : 60000n * SCALE) : 0n;
	const exceeds = income > rebateLimit;
	const excess = exceeds ? income - rebateLimit : 0n;
	const relief =
		resident && exceeds && slab > excess ? slab - excess : 0n;
	const afterAdjustments = slab - rebate - relief;
	const surcharge = surchargeFor(income, afterAdjustments);
	const cess = exactPercent(afterAdjustments + surcharge, 4n);
	const finalLiability = round288(afterAdjustments + surcharge + cess);
	return {
		taxableIncome: income,
		incomeTaxBeforeAdjustments: slab,
		rebateApplied: rebate,
		marginalReliefApplied: relief,
		surcharge,
		cess,
		finalTaxLiability: finalLiability,
	};
};

const docId = parseSha256Digest("ef".repeat(32));

const engineRun = (
	taxableTotal: number,
	resident: boolean,
): Extract<NewRegimeSalaryComputation, { kind: "computed" }> => {
	const obs = (key: string, value: number) => ({
		observationId: `${key}@${docId}`,
		factKey: parseFactKey(key),
		sourceDocumentId: docId,
		adapterId: "form16-pdf",
		adapterVersion: "1",
		originalText: `${key}: ${value}`,
		normalizedValue: value,
		transformationSteps: [],
		evidence: {
			kind: "pdf-page-region" as const,
			page: 1,
			x: 72,
			y: 600,
			width: 200,
			height: 12,
		},
		ruleCitation: {
			ruleId: "FORM16-PARTA-SALARY-TAXABLE-TOTAL" as never,
			description: "fixture",
		},
		record: { kind: "unidentified-document" as const },
	});
	const result = computeNewRegimeSalaryScenario({
		rulePack: itr1Ay202627RulePack,
		residentAnswer: {
			questionId: parseQuestionId("itr1-resident-individual"),
			value: resident ? "yes" : "no",
			label: resident ? "Yes" : "No",
			answeredAt: parseIsoTimestamp("2026-08-23T09:00:00.000Z"),
			rulePackId: itr1Ay202627RulePack.identity.id,
		},
		salaryDocuments: [
			{
				documentId: docId,
				observations: [
					obs("salary.section-17-1", taxableTotal),
					obs("salary.exempt-allowances-section-10", 0),
					obs("salary.taxable-total", taxableTotal),
				],
			},
		],
	});
	if (result.kind !== "computed") {
		throw new Error(`engine blocked for ${taxableTotal}`);
	}
	return result;
};

describe("independent BigInt oracle cross-check", () => {
	const cases: readonly { total: number; resident: boolean }[] = [
		...Array.from({ length: 1200 }, (_, index) => ({
			total: 75990 + index * 9973,
			resident: true,
		})),
		...Array.from({ length: 300 }, (_, index) => ({
			total: 1275010 + index * 397,
			resident: false,
		})),
		...[
			75000, 475000, 475001, 475005, 874995, 875000, 1274999, 1275000,
			1275005, 1675000, 2075000, 2475000, 5075000, 5075010, 10075000,
			10075005, 10075010, 15075010, 20075000, 20075005, 20075010,
			35075010, 50075000, 50075005, 50075010, 90075010,
		].map((total) => ({ total, resident: true })),
	];

	test(`agrees with the engine on ${cases.length} scenarios`, () => {
		let mismatches = 0;
		for (const { total, resident } of cases) {
			const expected = oracleSummary(BigInt(total), resident);
			const actual = engineRun(total, resident).summary;
			const pairs = [
				["taxableIncome", expected.taxableIncome, actual.taxableIncome],
				[
					"incomeTaxBeforeAdjustments",
					expected.incomeTaxBeforeAdjustments,
					actual.incomeTaxBeforeAdjustments,
				],
				["rebateApplied", expected.rebateApplied, actual.rebateApplied],
				[
					"marginalReliefApplied",
					expected.marginalReliefApplied,
					actual.marginalReliefApplied,
				],
				["surcharge", expected.surcharge, actual.surcharge],
				["cess", expected.cess, actual.cess],
				[
					"finalTaxLiability",
					expected.finalTaxLiability,
					actual.finalTaxLiability,
				],
			] as const;
			for (const [field, oracleValue, engineValue] of pairs) {
				if (toSub(engineValue) !== oracleValue) {
					mismatches += 1;
					console.error(
						`MISMATCH total=${total} resident=${resident} ${field}: engine=${engineValue} oracle=${Number(oracleValue) / 1e6}`,
					);
				}
			}
		}
		expect(mismatches).toBe(0);
	});

	test("never produces a negative intermediate or a liability below slab-minus-adjustments", () => {
		for (const { total, resident } of cases.slice(0, 400)) {
			const summary = engineRun(total, resident).summary;
			const finalSub = toSub(summary.finalTaxLiability);
			const slabSub = toSub(summary.incomeTaxBeforeAdjustments);
			expect(finalSub).toBeGreaterThanOrEqual(0n);
			expect(finalSub).toBeLessThanOrEqual(
				slabSub + toSub(summary.surcharge) + toSub(summary.cess) + 10n * SCALE,
			);
		}
	});
});
