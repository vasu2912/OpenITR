import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const openDeductions = async (page: Parameters<typeof openDocumentIntake>[0]) => {
	await openDocumentIntake(page);
	await selectSourceFiles(page, [
		{
			name: "synthetic-salary.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		},
	]);
	await expect(
		page.getByLabel(
			"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
		),
	).toBeVisible({ timeout: 30_000 });
};

const record = async (
	page: Parameters<typeof openDocumentIntake>[0],
	prompt: string,
	value: string,
) => {
	const input = page.getByLabel(prompt);
	if ((await input.evaluate((element) => element.tagName)) === "SELECT") {
		await input.selectOption(value);
	} else {
		await input.fill(value);
	}
	await input
		.locator("xpath=ancestor::form")
		.getByRole("button", { name: "Record answer" })
		.click();
};

test.describe("savings and pension-contribution deductions", () => {
	test("keeps category questions hidden after an explicit no", async ({ page }) => {
		await openDeductions(page);
		await record(
			page,
			"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
			"no",
		);
		const card = page.locator(".openitr-savings-pension-card");
		await expect(card).toContainText("Old-regime deduction");
		await expect(card).toContainText("₹ 0");
		await expect(
			page.getByLabel("What was your eligible section 80C amount for FY 2025-26?"),
		).toHaveCount(0);
	});

	test("shows claimed amounts, regime results, proof warning, trace, and provenance", async ({
		page,
	}) => {
		await openDeductions(page);
		for (const [prompt, value] of [
			[
				"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
				"yes",
			],
			["What was your eligible section 80C amount for FY 2025-26?", "100000"],
			[
				"What did you contribute to an eligible section 80CCC pension annuity for FY 2025-26?",
				"60000",
			],
			["What did you contribute under section 80CCD(1) for FY 2025-26?", "50000"],
			["Were you an employee for the section 80CCD(1) contribution?", "yes"],
			["What salary amount is the section 80CCD(1) percentage based on?", "300000"],
			[
				"What additional contribution did you allocate to section 80CCD(1B) for FY 2025-26?",
				"60000",
			],
			[
				"How much did Central or State Government employers contribute under section 80CCD(2)?",
				"150000",
			],
			[
				"What salary base applies to those government-employer contributions?",
				"1000000",
			],
			[
				"How much did PSU or other employers contribute under section 80CCD(2)?",
				"150000",
			],
			[
				"What salary base applies to those PSU or other-employer contributions?",
				"1000000",
			],
			[
				"Do you have supporting details available for every positive savings or pension amount?",
				"no",
			],
		] as const) {
			await record(page, prompt, value);
		}

		const card = page.locator(".openitr-savings-pension-card");
		await expect(card).toContainText("₹ 4,40,000");
		await expect(card).toContainText("₹ 2,80,000");
		await expect(card).toContainText("80CCD(1B)");
		await expect(card).toContainText("Claimed ₹ 60,000");
		await expect(card).toContainText(
			"ANALYSIS_SAVINGS_PENSION_PROOF_NOT_AVAILABLE",
		);
		await card
			.locator("details")
			.filter({ hasText: "New-regime savings and personal-pension exclusions" })
			.getByText("New-regime savings and personal-pension exclusions")
			.click();
		await expect(card).toContainText("ITR1-NR-CHAPTER-VIA-EXCLUSIONS");
		await expect(page.locator(".openitr-recorded-answers")).toContainText(
			"Question revision 2026-09-10",
		);
	});

	test("associates invalid and missing-base errors and remains usable on mobile", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openDeductions(page);
		await record(
			page,
			"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
			"yes",
		);
		const section80c = page.getByLabel(
			"What was your eligible section 80C amount for FY 2025-26?",
		);
		await section80c.fill("-1");
		await section80c.press("Tab");
		const submit = section80c
			.locator("xpath=ancestor::form")
			.getByRole("button", { name: "Record answer" });
		await expect(submit).toBeFocused();
		await submit.click();
		const error = page.getByRole("alert").filter({
			hasText: "Enter a non-negative amount",
		});
		await expect(error).toBeVisible();
		await expect(section80c).toHaveAttribute("aria-invalid", "true");

		for (const [prompt, value] of [
			["What was your eligible section 80C amount for FY 2025-26?", "0"],
			[
				"What did you contribute to an eligible section 80CCC pension annuity for FY 2025-26?",
				"0",
			],
			["What did you contribute under section 80CCD(1) for FY 2025-26?", "1"],
			["Were you an employee for the section 80CCD(1) contribution?", "yes"],
			[
				"What additional contribution did you allocate to section 80CCD(1B) for FY 2025-26?",
				"0",
			],
			[
				"How much did Central or State Government employers contribute under section 80CCD(2)?",
				"0",
			],
			[
				"How much did PSU or other employers contribute under section 80CCD(2)?",
				"0",
			],
			[
				"Do you have supporting details available for every positive savings or pension amount?",
				"yes",
			],
		] as const) {
			await record(page, prompt, value);
		}
		await expect(page.locator(".openitr-savings-pension-card")).toContainText(
			"FACT_80CCD1_INCOME_BASE_MISSING",
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
});
