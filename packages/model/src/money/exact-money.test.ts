import { describe, expect, test } from "vitest";

import {
	addExactMoney,
	compareExactMoney,
	divideExactMoneyByWholeAndRound,
	exactMoneyFromWholeRupees,
	maxExactMoney,
	minExactMoney,
	multiplyByWholePercent,
	parseExactMoney,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "./exact-money";

const m = (value: string): ReturnType<typeof parseExactMoney> =>
	parseExactMoney(value);

describe("exact money parsing", () => {
	test("parses whole rupees into a canonical non-exponential value", () => {
		expect(parseExactMoney("1200000")).toBe("1200000");
	});

	test("keeps decimal paise without binary floating point drift", () => {
		expect(parseExactMoney("60001.50")).toBe("60001.5");
		expect(parseExactMoney("0.05")).toBe("0.05");
		expect(parseExactMoney("1080000.15")).toBe("1080000.15");
	});

	test("normalizes trailing zeros deterministically", () => {
		expect(parseExactMoney("1200000.00")).toBe("1200000");
		expect(parseExactMoney("0.100")).toBe("0.1");
	});

	test("rejects malformed or negative amounts", () => {
		for (const invalid of [
			"",
			"1,00,000",
			"-5",
			"Rs 5",
			"1e6",
			".5",
			"5.",
			"abc",
			"NaN",
			"Infinity",
			"+5",
			"0x10",
		]) {
			expect(() => parseExactMoney(invalid)).toThrow();
		}
	});

	test("rejects values beyond the engine precision envelope", () => {
		expect(() => parseExactMoney("9".repeat(40))).toThrow(
		"Exact money exceeds 39 digits",
	);
		expect(parseExactMoney("9".repeat(39))).toBe("9".repeat(39));
	});
});

describe("exact money construction from observations", () => {
	test("builds from safe integer whole rupees", () => {
		expect(exactMoneyFromWholeRupees(1050000)).toBe("1050000");
		expect(exactMoneyFromWholeRupees(0)).toBe("0");
	});

	test("rejects fractional, unsafe, and negative numbers", () => {
		expect(() => exactMoneyFromWholeRupees(1.5)).toThrow();
		expect(() => exactMoneyFromWholeRupees(Number.NaN)).toThrow();
		expect(() => exactMoneyFromWholeRupees(Number.MAX_SAFE_INTEGER + 1)).toThrow();
		expect(() => exactMoneyFromWholeRupees(-1)).toThrow();
	});
});

describe("exact money arithmetic", () => {
	test("adds exactly across decimal amounts", () => {
		expect(addExactMoney(m("60000"), m("1.5"))).toBe("60001.5");
		expect(addExactMoney(m("0.1"), m("0.2"))).toBe("0.3");
	});

	test("allows one carry digit but rejects an arithmetic overflow", () => {
		expect(addExactMoney(m("9".repeat(39)), m("9".repeat(39)))).toBe(
			`1${"9".repeat(38)}8`,
		);
		const maximumInput = m("9".repeat(39));
		const withinEnvelope = Array.from({ length: 10 }).reduce<
			ReturnType<typeof m>
		>(
			(total) => addExactMoney(total, maximumInput),
			m("0"),
		);
		expect(() =>
			addExactMoney(withinEnvelope, maximumInput),
		).toThrow("Exact money result exceeds the supported precision");
	});

	test("subtracts exactly and never produces a negative amount", () => {
		expect(subtractExactMoney(m("75000"), m("0.25"))).toBe("74999.75");
		expect(() => subtractExactMoney(m("1"), m("1.01"))).toThrow();
	});

	test("multiplies by whole percentages exactly", () => {
		expect(multiplyByWholePercent(m("60000"), 5)).toBe("3000");
		expect(multiplyByWholePercent(m("60001.5"), 15)).toBe("9000.225");
		expect(multiplyByWholePercent(m("1080000"), 4)).toBe("43200");
		expect(multiplyByWholePercent(m("8.65"), 4)).toBe("0.346");
		expect(multiplyByWholePercent(m("2580000"), 30)).toBe("774000");
	});

	test("rejects out-of-range percentages", () => {
		expect(() => multiplyByWholePercent(m("100"), -1)).toThrow();
		expect(() => multiplyByWholePercent(m("100"), 101)).toThrow();
		expect(() => multiplyByWholePercent(m("100"), 4.5)).toThrow();
	});

	test("divides by a whole number and returns an exact whole-rupee result", () => {
		expect(divideExactMoneyByWholeAndRound(m("30000"), 3)).toBe("10000");
		expect(divideExactMoneyByWholeAndRound(m("100"), 3)).toBe("33");
		expect(divideExactMoneyByWholeAndRound(m("101"), 3)).toBe("34");
	});

	test("rejects a non-positive or fractional divisor", () => {
		expect(() => divideExactMoneyByWholeAndRound(m("100"), 0)).toThrow();
		expect(() => divideExactMoneyByWholeAndRound(m("100"), 1.5)).toThrow();
	});
});

describe("statutory rounding to a multiple", () => {
	test("keeps exact multiples unchanged", () => {
		expect(roundToNearestMultipleOf(m("1200000"), m("10"))).toBe("1200000");
	});

	test("rounds to the nearer multiple", () => {
		expect(roundToNearestMultipleOf(m("975003"), m("10"))).toBe("975000");
		expect(roundToNearestMultipleOf(m("975007"), m("10"))).toBe("975010");
		expect(roundToNearestMultipleOf(m("83201.04"), m("10"))).toBe("83200");
	});

	test("breaks ties upward as section 288A and 288B require", () => {
		expect(roundToNearestMultipleOf(m("1199995"), m("10"))).toBe("1200000");
		expect(roundToNearestMultipleOf(m("62405"), m("10"))).toBe("62410");
	});

	test("rejects rounding a negative amount", () => {
		expect(() => roundToNearestMultipleOf(m("-1"), m("10"))).toThrow();
		expect(() => roundToNearestMultipleOf(m("100"), m("0"))).toThrow();
	});
});

describe("exact money comparison", () => {
	test("orders by numeric value, not text order", () => {
		expect(compareExactMoney(m("9"), m("100"))).toBe(-1);
		expect(compareExactMoney(m("100"), m("9"))).toBe(1);
		expect(compareExactMoney(m("100"), m("100.0"))).toBe(0);
		expect(minExactMoney(m("601.5"), m("60000"))).toBe("601.5");
		expect(maxExactMoney(m("601.5"), m("60000"))).toBe("60000");
	});
});
