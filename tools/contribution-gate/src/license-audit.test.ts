import {
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

import {
	auditWorkspaceLicenses,
	isAllowedLicense,
	normalizeLicense,
} from "./license-audit";

const createSyntheticWorkspace = (
	packages: Record<string, Record<string, unknown>>,
): string => {
	const createdRoot = mkdirSync(
		join(tmpdir(), `openitr-license-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`),
		{ recursive: true },
	);
	if (createdRoot === undefined) {
		throw new Error("Could not create the synthetic workspace fixture");
	}
	const root = createdRoot;
	for (const [manifestPath, manifest] of Object.entries(packages)) {
		const file = join(root, manifestPath);
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, JSON.stringify(manifest));
	}
	return root;
};

const cleanupRoots: string[] = [];

afterEach(() => {
	while (cleanupRoots.length > 0) {
		const root = cleanupRoots.pop();
		if (root !== undefined) {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

describe("licence policy normalisation", () => {
	test.each([
		["MIT", true],
		["0BSD", true],
		["Apache-2.0", true],
		["BSD-2-Clause", true],
		["BSD-3-Clause", true],
		["ISC", true],
		["(MIT OR Apache-2.0)", true],
		["MIT *", true],
		["SIL OFL 1.1", true],
		["OFL-1.1", true],
		["CC-BY-4.0", false],
		["(MIT OR GPL-3.0)", false],
		["GPL-3.0", false],
		["UNLICENSED", false],
		["UNLICENSED*", false],
		[undefined, false],
	] as const)("decides %s as %j", (raw, expected) => {
		expect(isAllowedLicense(raw)).toBe(expected);
	});

	test("normalises licence expressions to comparable tokens", () => {
		expect(normalizeLicense("(MIT OR Apache-2.0)")).toBe("MIT OR APACHE-2.0");
		expect(normalizeLicense("MIT *")).toBe("MIT");
		expect(normalizeLicense(undefined)).toBe("UNLICENSED");
	});
});

describe("workspace licence audit", () => {
	test("walks the production dependency closure and reports only disallowed licences", () => {
		const root = createSyntheticWorkspace({
			"apps/web/package.json": {
				name: "@test/web",
				private: true,
				dependencies: { good: "1.0.0", bad: "1.0.0" },
			},
			"node_modules/good/package.json": {
				name: "good",
				version: "1.0.0",
				license: "MIT",
				dependencies: { nested: "1.0.0" },
			},
			"node_modules/nested/package.json": {
				name: "nested",
				version: "1.0.0",
				license: "(MIT OR Apache-2.0)",
			},
			"node_modules/bad/package.json": {
				name: "bad",
				version: "2.0.0",
				license: "GPL-3.0-only",
			},
			"node_modules/unlicensed/package.json": {
				name: "unlicensed",
				version: "0.1.0",
			},
		});
		cleanupRoots.push(root);

		const result = auditWorkspaceLicenses({ workspaceRoot: root });

		expect(result.checkedPackages).toBe(3);
		expect(result.violations).toEqual([
			{
				name: "bad",
				version: "2.0.0",
				reason: "disallowed-license",
				license: "GPL-3.0-ONLY",
			},
		]);
	});

	test("reports an unreadable dependency instead of crashing the audit", () => {
		const root = createSyntheticWorkspace({
			"packages/model/package.json": {
				name: "@test/model",
				private: true,
				dependencies: { ghost: "1.0.0" },
			},
		});
		cleanupRoots.push(root);

		const result = auditWorkspaceLicenses({ workspaceRoot: root });

		expect(result.violations).toEqual([
			{
				name: "ghost",
				version: null,
				reason: "unreadable-package",
				license: null,
			},
		]);
	});
});

describe("this repository's production dependencies", () => {
	test("stay inside the permissive allowlist", () => {
		const repoRoot = new URL("../../..", import.meta.url).pathname;

		const result = auditWorkspaceLicenses({ workspaceRoot: repoRoot });

		expect(result.checkedPackages).toBeGreaterThan(20);
		expect(result.violations).toEqual([]);
	});
});
