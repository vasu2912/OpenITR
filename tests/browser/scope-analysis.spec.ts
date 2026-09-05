import { expect, test } from "@playwright/test";

import { answerScopeCheck, openScopeQuestion } from "./helpers";

test.describe("full ITR-1 analysis scope", () => {
	test("renders unresolved scope questions and cited decisions after the initial answer", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");

		await expect(
			page.getByRole("heading", { name: "Complete ITR-1 analysis scope" }),
		).toBeVisible();
		await expect(page.getByText(/Missing fact key: scope\.total-income/)).toBeVisible();
		const totalIncome = page.getByLabel(/What was your total income/);
		await expect(totalIncome).toHaveValue("");
		await expect(page.getByRole("button", { name: "Record scope answer" }).first()).toBeDisabled();
	});

	test("announces invalid scope input and keeps the question unresolved", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		const form = page.locator("form").filter({ has: page.getByLabel(/What was your total income/) });
		await form.getByLabel(/What was your total income/).fill("not-money");
		await form.getByRole("button", { name: "Record scope answer" }).click();
		await expect(form.getByRole("alert")).toContainText(/non-negative amount|valid amount|digits/i);
		await expect(form.getByLabel(/What was your total income/)).toHaveValue("not-money");
	});

	test("keeps a recorded answer editable and renders its typed provenance", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		const form = page.locator("form").filter({ has: page.getByLabel(/What was your total income/) });
		await form.getByLabel(/What was your total income/).fill("5000000");
		await form.getByRole("button", { name: "Record scope answer" }).click();
		const recorded = page.locator('[data-scope-question="scope-total-income"]');
		await expect(recorded).toContainText("Recorded answer: ₹ 5,000,000");
		await expect(recorded).toContainText("Pinned revision 2026-09-08");
		await recorded.getByRole("button", { name: "Change answer" }).click();
		await expect(recorded.getByLabel(/What was your total income/)).toHaveValue("5000000");
		await recorded.getByLabel(/What was your total income/).fill("5000000.01");
		await recorded.getByRole("button", { name: "Record scope answer" }).click();
		await expect(page.getByText(/Total income above ₹50,00,000/)).toBeVisible();
	});

	test("does not expose enabled document intake while full scope is unresolved", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		await expect(page.getByRole("heading", { name: "Select source documents" })).toHaveCount(0);
		await expect(page.getByText(/Complete the mandatory scope questions before selecting source documents/i)).toBeVisible();
	});
});
