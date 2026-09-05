import {
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import { openDocumentIntake, selectSourceFiles } from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

test.describe("missing-fact questionnaire", () => {
	test("changing an earlier answer hides the old estimate while it recomputes", async ({
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
				name: "openitr-sentinel-26as-export.txt",
				mimeType: "text/plain",
				buffer: bufferOf(utf8Bytes(createForm26AsTextFixture())),
			},
		]);

		const questionnaire = page.locator(".openitr-missing-facts-card");
		await expect(
			questionnaire.getByText("3 missing facts can be answered"),
		).toBeVisible({ timeout: 30_000 });
		await questionnaire
			.getByLabel("How much savings-account interest did you receive in FY 2025-26?")
			.fill("4850.25");
		await questionnaire.getByRole("button", { name: "Record answer" }).first().click();
		const depositsInput = questionnaire.getByLabel(
			"How much interest on deposits (fixed or recurring) did you receive in FY 2025-26?",
		);
		await depositsInput.fill("12000");
		await depositsInput
			.locator("xpath=ancestor::form")
			.getByRole("button", { name: "Record answer" })
			.click();

		const estimate = page.locator(".openitr-estimate-card");
		await expect(estimate.getByText("₹ 61,250").first()).toBeVisible({
			timeout: 30_000,
		});
		// Inspect the pending state before its scheduled recomputation settles.
		await page.clock.install({ time: new Date("2026-09-03T12:00:00Z") });
		await page.clock.pauseAt(new Date("2026-09-03T12:00:01Z"));
		await questionnaire.getByRole("button", { name: "Change answer" }).first().click();

		await expect(
			page.getByText("The previous estimate is hidden while the changed decision is applied."),
		).toBeVisible();
		await expect(page.locator(".openitr-estimate-card")).toHaveCount(0);
		await page.clock.resume();

		const replacement = questionnaire.getByLabel(
			"How much savings-account interest did you receive in FY 2025-26?",
		);
		await replacement.fill("9000");
		await questionnaire.getByRole("button", { name: "Record answer" }).first().click();
		await expect(
			page.locator(".openitr-estimate-card").getByText("₹ 21,000").first(),
		).toBeVisible({
			timeout: 30_000,
		});
	});

	test("validates attested answers and clears stale missing-fact results", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSourceFiles(page, [
			{
				name: "openitr-sentinel-26as-export.txt",
				mimeType: "text/plain",
				buffer: bufferOf(utf8Bytes(createForm26AsTextFixture())),
			},
		]);

		const questionnaire = page.locator(".openitr-missing-facts-card");
		await expect(
			questionnaire.getByRole("heading", { name: "Missing facts", exact: true }),
		).toBeVisible({ timeout: 30_000 });
		await expect(questionnaire.getByText("3 missing facts can be answered")).toBeVisible();
		await expect(
			questionnaire.getByText("Why this is required", { exact: true }).first(),
		).toBeVisible();
		await expect(
			questionnaire.getByText("Section 56 charges savings-account interest", {
				exact: false,
			}),
		).toBeVisible();
		await expect(
			questionnaire.getByText("Result this can affect", { exact: true }).first(),
		).toBeVisible();
		await expect(
			questionnaire.getByText("Estimated refund or amount payable", {
				exact: true,
			}).first(),
		).toBeVisible();

		const savingsInput = questionnaire.getByLabel(
			"How much savings-account interest did you receive in FY 2025-26?",
		);
		await savingsInput.focus();
		await expect(savingsInput).toBeFocused();
		await expect(savingsInput).toHaveCSS("outline-style", "solid");
		await page.keyboard.press("Tab");
		await expect(
			questionnaire.getByRole("button", { name: "Record answer" }).first(),
		).toBeFocused();

		await savingsInput.fill("1,200");
		await questionnaire
			.getByRole("button", { name: "Record answer" })
			.first()
			.click();
		await expect(
			questionnaire.getByRole("alert").filter({
				hasText:
					"Enter a non-negative amount using digits and an optional decimal point.",
			}),
		).toBeVisible();
		await expect(savingsInput).toHaveAttribute("aria-invalid", "true");
		await expect(questionnaire.getByText("Recorded answers")).toHaveCount(0);

		await savingsInput.fill("4850.25");
		await questionnaire
			.getByRole("button", { name: "Record answer" })
			.first()
			.click();
		await expect(savingsInput).toHaveCount(0);
		await questionnaire.getByRole("button", { name: "Change answer" }).click();
		const replacementSavingsInput = questionnaire.getByLabel(
			"How much savings-account interest did you receive in FY 2025-26?",
		);
		await expect(replacementSavingsInput).toBeVisible();
		await replacementSavingsInput.fill("4850.25");
		await questionnaire
			.getByRole("button", { name: "Record answer" })
			.first()
			.click();
		await expect(questionnaire.getByText("2 missing facts can be answered")).toBeVisible();
		await expect(
			questionnaire.getByText("bank-interest.savings-account", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: /FACT_BANK_INTEREST_EVIDENCE_REQUIRED: bank-interest\.deposits/,
			}),
		).toBeVisible();

		const depositsInput = questionnaire.getByLabel(
			"How much interest on deposits (fixed or recurring) did you receive in FY 2025-26?",
		);
		await depositsInput.fill("12000");
		await depositsInput
			.locator("xpath=ancestor::form")
			.getByRole("button", { name: "Record answer" })
			.click();
		await expect(questionnaire.getByText("1 missing fact can be answered")).toBeVisible();
		const deductionsPresent = questionnaire.getByLabel(
			"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
		);
		await deductionsPresent.selectOption("no");
		await deductionsPresent
			.locator("xpath=ancestor::form")
			.getByRole("button", { name: "Record answer" })
			.click();
		await expect(
			questionnaire.getByText("Every permitted missing fact has been supplied"),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: /FACT_BANK_INTEREST_EVIDENCE_REQUIRED/,
			}),
		).toHaveCount(0);
	});

	test("does not ask for facts accepted evidence already supplies", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSourceFiles(page, [
			{
				name: "openitr-sentinel-ais-export.json",
				mimeType: "application/json",
				buffer: bufferOf(utf8Bytes(createAisJsonBankInterestFixture())),
			},
		]);

		await expect(
			page.getByText("bank-interest.savings-account", { exact: true }),
		).toBeVisible({ timeout: 30_000 });
		const questionnaire = page.locator(".openitr-missing-facts-card");
		await expect(
			questionnaire.getByLabel(
				"Do you want to analyze any section 80C, 80CCC, or 80CCD savings and pension contributions for FY 2025-26?",
			),
		).toBeVisible();
		await expect(
			questionnaire.getByLabel(
				"How much savings-account interest did you receive in FY 2025-26?",
			),
		).toHaveCount(0);
		await expect(
			questionnaire.getByLabel(
				"How much interest on deposits (fixed or recurring) did you receive in FY 2025-26?",
			),
		).toHaveCount(0);
	});
});
