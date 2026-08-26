import {
	createAisJsonBankInterestFixture,
	createEpayTaxPdfFixture,
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	EPAY_SENTINEL_BANK_REFERENCE,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
	candidateRow,
	openDocumentIntake,
	selectSourceFiles,
} from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const SENTINEL_EPAY_NAME = "openitr-sentinel-epay-tax-receipt.pdf";

const selectEstimateTrioPlus = async (
	page: Page,
	extraFiles: Parameters<typeof selectSourceFiles>[1],
): Promise<void> => {
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
			name: "openitr-sentinel-26as-export.txt",
			mimeType: "text/plain",
			buffer: bufferOf(utf8Bytes(createForm26AsTextFixture())),
		},
		...extraFiles,
	]);
};

test.describe("e-Pay Tax receipt review", () => {
	test("shows an accepted receipt as tax-payment evidence with its challan identity and feeds the estimate", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectEstimateTrioPlus(page, [
			{
				name: SENTINEL_EPAY_NAME,
				mimeType: "application/pdf",
				buffer: bufferOf(createEpayTaxPdfFixture()),
			},
		]);

		const row = candidateRow(page, SENTINEL_EPAY_NAME);
		await expect(row).toContainText("Identified", { timeout: 30_000 });
		await expect(row).toContainText(
			"Document type: epay-tax-receipt-pdf (2026-27)",
		);
		await expect(row).toContainText("1 tax payment");

		const reviewSection = page.locator(".openitr-review-card");
		const paymentGroup = reviewSection.locator(
			'.openitr-review-group[data-evidence-role="tax-payments"]',
		);
		await expect(paymentGroup.getByText("Tax payment evidence")).toBeVisible();
		const paymentCard = paymentGroup.locator(
			'.openitr-observation[data-fact-key="tax-payment.self-assessment-tax"]',
		);
		await expect(paymentCard).toContainText("₹ 45,670");
		await expect(paymentCard).toContainText(
			"BSR 0004321 · Serial 00517 · dated 26/03/2026",
		);
		await expect(paymentCard).toContainText("(300) Self Assessment Tax");
		await expect(paymentCard).toContainText(EPAY_SENTINEL_BANK_REFERENCE);

		const toggle = paymentCard.getByRole("button", { name: /evidence/ });
		await toggle.click();
		const panel = paymentCard.locator(".openitr-evidence-panel");
		await expect(panel).toBeVisible();
		await expect(panel).toContainText("Evidence location: Page 1");
		const currentLine = panel.locator('[data-evidence-current="true"]');
		await expect(currentLine).toHaveCount(1);
		await expect(currentLine).toContainText("Total Tax Paid");

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByText(
				"Taxes paid (TDS deposits and challan payments)",
			),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			estimateSection.getByText(/Changed by accepted e-Pay Tax receipt/),
		).toBeVisible();
		await expect(
			estimateSection.getByText(/BSR 0004321 · Serial 00517/),
		).toBeVisible();
	});

	test("keeps a rejected receipt out of taxes paid and names the review needed", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectEstimateTrioPlus(page, [
			{
				name: "openitr-sentinel-epay-tax-receipt.pdf",
				mimeType: "application/pdf",
				buffer: bufferOf(
					createEpayTaxPdfFixture({ typeOfPayment: "(102) Surcharge" }),
				),
			},
		]);

		const row = candidateRow(page, "openitr-sentinel-epay-tax-receipt.pdf");
		await expect(row).toContainText("1 review item", { timeout: 30_000 });

		const reviewSection = page.locator(".openitr-review-card");
		await expect(
			reviewSection.getByText(/DOCUMENT_EPAY_RECEIPT_TYPE_OF_PAYMENT_UNKNOWN/),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			reviewSection.getByText(/Type of Payment this revision/),
		).toBeVisible();

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByText(
				"Taxes paid (TDS deposits and challan payments)",
			),
		).toBeVisible({ timeout: 30_000 });
		// The unknown receipt must not move taxes paid past the statement's
		// own deposits.
		await expect(estimateSection.getByText("₹ 61,250").first()).toBeVisible();
		await expect(
			estimateSection.getByText(/Changed by accepted e-Pay Tax receipt/),
		).toHaveCount(0);
	});

	test("coalesces agreeing reprints of one paid challan so the payment counts once", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectEstimateTrioPlus(page, [
			{
				name: "openitr-sentinel-epay-tax-receipt.pdf",
				mimeType: "application/pdf",
				buffer: bufferOf(createEpayTaxPdfFixture()),
			},
			{
				name: "openitr-sentinel-epay-tax-receipt-reprint.pdf",
				mimeType: "application/pdf",
				buffer: bufferOf(
					createEpayTaxPdfFixture({
						bankReference: "OPENITRBNK7654321",
					}),
				),
			},
		]);

		await expect(
			candidateRow(page, "openitr-sentinel-epay-tax-receipt-reprint.pdf"),
		).toContainText("1 tax payment", { timeout: 30_000 });
		await expect(
			candidateRow(page, "openitr-sentinel-epay-tax-receipt.pdf"),
		).toContainText("1 tax payment", { timeout: 30_000 });

		const conflictsSection = page.locator(".openitr-conflicts-card");
		await expect(conflictsSection).toHaveCount(0);

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByText("₹ 1,06,920").first(),
		).toBeVisible({ timeout: 30_000 });
	});
});
