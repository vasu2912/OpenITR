import { expect, test } from "@playwright/test";

import { answerScopeCheck, openScopeQuestion } from "./helpers";

test.describe("full ITR-1 analysis scope", () => {
	test("shows the compact analysis notice only before the questionnaire", async ({ page }) => {
		await openScopeQuestion(page);
		await expect(page.getByRole("note")).toContainText("For analysis only");
		await answerScopeCheck(page, "Yes");
		await expect(page.getByRole("note")).toHaveCount(0);
		await expect(page.locator("[data-current-scope-question]")).toHaveCount(1);
	});

	test("renders unresolved scope questions and cited decisions after the initial answer", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");

		await expect(
			page.getByRole("heading", { name: "Scope questions" }),
		).toBeVisible();
		await expect(page.locator(".openitr-scope-analysis-card")).toHaveCount(0);
		await expect(
			page.locator(
				".openitr-current-scope-question > .openitr-scope-analysis-question-list > .openitr-scope-analysis-question",
			),
		).toHaveCount(1);
		await expect(
			page.getByRole("navigation", { name: "Scope question queue" }),
		).toHaveCount(0);
		await expect(page.locator("[data-current-scope-question]")).toHaveCount(1);
		const totalIncome = page.getByLabel(
			/What was your total income for FY 2025-26/i,
		);
		await expect(totalIncome).toHaveValue("");
		await expect(page.getByRole("button", { name: "Record scope answer" }).first()).toBeDisabled();
		await page.getByRole("button", { name: "Decision", exact: true }).click();
		await expect(page.getByText(/Missing fact key: scope\.total-income/)).toBeVisible();
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

	test("keeps the answer action clear of the input and advances after recording", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");

		const currentQuestion = page.locator("[data-current-scope-question]");
		await expect(currentQuestion).toHaveAttribute(
			"data-current-scope-question",
			"scope-total-income",
		);
		const input = currentQuestion.getByLabel(
			/What was your total income for FY 2025-26/i,
		);
		const record = currentQuestion.getByRole("button", {
			name: "Record scope answer",
		});
		await input.click();
		const inputBox = await input.boundingBox();
		const recordBox = await record.boundingBox();
		expect(inputBox).not.toBeNull();
		expect(recordBox).not.toBeNull();
		if (inputBox !== null && recordBox !== null) {
			expect(inputBox.x + inputBox.width).toBeLessThan(recordBox.x);
		}

		await input.fill("900000");
		await record.click();
		await expect(currentQuestion).not.toHaveAttribute(
			"data-current-scope-question",
			"scope-total-income",
		);
		await expect(page.locator("[data-current-scope-question]")).toHaveCount(1);
	});

	test("shows bounded counts and Yes or No answers as visible choices", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");

		const currentQuestion = page.locator("[data-current-scope-question]");
		await currentQuestion
			.getByLabel(/What was your total income for FY 2025-26/i)
			.fill("900000");
		await currentQuestion
			.getByRole("button", { name: "Record scope answer" })
			.click();

		await expect(currentQuestion).toHaveAttribute(
			"data-current-scope-question",
			"scope-house-property-count",
		);
		await expect(
			currentQuestion.getByRole("radio", { name: "No properties" }),
		).toBeVisible();
		await expect(
			currentQuestion.getByRole("radio", { name: "One property" }),
		).toBeVisible();
		await expect(
			currentQuestion.getByRole("radio", { name: "Two properties" }),
		).toBeVisible();
		await expect(
			currentQuestion.getByRole("radio", { name: "Three or more properties" }),
		).toBeVisible();
		const noPropertiesBox = await currentQuestion
			.getByRole("radio", { name: "No properties" })
			.locator("xpath=ancestor::label")
			.boundingBox();
		const onePropertyBox = await currentQuestion
			.getByRole("radio", { name: "One property" })
			.locator("xpath=ancestor::label")
			.boundingBox();
		expect(noPropertiesBox).not.toBeNull();
		expect(onePropertyBox).not.toBeNull();
		if (noPropertiesBox !== null && onePropertyBox !== null) {
			expect(onePropertyBox.y).toBeGreaterThan(
				noPropertiesBox.y + noPropertiesBox.height,
			);
		}
		await currentQuestion
			.getByRole("radio", { name: "No properties" })
			.check();
		await currentQuestion
			.getByRole("button", { name: "Record scope answer" })
			.click();

		await currentQuestion
			.getByLabel(/How much long-term profit/i)
			.fill("0");
		await currentQuestion
			.getByRole("button", { name: "Record scope answer" })
			.click();
		await expect(
			currentQuestion.getByRole("radio", { name: "Yes" }),
		).toBeVisible();
		await expect(
			currentQuestion.getByRole("radio", { name: "No" }),
		).toBeVisible();
		await expect(currentQuestion.getByRole("combobox")).toHaveCount(0);
	});

	test("keeps a deferred question out of the way when the taxpayer changes sections", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");

		const currentQuestion = page.locator("[data-current-scope-question]");
		await expect(currentQuestion).toHaveAttribute(
			"data-current-scope-question",
			"scope-total-income",
		);
		await currentQuestion.getByRole("button", { name: "Answer later" }).click();
		await expect(currentQuestion).not.toHaveAttribute(
			"data-current-scope-question",
			"scope-total-income",
		);
		await page.getByRole("button", { name: "Decision", exact: true }).click();
		await page.getByRole("button", { name: "Questions", exact: true }).click();
		await expect(currentQuestion).not.toHaveAttribute(
			"data-current-scope-question",
			"scope-total-income",
		);
	});

	test("keeps a recorded answer editable and renders its typed provenance", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		const form = page.locator("form").filter({ has: page.getByLabel(/What was your total income/) });
		await form.getByLabel(/What was your total income/).fill("5000000");
		await form.getByRole("button", { name: "Record scope answer" }).click();
		await page.locator("summary").filter({ hasText: /Review .* recorded answers?/ }).click();
		const recorded = page.locator('[data-scope-question="scope-total-income"]');
		await expect(recorded).toContainText("Recorded answer: ₹ 5,000,000");
		await expect(recorded).toContainText("Pinned revision 2026-09-17");
		await recorded.getByRole("button", { name: "Change answer" }).click();
		await expect(recorded.getByLabel(/What was your total income/)).toHaveValue("5000000");
		await recorded.getByLabel(/What was your total income/).fill("5000000.01");
		await recorded.getByRole("button", { name: "Record scope answer" }).click();
		await page.getByRole("button", { name: "Decision", exact: true }).click();
		await expect(page.getByText(/Total income above ₹50,00,000/)).toBeVisible();
	});

	test("does not expose enabled document intake while full scope is unresolved", async ({ page }) => {
		await openScopeQuestion(page);
		await answerScopeCheck(page, "Yes");
		await expect(page.getByRole("heading", { name: "Select source documents" })).toHaveCount(0);
		await page.getByRole("button", { name: /^Documents / }).click();
		await expect(page.getByText(/Complete the mandatory scope questions before selecting source documents/i)).toBeVisible();
	});
});
