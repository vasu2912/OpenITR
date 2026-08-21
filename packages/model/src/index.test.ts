import { describe, expect, test } from "vitest";

import { parseAssessmentYear, parseFinancialYear } from "./index";

describe("year ranges", () => {
	test("accepts only consecutive financial and assessment years", () => {
		expect(parseFinancialYear("2025-26")).toBe("2025-26");
		expect(parseAssessmentYear("2099-00")).toBe("2099-00");
		expect(() => parseFinancialYear("2025-99")).toThrow(
			"Invalid financial year",
		);
		expect(() => parseAssessmentYear("2026-25")).toThrow(
			"Invalid assessment year",
		);
	});
});
