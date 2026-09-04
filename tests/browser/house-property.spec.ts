import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const openHousePropertyQuestions = async (page: Parameters<typeof openDocumentIntake>[0], propertyCount = "1") => {
	await openDocumentIntake(page, { "scope-house-property-count": propertyCount });
	await selectSourceFiles(page, [{
		name: "synthetic-house-property-salary.pdf",
		mimeType: "application/pdf",
		buffer: bufferOf(createForm16SalaryPdfFixture()),
	}]);
	await expect(page.getByLabel("Did you own property 1 during FY 2025-26?")).toBeVisible({ timeout: 30_000 });
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
		await answerCurrent(page, "Did you own property 1 during FY 2025-26?", "yes");
		await answerCurrent(page, "Was property 1 self-occupied throughout FY 2025-26?", "yes");
		await answerCurrent(page, "How much interest on borrowed capital was payable for property 1 in FY 2025-26?", "250000");
		await answerCurrent(page, "Was the loan for property 1 used to acquire or construct it?", "yes");
		await answerCurrent(page, "Was capital for property 1 borrowed on or after 1 April 1999?", "yes");
		await answerCurrent(page, /Was property 1 acquired or constructed within/, "yes");
		await answerCurrent(page, "Do you have the lender's interest certificate for property 1?", "yes");

		const result = page.locator(".openitr-property-card");
		await expect(result.getByRole("heading", { name: "Old regime" })).toBeVisible();
		await expect(result.getByRole("heading", { name: "New regime" })).toBeVisible();
		await expect(result.getByText("₹ 2,00,000").first()).toBeVisible();
		const newRegime = result.locator(".openitr-property-regime").filter({ hasText: "New regime" });
		await expect(newRegime.getByText("Interest deduction").locator("xpath=following-sibling::dd")).toHaveText("₹ 0");
		await result.locator("details").first().getByText("Property 1 self-occupied annual value").click();
		await expect(result.getByText("ITR1-SELF-OCCUPIED-ANNUAL-VALUE-SECTION-23").first()).toBeVisible();
		await result.locator("details").nth(1).getByText("Property 1 old-regime interest deduction").click();
		await expect(result.getByText("ITR1-OR-SELF-OCCUPIED-INTEREST-SECTION-24B")).toBeVisible();
	});

	test("keeps missing and unsupported answers explicit and keyboard reachable", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openHousePropertyQuestions(page);
		const owner = page.getByLabel("Did you own property 1 during FY 2025-26?");
		await owner.focus();
		await expect(owner).toBeFocused();
		await page.keyboard.press("Tab");
		const form = owner.locator("xpath=ancestor::form");
		await expect(form.getByRole("button", { name: "Record answer" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(form.getByRole("alert")).toContainText("Select Yes or No");
		await owner.selectOption("yes");
		await form.getByRole("button", { name: "Record answer" }).click();
		await answerCurrent(page, "Was property 1 self-occupied throughout FY 2025-26?", "no");
		const result = page.locator(".openitr-property-card");
		await expect(result).toContainText("FACT_HOUSE_PROPERTY_EXPECTED_RENT_MISSING");
		await expect(page.getByLabel("What was the reasonable expected rent for property 1 in FY 2025-26?")).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	});

	test("shows two distinct let-out properties and their combined result", async ({ page }) => {
		await openHousePropertyQuestions(page, "2");
		for (const property of [1, 2] as const) {
			await answerCurrent(page, `Did you own property ${property} during FY 2025-26?`, "yes");
			await answerCurrent(page, `Was property ${property} self-occupied throughout FY 2025-26?`, "no");
			await answerCurrent(page, `How much interest on borrowed capital was payable for property ${property} in FY 2025-26?`, property === 1 ? "50000" : "30000");
			await answerCurrent(page, `What was the reasonable expected rent for property ${property} in FY 2025-26?`, "240000");
			await answerCurrent(page, `What rent was received or receivable for property ${property} in FY 2025-26?`, property === 1 ? "300000" : "180000");
			await answerCurrent(page, `Was actual rent for property ${property} below expected rent because it was vacant?`, property === 1 ? "no" : "yes");
			await answerCurrent(page, `How much municipal tax did you bear and actually pay for property ${property} in FY 2025-26?`, property === 1 ? "20000" : "10000");
		}
		const result = page.locator(".openitr-property-card");
		await expect(result.getByRole("heading", { name: "Property 1: Let-out" })).toBeVisible();
		await expect(result.getByRole("heading", { name: "Property 2: Let-out" })).toBeVisible();
		await expect(result.getByText("₹ 2,35,000 income").first()).toBeVisible();
		const secondProperty = result.locator(".openitr-property-item").filter({ hasText: "Property 2: Let-out" });
		await secondProperty.getByText("Property 2 gross annual value").first().click();
		await expect(secondProperty.getByText("ITR1-LET-OUT-GROSS-ANNUAL-VALUE-SECTION-23").first()).toBeVisible();
	});
});
