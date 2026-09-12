import { parseFactKey } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildAnalysisReadiness } from "./analysis-readiness";

const result = (
	kind: "computed" | "blocked",
) => ({
	id: "estimated-balance",
	label: "Estimated refund or amount payable",
	limitation: "Uses only accepted FY 2025-26 facts.",
	computation:
		kind === "computed"
			? { kind }
			: {
					kind,
					issues: [
						{
							code: "FACT_BANK_INTEREST_MISSING",
							severity: "blocking" as const,
							affectedFactKeys: [parseFactKey("bank-interest.savings-account")],
							recoveryAction: "Supply the missing bank-interest fact.",
						},
					],
				},
} as const);

describe("analysis readiness", () => {
	test("blocks unavailable requested results and names their exact facts", () => {
		const readiness = buildAnalysisReadiness({
			analysisFactSetRevision: undefined,
			confirmedFactSetRevision: undefined,
			primaryRegimeFactSetRevision: undefined,
			pendingRecomputation: false,
			results: [result("blocked")],
			documentIssues: [],
			scopeIssues: [],
			missingFacts: [],
			conflicts: [],
			reviewFacts: [],
		});

		expect(readiness.state).toBe("blocked");
		expect(readiness.issues).toContainEqual(
			expect.objectContaining({
				kind: "computation-issue",
				factKeys: ["bank-interest.savings-account"],
				affectedResults: ["Estimated refund or amount payable"],
			}),
		);
	});

	test("requires review while keeping completed partial results visible", () => {
		const readiness = buildAnalysisReadiness({
			analysisFactSetRevision: "facts-v1",
			confirmedFactSetRevision: undefined,
			primaryRegimeFactSetRevision: "facts-v1",
			pendingRecomputation: false,
			results: [result("computed")],
			documentIssues: [],
			scopeIssues: [],
			missingFacts: [],
			conflicts: [],
			reviewFacts: [
				{
					id: "answer-bank-interest",
					kind: "attested-fact",
					severity: "review",
					factKeys: ["bank-interest.savings-account"],
					affectedResults: ["Current-year analysis"],
					explanation: "This fact came from an attested answer.",
					recoveryAction: "Review the answer before confirming the analysis.",
					targetId: "answer-bank-interest",
				},
			],
		});

		expect(readiness.state).toBe("needs-review");
		expect(readiness.availableResults).toEqual([
			expect.objectContaining({
				id: "estimated-balance",
				limitation: "Uses only accepted FY 2025-26 facts.",
			}),
		]);
	});

	test("becomes analysis-ready only for the confirmed report revision", () => {
		const readiness = buildAnalysisReadiness({
			analysisFactSetRevision: "facts-v1",
			confirmedFactSetRevision: "facts-v1",
			primaryRegimeFactSetRevision: "facts-v1",
			pendingRecomputation: false,
			results: [result("computed")],
			documentIssues: [],
			scopeIssues: [],
			missingFacts: [],
			conflicts: [],
			reviewFacts: [],
		});

		expect(readiness).toMatchObject({ state: "analysis-ready", issues: [] });
	});
});
