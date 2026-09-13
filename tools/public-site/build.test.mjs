import { execFileSync } from "node:child_process";
import {
	mkdtempSync,
	readFileSync,
	writeFileSync,
	rmSync,
	existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { scanRelease } from "../release-guard/scan-release.mjs";

const roots = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function build(branch) {
	const root = mkdtempSync(join(tmpdir(), "openitr-public-site-"));
	roots.push(root);
	writeFileSync(
		join(root, "index.html"),
		'<html><head><title>App</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
	);
	execFileSync(
		process.execPath,
		[new URL("./build.mjs", import.meta.url).pathname, root],
		{ env: { ...process.env, WORKERS_CI_BRANCH: branch } },
	);
	return { root, read: (path) => readFileSync(join(root, path), "utf8") };
}
test("production pages contain crawlable content, unique metadata, working local links, and matching sitemap entries", () => {
	const { root, read } = build("main");
	const paths = ["", "how-it-works/", "supported-documents/", "scope/", "faq/"];
	const titles = new Set();
	for (const path of paths) {
		const html = read(`${path}index.html`);
		expect(html.match(/<h1>/g)).toHaveLength(1);
		expect(html).toContain('name="robots" content="index, follow"');
		expect(html).toContain(
			`rel="canonical" href="https://openitr.vasu-kandagatla.workers.dev/${path}"`,
		);
		titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
		for (const [, href] of html.matchAll(/href="(\/[^"#]*)"/g)) {
			expect(
				existsSync(join(root, href.endsWith("/") ? `${href}index.html` : href)),
				href,
			).toBe(true);
		}
		expect(read("sitemap.xml")).toContain(
			`<loc>https://openitr.vasu-kandagatla.workers.dev/${path}</loc>`,
		);
	}
	expect(titles.size).toBe(5);
	expect(read("sitemap.xml")).not.toContain("/app/");
	expect(read("sitemap.xml")).not.toContain("404");
	const schema = JSON.parse(
		read("index.html").match(
			/<script type="application\/ld\+json">(.*?)<\/script>/,
		)[1],
	);
	expect(schema).toMatchObject({
		name: "OpenITR",
		isAccessibleForFree: true,
		offers: { price: "0" },
	});
	expect(read("index.html").match(/class="external-arrow"/g)).toHaveLength(4);
	expect(read("index.html")).not.toContain("↗");
	expect(read("robots.txt")).toContain("User-agent: *\nAllow: /");
	expect(scanRelease({ distDir: root }).violations).toEqual([]);
});
test("the app and missing page are noindex, and preview hosts receive noindex headers", () => {
	const { read } = build("main");
	expect(read("app/index.html")).toContain('src="/assets/app.js"');
	expect(read("app/index.html")).toContain('content="noindex, follow"');
	expect(read("404.html")).toContain('content="noindex, follow"');
	expect(read("_headers")).toContain(
		"https://:version-openitr.vasu-kandagatla.workers.dev/*\n  X-Robots-Tag: noindex, follow",
	);
});
test("branch builds mark every public page noindex without blocking retrieval", () => {
	const { read } = build("codex/public-discovery");
	for (const path of [
		"",
		"how-it-works/",
		"supported-documents/",
		"scope/",
		"faq/",
	]) {
		expect(read(`${path}index.html`)).toContain('content="noindex, follow"');
	}
	expect(read("_headers")).toContain("/*\n  X-Robots-Tag: noindex, follow");
	expect(read("robots.txt")).not.toContain("Disallow");
});
