import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

const scriptUrl = new URL("./scan-release.mjs", import.meta.url);

const runScanner = (distDir) =>
	execFileSync(process.execPath, [scriptUrl.pathname, distDir], {
		encoding: "utf8",
	});

const createTempDist = () => {
	const root = mkdtempSync(join(tmpdir(), "openitr-release-guard-"));
	const dist = join(root, "dist");
	mkdirSync(dist, { recursive: true });
	return { root, dist };
};

let cleanupRoot;

afterEach(() => {
	if (cleanupRoot !== undefined) {
		rmSync(cleanupRoot, { recursive: true, force: true });
		cleanupRoot = undefined;
	}
});

const writeDist = (files) => {
	const { root, dist } = createTempDist();
	cleanupRoot = root;
	for (const [name, content] of Object.entries(files)) {
		const file = join(dist, name);
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, content);
	}
	return dist;
};

describe("release guard", () => {
	test("accepts a static self-hosted release", () => {
		const dist = writeDist({
			"index.html": `<!doctype html>
<html><head><link rel="stylesheet" href="./assets/index-HASH.css"></head>
<body><script type="module" src="./assets/index-HASH.js"></script></body></html>
`,
			"assets/index-HASH.js": 'const chunk="./assets/chunk-HASH.js";import(chunk);',
			"assets/chunk-HASH.js": "export const two = 1 + 1;",
		});

		expect(() => runScanner(dist)).not.toThrow();
	});

	test.each([
		[
			"direct eval",
			"assets/app-HASH.js",
			'const run = eval(userInput);',
		],
		[
			"function constructor",
			"assets/app-HASH.js",
			'const factory = new Function(ruleSource);',
		],
		[
			"worker importScripts",
			"assets/worker-HASH.js",
			'importScripts("https://cdn.example.test/rule.js");',
		],
		[
			"document write injection",
			"assets/app-HASH.js",
			'document.write("<scr"+"ipt src=remote></scr"+"ipt>");',
		],
		[
			"dynamic import of a remote rule module",
			"assets/app-HASH.js",
			'const rules = await import("https://cdn.example.test/rules.js");',
		],
		[
			"worker constructed from a remote URL",
			"assets/app-HASH.js",
			'const engine = new Worker("https://cdn.example.test/engine.js");',
		],
	])(
		"rejects a release asset containing %s",
		(_label, assetName, snippet) => {
			const dist = writeDist({
				"index.html": '<script type="module" src="./assets/index-HASH.js"></script>',
				"assets/index-HASH.js": "console.log(1);",
				[assetName]: snippet,
			});

			let failure;
			try {
				runScanner(dist);
			} catch (error) {
				failure = error;
			}

			expect(failure).toBeDefined();
			const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
			expect(output).toContain(assetName);
		},
	);

	test.each([
		[
			"quoted",
			'<script src="https://cdn.example.test/analytics.js"></script>',
		],
		[
			"unquoted",
			"<script src=https://cdn.example.test/tracker.js defer></script>",
		],
		[
			"in the first attribute position",
			'<a href="https://cdn.example.test/pixel.gif">x</a>',
		],
	])(
		"rejects a remote HTML reference written %s",
		(_label, html) => {
			const dist = writeDist({
				"index.html": html,
				"assets/index-HASH.js": "console.log(1);",
			});

			let failure;
			try {
				runScanner(dist);
			} catch (error) {
				failure = error;
			}

			expect(failure).toBeDefined();
			const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
			expect(output).toContain("cdn.example.test");
		},
	);

	test("fails when the release directory is missing", () => {
		let failure;
		try {
			runScanner("/nonexistent/openitr-dist");
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeDefined();
	});
});
