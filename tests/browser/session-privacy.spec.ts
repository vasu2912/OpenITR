import { expect, test } from "@playwright/test";

import {
	answerScopeCheck,
	captureStorageSnapshot,
	expectNoStoredSessionData,
	expectInitialScopeAnswer,
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
		await expectInitialScopeAnswer({ page, answer: "Yes" });

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
		await expectInitialScopeAnswer({ page, answer: "No" });

		await page
			.getByRole("banner")
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
		await expectInitialScopeAnswer({ page: firstTab, answer: "Yes" });

		const secondTab = await context.newPage();
		await seedVisitorStorage(secondTab);
		await openScopeQuestion(secondTab);
		await expect(
			secondTab.getByRole("heading", { name: "Complete ITR-1 analysis scope" }),
		).toHaveCount(0);
		await answerScopeCheck(secondTab, "No");
		await expectInitialScopeAnswer({ page: secondTab, answer: "No" });

		await expectInitialScopeAnswer({ page: firstTab, answer: "Yes" });

		const firstSnapshot = await captureStorageSnapshot(firstTab);
		await expectNoStoredSessionData(firstTab, firstSnapshot);
		const secondSnapshot = await captureStorageSnapshot(secondTab);
		await expectNoStoredSessionData(secondTab, secondSnapshot);

		await context.close();
	});
});
