import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const record = async (page: Parameters<typeof openDocumentIntake>[0], prompt: string, value: string) => {
	const input = page.getByLabel(prompt);
	if ((await input.evaluate((element) => element.tagName)) === "SELECT") await input.selectOption(value);
	else await input.fill(value);
	await input.locator("xpath=ancestor::form").getByRole("button", { name: "Record answer" }).click();
};

test.describe("remaining deductions", () => {
	test("derives 80TTA from existing interest facts and shows cited evidence on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openDocumentIntake(page);
		await selectSourceFiles(page, [{ name: "synthetic-salary.pdf", mimeType: "application/pdf", buffer: bufferOf(createForm16SalaryPdfFixture()) }]);
		const card = page.locator(".openitr-remaining-deductions-card");
		await expect(card).toContainText("FACT_REMAINING_DEDUCTION_DETAILS_MISSING", { timeout: 30_000 });
		for (const [prompt, value] of [
			["How much savings-account interest did you receive in FY 2025-26?", "14000"],
			["How much interest on deposits (fixed or recurring) did you receive in FY 2025-26?", "60000"],
			["Were you a resident senior citizen for FY 2025-26?", "no"],
			["Do you want to analyze an Agniveer Corpus Fund deduction under section 80CCH?", "no"],
			["Do you want to analyze rent paid under section 80GG?", "no"],
			["Do you want to analyze a contribution under section 80GGA?", "no"],
			["Do you want to analyze a political contribution under section 80GGC?", "no"],
			["Do you need a Chapter VI-A deduction not named in this questionnaire?", "no"],
		] as const) await record(page, prompt, value);
		await expect(card).toContainText("Section 80TTA");
		await expect(card).toContainText("Old regime ₹ 10,000");
		await expect(card).toContainText("New regime ₹ 0");
		await card.getByText("Recorded facts and origins").click();
		await expect(card).toContainText("taxpayer.senior-citizen");
		await card.getByText("Section 80TTA allowed deduction").click();
		await expect(card).toContainText("ITR1-OR-80TTA");
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	});
});
