import {
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const recordAnswerIfPresent = async ({
	page,
	label,
	value,
}: Readonly<{
	page: Page;
	label: string;
	value: string;
}>): Promise<void> => {
	const input = page.getByLabel(label);
	if ((await input.count()) === 0) return;
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

test("compares regimes neutrally and records a changeable primary scenario", async ({
	page,
}) => {
	await openDocumentIntake(page, { "scope-total-income": "1100000" });
	const bankInterestScope = page.locator(
		'[data-scope-question="scope-bank-interest"]',
	);
	await bankInterestScope
		.locator("#scope-bank-interest-answer")
		.selectOption("no");
	await bankInterestScope
		.getByRole("button", { name: "Record scope answer" })
		.click();
	await selectSourceFiles(page, [
		{
			name: "synthetic-regime-comparison.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		},
		{
			name: "synthetic-regime-comparison-26as.txt",
			mimeType: "text/plain",
			buffer: bufferOf(utf8Bytes(createForm26AsTextFixture())),
		},
	]);

	await expect(
		page.getByLabel("Were you a resident senior citizen for FY 2025-26?"),
	).toBeVisible({ timeout: 30_000 });
	for (const [label, value] of [
		["How much savings-account interest did you receive in FY 2025-26?", "0"],
		["How much interest on deposits (fixed or recurring) did you receive in FY 2025-26?", "0"],
		["Were you a resident senior citizen for FY 2025-26?", "no"],
		["Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?", "no"],
		["Do you want to analyze section 80D health-insurance, preventive-checkup, or eligible senior-citizen medical payments?", "no"],
		["Do you want to analyze a section 80DD deduction for a dependent person with disability?", "no"],
		["Do you want to analyze section 80DDB medical treatment for a specified disease?", "no"],
		["Do you want to analyze section 80U for your own disability?", "no"],
		["Do you want to analyze interest on a higher-education loan under section 80E?", "no"],
		["Do you want to analyze additional first-home loan interest under section 80EE?", "no"],
		["Do you want to analyze additional affordable first-home loan interest under section 80EEA?", "no"],
		["Do you want to analyze electric-vehicle loan interest under section 80EEB?", "no"],
		["Do you want to analyze a donation under section 80G?", "no"],
		["Do you want to analyze an Agniveer Corpus Fund deduction under section 80CCH?", "no"],
		["Do you want to analyze rent paid under section 80GG?", "no"],
		["Do you want to analyze a contribution under section 80GGA?", "no"],
		["Do you want to analyze a political contribution under section 80GGC?", "no"],
		["Do you need a Chapter VI-A deduction not named in this questionnaire?", "no"],
	] as const) {
		await recordAnswerIfPresent({ page, label, value });
	}

	const comparison = page.locator(".openitr-regime-comparison");
	await expect(
		comparison.getByRole("heading", { name: "Compare old and new regimes" }),
	).toBeVisible({ timeout: 30_000 });
	await expect(comparison.getByText("Fact-set revision fact-set-", { exact: false })).toBeVisible();
	await expect(comparison.getByRole("heading", { name: "Old regime", exact: true })).toBeVisible();
	await expect(comparison.getByRole("heading", { name: "New regime", exact: true })).toBeVisible();
	const taxableIncome = comparison.locator('[data-comparison-row="taxable-income"]');
	await expect(taxableIncome).toContainText("₹ 10,00,000");
	await expect(taxableIncome).toContainText("₹ 9,75,000");
	await expect(taxableIncome).toContainText("Old regime is ₹ 25,000 higher");

	const oldChoice = comparison.getByRole("radio", { name: "Old regime" });
	const newChoice = comparison.getByRole("radio", { name: "New regime" });
	await expect(oldChoice).not.toBeChecked();
	await expect(newChoice).not.toBeChecked();
	await oldChoice.check();
	await expect(oldChoice).toBeChecked();
	await newChoice.check();
	await expect(newChoice).toBeChecked();
	await expect(oldChoice).not.toBeChecked();

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(comparison).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
	expect(
		await comparison.locator(".openitr-regime-table-wrap").evaluate(
			(element) => element.scrollWidth <= element.clientWidth,
		),
	).toBe(true);
});
