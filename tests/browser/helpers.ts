import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const privacySentinel = "openitr-privacy-sentinel-f21a3c";
export const seededStorageJson = `{"visitor-seed":"${privacySentinel}"}`;

type CrossTabChannelProbe = Readonly<{
	broadcastChannels: number;
	sharedWorkers: number;
}>;

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
			const probe: {
				broadcastChannels: number;
				sharedWorkers: number;
			} = { broadcastChannels: 0, sharedWorkers: 0 };
			(globalThis as Record<string, unknown>).openitrCrossTabProbe = probe;

			const OriginalBroadcastChannel = globalThis.BroadcastChannel;
			if (OriginalBroadcastChannel) {
				class CountingBroadcastChannel extends OriginalBroadcastChannel {
					constructor(...channelArgs: ConstructorParameters<typeof BroadcastChannel>) {
						super(...channelArgs);
						probe.broadcastChannels += 1;
					}
				}
				globalThis.BroadcastChannel = CountingBroadcastChannel;
			}

			const OriginalSharedWorker = (
				globalThis as Record<string, unknown>
			).SharedWorker;
			if (typeof OriginalSharedWorker === "function") {
				const SharedWorkerConstructor = OriginalSharedWorker as new (
					...workerArgs: unknown[]
				) => unknown;
				class CountingSharedWorker extends SharedWorkerConstructor {
					constructor(...workerArgs: unknown[]) {
						super(...workerArgs);
						probe.sharedWorkers += 1;
					}
				}
				(globalThis as Record<string, unknown>).SharedWorker =
					CountingSharedWorker;
			}
		},
		[privacySentinel] as const,
	);
};

export const openScopeQuestion = async (page: Page): Promise<void> => {
	await page.goto("/app/");
	await expect(
		page.getByRole("heading", { name: "Residential status" }),
	).toBeVisible({ timeout: 30_000 });
};

export const answerScopeCheck = async (
	page: Page,
	answer: "Yes" | "No",
): Promise<void> => {
	await page.getByRole("radio", { name: answer }).check();
	await page.getByRole("button", { name: "Continue" }).click();
};

export const recordQuestionAnswer = async ({
	optional = false,
	page,
	prompt,
	submitButtonName = "Record answer",
	value,
}: Readonly<{
	optional?: boolean;
	page: Page;
	prompt: string | RegExp;
	submitButtonName?: string;
	value: string;
}>): Promise<boolean> => {
	const form = page.locator("form").filter({ hasText: prompt }).first();
	if ((await form.count()) === 0) {
		if (optional) return false;
		throw new Error(`Question form not found: ${String(prompt)}`);
	}
	const radioLabel =
		value === "yes" ? "Yes" : value === "no" ? "No" : undefined;
	const radio =
		radioLabel === undefined
			? undefined
			: form.getByRole("radio", { name: radioLabel, exact: true });
	if (radio !== undefined && (await radio.count()) > 0) {
		await radio.check();
	} else {
		await form.getByLabel(prompt).fill(value);
	}
	await form.getByRole("button", { name: submitButtonName }).click();
	return true;
};

const scopeChoiceLabel = (
	questionId: string,
	value: string,
): string | undefined => {
	if (value === "yes") return "Yes";
	if (value === "no") return "No";
	if (questionId !== "scope-house-property-count") return undefined;
	switch (value) {
		case "0":
			return "No properties";
		case "1":
			return "One property";
		case "2":
			return "Two properties";
		default:
			return "Three or more properties";
	}
};

export const expectInitialScopeAnswer = async ({
	page,
	answer,
}: Readonly<{ page: Page; answer: "Yes" | "No" }>): Promise<void> => {
	await expect(
		page.getByRole("heading", { name: "Scope questions" }),
	).toBeVisible();
	const individual = page.locator('[data-scope-question="scope-individual"]');
	if (answer === "Yes") {
		await expect(individual).toContainText("Recorded answer: Yes");
	} else {
		await expect(individual.getByRole("radio", { name: "Yes" })).not.toBeChecked();
		await expect(individual.getByRole("radio", { name: "No" })).not.toBeChecked();
	}
};

export const expectScopeResult = (
	page: Page,
	resultTitle:
		| "Supported by this scope check"
		| "Not supported by this scope check",
): Promise<void> => expect(page.getByText(resultTitle)).toBeVisible();

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
	expect(
		await page.evaluate(
			() =>
				(globalThis as Record<string, unknown>).openitrCrossTabProbe ?? {
					broadcastChannels: -1,
					sharedWorkers: -1,
				},
		),
	).toEqual({ broadcastChannels: 0, sharedWorkers: 0 });
	const snapshotUrl = new URL(snapshot.url);
	expect(snapshotUrl.search).toBe("");
	expect(snapshotUrl.hash).toBe("");
};

