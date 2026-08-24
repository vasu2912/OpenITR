import {
	computeSourceDocumentIdentity,
	DOCUMENT_REVIEW_ISSUE_CODES,
} from "@openitr/model";
import type {
	DocumentExtractionOutcome,
	InspectableSourceDocument,
	Sha256Digest,
} from "@openitr/model";
import { describe, expect, test } from "vitest";

import { createForm16PdfAdapter } from "./form16-pdf-adapter";

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

const extractForm16 = (
	input: InspectableSourceDocument,
): Promise<DocumentExtractionOutcome> => {
	const extract = createForm16PdfAdapter().extract;
	if (extract === undefined) {
		throw new Error("Form 16 revision must support observation extraction");
	}
	return extract(input);
};

// The generator fixes every row at x=72 with baseline y = 720 - 16 * rowIndex
// and a 12pt font. Width and height are measured by the PDF engine, so the
// exact assertions cover position and page; size is asserted positive and
// proven stable by the determinism test.
const ROW_BASELINE_Y = [640, 624, 608] as const;

describe("Form 16 Part A salary extraction", () => {
	test("produces exact canonical observations for the supported revision", async () => {
		const bytes = await import("../testing").then((m) =>
			m.createForm16SalaryPdfFixture(),
		);
		const outcome = await extractForm16({
			identity: await identityOf(bytes),
			displayName: "form16-salary.pdf",
			bytes,
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			return;
		}

		const { contentSha256: identity } = await computeSourceDocumentIdentity({ bytes });
		expect(outcome.observations).toHaveLength(3);
		expect(outcome.issues).toEqual([]);

		const byFactKey = (factKey: string) =>
			outcome.observations.find((o) => o.factKey === factKey);
		const section17 = byFactKey("salary.section-17-1");
		const exemptAllowances = byFactKey("salary.exempt-allowances-section-10");
		const taxable = byFactKey("salary.taxable-total");

		expect(section17?.observationId).toBe(`salary.section-17-1@${identity}`);
		expect(section17?.originalText).toBe(
			"Salary as per provisions contained in section 17(1): Rs 12,00,000",
		);
		expect(section17?.normalizedValue).toBe(1200000);
		expect(section17?.sourceDocumentId).toBe(identity);
		expect(section17?.adapterId).toBe("form16-pdf");
		expect(section17?.adapterVersion).toBe("1");
		expect(section17?.ruleCitation.ruleId).toBe(
			"FORM16-PARTA-SALARY-SECTION-17-1",
		);
		expect(section17?.transformationSteps).toEqual([
			{
				order: 1,
				operation: "trim-whitespace",
				input: " Rs 12,00,000",
				output: "Rs 12,00,000",
			},
			{
				order: 2,
				operation: "strip-currency-prefix",
				input: "Rs 12,00,000",
				output: "12,00,000",
			},
			{
				order: 3,
				operation: "remove-indian-digit-grouping",
				input: "12,00,000",
				output: "1200000",
			},
			{
				order: 4,
				operation: "parse-whole-rupees",
				input: "1200000",
				output: "1200000",
			},
		]);
		expect(section17?.evidence).toMatchObject({
			kind: "pdf-page-region",
			page: 1,
			x: 72,
			y: ROW_BASELINE_Y[0],
		});
		expect(section17?.evidence.kind).toBe("pdf-page-region");
		expect(
			section17?.evidence.kind === "pdf-page-region"
				? section17.evidence.width
				: undefined,
		).toBeGreaterThan(0);
		expect(
			section17?.evidence.kind === "pdf-page-region"
				? section17.evidence.height
				: undefined,
		).toBeGreaterThan(0);

		expect(exemptAllowances?.factKey).toBe(
			"salary.exempt-allowances-section-10",
		);
		expect(exemptAllowances?.normalizedValue).toBe(150000);
		expect(exemptAllowances?.originalText).toBe(
			"Less: Allowance to the extent exempt u/s 10: Rs 1,50,000",
		);
		expect(exemptAllowances?.evidence.kind).toBe("pdf-page-region");
		expect(
			exemptAllowances?.evidence.kind === "pdf-page-region"
				? exemptAllowances.evidence.y
				: undefined,
		).toBe(ROW_BASELINE_Y[1]);

		expect(taxable?.factKey).toBe("salary.taxable-total");
		expect(taxable?.normalizedValue).toBe(1050000);
		expect(taxable?.originalText).toBe("Taxable salary: Rs 10,50,000");
		expect(
			taxable?.evidence.kind === "pdf-page-region"
				? taxable.evidence.y
				: undefined,
		).toBe(ROW_BASELINE_Y[2]);

		expect(outcome.pages).toHaveLength(1);
		expect(outcome.pages[0]?.page).toBe(1);
		expect(outcome.pages[0]?.lines).toHaveLength(8);
		expect(outcome.pages[0]?.lines[5]).toEqual({
			lineNumber: 6,
			text: "Salary as per provisions contained in section 17(1): Rs 12,00,000",
		});
	});

	test("is deterministic for the same fixture", async () => {
		const testing = await import("../testing");
		const bytes = testing.createForm16SalaryPdfFixture();
		const sharedIdentity = await identityOf(bytes);

		const first: DocumentExtractionOutcome = await extractForm16({
			identity: sharedIdentity,
			displayName: "a.pdf",
			bytes,
		});
		const second = await extractForm16({
			identity: sharedIdentity,
			displayName: "totally-different-name.pdf",
			bytes,
		});

		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
		// A structured clone is exactly what a worker boundary does to the
		// outcome; determinism must survive it.
		expect(structuredClone(first)).toEqual(second);
	});

	test("ignores a misleading filename and MIME type", async () => {
		const testing = await import("../testing");
		const bytes = testing.createForm16SalaryPdfFixture();
		const outcome = await extractForm16({
			identity: await identityOf(bytes),
			displayName: "holiday-photo.jpg",
			suppliedMediaType: "image/jpeg",
			bytes,
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(outcome.observations.map((o) => o.normalizedValue)).toEqual([
				150000,
				1200000,
				1050000,
			]);
		}
	});

	test("reports a missing required field without inventing an observation", async () => {
		const testing = await import("../testing");
		const bytes = testing.createForm16SalaryPdfFixture({
			omitLabel: "Taxable salary",
		});
		const outcome = await extractForm16({
			identity: await identityOf(bytes),
			displayName: "partial.pdf",
			bytes,
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			return;
		}
		expect(outcome.observations.map((o) => o.factKey)).not.toContain(
			"salary.taxable-total",
		);
		expect(outcome.issues).toEqual([
			{
				code: DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldMissing,
				severity: "review",
				affectedFactKeys: ["salary.taxable-total"],
				recoveryAction: expect.any(String),
			},
		]);
	});

	test("reports a duplicated field without choosing between matches", async () => {
		const testing = await import("../testing");
		const bytes = testing.createForm16SalaryPdfFixture({
			duplicateLabel: "Salary as per provisions contained in section 17(1)",
		});
		const outcome = await extractForm16({
			identity: await identityOf(bytes),
			displayName: "duplicated.pdf",
			bytes,
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind !== "extracted") {
			return;
		}
		expect(outcome.observations.map((o) => o.factKey)).not.toContain(
			"salary.section-17-1",
		);
		expect(outcome.issues).toEqual([
			{
				code: DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldAmbiguous,
				severity: "review",
				affectedFactKeys: ["salary.section-17-1"],
				recoveryAction: expect.any(String),
			},
		]);
	});
});

test("reports every field missing for a changed template without inventing facts", async () => {
	const testing = await import("../testing");
	const allOmitted = testing.createForm16SalaryPdfFixture({
		omitLabel: "",
	});
	const outcome = await extractForm16({
		identity: await identityOf(allOmitted),
		displayName: "changed-template.pdf",
		bytes: allOmitted,
	});

	expect(outcome.kind).toBe("extracted");
	if (outcome.kind !== "extracted") {
		return;
	}
	expect(outcome.observations).toHaveLength(0);
	expect(outcome.issues.map((issue) => issue.code)).toEqual([
		DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldMissing,
		DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldMissing,
		DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldMissing,
	]);
});
