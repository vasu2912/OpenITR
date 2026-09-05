import { parseExactMoney, parseFactKey } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260909 } from "../revisions/2026-09-09/rule-pack";
import {
	computeSavingsPensionDeductions,
	type SavingsPensionDeductionFact,
} from "./savings-pension-deductions";

const attested = (
	factKey: string,
	value: string | boolean,
): SavingsPensionDeductionFact => ({
	factKey: parseFactKey(factKey),
	value: typeof value === "boolean" ? value : parseExactMoney(value),
	origin: { kind: "attested-answer", answerId: `answer:${factKey}` },
});

const completeFacts = (
	overrides: Readonly<Record<string, string | boolean>> = {},
): readonly SavingsPensionDeductionFact[] => {
	const values: Readonly<Record<string, string | boolean>> = {
		"deductions.savings-pension-present": true,
		"deductions.80c": "100000",
		"deductions.80ccc": "60000",
		"deductions.80ccd1": "50000",
		"deductions.80ccd1-employed": true,
		"deductions.80ccd1-salary-base": "300000",
		"deductions.80ccd1b": "60000",
		"deductions.80ccd2-government": "150000",
		"deductions.80ccd2-government-salary-base": "1000000",
		"deductions.80ccd2-other": "150000",
		"deductions.80ccd2-other-salary-base": "1000000",
		"deductions.savings-pension-proof-available": false,
		...overrides,
	};
	return Object.entries(values).map(([factKey, value]) => attested(factKey, value));
};

describe("savings and pension-contribution deductions", () => {
	test("applies shared, additional-pension, and employer limits by regime", () => {
		const result = computeSavingsPensionDeductions({
			rulePack: itr1Ay202627RulePack20260909,
			facts: completeFacts(),
		});
		expect(result).toMatchObject({
			kind: "computed",
			oldRegime: {
				sharedClaimed: "190000",
				sharedAllowed: "150000",
				section80ccd1bAllowed: "50000",
				governmentEmployerAllowed: "140000",
				otherEmployerAllowed: "100000",
				totalAllowed: "440000",
			},
			newRegime: {
				sharedAllowed: "0",
				section80ccd1bAllowed: "0",
				governmentEmployerAllowed: "140000",
				otherEmployerAllowed: "140000",
				totalAllowed: "280000",
			},
		});
		if (result.kind !== "computed") throw new Error("Expected computation");
		expect(result.claims).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					category: "80C",
					claimedAmount: "100000",
					applicablePerson: "taxpayer-or-eligible-family",
					origin: { kind: "attested-answer", answerId: "answer:deductions.80c" },
				}),
				expect.objectContaining({
					category: "80CCD(2)-OTHER-EMPLOYER",
					claimedAmount: "150000",
					applicablePerson: "other-employer-for-taxpayer",
				}),
			]),
		);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "ANALYSIS_SAVINGS_PENSION_PROOF_NOT_AVAILABLE",
				severity: "warning",
			}),
		);
		expect(result.trace.map((node) => node.ruleId)).toEqual(
			expect.arrayContaining([
				"ITR1-OR-80CCE-SHARED-LIMIT",
				"ITR1-OR-80CCD1B-LIMIT",
				"ITR1-NR-80CCD2-EMPLOYER-LIMIT",
				"ITR1-NR-CHAPTER-VIA-EXCLUSIONS",
			]),
		);
	});

	test.each([
		["40000", "40000"],
		["40001", "40000"],
	] as const)(
		"caps a non-employee section 80CCD(1) claim of ₹%s at twenty percent of its income base",
		(claimed, allowed) => {
			const result = computeSavingsPensionDeductions({
				rulePack: itr1Ay202627RulePack20260909,
				facts: completeFacts({
					"deductions.80c": "0",
					"deductions.80ccc": "0",
					"deductions.80ccd1": claimed,
					"deductions.80ccd1-employed": false,
					"deductions.80ccd1-salary-base": "0",
					"deductions.80ccd1-gti-base": "200000",
					"deductions.80ccd1b": "0",
					"deductions.80ccd2-government": "0",
					"deductions.80ccd2-other": "0",
				}),
			});
			expect(result).toMatchObject({
				kind: "computed",
				oldRegime: { sharedClaimed: allowed, sharedAllowed: allowed },
			});
		},
	);

	test("keeps new-regime exclusions visible instead of discarding their claims", () => {
		const result = computeSavingsPensionDeductions({
			rulePack: itr1Ay202627RulePack20260909,
			facts: completeFacts(),
		});
		expect(result).toMatchObject({
			kind: "computed",
			newRegime: { sharedAllowed: "0", section80ccd1bAllowed: "0" },
		});
		if (result.kind === "computed") {
			expect(result.claims.find((claim) => claim.category === "80CCD(1B)")?.claimedAmount).toBe(
				"60000",
			);
		}
	});

	test("treats an explicit no as zero deductions without inventing category facts", () => {
		expect(
			computeSavingsPensionDeductions({
				rulePack: itr1Ay202627RulePack20260909,
				facts: [attested("deductions.savings-pension-present", false)],
			}),
		).toMatchObject({
			kind: "computed",
			claims: [],
			oldRegime: { totalAllowed: "0" },
			newRegime: { totalAllowed: "0" },
		});
	});

	test("blocks when a required amount or proof fact is blank instead of treating it as zero", () => {
		expect(
			computeSavingsPensionDeductions({
				rulePack: itr1Ay202627RulePack20260909,
				facts: [attested("deductions.savings-pension-present", true)],
			}),
		).toMatchObject({
			kind: "blocked",
			issue: { code: "FACT_SAVINGS_PENSION_DEDUCTION_MISSING" },
		});
	});

	test("preserves accepted evidence identity on a supported claim", () => {
		const facts = completeFacts().map((fact) =>
			fact.factKey === parseFactKey("deductions.80c")
				? {
					...fact,
					origin: {
						kind: "accepted-evidence" as const,
						sourceDocumentIds: ["source-document-sha256"] as const,
					},
				}
				: fact,
		);
		const result = computeSavingsPensionDeductions({
			rulePack: itr1Ay202627RulePack20260909,
			facts,
		});
		if (result.kind !== "computed") throw new Error("Expected computation");
		expect(result.claims.find((claim) => claim.category === "80C")?.origin).toEqual({
			kind: "accepted-evidence",
			sourceDocumentIds: ["source-document-sha256"],
		});
	});
});
