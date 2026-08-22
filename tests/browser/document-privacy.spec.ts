import {
	createAisJsonFixture,
	createForm16PdfFixture,
	createUnknownBytesFixture,
} from "@openitr/document-adapters/testing";
import { expect, test } from "@playwright/test";
import type { Request } from "@playwright/test";

import { openDocumentIntake, expectCandidateStatus, selectSourceFiles } from "./helpers";

const sentinelName = "openitr-privacy-sentinel-statement.json";
const sentinelContentMarker = "openitr-sentinel-bytes";

test.describe("document inspection privacy boundary", () => {
	test("selecting documents triggers no request carrying document data", async ({
		page,
	}) => {
		const requests: Request[] = [];
		page.on("request", (request) => {
			requests.push(request);
		});

		await openDocumentIntake(page);
		const baselineCount = requests.length;

		await selectSourceFiles(page, [
			{
				name: sentinelName,
				mimeType: "application/json",
				buffer: Buffer.from(
					JSON.stringify({
						documentType: "AIS",
						schemaVersion: "2026-27",
						note: sentinelContentMarker,
					}),
					"utf-8",
				),
			},
			{
				name: "openitr-sentinel-certificate.pdf",
				mimeType: "application/pdf",
				buffer: Buffer.from(createForm16PdfFixture()),
			},
			{
				name: "openitr-sentinel-unknown.bin",
				mimeType: "application/octet-stream",
				buffer: Buffer.from(createUnknownBytesFixture()),
			},
		]);

		const origin = new URL(page.url()).origin;
		await expectCandidateStatus(page, sentinelName, "identified");
		await expectCandidateStatus(
			page,
			"openitr-sentinel-certificate.pdf",
			"identified",
		);
		await expectCandidateStatus(
			page,
			"openitr-sentinel-unknown.bin",
			"rejected",
		);
		await page.waitForTimeout(2_000);

		const afterSelection = requests.slice(baselineCount);
		for (const request of afterSelection) {
			const url = request.url();
			expect(url, "every request stays same-origin").toContain(origin);
			expect(request.method()).toBe("GET");
			// Lazy parser chunks load on demand from the same origin; nothing else
			// may be fetched once a document is selected.
			expect(new URL(url).pathname).toMatch(/^\/assets\//);
		}

		for (const request of requests) {
			const url = request.url();
			expect(url).not.toContain(sentinelName);
			expect(url).not.toContain(sentinelContentMarker);
			expect(url).not.toContain("openitr-sentinel");
			expect(request.postData() ?? "").not.toContain(sentinelName);
			expect(request.postData() ?? "").not.toContain(sentinelContentMarker);
		}
	});
});
