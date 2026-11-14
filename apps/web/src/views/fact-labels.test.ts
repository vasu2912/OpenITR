import { FORM16_SALARY_FIELD_DEFINITIONS } from "@openitr/document-adapters";
import { describe, expect, it } from "vitest";

import { activeAnalysisRelease } from "../app/release-manifest";
import { loadRulePack } from "../session/load-rule-pack";
import { createFactLabeler, humanizeKey } from "./fact-labels";

describe("humanizeKey", () => {
	it("turns a derived node id into a readable step name", () => {
		expect(humanizeKey("derived.rebate-section-87a")).toBe(
			"Rebate section 87A",
		);
		expect(
			humanizeKey("derived.total-tax-liability-rounded-section-288b"),
		).toBe("Total tax liability rounded section 288B");
	});

	it("keeps tax acronyms in capitals", () => {
		expect(humanizeKey("tds.tds-deposited")).toBe("TDS deposited");
	});

	it("drops content hashes that only make ids unique", () => {
		expect(
			humanizeKey(
				"derived.salary-source-4a9ca50e424778ebab2efe2c2ecec003e7d2f7ebd06ff5f90c6b011d4cfb9700",
			),
		).toBe("Salary source");
	});
});

describe("createFactLabeler", async () => {
	const rulePack = await loadRulePack(activeAnalysisRelease);
	const labelOf = createFactLabeler(rulePack);

	it("names a scope fact with its catalog label", () => {
		expect(labelOf("scope.taxpayer-is-individual")).toBe(
			"An individual taxpayer",
		);
	});

	it("names a fact the questionnaire asks for with the question prompt", () => {
		expect(labelOf("deductions.savings-pension-present")).toMatch(
			/^Do you want to analyze/,
		);
	});

	it("falls back to a readable key for facts no question asks for", () => {
		expect(labelOf("bank-interest.unknown-field")).toBe("Unknown field");
	});

	it("names document fields with the wording printed on the document", () => {
		const withForm16 = createFactLabeler(
			rulePack,
			FORM16_SALARY_FIELD_DEFINITIONS,
		);
		expect(withForm16("salary.taxable-total")).toBe("Taxable salary");
	});
});
