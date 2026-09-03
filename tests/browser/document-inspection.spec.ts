import {
	createAisJsonFixture,
	createAmbiguousPdfFixture,
	createDamagedPdfFixture,
	createEncryptedPdfFixture,
	createForm16PdfFixture,
	createImageOnlyPdfFixture,
	createPrivateStatementCsvFixture,
	createUnknownBytesFixture,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import {
	expectCandidateStatus,
	openDocumentIntake,
	selectSourceFiles,
} from "./helpers";

const bufferOf = (text: string): Buffer => Buffer.from(text, "utf-8");
const bytesBuffer = (bytes: Uint8Array): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const sentinelName = "openitr-sentinel-ais-export.json";

test.describe("source document inspection", () => {
	test("selects documents in one batch and reports identified and rejected states", async ({
		page,
	}) => {
		await openDocumentIntake(page);

		await selectSourceFiles(page, [
			{
				name: sentinelName,
				mimeType: "application/json",
				buffer: bufferOf(createAisJsonFixture()),
			},
			{
				name: "openitr-sentinel-notes.txt",
				mimeType: "text/plain",
				buffer: bytesBuffer(createUnknownBytesFixture()),
			},
		]);

		await expect(
			page.locator(`[data-candidate="${sentinelName}"]`),
		).toBeVisible();
		await expectCandidateStatus(page, sentinelName, "identified");
		await expect(
			page.locator(`[data-candidate="${sentinelName}"]`),
		).toContainText("ais-json");

		await expectCandidateStatus(page, "openitr-sentinel-notes.txt", "rejected");
		await expect(
			page.locator('[data-candidate="openitr-sentinel-notes.txt"]'),
		).toContainText("DOCUMENT_UNKNOWN_FORMAT");
	});

	test("identifies a Form 16 PDF behind a misleading JSON name", async ({
		page,
	}) => {
		await openDocumentIntake(page);

		await selectSourceFiles(page, [
			{
				name: "mislabeled-openitr-sentinel.json",
				mimeType: "application/json",
				buffer: bytesBuffer(createForm16PdfFixture()),
			},
		]);

		await expectCandidateStatus(
			page,
			"mislabeled-openitr-sentinel.json",
			"identified",
		);
		await expect(
			page.locator('[data-candidate="mislabeled-openitr-sentinel.json"]'),
		).toContainText("form16-pdf");
	});

	test("reports encrypted, damaged, image-only, ambiguous, and private-institution rejections distinctly", async ({
		page,
	}) => {
		test.setTimeout(60_000);
		await openDocumentIntake(page);

		await selectSourceFiles(page, [
			{
				name: "locked.pdf",
				mimeType: "application/pdf",
				buffer: bytesBuffer(createEncryptedPdfFixture()),
			},
			{
				name: "torn.pdf",
				mimeType: "application/pdf",
				buffer: bytesBuffer(createDamagedPdfFixture()),
			},
			{
				name: "scan.pdf",
				mimeType: "application/pdf",
				buffer: bytesBuffer(createImageOnlyPdfFixture()),
			},
			{
				name: "conflicting.pdf",
				mimeType: "application/pdf",
				buffer: bytesBuffer(createAmbiguousPdfFixture()),
			},
			{
				name: "bank-statement.csv",
				mimeType: "text/csv",
				buffer: bufferOf(createPrivateStatementCsvFixture()),
			},
		]);

		await expectCandidateStatus(page, "locked.pdf", "rejected");
		await expect(page.locator('[data-candidate="locked.pdf"]')).toContainText(
			"FILE_ENCRYPTED",
		);

		await expectCandidateStatus(page, "torn.pdf", "rejected");
		await expect(page.locator('[data-candidate="torn.pdf"]')).toContainText(
			"DOCUMENT_DAMAGED",
		);

		await expectCandidateStatus(page, "scan.pdf", "rejected");
		await expect(page.locator('[data-candidate="scan.pdf"]')).toContainText(
			"DOCUMENT_IMAGE_ONLY",
		);

		await expectCandidateStatus(page, "conflicting.pdf", "rejected");
		await expect(
			page.locator('[data-candidate="conflicting.pdf"]'),
		).toContainText("DOCUMENT_AMBIGUOUS_MATCH");

		await expectCandidateStatus(page, "bank-statement.csv", "rejected");
		await expect(
			page.locator('[data-candidate="bank-statement.csv"]'),
		).toContainText("DOCUMENT_PRIVATE_INSTITUTION_TEMPLATE");
	});

	test("removes an identified document through keyboard activation", async ({
		page,
	}) => {
		await openDocumentIntake(page);

		await selectSourceFiles(page, [
			{
				name: sentinelName,
				mimeType: "application/json",
				buffer: bufferOf(createAisJsonFixture()),
			},
		]);
		await expectCandidateStatus(page, sentinelName, "identified");

		const removeButton = page.getByRole("button", { name: "Remove" });
		await removeButton.focus();
		await page.keyboard.press("Enter");

		await expectCandidateStatus(page, sentinelName, "removed");
	});

	test("cancels active inspection and the row settles as cancelled", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		// Hold the real worker's startup so cancellation does not race a tiny
		// fixture finishing before Playwright can activate its button.
		let releaseWorker = () => {};
		const workerStartup = new Promise<void>((resolve) => {
			releaseWorker = resolve;
		});
		await page.route(
			/\/assets\/document-inspection\.worker-.*\.js$/,
			async (route) => {
				await workerStartup;
				await route.continue();
			},
		);

		try {
			await selectSourceFiles(page, [
				{
					name: "bulk-form16-a.pdf",
					mimeType: "application/pdf",
					buffer: bytesBuffer(createForm16PdfFixture(["batch a"])),
				},
			]);

			await page
				.getByRole("button", { name: "Cancel inspection", exact: true })
				.focus();
			await page.keyboard.press("Enter");
		} finally {
			releaseWorker();
		}
		await expect(
			page.locator('.openitr-document-row[data-status="cancelled"]').first(),
		).toBeVisible();

		await page.waitForTimeout(2_000);
		const statuses = await page
			.locator(".openitr-document-row")
			.evaluateAll((rows) =>
				rows.map((row) => row.getAttribute("data-status")),
			);
		expect(statuses).toContain("cancelled");
	});
});
