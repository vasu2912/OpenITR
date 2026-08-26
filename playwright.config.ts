import { defineConfig } from "@playwright/test";

const previewPort = 4173;
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
	testDir: "./tests/browser",
	timeout: 30_000,
	use: {
		baseURL: previewUrl,
	},
	webServer: {
		command: `pnpm --filter @openitr/web build && pnpm --filter @openitr/web exec vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
		url: previewUrl,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
