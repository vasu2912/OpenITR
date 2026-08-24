#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN_JS_PATTERNS = [
	{
		label: "eval call",
		pattern: /\beval\s*\(/,
	},
	{
		label: "Function constructor",
		pattern: /\bnew\s+Function\s*\(/,
	},
	{
		label: "worker importScripts",
		pattern: /\bimportScripts\s*\(/,
	},
	{
		label: "document.write",
		pattern: /\bdocument\.write\s*\(/,
	},
	{
		label: "dynamic import of a remote URL",
		pattern: /\bimport\s*\(\s*["'`]https?:/,
	},
	{
		label: "worker constructed from a remote URL",
		pattern: /\bnew\s+(?:Worker|SharedWorker|ServiceWorker)\s*\(\s*["'`]https?:/,
	},
];

const REMOTE_ASSET_PATTERN =
	/\s(?:src|href)=["']https?:\/\/[^"']+["']/g;

const collectFiles = (dir, files = []) => {
	for (const entry of readdirSync(dir)) {
		const entryPath = join(dir, entry);
		if (statSync(entryPath).isDirectory()) {
			collectFiles(entryPath, files);
		} else {
			files.push(entryPath);
		}
	}
	return files;
};

const lineOf = (text, index) =>
	text.slice(0, index).split("\n").length;

export const scanRelease = ({ distDir }) => {
	const violations = [];
	let scannedFiles = 0;
	const files = collectFiles(distDir);

	for (const file of files) {
		const isScript = file.endsWith(".js") || file.endsWith(".mjs");
		const isHtml = file.endsWith(".html");
		if (!isScript && !isHtml) {
			continue;
		}
		scannedFiles += 1;
		const text = readFileSync(file, "utf8");
		const displayPath = relative(distDir, file).split(sep).join("/");

		if (isScript) {
			for (const { label, pattern } of FORBIDDEN_JS_PATTERNS) {
				const match = pattern.exec(text);
				if (match !== null) {
					violations.push(
						`${displayPath}:${lineOf(text, match.index)}: ${label}`,
					);
				}
			}
		}

		if (isHtml) {
			for (const match of text.matchAll(REMOTE_ASSET_PATTERN)) {
				violations.push(
					`${displayPath}:${lineOf(text, match.index)}: remote asset reference ${match[0].trim()}`,
				);
			}
		}
	}

	return { violations, scannedFiles };
};

const runAsCli = () => {
	const distDir = process.argv[2];
	if (distDir === undefined) {
		console.error("Usage: scan-release.mjs <dist-dir>");
		process.exitCode = 1;
		return;
	}

	let result;
	try {
		result = scanRelease({ distDir });
	} catch (error) {
		console.error(`release-guard: cannot scan "${distDir}": ${error.message}`);
		process.exitCode = 1;
		return;
	}

	if (result.violations.length > 0) {
		console.error(
			`release-guard: blocked ${result.violations.length} violation(s) in the release:`,
		);
		for (const violation of result.violations) {
			console.error(`  ${violation}`);
		}
		process.exitCode = 1;
		return;
	}

	console.log(
		`release-guard: ${result.scannedFiles} executable/HTML assets scanned, no runtime-plugin or downloaded-executable-rule vectors found.`,
	);
};

if (process.argv[1] !== undefined) {
	const invokedDirectly =
		process.argv[1] === fileURLToPath(import.meta.url) ||
		process.argv[1].endsWith("scan-release.mjs");
	if (invokedDirectly) {
		runAsCli();
	}
}
