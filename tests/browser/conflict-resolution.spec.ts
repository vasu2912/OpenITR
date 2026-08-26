import {
	createAisCsvBankInterestFixture,
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
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

const selectSalaryAisAndStatement = async (
	page: Page,
	csvSavingsAmount: string,
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
			name: "openitr-sentinel-ais-export.csv",
			mimeType: "text/csv",
			buffer: bufferOf(
				utf8Bytes(
					createAisCsvBankInterestFixture({
						bankInterestRows: [
							{
								recordCategory: "SAVINGS_ACCOUNT",
								institutionName: "OpenITR Synthetic Bank",
								maskedAccountNumber: "XXXXXX0001",
								interestAmount: csvSavingsAmount,
							},
							{
								recordCategory: "DEPOSITS",
								institutionName: "OpenITR Synthetic Co-operative Bank",
								maskedAccountNumber: "XXXXXX0002",
								interestAmount: "45,678.90",
							},
						],
					}),
				),
			),
		},
		{
			name: "openitr-sentinel-26as-export.txt",
			mimeType: "text/plain",
			buffer: bufferOf(utf8Bytes(createForm26AsTextFixture())),
		},
	]);
};

const waitUntilAllExtracted = async (page: Page): Promise<void> => {
	// The estimate card appears as soon as every selected slice settles,
	// whether its scenario computes or blocks on review.
	await expect(page.locator(".openitr-estimate-card")).toBeVisible({
		timeout: 30_000,
	});
};

test.describe("cross-source conflict resolution", () => {
	test("identical AIS exports in two formats coexist and compute without a conflict", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSalaryAisAndStatement(page, "7,890.25");
		await waitUntilAllExtracted(page);

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByText("₹ 53,569.15").first(),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(".openitr-conflicts-card")).toHaveCount(0);
	});

	test("a disagreeing export raises a resolvable conflict that names sources and the blocked result", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSalaryAisAndStatement(page, "9,000.00");
		await waitUntilAllExtracted(page);

		const conflictsCard = page.locator(".openitr-conflicts-card");
		await expect(
			conflictsCard.getByText("1 unresolved conflict blocking affected results below"),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			conflictsCard.getByText("bank-interest.savings-account"),
		).toBeVisible();
		await expect(conflictsCard.getByText(/Affects:/)).toContainText(
			"Estimated refund or amount payable",
		);
		await expect(
			conflictsCard.getByText(/₹ 7,890.25 — openitr-sentinel-ais-export.json/),
		).toBeVisible();
		await expect(
			conflictsCard.getByText(/₹ 9,000 — openitr-sentinel-ais-export.csv/),
		).toBeVisible();

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByText(/FACT_TAX_FACT_CONFLICTED/),
		).toBeVisible();

		// The salary scenario needs none of the disputed facts.
		const salarySection = page.locator(".openitr-computation-card");
		await expect(salarySection.getByText(/Final tax liability/)).toBeVisible();
	});

	test("recording a reasoned selection unblocks the estimate while both observations stay visible", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSalaryAisAndStatement(page, "9,000.00");
		await waitUntilAllExtracted(page);

		const conflictsCard = page.locator(".openitr-conflicts-card");
		await expect(
			conflictsCard.getByText("bank-interest.savings-account"),
		).toBeVisible({ timeout: 30_000 });

		// Submitting without a reason is refused inline.
		await conflictsCard
			.getByRole("radio", { name: /₹ 7,890\.25 — openitr-sentinel-ais-export\.json/ })
			.check();
		await conflictsCard
			.getByRole("button", { name: "Record resolution" })
			.click();
		await expect(
			conflictsCard.getByText(/reason is required/i),
		).toBeVisible();

		await conflictsCard
			.getByLabel("Reason for this resolution")
			.fill("The JSON export matches the bank statement I checked.");
		await conflictsCard
			.getByRole("button", { name: "Record resolution" })
			.click();

		await expect(
			conflictsCard.getByText(/Every conflict has a recorded resolution/),
		).toBeVisible();
		await expect(
			conflictsCard.getByText(/The JSON export matches the bank statement/),
		).toBeVisible();
		await expect(conflictsCard.getByText(/Original evidence retained/)).toBeVisible();

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByText("₹ 53,569.15").first(),
		).toBeVisible({ timeout: 30_000 });

		// Both original savings observations remain listed as evidence.
		const reviewSection = page.locator(".openitr-review-card");
		const savingsCards = reviewSection.locator(
			'.openitr-observation[data-fact-key="bank-interest.savings-account"]',
		);
		await expect(savingsCards).toHaveCount(2);
	});

	test("attesting a corrected amount feeds the attested value into the estimate", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSalaryAisAndStatement(page, "9,000.00");
		await waitUntilAllExtracted(page);

		const conflictsCard = page.locator(".openitr-conflicts-card");
		await expect(
			conflictsCard.getByText("bank-interest.savings-account"),
		).toBeVisible({ timeout: 30_000 });

		await conflictsCard
			.getByRole("radio", { name: /Attest the correct amount instead/ })
			.check();
		await conflictsCard
			.getByRole("textbox", { name: "Attested amount in rupees" })
			.fill("8000");
		await conflictsCard
			.getByLabel("Reason for this resolution")
			.fill("The bank confirmed the corrected figure by letter.");
		await conflictsCard
			.getByRole("button", { name: "Record resolution" })
			.click();

		await expect(
			conflictsCard.getByText(/Every conflict has a recorded resolution/),
		).toBeVisible();

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByText("₹ 53,678.9").first(),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			estimateSection.getByText(/Attested by you/),
		).toBeVisible();
	});

	test("the conflict form stays usable on a mobile viewport", async ({
		page,
	}) => {
		await page.setViewportSize({ height: 844, width: 390 });
		await openDocumentIntake(page);
		await selectSalaryAisAndStatement(page, "9,000.00");
		await waitUntilAllExtracted(page);

		const conflictsCard = page.locator(".openitr-conflicts-card");
		await expect(
			conflictsCard.getByText("bank-interest.savings-account"),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			conflictsCard.getByRole("radio", {
				name: /₹ 7,890\.25 — openitr-sentinel-ais-export\.json/,
			}),
		).toBeVisible();
		const reasonBox = conflictsCard.getByLabel("Reason for this resolution");
		await reasonBox.scrollIntoViewIfNeeded();
		await reasonBox.fill("Checked against the bank statement.");
	});
});
