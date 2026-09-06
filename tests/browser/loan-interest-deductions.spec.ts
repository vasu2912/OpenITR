import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const prompts = Object.freeze({
	education: "Do you want to analyze interest on a higher-education loan under section 80E?",
	home: "Do you want to analyze additional first-home loan interest under section 80EE?",
	affordableHome: "Do you want to analyze additional affordable first-home loan interest under section 80EEA?",
	electricVehicle: "Do you want to analyze electric-vehicle loan interest under section 80EEB?",
});

const openDeductions = async (page: Parameters<typeof openDocumentIntake>[0]) => {
	await openDocumentIntake(page);
	await selectSourceFiles(page, [{
		name: "synthetic-salary.pdf",
		mimeType: "application/pdf",
		buffer: bufferOf(createForm16SalaryPdfFixture()),
	}]);
	await expect(page.getByLabel(prompts.education)).toBeVisible({ timeout: 30_000 });
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
	await input.locator("xpath=ancestor::form").getByRole("button", { name: "Record answer" }).click();
};

test.describe("loan-interest deductions", () => {
	test("validates a real calendar date and shows capped 80EEA results with origins and trace", async ({ page }) => {
		await openDeductions(page);
		await record(page, prompts.education, "no");
		await record(page, prompts.home, "no");
		await record(page, prompts.affordableHome, "yes");
		await record(page, prompts.electricVehicle, "no");
		const sanctionDate = page.getByLabel("When was the section 80EEA loan sanctioned?");
		await sanctionDate.evaluate((element) => {
			const input = element as HTMLInputElement;
			input.type = "text";
		});
		await sanctionDate.fill("2022-02-30");
		await sanctionDate.locator("xpath=ancestor::form").getByRole("button", { name: "Record answer" }).click();
		await expect(sanctionDate).toHaveAttribute("aria-invalid", "true");
		await expect(page.getByRole("alert").filter({ hasText: "Enter a valid date" })).toBeVisible();
		await sanctionDate.fill("2022-03-31");
		await sanctionDate.locator("xpath=ancestor::form").getByRole("button", { name: "Record answer" }).click();
		for (const [prompt, value] of [
			["Are you the individual borrower for the section 80EEA housing loan?", "yes"],
			["Was the section 80EEA loan used to acquire residential house property?", "yes"],
			["Was the section 80EEA loan from an eligible financial institution?", "yes"],
			["What was the stamp-duty value of the section 80EEA property?", "4500000"],
			["Did you own no residential house property when the section 80EEA loan was sanctioned?", "yes"],
			["Has the eligible section 24(b) house-property interest limit been applied before section 80EEA?", "yes"],
			["How much additional eligible interest remains for section 80EEA after section 24(b)?", "175000"],
			["Are the lender and loan-account details available for section 80EEA?", "yes"],
		] as const) await record(page, prompt, value);

		const card = page.locator(".openitr-loan-interest-card");
		await expect(card).toContainText("Interest supplied ₹ 1,75,000");
		await expect(card).toContainText("Old regime ₹ 1,50,000");
		await expect(card).toContainText("New regime ₹ 0");
		await card.getByText("Recorded facts and origins").click();
		await expect(card).toContainText("deductions.80eea-sanction-date");
		await expect(card).toContainText("2022-03-31");
		await expect(card).toContainText("Attested answer");
		await card.getByText("Section 80EEA old-regime deduction").click();
		await expect(card).toContainText("ITR1-OR-80EEA-LIMIT-AND-24B-ORDER");
	});

	test("shows an unsupported electric-vehicle purpose as a recoverable mobile blocker without overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openDeductions(page);
		await expect(page.locator(".openitr-sidebar")).toBeHidden();
		expect(
			await page.locator("#openitr-main").evaluate(
				(element) => element.getBoundingClientRect().width,
			),
		).toBeGreaterThanOrEqual(390);
		await record(page, prompts.education, "no");
		await record(page, prompts.home, "no");
		await record(page, prompts.affordableHome, "no");
		await record(page, prompts.electricVehicle, "yes");
		for (const [prompt, value] of [
			["Are you the individual borrower for the section 80EEB vehicle loan?", "yes"],
			["Was the loan used to purchase an exclusively electric vehicle?", "no"],
			["Was the section 80EEB loan from an eligible financial institution?", "yes"],
			["When was the section 80EEB loan sanctioned?", "2023-03-31"],
			["How much qualifying section 80EEB interest did you pay during FY 2025-26?", "100000"],
			["Is this section 80EEB interest excluded from every other deduction?", "yes"],
			["Are the lender, loan-account, and vehicle-registration details available for section 80EEB?", "yes"],
		] as const) await record(page, prompt, value);
		const card = page.locator(".openitr-loan-interest-card");
		await expect(card).toContainText("80EEB: FACT_80EEB_PURPOSE_INELIGIBLE");
		await expect(card).toContainText("exclusively electric vehicle");
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	});
});