export const openDocumentIntake = async (
	page: Page,
	scopeOverrides: Readonly<Record<string, string>> = {},
): Promise<void> => {
	await openScopeQuestion(page);
	await answerScopeCheck(page, "Yes");
	const defaultAnswers: Readonly<Record<string, string>> = {
		"scope-individual": "yes",
		"scope-resident-other-than-rnor": "yes",
		"scope-total-income": "900000",
		"scope-house-property-count": "0",
		"scope-section112a-ltcg": "0",
		"scope-other-capital-gains": "no",
		"scope-agriculture-present": "no",
		"scope-business-profession": "no",
		"scope-lottery": "no",
		"scope-racehorse": "no",
		"scope-115bbda": "no",
		"scope-115bbe": "no",
		"scope-online-games": "no",
		"scope-vda": "no",
		"scope-other-special-rate": "no",
		"scope-company-director": "no",
		"scope-unlisted-equity": "no",
		"scope-foreign-assets": "no",
		"scope-foreign-signing": "no",
		"scope-foreign-income": "no",
		"scope-194n": "no",
		"scope-deferred-esop": "no",
		"scope-brought-forward-losses": "no",
		"scope-carry-forward-losses": "no",
		"scope-other-source-loss": "no",
		"scope-section5a": "no",
		"scope-foreign-tax-relief": "no",
		"scope-other-source-deductions": "no",
		"scope-other-person-tds": "no",
		// Composition questions are answered explicitly for estimate scenarios.
		// Bank interest remains unresolved until evidence or an amount answer supplies it.
		"scope-salary-pension": "yes",
		"scope-other-sources": "no",
	};
	const skippedQuestionIds = new Set<string>();
	while (true) {
		const row = page.locator("[data-current-scope-question]");
		if ((await row.count()) === 0) break;
		const questionId = await row.getAttribute("data-current-scope-question");
		if (questionId === null) break;
		const value = scopeOverrides[questionId] ?? defaultAnswers[questionId];
		if (value === undefined) {
			if (skippedQuestionIds.has(questionId)) break;
			skippedQuestionIds.add(questionId);
			await row.getByRole("button", { name: "Answer later" }).click();
			continue;
		}
		const choiceLabel = scopeChoiceLabel(questionId, value);
		if (choiceLabel === undefined) {
			await row.locator(`#${questionId}-answer`).fill(value);
		} else {
			await row.getByRole("radio", { name: choiceLabel }).check();
		}
		await row.getByRole("button", { name: "Record scope answer" }).click();
	}
	await openWorkflowStage(page, "documents");
	await expect(
		page.getByRole("heading", { name: "Select source documents" }),
	).toBeVisible();
};

const openWorkflowStage = async (
	page: Page,
	stage: "documents" | "review" | "computations" | "analysis" | "final-review",
): Promise<void> => {
	await page
		.locator(`[data-workflow-stage="${stage}"]`)
		.filter({ visible: true })
		.click();
};

export const openReviewFacts = async (page: Page): Promise<void> => {
	await openWorkflowStage(page, "review");
};

export const openIncomeComputations = async (page: Page): Promise<void> => {
	await openWorkflowStage(page, "computations");
	await page.getByRole("button", { name: "Income", exact: true }).click();
};

export const openDeductions = async (page: Page): Promise<void> => {
	await openWorkflowStage(page, "computations");
	await page.getByRole("button", { name: "Deductions", exact: true }).click();
};

export const openTaxComparison = async (page: Page): Promise<void> => {
	await openWorkflowStage(page, "computations");
	await page.getByRole("button", { name: "Tax comparison", exact: true }).click();
};

export const openAnalysis = async (page: Page): Promise<void> => {
	await openWorkflowStage(page, "analysis");
};

export const openFinalReview = async (page: Page): Promise<void> => {
	await openWorkflowStage(page, "final-review");
};

export type BrowserFixtureFile = Readonly<{
	name: string;
	mimeType: string;
	buffer: Buffer;
}>;

export const selectSourceFiles = async (
	page: Page,
	files: readonly BrowserFixtureFile[],
): Promise<void> => {
	await page.setInputFiles(
		'[aria-label="Select source documents"] input[type="file"]',
		files.map((file) => ({
			name: file.name,
			mimeType: file.mimeType,
			buffer: file.buffer,
		})),
	);
};

export const candidateRow = (page: Page, displayName: string) =>
	page.locator(`[data-candidate="${displayName}"]`);

export const expectCandidateStatus = (
	page: Page,
	displayName: string,
	status:
		| "queued"
		| "inspecting"
		| "identified"
		| "rejected"
		| "cancelled"
		| "removed",
): Promise<void> => {
	// expect.poll reads the attribute through protocol round-trips. The
	// rAF-injected polling behind web-first assertions can stall a module
	// worker's first message delivery in headless Chromium.
	return expect
		.poll(() => candidateRow(page, displayName).getAttribute("data-status"), {
			timeout: 15_000,
		})
		.toBe(status);
};
