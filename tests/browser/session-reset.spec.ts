import { expect, test } from "@playwright/test";

import {
	answerScopeCheck,
	expectScopeResult,
	openScopeQuestion,
} from "./helpers";

test.describe("OpenITR session lifecycle", () => {
	test("refreshing the page starts a new empty session", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		await expectScopeResult(page, "Supported by this scope check");

		await page.reload();

		await expect(
			page.getByRole("heading", { name: "Residential status" }),
		).toBeVisible();
		await expect(
			page.getByText("Supported by this scope check"),
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
		await expectScopeResult(page, "Not supported by this scope check");

		await page
			.getByRole("main")
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
			page.getByText("Not supported by this scope check"),
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
		await expectScopeResult(page, "Supported by this scope check");

		await page
			.getByRole("main")
			.getByRole("button", { name: "Reset session" })
			.click();

		const confirmationDialog = page.getByRole("dialog", {
			name: "Reset this session?",
		});
		await expect(confirmationDialog).toBeVisible();
		await confirmationDialog.getByRole("button", { name: "Cancel" }).click();

		await expect(confirmationDialog).toHaveCount(0);
		await expectScopeResult(page, "Supported by this scope check");
		await expect(page.getByText("You answered Yes.")).toBeVisible();
	});
});
