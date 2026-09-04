import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const openHousePropertyQuestions = async (page: Parameters<typeof openDocumentIntake>[0]) => {
	await openDocumentIntake(page, { "scope-house-property-count": "1" });
	await selectSourceFiles(page, [{
		name: "synthetic-house-property-salary.pdf",
		mimeType: "application/pdf",
		buffer: bufferOf(createForm16SalaryPdfFixture()),
	}]);
	await expect(page.getByLabel("Did you own the self-occupied property during FY 2025-26?")).toBeVisible({ timeout: 30_000 });
};

const answerCurrent = async (
	page: Parameters<typeof openDocumentIntake>[0],
	label: string | RegExp,
	value: string,
) => {
	const input = page.getByLabel(label);
	if ((await input.evaluate((element) => element.tagName)) === "SELECT") {
		await input.selectOption(value);
	} else {
		await input.fill(value);
	}
	await input.locator("xpath=ancestor::form").getByRole("button", { name: "Record answer" }).click();
};

test.describe("self-occupied house-property analysis", () => {
	test("shows distinct cited old- and new-regime results", async ({ page }) => {
		await openHousePropertyQuestions(page);
		await answerCurrent(page, "Did you own the self-occupied property during FY 2025-26?", "yes");
		await answerCurrent(page, "Was the property self-occupied throughout FY 2025-26?", "yes");
		await answerCurrent(page, "How much interest on borrowed capital was payable for this property in FY 2025-26?", "250000");
		await answerCurrent(page, "Was the loan used to acquire or construct the property?", "yes");
		await answerCurrent(page, "Was the capital borrowed on or after 1 April 1999?", "yes");
		await answerCurrent(page, /Was acquisition or construction completed within five years/, "yes");
		await answerCurrent(page, "Do you have the lender's certificate for the interest payable?", "yes");

		const result = page.locator(".openitr-property-card");
		await expect(result.getByRole("heading", { name: "Old regime" })).toBeVisible();
		await expect(result.getByRole("heading", { name: "New regime" })).toBeVisible();
		await expect(result.getByText("₹ 2,00,000").first()).toBeVisible();
		const newRegime = result.locator(".openitr-property-regime").filter({ hasText: "New regime" });
		await expect(newRegime.getByText("Interest deduction").locator("xpath=following-sibling::dd")).toHaveText("₹ 0");
		await result.locator("details").first().getByText("Self-occupied annual value").click();
		await expect(result.getByText("ITR1-SELF-OCCUPIED-ANNUAL-VALUE-SECTION-23").first()).toBeVisible();
		await result.locator("details").nth(1).getByText("Old-regime interest deduction").click();
		await expect(result.getByText("ITR1-OR-SELF-OCCUPIED-INTEREST-SECTION-24B")).toBeVisible();
	});

	test("keeps missing and unsupported answers explicit and keyboard reachable", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openHousePropertyQuestions(page);
		const owner = page.getByLabel("Did you own the self-occupied property during FY 2025-26?");
		await owner.focus();
		await expect(owner).toBeFocused();
		await page.keyboard.press("Tab");
		const form = owner.locator("xpath=ancestor::form");
		await expect(form.getByRole("button", { name: "Record answer" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(form.getByRole("alert")).toContainText("Select Yes or No");
		await owner.selectOption("yes");
		await form.getByRole("button", { name: "Record answer" }).click();
		await answerCurrent(page, "Was the property self-occupied throughout FY 2025-26?", "no");
		const result = page.locator(".openitr-property-card");
		await expect(result).toContainText("RULE_HOUSE_PROPERTY_NOT_SELF_OCCUPIED");
		await expect(result).toContainText("Use the let-out property analysis");
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	});
});
