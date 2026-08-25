import { describe, expect, test } from "vitest";

import { parseGroupedRupeeAmount } from "./grouped-rupee-amount";

describe("grouped rupee amount parsing", () => {
	test("parses an Indian digit-grouped amount with paise and records every step", () => {
		const parsed = parseGroupedRupeeAmount(" 10,00,000.00 ");
		expect(parsed?.value).toBe("1000000");
		expect(parsed?.steps.map((step) => step.operation)).toEqual([
			"trim-whitespace",
			"remove-indian-digit-grouping",
			"parse-exact-rupees",
		]);
	});

	test.each([
		["a non-string node", 500],
		["a negative amount", "-500"],
		["an exponent form", "1e5"],
		["non-ASCII digits", "١٢٣"],
	])("rejects %s", (_label, raw) => {
		expect(parseGroupedRupeeAmount(raw)).toBeUndefined();
	});

	test("rejects a digit string beyond any plausible statement magnitude instead of creating an unbounded money fact", () => {
		expect(parseGroupedRupeeAmount("9".repeat(400))).toBeUndefined();
		expect(parseGroupedRupeeAmount("9".repeat(15))).not.toBeUndefined();
	});
});
