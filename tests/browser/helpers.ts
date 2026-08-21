import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const privacySentinel = "openitr-privacy-sentinel-f21a3c";
export const seededStorageJson = `{"visitor-seed":"${privacySentinel}"}`;

type BrowserStorageSnapshot = Readonly<{
	localStorageJson: string;
	sessionStorageJson: string;
	url: string;
	historyLength: number;
}>;

export const seedVisitorStorage = (page: Page): void => {
	void page.addInitScript(
		([sentinel]) => {
			localStorage.setItem("visitor-seed", sentinel);
			sessionStorage.setItem("visitor-seed", sentinel);
		},
		[privacySentinel] as const,
	);
};

export const openScopeQuestion = async (page: Page): Promise<void> => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Residential status" }),
	).toBeVisible();
};

export const answerScopeCheck = async (
	page: Page,
	answer: "Yes" | "No",
): Promise<void> => {
	await page.getByRole("radio", { name: answer }).check();
	await page.getByRole("button", { name: "Check scope" }).click();
};

export const expectScopeResult = (
	page: Page,
	resultTitle:
		| "Supported by this scope check"
		| "Not supported by this scope check",
): void => {
	expect(page.getByText(resultTitle)).toBeVisible();
};

export const captureStorageSnapshot = (
	page: Page,
): Promise<BrowserStorageSnapshot> =>
	Promise.all([
		page.evaluate(() => JSON.stringify(localStorage)),
		page.evaluate(() => JSON.stringify(sessionStorage)),
		page.evaluate(() => window.location.href),
		page.evaluate(() => window.history.length),
	]).then(([localStorageJson, sessionStorageJson, url, historyLength]) => ({
		localStorageJson,
		sessionStorageJson,
		url,
		historyLength,
	}));

export const expectNoStoredSessionData = async (
	page: Page,
	snapshot: BrowserStorageSnapshot,
): Promise<void> => {
	expect(snapshot.localStorageJson).toBe(seededStorageJson);
	expect(snapshot.sessionStorageJson).toBe(seededStorageJson);
	expect(await page.evaluate(() => document.cookie)).toBe("");
	expect(await page.evaluate(() => caches.keys())).toEqual([]);
	expect(
		await page.evaluate(() =>
			indexedDB.databases().then((databases) => databases.map((d) => d.name)),
		),
	).toEqual([]);
	expect(
		await page.evaluate(() =>
			navigator.serviceWorker.getRegistrations().then((r) => r.length),
		),
	).toBe(0);
	expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
	const snapshotUrl = new URL(snapshot.url);
	expect(snapshotUrl.search).toBe("");
	expect(snapshotUrl.hash).toBe("");
};
