import { expect, test } from "@playwright/test";

import {
	answerScopeCheck,
	captureStorageSnapshot,
	expectNoStoredSessionData,
	expectScopeResult,
	openScopeQuestion,
	seedVisitorStorage,
} from "./helpers";

test.describe("OpenITR browser privacy boundary", () => {
	test("answering the scope check writes no session data to the browser", async ({
		page,
	}) => {
		seedVisitorStorage(page);
		await openScopeQuestion(page);
		const snapshotBeforeAnswer = await captureStorageSnapshot(page);

		await answerScopeCheck(page, "Yes");
		await expectScopeResult(page, "Supported by this scope check");

		const snapshotAfterAnswer = await captureStorageSnapshot(page);
		expect(snapshotAfterAnswer.localStorageJson).toBe(
			snapshotBeforeAnswer.localStorageJson,
		);
		expect(snapshotAfterAnswer.sessionStorageJson).toBe(
			snapshotBeforeAnswer.sessionStorageJson,
		);
		expect(snapshotAfterAnswer.historyLength).toBe(
			snapshotBeforeAnswer.historyLength,
		);
		await expectNoStoredSessionData(page, snapshotAfterAnswer);
	});

	test("reset and refresh leave no session data in browser storage", async ({
		page,
	}) => {
		seedVisitorStorage(page);
		await openScopeQuestion(page);
		await answerScopeCheck(page, "No");
		await expectScopeResult(page, "Not supported by this scope check");

		await page
			.getByRole("main")
			.getByRole("button", { name: "Reset session" })
			.click();
		await page
			.getByRole("dialog", { name: "Reset this session?" })
			.getByRole("button", { name: "Reset session" })
			.click();
		await expect(
			page.getByRole("heading", { name: "Residential status" }),
		).toBeVisible();

		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Residential status" }),
		).toBeVisible();

		const snapshot = await captureStorageSnapshot(page);
		await expectNoStoredSessionData(page, snapshot);
	});

	test("two tabs never share an OpenITR session", async ({ browser }) => {
		const context = await browser.newContext();
		const firstTab = await context.newPage();
		await seedVisitorStorage(firstTab);
		await openScopeQuestion(firstTab);
		await answerScopeCheck(firstTab, "Yes");
		await expectScopeResult(firstTab, "Supported by this scope check");

		const secondTab = await context.newPage();
		await seedVisitorStorage(secondTab);
		await openScopeQuestion(secondTab);
		await expect(
			secondTab.getByText("Supported by this scope check"),
		).toHaveCount(0);
		await answerScopeCheck(secondTab, "No");
		await expectScopeResult(secondTab, "Not supported by this scope check");

		await expect(
			firstTab.getByText("Supported by this scope check"),
		).toBeVisible();
		await expect(
			firstTab.getByText("Not supported by this scope check"),
		).toHaveCount(0);

		const firstSnapshot = await captureStorageSnapshot(firstTab);
		await expectNoStoredSessionData(firstTab, firstSnapshot);
		const secondSnapshot = await captureStorageSnapshot(secondTab);
		await expectNoStoredSessionData(secondTab, secondSnapshot);

		await context.close();
	});
});
