import { parseExactMoney, parseFactKey } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { itr1Ay202627RulePack20260910 } from "../revisions/2026-09-10/rule-pack";
import {
	computeHealthDisabilityDeductions,
	type HealthDisabilityDeductionFact,
} from "./health-disability-deductions";

const attested = (
	factKey: string,
	value: string | boolean,
): HealthDisabilityDeductionFact => ({
	factKey: parseFactKey(factKey),
	value: typeof value === "boolean" ? value : parseExactMoney(value),
	origin: { kind: "attested-answer", answerId: `answer:${factKey}` },
});

const selections = (
	overrides: Readonly<Record<string, string | boolean>> = {},
): readonly HealthDisabilityDeductionFact[] =>
	Object.entries({
		"deductions.80d-present": false,
		"deductions.80dd-present": false,
		"deductions.80ddb-present": false,
		"deductions.80u-present": false,
		...overrides,
	}).map(([factKey, value]) => attested(factKey, value));

describe("health and disability deductions", () => {
	test("applies both section 80D group caps and the shared preventive-checkup boundary", () => {
		const result = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80d-present": true,
				"deductions.80d-self-family-claimed": true,
				"deductions.80d-self-family-senior": false,
				"deductions.80d-self-family-premium": "23000",
				"deductions.80d-self-family-preventive": "3000",
				"deductions.80d-self-family-premium-noncash": true,
				"deductions.80d-self-family-policy-details": true,
				"deductions.80d-parents-claimed": true,
				"deductions.80d-parents-senior": true,
				"deductions.80d-parents-premium": "0",
				"deductions.80d-parents-preventive": "4000",
				"deductions.80d-parents-medical": "65000",
			}),
		});
		expect(result).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "75000",
			newRegimeTotal: "0",
			categories: [
				{
					category: "80D",
					claimedAmount: "95000",
					oldRegimeAllowed: "75000",
					newRegimeAllowed: "0",
				},
			],
		});
		if (result.kind !== "computed") throw new Error("Expected computation");
		expect(result.trace.map((node) => node.ruleId)).toEqual(
			expect.arrayContaining([
				"ITR1-OR-80D-GROUP-LIMITS",
				"ITR1-OR-80D-PREVENTIVE-CAP",
				"ITR1-NR-80D-EXCLUSION",
			]),
		);
	});

	test("does not move preventive-checkup room between section 80D groups", () => {
		const result = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80d-present": true,
				"deductions.80d-self-family-claimed": true,
				"deductions.80d-self-family-senior": false,
				"deductions.80d-self-family-premium": "25000",
				"deductions.80d-self-family-preventive": "5000",
				"deductions.80d-self-family-premium-noncash": true,
				"deductions.80d-self-family-policy-details": true,
				"deductions.80d-parents-claimed": true,
				"deductions.80d-parents-senior": false,
				"deductions.80d-parents-premium": "0",
				"deductions.80d-parents-preventive": "0",
			}),
		});
		expect(result).toMatchObject({
			kind: "computed",
			oldRegimeTotal: "25000",
			categories: [{ category: "80D", claimedAmount: "30000" }],
		});
	});

	test.each([
		[false, "75000"],
		[true, "125000"],
	] as const)("uses the fixed section 80DD amount at the severe-disability boundary %s", (severe, amount) => {
		const result = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80dd-present": true,
				"deductions.80dd-eligible-dependent": true,
				"deductions.80dd-qualifying-payment": true,
				"deductions.80dd-severe": severe,
				"deductions.80dd-certificate": true,
			}),
		});
		expect(result).toMatchObject({
			kind: "computed",
			categories: [
				{
					category: "80DD",
					oldRegimeAllowed: amount,
					newRegimeAllowed: "0",
					applicablePerson: "eligible-dependent",
				},
			],
		});
	});

	test.each([
		[false, "40000"],
		[true, "100000"],
	] as const)("caps reimbursed section 80DDB expenditure for senior status %s", (senior, amount) => {
		const result = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80ddb-present": true,
				"deductions.80ddb-eligible-person": true,
				"deductions.80ddb-specified-disease": true,
				"deductions.80ddb-senior": senior,
				"deductions.80ddb-expenditure": "140000",
				"deductions.80ddb-reimbursement": "10000",
				"deductions.80ddb-prescription": true,
			}),
		});
		expect(result).toMatchObject({
			kind: "computed",
			categories: [
				{
					category: "80DDB",
					claimedAmount: "130000",
					oldRegimeAllowed: amount,
					newRegimeAllowed: "0",
				},
			],
		});
	});

	test.each([
		[false, "75000"],
		[true, "125000"],
	] as const)("uses the fixed section 80U amount at the severe-disability boundary %s", (severe, amount) => {
		const result = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80u-present": true,
				"deductions.80u-severe": severe,
				"deductions.80u-certificate": true,
			}),
		});
		expect(result).toMatchObject({
			kind: "computed",
			categories: [{ category: "80U", oldRegimeAllowed: amount }],
		});
	});

	test("blocks incompatible medical expenditure and names only section 80D", () => {
		const result = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80d-present": true,
				"deductions.80d-self-family-claimed": true,
				"deductions.80d-self-family-senior": true,
				"deductions.80d-self-family-premium": "10000",
				"deductions.80d-self-family-preventive": "0",
				"deductions.80d-self-family-medical": "5000",
				"deductions.80d-self-family-premium-noncash": true,
				"deductions.80d-self-family-policy-details": true,
				"deductions.80d-parents-claimed": false,
			}),
		});
		expect(result).toMatchObject({
			kind: "blocked",
			issues: [{ code: "FACT_80D_MEDICAL_WITH_INSURANCE_PREMIUM" }],
		});
	});

	test("blocks reimbursement above expenditure and missing certificates by category", () => {
		const excessiveReimbursement = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80ddb-present": true,
				"deductions.80ddb-eligible-person": true,
				"deductions.80ddb-specified-disease": true,
				"deductions.80ddb-senior": false,
				"deductions.80ddb-expenditure": "10000",
				"deductions.80ddb-reimbursement": "10001",
				"deductions.80ddb-prescription": true,
			}),
		});
		expect(excessiveReimbursement).toMatchObject({
			kind: "blocked",
			issues: [{ code: "FACT_80DDB_REIMBURSEMENT_EXCEEDS_EXPENDITURE" }],
		});

		const missingCertificate = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: selections({
				"deductions.80u-present": true,
				"deductions.80u-severe": true,
				"deductions.80u-certificate": false,
			}),
		});
		expect(missingCertificate).toMatchObject({
			kind: "blocked",
			issues: [{ code: "FACT_80U_CERTIFICATE_REQUIRED" }],
		});
	});

	test("keeps every selected category fact and its origin inspectable", () => {
		const evidenceFact: HealthDisabilityDeductionFact = {
			factKey: parseFactKey("deductions.80u-certificate"),
			value: true,
			origin: {
				kind: "accepted-evidence",
				sourceDocumentIds: ["synthetic-certificate"],
			},
		};
		const result = computeHealthDisabilityDeductions({
			rulePack: itr1Ay202627RulePack20260910,
			facts: [
				...selections({
					"deductions.80u-present": true,
					"deductions.80u-severe": false,
				}),
				evidenceFact,
			],
		});
		if (result.kind !== "computed") throw new Error("Expected computation");
		expect(result.facts).toContainEqual(evidenceFact);
	});
});
