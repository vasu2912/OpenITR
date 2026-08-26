import {
	createAisJsonBankInterestFixture,
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";

import {
	openDocumentIntake,
	selectSourceFiles,
} from "./helpers";

const bufferOf = (bytes: Uint8Array<ArrayBuffer>): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const selectAllThreeDocuments = async (page: import("@playwright/test").Page) => {
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
	]);
};

test.describe("estimated refund or amount payable", () => {
	test("reconciles the three accepted slices into one educational estimate", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectAllThreeDocuments(page);

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(
			estimateSection.getByRole("heading", {
				name: "Estimated refund or amount payable",
			}),
		).toBeVisible({ timeout: 30_000 });

		const outcomeHeading = estimateSection.getByRole("heading", {
			name: /Estimated refund|Estimated amount payable|Balanced/,
		});
		await expect(outcomeHeading).toBeVisible({ timeout: 30_000 });

		await expect(
			estimateSection.getByText("Educational analysis only"),
		).toBeVisible();
		await expect(
			estimateSection.getByText(
				/not an official result|not a filing computation/,
			),
		).toBeVisible();

		await expect(
			estimateSection.getByText("Taxes paid (TDS deposits and challan payments)"),
		).toBeVisible();
		await expect(
			estimateSection.getByText("Accepted bank interest"),
		).toBeVisible();

		await expect(
			estimateSection.getByText("Source evidence behind the estimate"),
		).toBeVisible();
		await expect(
			estimateSection.getByText("bank-interest.savings-account", {
				exact: true,
			}),
		).toBeVisible();
		await expect(
			estimateSection.getByText("tds.tds-deposited", { exact: true }),
		).toBeVisible();

		const traceHeading = estimateSection.getByText(
			/Computation trace — every node cites its rule/,
		);
		await expect(traceHeading).toBeVisible();
	});

	test("names the missing slices when only salary evidence is selected", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectSourceFiles(page, [
			{
				name: "openitr-sentinel-form16-salary.pdf",
				mimeType: "application/pdf",
				buffer: bufferOf(createForm16SalaryPdfFixture()),
			},
		]);

		const estimateSection = page.locator(".openitr-estimate-card");
		await expect(estimateSection).toBeVisible({ timeout: 30_000 });

		await expect(
			estimateSection.getByText(/FACT_BANK_INTEREST_EVIDENCE_REQUIRED/),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			estimateSection.getByText(/FACT_TDS_EVIDENCE_REQUIRED/),
		).toBeVisible();
		await expect(
			estimateSection.getByText(/need review first/i),
		).toBeVisible();
	});
});
