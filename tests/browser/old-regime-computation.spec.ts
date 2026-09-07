import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const recordAnswer = async ({
	page,
	label,
	value,
}: Readonly<{
	page: Page;
	label: string;
	value: string;
}>): Promise<void> => {
	const input = page.getByLabel(label);
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

const recordAnswerIfPresent = async ({
	page,
	label,
	value,
}: Readonly<{
	page: Page;
	label: string;
	value: string;
}>): Promise<void> => {
	if ((await page.getByLabel(label).count()) === 0) {
		return;
	}
	await recordAnswer({ page, label, value });
};

test.describe("old-regime computation", () => {
	test("reconciles accepted income to liability and exposes cited steps", async ({
		page,
	}) => {
		await openDocumentIntake(page, { "scope-total-income": "1100000" });
		const bankInterestScope = page.locator(
			'[data-scope-question="scope-bank-interest"]',
		);
		await expect(bankInterestScope).toBeVisible();
		await bankInterestScope
			.locator("#scope-bank-interest-answer")
			.selectOption("no");
		await bankInterestScope
			.getByRole("button", { name: "Record scope answer" })
			.click();
		await selectSourceFiles(page, [
			{
				name: "synthetic-old-regime-salary.pdf",
				mimeType: "application/pdf",
				buffer: bufferOf(createForm16SalaryPdfFixture()),
			},
		]);

		await expect(
			page.getByLabel(
				"Were you a resident senior citizen for FY 2025-26?",
			),
		).toBeVisible({ timeout: 30_000 });

		for (const [label, value] of [
			[
				"How much savings-account interest did you receive in FY 2025-26?",
				"0",
			],
			[
				"How much interest on deposits (fixed or recurring) did you receive in FY 2025-26?",
				"0",
			],
			[
				"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
				"no",
			],
			[
				"Do you want to analyze section 80D health-insurance, preventive-checkup, or eligible senior-citizen medical payments?",
				"no",
			],
			[
				"Do you want to analyze a section 80DD deduction for a dependent person with disability?",
				"no",
			],
			[
				"Do you want to analyze section 80DDB medical treatment for a specified disease?",
				"no",
			],
			[
				"Do you want to analyze section 80U for your own disability?",
				"no",
			],
			[
				"Do you want to analyze interest on a higher-education loan under section 80E?",
				"no",
			],
			[
				"Do you want to analyze additional first-home loan interest under section 80EE?",
				"no",
			],
			[
				"Do you want to analyze additional affordable first-home loan interest under section 80EEA?",
				"no",
			],
			[
				"Do you want to analyze electric-vehicle loan interest under section 80EEB?",
				"no",
			],
			[
				"Do you want to analyze a donation under section 80G?",
				"no",
			],
			[
				"Were you a resident senior citizen for FY 2025-26?",
				"no",
			],
			[
				"Do you want to analyze an Agniveer Corpus Fund deduction under section 80CCH?",
				"no",
			],
			[
				"Do you want to analyze rent paid under section 80GG?",
				"no",
			],
			[
				"Do you want to analyze a contribution under section 80GGA?",
				"no",
			],
			[
				"Do you want to analyze a political contribution under section 80GGC?",
				"no",
			],
			[
				"Do you need a Chapter VI-A deduction not named in this questionnaire?",
				"no",
			],
		] as const) {
			await recordAnswerIfPresent({ page, label, value });
		}

		const computation = page.locator(".openitr-old-regime-card");
		await expect(
			computation.getByRole("heading", { name: "Old-regime tax computation" }),
		).toBeVisible({ timeout: 30_000 });
		await expect(computation.getByText("Salary income after standard deduction")).toBeVisible();
		await expect(computation.getByText("Total income (taxable income, rounded)")).toBeVisible();
		await expect(
			computation
				.locator("dt", { hasText: "Total income (taxable income, rounded)" })
				.locator("xpath=following-sibling::dd")
				.getByText("₹ 10,00,000", { exact: true }),
		).toBeVisible();
		await expect(
			computation.getByText("Final tax liability", { exact: true }),
		).toBeVisible();
		await expect(
			computation
				.locator("dt", { hasText: "Final tax liability" })
				.locator("xpath=following-sibling::dd")
				.getByText("₹ 1,17,000", { exact: true }),
		).toBeVisible();

		await computation
			.locator("details")
			.filter({ hasText: "derived.old-regime-total-tax-liability" })
			.getByText("derived.old-regime-total-tax-liability")
			.click();
		await expect(computation.getByText("ITR1-TAX-ROUNDING-288B")).toBeVisible();
	});
});
