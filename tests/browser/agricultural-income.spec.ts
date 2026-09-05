import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const enterAgriculturalIncome = async (
	page: Parameters<typeof openDocumentIntake>[0],
) => {
	await openDocumentIntake(page, { "scope-agriculture-present": "yes" });
	await selectSourceFiles(page, [
		{
			name: "synthetic-salary.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		},
	]);
	await expect(
		page.getByLabel("What was your agricultural income for FY 2025-26?"),
	).toBeVisible({ timeout: 30_000 });
};

test.describe("agricultural-income explanation", () => {
	test("does not ask for an amount when no income is indicated", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSourceFiles(page, [
			{
				name: "synthetic-salary.pdf",
				mimeType: "application/pdf",
				buffer: bufferOf(createForm16SalaryPdfFixture()),
			},
		]);
		await expect(page.getByText("synthetic-salary.pdf")).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page.getByLabel("What was your agricultural income for FY 2025-26?"),
		).toHaveCount(0);
		await expect(page.locator(".openitr-agricultural-income-card")).toHaveCount(
			0,
		);
	});

	test("asks conditionally and shows the cited exempt treatment at the limit", async ({
		page,
	}) => {
		await enterAgriculturalIncome(page);
		const card = page.locator(".openitr-agricultural-income-card");
		await expect(card).toContainText("FACT_AGRICULTURAL_INCOME_MISSING");

		const amount = page.getByLabel(
			"What was your agricultural income for FY 2025-26?",
		);
		await amount.fill("5000");
		await amount
			.locator("xpath=ancestor::form")
			.getByRole("button", { name: "Record answer" })
			.click();

		await expect(
			card.getByRole("heading", { name: "Agricultural-income explanation" }),
		).toBeVisible();
		await expect(card).toContainText("Agricultural income reported as exempt");
		await expect(card).toContainText("₹ 5,000");
		await expect(card).toContainText("Included in taxable total income");
		await card
			.locator("details")
			.filter({ hasText: "Agricultural income reported as exempt" })
			.getByText("Agricultural income reported as exempt")
			.click();
		await expect(card).toContainText(
			"ITR1-AGRICULTURAL-INCOME-EXEMPT-REPORTING",
		);
		await expect(page.locator(".openitr-recorded-answers")).toContainText(
			"scope.agriculture-income",
		);
		await expect(page.locator(".openitr-recorded-answers")).toContainText(
			"Question revision 2026-09-08",
		);
	});

	test("stops above the limit and remains usable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await enterAgriculturalIncome(page);
		const amount = page.getByLabel(
			"What was your agricultural income for FY 2025-26?",
		);
		await amount.fill("5001");
		await amount.focus();
		await page.keyboard.press("Tab");
		const submit = amount
			.locator("xpath=ancestor::form")
			.getByRole("button", { name: "Record answer" });
		await expect(submit).toBeFocused();
		await page.keyboard.press("Enter");

		const card = page.locator(".openitr-agricultural-income-card");
		await expect(card).toContainText(
			"RULE_AGRICULTURAL_INCOME_ITR1_LIMIT_EXCEEDED",
		);
		await expect(card).toContainText("pinned ITR-1 limit of ₹5000");
		await expect(page.locator(".openitr-estimate-card")).toHaveCount(0);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
});
