import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const prompts = Object.freeze({
	health: "Do you want to analyze section 80D health-insurance, preventive-checkup, or eligible senior-citizen medical payments?",
	dependent: "Do you want to analyze a section 80DD deduction for a dependent person with disability?",
	disease: "Do you want to analyze section 80DDB medical treatment for a specified disease?",
	taxpayer: "Do you want to analyze section 80U for your own disability?",
});

const openDeductions = async (page: Parameters<typeof openDocumentIntake>[0]) => {
	await openDocumentIntake(page);
	await selectSourceFiles(page, [
		{
			name: "synthetic-salary.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		},
	]);
	await expect(page.getByLabel(prompts.health)).toBeVisible({ timeout: 30_000 });
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

const recordUnselectedCategories = async (
	page: Parameters<typeof openDocumentIntake>[0],
) => {
	await record(page, prompts.dependent, "no");
	await record(page, prompts.disease, "no");
	await record(page, prompts.taxpayer, "no");
};

test.describe("health and disability deductions", () => {
	test("keeps category details hidden after explicit No answers", async ({ page }) => {
		await openDeductions(page);
		await record(page, prompts.health, "no");
		await recordUnselectedCategories(page);

		const card = page.locator(".openitr-health-disability-card");
		await expect(card).toContainText("No health or disability deduction category was selected.");
		await expect(card).toContainText("Old-regime deduction");
		await expect(card).toContainText("New-regime deduction");
		await expect(
			page.getByLabel("Does the section 80D claim include you, your spouse, or dependent children?"),
		).toHaveCount(0);
	});

	test("shows capped 80D results, cited regime trace, and recorded origins", async ({
		page,
	}) => {
		await openDeductions(page);
		for (const [prompt, value] of [
			[prompts.health, "yes"],
			["Does the section 80D claim include you, your spouse, or dependent children?", "yes"],
			["Was anyone in the section 80D self, spouse, or dependent-child group a senior citizen?", "no"],
			["How much health-insurance premium was paid for the section 80D self-and-family group?", "23000"],
			["How much was paid for preventive health checkups for the section 80D self-and-family group?", "3000"],
			["Was every self-and-family health-insurance premium payment made by an eligible non-cash mode?", "yes"],
			["Are insurer and policy details available for the self-and-family health-insurance premium?", "yes"],
			["Does the section 80D claim include either of your parents?", "yes"],
			["Was either parent in the section 80D parent group a senior citizen?", "yes"],
			["How much health-insurance premium was paid for the section 80D parent group?", "0"],
			["How much was paid for preventive health checkups for the section 80D parent group?", "4000"],
			["How much eligible medical expenditure was paid for senior citizens in the parent group?", "65000"],
		] as const) {
			await record(page, prompt, value);
		}
		await recordUnselectedCategories(page);

		const card = page.locator(".openitr-health-disability-card");
		await expect(card).toContainText("Claimed ₹ 95,000");
		await expect(card).toContainText("Old regime ₹ 75,000");
		await expect(card).toContainText("New regime ₹ 0");
		await card.getByText("Recorded facts and origins").click();
		await expect(card).toContainText("deductions.80d-parents-medical");
		await expect(card).toContainText("Attested answer");
		await card.getByText("New-regime section 80D exclusion").click();
		await expect(card).toContainText("ITR1-NR-80D-EXCLUSION");
		await expect(page.locator(".openitr-recorded-answers")).toContainText(
			"Question revision 2026-09-10",
		);
	});

	test("associates invalid input and explains an incompatible section 80D claim", async ({
		page,
	}) => {
		await openDeductions(page);
		await record(page, prompts.health, "yes");
		await record(
			page,
			"Does the section 80D claim include you, your spouse, or dependent children?",
			"yes",
		);
		await record(
			page,
			"Was anyone in the section 80D self, spouse, or dependent-child group a senior citizen?",
			"yes",
		);
		const premium = page.getByLabel(
			"How much health-insurance premium was paid for the section 80D self-and-family group?",
		);
		await premium.fill("-1");
		await premium.press("Tab");
		const submit = premium
			.locator("xpath=ancestor::form")
			.getByRole("button", { name: "Record answer" });
		await expect(submit).toBeFocused();
		await submit.click();
		await expect(premium).toHaveAttribute("aria-invalid", "true");
		await expect(page.getByRole("alert").filter({ hasText: "Enter a non-negative amount" })).toBeVisible();

		for (const [prompt, value] of [
			["How much health-insurance premium was paid for the section 80D self-and-family group?", "10000"],
			["How much was paid for preventive health checkups for the section 80D self-and-family group?", "0"],
			["How much eligible medical expenditure was paid for senior citizens in the self-and-family group?", "5000"],
			["Was every self-and-family health-insurance premium payment made by an eligible non-cash mode?", "yes"],
			["Are insurer and policy details available for the self-and-family health-insurance premium?", "yes"],
			["Does the section 80D claim include either of your parents?", "no"],
		] as const) {
			await record(page, prompt, value);
		}
		await recordUnselectedCategories(page);
		const card = page.locator(".openitr-health-disability-card");
		await expect(card).toContainText("80D: FACT_80D_MEDICAL_WITH_INSURANCE_PREMIUM");
		await expect(card).toContainText("Remove self and family medical expenditure");
	});

	test("shows a recoverable 80U certificate blocker without mobile overflow", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openDeductions(page);
		await record(page, prompts.health, "no");
		await record(page, prompts.dependent, "no");
		await record(page, prompts.disease, "no");
		await record(page, prompts.taxpayer, "yes");
		await record(page, "Was your certified disability severe disability of 80% or more?", "yes");
		await record(page, "Are the required section 80U disability-certificate and Form 10-IA details available?", "no");

		const card = page.locator(".openitr-health-disability-card");
		await expect(card).toContainText("80U: FACT_80U_CERTIFICATE_REQUIRED");
		await expect(card).toContainText("Provide the disability-certificate");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
});
