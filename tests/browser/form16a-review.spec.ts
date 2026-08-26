import {
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm16APdfFixture,
	FORM16A_SENTINEL_INTEREST_GROSS,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import {
	openDocumentIntake,
	selectSourceFiles,
} from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const SENTINEL_FORM16A_NAME = "openitr-sentinel-form16a-certificate.pdf";

test.describe("Form 16A non-salary TDS review", () => {
	test("lists income evidence separately from tax-paid evidence with its page-region locator", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSourceFiles(page, [
			{
				name: SENTINEL_FORM16A_NAME,
				mimeType: "application/pdf",
				buffer: bufferOf(createForm16APdfFixture()),
			},
		]);

		const row = page.locator(`[data-candidate="${SENTINEL_FORM16A_NAME}"]`);
		await expect(row).toContainText("2 non-salary income, 3 TDS", {
			timeout: 30_000,
		});

		const reviewSection = page.locator(".openitr-review-card");
		const incomeGroup = reviewSection.locator(
			'.openitr-review-group[data-evidence-role="non-salary-income"]',
		);
		await expect(
			incomeGroup.getByText("Non-salary income evidence"),
		).toBeVisible();
		await expect(
			incomeGroup.getByText("non-salary-income.interest-other-than-securities"),
		).toBeVisible();
		const interestCard = incomeGroup.locator(
			'.openitr-observation[data-fact-key="non-salary-income.interest-other-than-securities"]',
		);
		await expect(interestCard).toContainText("₹ 1,20,000");

		const taxesPaidGroup = reviewSection.locator(
			'.openitr-review-group[data-evidence-role="taxes-paid"]',
		);
		await expect(taxesPaidGroup.getByText("Tax-paid evidence")).toBeVisible();
		await expect(
			taxesPaidGroup.getByText("tds.tds-deposited", { exact: true }),
		).toBeVisible();

		const toggle = interestCard.getByRole("button");
		await toggle.click();
		const panel = interestCard.locator(".openitr-evidence-panel");
		await expect(panel).toBeVisible();
		await expect(panel).toContainText("Evidence location: Page 1");
		const currentLine = panel.locator('[data-evidence-current="true"]');
		await expect(currentLine).toHaveCount(1);
		await expect(currentLine).toContainText(FORM16A_SENTINEL_INTEREST_GROSS);
	});

	test("feeds accepted certificate receipts and deposits into the estimate", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSourceFiles(page, [
			{
				name: "openitr-sentinel-form16-salary.pdf",
				mimeType: "application/pdf",
				buffer: bufferOf(createForm16SalaryPdfFixture()),
			},
			{
				name: "openitr-sentinel-ais-export.json",
				mimeType: "application/json",
				buffer: bufferOf(utf8Bytes(createAisJsonBankInterestFixture())),
			},
			{
				name: SENTINEL_FORM16A_NAME,
				mimeType: "application/pdf",
				buffer: bufferOf(createForm16APdfFixture()),
			},
		]);

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(estimateSection).toBeVisible({ timeout: 30_000 });

		await expect(
			estimateSection.getByText("Accepted non-salary income"),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			estimateSection.getByText("₹ 1,45,000").first(),
		).toBeVisible();
		await expect(
			estimateSection.getByText("Taxes paid (TDS deposits and challan payments)"),
		).toBeVisible();
		await expect(estimateSection.getByText("₹ 12,000").first()).toBeVisible();
	});
});
