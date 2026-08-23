import {
	createForm16SalaryPdfFixture,
	FORM16_SALARY_FIXTURE_SENTINEL_AMOUNT,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";
import type { Request } from "@playwright/test";

import {
	openDocumentIntake,
	selectSourceFiles,
} from "./helpers";

const bufferOf = (bytes: Uint8Array): Buffer =>
	Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const SENTINEL_FORM16_NAME = "openitr-sentinel-form16-salary.pdf";

const selectForm16 = async (page: import("@playwright/test").Page) => {
	await selectSourceFiles(page, [
		{
			name: SENTINEL_FORM16_NAME,
			mimeType: "application/pdf",
			buffer: bufferOf(createForm16SalaryPdfFixture()),
		},
	]);
};

test.describe("Form 16 salary observation review", () => {
	test("lists extracted observations and opens the evidence location", async ({
		page,
	}) => {
		await openDocumentIntake(page);
		await selectForm16(page);

		const row = page.locator(`[data-candidate="${SENTINEL_FORM16_NAME}"]`);
		await expect(row).toContainText("3 salary observations", {
			timeout: 30_000,
		});

		const reviewSection = page.locator(".openitr-review-card");
		await expect(reviewSection.getByText("salary.section-17-1")).toBeVisible();
		await expect(
			reviewSection.getByText("salary.exempt-allowances-section-10"),
		).toBeVisible();
		await expect(reviewSection.getByText("salary.taxable-total")).toBeVisible();

		const observationCard = reviewSection.locator(
			'.openitr-observation[data-fact-key="salary.section-17-1"]',
		);
		await expect(observationCard).toContainText("₹ 12,00,000");
		await expect(observationCard).toContainText("Rs 12,00,000");

		const toggle = observationCard.getByRole("button");
		await expect(toggle).toHaveAccessibleName("Show evidence");
		await toggle.focus();
		await page.keyboard.press("Enter");

		const panel = observationCard.locator(".openitr-evidence-panel");
		await expect(panel).toBeVisible();
		const activeToggle = observationCard.getByRole("button");
		await expect(activeToggle).toHaveAttribute("aria-expanded", "true");
		await expect(activeToggle).toHaveAccessibleName("Hide evidence");
		await expect(panel).toContainText("Evidence location: Page 1");
		const currentLine = panel.locator('[data-evidence-current="true"]');
		await expect(currentLine).toHaveCount(1);
		await expect(currentLine).toHaveAttribute("aria-current", "location");
		await expect(currentLine).toContainText(
			"Salary as per provisions contained in section 17(1): Rs 12,00,000",
		);
		expect(await currentLine.getAttribute("aria-current")).toBe("location");

		// Keyboard-only users can close the panel again.
		await page.keyboard.press("Enter");
		await expect(panel).not.toBeAttached();
	});

	test("a rejected document adds no observations", async ({ page }) => {
		await openDocumentIntake(page);
		await selectSourceFiles(page, [
			{
				name: "openitr-sentinel-unknown.bin",
				mimeType: "application/octet-stream",
				buffer: Buffer.from(
					"openitr-synthetic-unknown-bytes that no adapter claims",
					"utf-8",
				),
			},
		]);

		await expect(
			page.locator('[data-candidate="openitr-sentinel-unknown.bin"]'),
		).toContainText("Rejected", { timeout: 30_000 });
		await expect(page.locator(".openitr-review-card")).toHaveCount(0);
	});

	test("selection triggers no request carrying document data", async ({
		page,
	}) => {
		const requests: Request[] = [];
		page.on("request", (request) => {
			requests.push(request);
		});
		await openDocumentIntake(page);
		const baseline = requests.length;

		const sentinelAmount = FORM16_SALARY_FIXTURE_SENTINEL_AMOUNT;
		const sentinelEmployee = "OpenITR Synthetic Employee";
		await selectForm16(page);

		const reviewSection = page.locator(".openitr-review-card");
		await expect(
			reviewSection.getByText("salary.taxable-total"),
		).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(1_500);

		const origin = new URL(page.url()).origin;
		for (const request of requests.slice(baseline)) {
			expect(request.url()).toContain(origin);
			expect(request.method()).toBe("GET");
			expect(new URL(request.url()).pathname).toMatch(/^\/assets\//);
		}
		for (const request of requests) {
			const url = request.url();
			expect(url).not.toContain(SENTINEL_FORM16_NAME);
			expect(url).not.toContain(sentinelAmount);
			expect(url).not.toContain(sentinelEmployee);
			expect(url).not.toContain("openitr-sentinel");
			expect(request.postData() ?? "").not.toContain(SENTINEL_FORM16_NAME);
			expect(request.postData() ?? "").not.toContain(sentinelAmount);
		}
	});
});
