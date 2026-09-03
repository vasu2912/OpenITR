import { expect, test } from "@playwright/test";

import {
	answerScopeCheck,
	expectInitialScopeAnswer,
	openScopeQuestion,
} from "./helpers";

test.describe("OpenITR session lifecycle", () => {
	test("refreshing the page starts a new empty session", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		await expectInitialScopeAnswer({ page, answer: "Yes" });

		await page.reload();

		await expect(
			page.getByRole("heading", { name: "Residential status" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Complete ITR-1 analysis scope" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("radio", { name: "Yes" }),
		).not.toBeChecked();
	});

	test("confirmed reset returns the application to an empty scope check", async ({
		page,
	}) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "No");
		await expectInitialScopeAnswer({ page, answer: "No" });

		await page
			.getByRole("banner")
			.getByRole("button", { name: "Reset session" })
			.click();

		const confirmationDialog = page.getByRole("dialog", {
			name: "Reset this session?",
		});
		await expect(confirmationDialog).toBeVisible();
		await confirmationDialog
			.getByRole("button", { name: "Reset session" })
			.click();

		await expect(
			page.getByRole("heading", { name: "Residential status" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Complete ITR-1 analysis scope" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("radio", { name: "No" }),
		).not.toBeChecked();
	});

	test("canceling the reset confirmation keeps the current session", async ({
		page,
	}) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		await expectInitialScopeAnswer({ page, answer: "Yes" });

		await page
			.getByRole("banner")
			.getByRole("button", { name: "Reset session" })
			.click();

		const confirmationDialog = page.getByRole("dialog", {
			name: "Reset this session?",
		});
		await expect(confirmationDialog).toBeVisible();
		await confirmationDialog.getByRole("button", { name: "Cancel" }).click();

		await expect(confirmationDialog).toHaveCount(0);
		await expectInitialScopeAnswer({ page, answer: "Yes" });
		await expect(page.locator('[data-scope-question="scope-individual"]')).toContainText("Recorded answer: Yes");
	});
});
