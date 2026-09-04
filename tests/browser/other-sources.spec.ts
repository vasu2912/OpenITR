import {
	createForm16APdfFixture,
	createForm16SalaryPdfFixture,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const answerCurrent = async (
	page: Parameters<typeof openDocumentIntake>[0],
	label: string,
	value: string,
) => {
	const input = page.getByLabel(label);
	await input.fill(value);
	await input.locator("xpath=ancestor::form").getByRole("button", { name: "Record answer" }).click();
};

test.describe("income from other sources analysis", () => {
	test("uses reviewed evidence and shows cited category and regime totals", async ({ page }) => {
		await openDocumentIntake(page, { "scope-other-sources": "yes" });
		await selectSourceFiles(page, [{
			name: "synthetic-form16a.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16APdfFixture()),
		}]);

		await expect(page.getByLabel("How much taxable family pension did you receive in FY 2025-26?")).toBeVisible({ timeout: 30_000 });
		await expect(page.getByLabel("How much ordinary dividend income did you receive in FY 2025-26?")).toHaveCount(0);
		await expect(page.getByLabel("How much permitted interest outside savings accounts and deposits did you receive in FY 2025-26?")).toHaveCount(0);
		await answerCurrent(page, "How much taxable family pension did you receive in FY 2025-26?", "90000");

		const result = page.locator(".openitr-other-sources-card");
		await expect(result.getByRole("heading", { name: "Income from other sources analysis" })).toBeVisible();
		await expect(result.getByText("₹ 2,20,000")).toBeVisible();
		await expect(result.getByText("₹ 2,10,000")).toBeVisible();
		await expect(result).toContainText("Ordinary dividends");
		await expect(result).toContainText("Other permitted interest");
		await expect(result).toContainText("Family pension");
		await result.locator("details").filter({ hasText: "New-regime family-pension deduction" }).getByText("New-regime family-pension deduction").click();
		await expect(result.getByText("ITR1-NR-FAMILY-PENSION-DEDUCTION-SECTION-57-IIA")).toBeVisible();
	});

	test("keeps missing categories explicit and validates answers on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openDocumentIntake(page, { "scope-other-sources": "yes" });
		await selectSourceFiles(page, [{
			name: "synthetic-salary.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		}]);

		const dividends = page.getByLabel("How much ordinary dividend income did you receive in FY 2025-26?");
		await expect(dividends).toBeVisible({ timeout: 30_000 });
		await dividends.focus();
		await page.keyboard.press("Tab");
		const form = dividends.locator("xpath=ancestor::form");
		await expect(form.getByRole("button", { name: "Record answer" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(form.getByRole("alert")).toContainText("Enter a non-negative amount");
		await expect(page.locator(".openitr-other-sources-card")).toContainText("FACT_OTHER_SOURCES_DIVIDENDS_MISSING");
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	});
});
