import { createForm16SalaryPdfFixture } from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import {
	openDocumentIntake,
	openIncomeComputations,
	openReviewFacts,
	recordQuestionAnswer,
	selectSourceFiles,
} from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const answerCurrent = async (
	page: Parameters<typeof openDocumentIntake>[0],
	label: string,
	value: string,
) => {
	await recordQuestionAnswer({ page, prompt: label, value });
};

const enterCapitalGainQuestions = async (
	page: Parameters<typeof openDocumentIntake>[0],
) => {
	await openDocumentIntake(page, { "scope-section112a-ltcg": "125000" });
	await selectSourceFiles(page, [
		{
			name: "synthetic-salary.pdf",
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		},
	]);
	await openReviewFacts(page);
};

test.describe("limited section 112A capital-gain analysis", () => {
	test("shows the cited gain and zero tax at the ITR-1 boundary", async ({
		page,
	}) => {
		await enterCapitalGainQuestions(page);

		const eligibleAsset = page.getByRole("group", {
			name: "Did every reported section 112A disposal involve a listed equity share, an equity-oriented fund unit, or a business-trust unit?",
		});
		await expect(eligibleAsset).toBeVisible({ timeout: 30_000 });
		await answerCurrent(
			page,
			"Did every reported section 112A disposal involve a listed equity share, an equity-oriented fund unit, or a business-trust unit?",
			"yes",
		);
		await answerCurrent(
			page,
			"Was every reported section 112A disposal classified as a long-term capital gain?",
			"yes",
		);
		await answerCurrent(
			page,
			"Were all applicable section 112A securities transaction tax conditions met?",
			"yes",
		);
		await answerCurrent(
			page,
			"What was the total sale consideration for the supported section 112A disposals?",
			"525000",
		);
		await answerCurrent(
			page,
			"What was the total cost of acquisition for the supported section 112A disposals?",
			"400000",
		);
		await openIncomeComputations(page);

		const result = page.locator(".openitr-section112a-card");
		await expect(
			result.getByRole("heading", {
				name: "Section 112A capital-gain analysis",
			}),
		).toBeVisible();
		await expect(result).toContainText("₹ 1,25,000");
		await expect(result).toContainText("Section 112A tax component");
		await result
			.locator("details")
			.filter({ hasText: "Section 112A tax component" })
			.getByText("Section 112A tax component")
			.click();
		await expect(result).toContainText("ITR1-SECTION112A-TAX");
		await expect(result).toContainText(
			"Round the exact tax component to the nearest whole rupee",
		);
		await openReviewFacts(page);
		await expect(page.locator(".openitr-recorded-answers")).toContainText(
			"capital-gains.section112a-sale-consideration",
		);
		await expect(page.locator(".openitr-recorded-answers")).toContainText(
			"Question revision 2026-09-17",
		);
	});

	test("stops after an unsupported asset classification on mobile", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await enterCapitalGainQuestions(page);
		const eligibleAssetForm = page
			.locator("form")
			.filter({
				hasText:
					"Did every reported section 112A disposal involve a listed equity share, an equity-oriented fund unit, or a business-trust unit?",
			})
			.first();
		const eligibleAsset = eligibleAssetForm.getByRole("radio", { name: "No" });
		await expect(eligibleAsset).toBeVisible({ timeout: 30_000 });
		await eligibleAsset.focus();
		await eligibleAsset.check();
		await page.keyboard.press("Tab");
		await expect(
			eligibleAssetForm.getByRole("button", { name: "Record answer" }),
		).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(
			page.getByLabel(
				"Was every reported section 112A disposal classified as a long-term capital gain?",
			),
		).toHaveCount(0);
		await openIncomeComputations(page);

		const result = page.locator(".openitr-section112a-card");
		await expect(result).toContainText(
			"RULE_SECTION112A_CLASSIFICATION_UNSUPPORTED",
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
});
