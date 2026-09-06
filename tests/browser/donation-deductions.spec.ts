import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const prompts = Object.freeze({
	present: "Do you want to analyze a donation under section 80G?",
	amount: "How much did you donate during FY 2025-26?",
	fullDeduction: "Is this recipient in a 100% deduction category?",
	qualifyingLimit: "Is this recipient category subject to the qualifying limit?",
	adjustedGti: "What is the adjusted gross total income for the section 80G limit?",
	cash: "Was the donation paid in cash?",
	noncashDetails: "Are the IFSC and transaction-reference details available?",
	recipientQualified: "Was the recipient eligible under section 80G for this donation?",
	recipientDetails:
		"Are the recipient's name, address, and applicable identification details available?",
	certificate:
		"Is the donation certificate or equivalent recipient evidence available?",
});

const openDeductions = async (
	page: Parameters<typeof openDocumentIntake>[0],
) => {
	await openDocumentIntake(page);
	await selectSourceFiles(page, [
		{
			name: "synthetic-salary.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		},
	]);
	await expect(page.getByLabel(prompts.present)).toBeVisible({
		timeout: 30_000,
	});
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

test.describe("donation deductions", () => {
	test("shows the unresolved state, then derives the adjusted-GTI-limited amount with origins and trace", async ({
		page,
	}) => {
		await openDeductions(page);
		const card = page.locator(".openitr-donation-card");
		await expect(card).toContainText(
			"FACT_DONATION_DEDUCTION_PRESENCE_MISSING",
		);
		for (const [prompt, value] of [
			[prompts.present, "yes"],
			[prompts.amount, "80000"],
			[prompts.fullDeduction, "no"],
			[prompts.qualifyingLimit, "yes"],
			[prompts.adjustedGti, "500000"],
			[prompts.cash, "no"],
			[prompts.noncashDetails, "yes"],
			[prompts.recipientQualified, "yes"],
			[prompts.recipientDetails, "yes"],
			[prompts.certificate, "yes"],
		] as const) {
			await record(page, prompt, value);
		}

		await expect(card).toContainText(
			"50% deduction subject to qualifying limit",
		);
		await expect(card).toContainText("Donation ₹ 80,000");
		await expect(card).toContainText("Old regime ₹ 25,000");
		await expect(card).toContainText("New regime ₹ 0");
		await card.getByText("Recorded facts and origins").click();
		await expect(card).toContainText("deductions.80g-adjusted-gti");
		await expect(card).toContainText("Attested answer");
		await card.getByText("Section 80G adjusted-GTI qualifying limit").click();
		await expect(card).toContainText("ITR1-OR-80G-ADJUSTED-GTI-LIMIT");
	});

	test("shows a cash rejection with recovery on a mobile viewport", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openDeductions(page);
		await expect(page.locator(".openitr-sidebar")).toBeHidden();
		for (const [prompt, value] of [
			[prompts.present, "yes"],
			[prompts.amount, "2001"],
			[prompts.fullDeduction, "yes"],
			[prompts.qualifyingLimit, "no"],
			[prompts.cash, "yes"],
			[prompts.recipientQualified, "yes"],
			[prompts.recipientDetails, "yes"],
			[prompts.certificate, "yes"],
		] as const) {
			await record(page, prompt, value);
		}

		const card = page.locator(".openitr-donation-card");
		await expect(card).toContainText("Status: Rejected");
		await expect(card).toContainText("FACT_80G_CASH_PAYMENT_EXCEEDS_LIMIT");
		await expect(card).toContainText("Old regime ₹ 0");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
});
