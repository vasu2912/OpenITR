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
	const consoleErrors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
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

	const analysis = page.locator(".openitr-complete-analytics");
	await expect(
		analysis.getByRole("heading", { name: "Complete analysis" }),
	).toBeVisible();
	await expect(analysis.getByText("New regime selected")).toBeVisible();
	await expect(
		analysis.locator('[data-analysis-amount="taxable-income"]'),
	).toContainText("₹ 9,75,000");
	await expect(
		analysis.locator('[data-analysis-amount="taxes-paid"]'),
	).toContainText("₹ 61,250");
	await expect(
		analysis.getByRole("heading", { name: "Future-year planning ideas" }),
	).toBeVisible();
	await expect(
		analysis.getByText("They do not alter the FY 2025-26 facts", {
			exact: false,
		}),
	).toBeVisible();
	await expect(analysis).not.toContainText(/guaranteed savings|buy now|sign up/i);
	await expect(
		analysis
			.locator('[data-analysis-amount="taxes-paid"]')
			.getByRole("link", { name: /^Evidence / }),
	).toHaveCount(2);
	for (const deductionId of [
		"savings-and-pension",
		"health-and-disability",
		"loan-interest",
		"donations",
		"remaining",
	]) {
		expect(
			await analysis
				.locator(`[data-analysis-amount="${deductionId}"]`)
				.getByRole("link", { name: /^Evidence / })
				.count(),
		).toBeLessThan(8);
	}

	const salaryAmount = analysis.locator('[data-analysis-amount="salary"]');
	const salaryTraceTarget = await salaryAmount
		.getByRole("link", { name: "Computation trace" })
		.getAttribute("href");
	await salaryAmount
		.getByRole("link", { name: "Computation trace" })
		.click();
	await expect(
		page.locator(`[id="${salaryTraceTarget?.slice(1) ?? "missing-trace"}"]`),
	).toBeVisible();
	const salaryEvidenceTarget = await salaryAmount
		.getByRole("link", { name: "Evidence 1" })
		.getAttribute("href");
	await salaryAmount
		.getByRole("link", { name: "Evidence 1" })
		.click();
	await expect(
		page.locator(
			`[id="${salaryEvidenceTarget?.slice(1) ?? "missing-evidence"}"]`,
		),
	).toBeVisible();
	const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
		const counts = new Map<string, number>();
		for (const element of elements) {
			counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
		}
		return [...counts.entries()]
			.filter(([id, count]) => id.length > 0 && count > 1)
			.map(([id]) => id);
	});
	expect(duplicateIds).toEqual([]);

	const finalReview = page.locator(".openitr-final-review");
	await expect(
		finalReview.getByRole("heading", {
			name: "Final fact and evidence review",
		}),
	).toBeVisible();
	for (const topic of [
		"Taxpayer profile",
		"Salary",
		"House property",
		"Other income",
		"Gains",
		"Deductions",
		"Taxes paid",
	]) {
		await expect(
			finalReview.getByRole("heading", { name: topic, exact: true }),
		).toBeVisible();
	}
	await expect(
		finalReview.locator('[data-origin="source-observation"]').first(),
	).toContainText("PDF page 1");
	await expect(
		finalReview.locator('[data-origin="user-attestation"]').first(),
	).toContainText("User attestation");
	await expect(
		finalReview.locator('[data-origin="derived"]').first(),
	).toContainText("Derived fact");
	await expect(
		finalReview.getByText("Downstream use", { exact: true }).first(),
	).toBeVisible();

	const sourceReturn = finalReview
		.locator('a[href^="#observation-"]')
		.first();
	const sourceTarget = await sourceReturn.getAttribute("href");
	await sourceReturn.click();
	await expect(
		page.locator(`[id="${sourceTarget?.slice(1) ?? "missing-target"}"]`),
	).toBeVisible();
	await expect(newChoice).toBeChecked();
	const readiness = page.locator(".openitr-analysis-readiness");
	await expect(
		readiness.getByRole("heading", { name: /Needs review/ }),
	).toBeVisible();
	await expect(
		readiness.getByText("final evidence review", { exact: false }),
	).toBeVisible();
	await expect(
		readiness.getByRole("heading", { name: "Available partial analysis" }),
	).toBeVisible();
	await expect(readiness).toContainText(/does not prepare, validate, or file a tax return/);
	await expect(
		readiness.getByRole("button", { name: /upload|submit|file|download/i }),
	).toHaveCount(0);

	await finalReview
		.getByRole("button", { name: "Confirm reviewed fact set" })
		.click();
	await expect(
		finalReview.getByText("Confirmed revision", { exact: false }),
	).toBeVisible();
	await expect(
		readiness.getByRole("heading", { name: /Analysis-ready/ }),
	).toBeVisible();
	await expect(
		page.locator(".openitr-estimate-card").getByRole("heading", {
			name: /Educational analysis only/,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("button", {
			name: /download.*(?:ITR|JSON)|upload.*portal|submit.*return|file.*return/i,
		}),
	).toHaveCount(0);
	await expect(
		page.getByRole("link", {
			name: /download.*(?:ITR|JSON)|upload.*portal|submit.*return|file.*return/i,
		}),
	).toHaveCount(0);
	await expect(
		page.getByText(/Filing successful|Return submitted successfully|Portal upload complete/i),
	).toHaveCount(0);

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(comparison).toBeVisible();
	await expect(analysis).toBeVisible();
	await expect(finalReview).toBeVisible();
	await expect(readiness).toBeVisible();
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

	const seniorReviewFact = finalReview
		.locator('[data-origin="user-attestation"]')
		.filter({ hasText: "taxpayer.senior-citizen" });
	const answerTarget = await seniorReviewFact
		.getByRole("link", { name: "Return to source or decision" })
		.getAttribute("href");
	await seniorReviewFact
		.getByRole("link", { name: "Return to source or decision" })
		.click();
	await page
		.locator(`[id="${answerTarget?.slice(1) ?? "missing-answer"}"]`)
		.getByRole("button", { name: "Change answer" })
		.click();
	await expect(
		finalReview.getByText("Confirmed revision", { exact: false }),
	).toHaveCount(0);
	await expect(
		finalReview.getByText("Warnings and unresolved review items"),
	).toBeVisible();
	await expect(
		finalReview.getByText("Affects: Old regime", { exact: false }).first(),
	).toBeVisible();
	await expect(
		finalReview.locator('[data-origin="source-observation"]').first(),
	).toBeVisible();
	expect(consoleErrors).toEqual([]);
});
