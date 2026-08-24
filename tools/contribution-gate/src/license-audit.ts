import {
	existsSync,
	realpathSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const ALLOWED_LICENSES = new Set([
	"0BSD",
	"MIT",
	"APACHE-2.0",
	"BSD-2-CLAUSE",
	"BSD-3-CLAUSE",
	"ISC",
	"SIL OFL 1.1",
	"OFL-1.1",
]);

export const normalizeLicense = (
	value: string | undefined,
): string => {
	if (value === undefined) {
		return "UNLICENSED";
	}
	const withoutWildcards = value
		.replaceAll("*", "")
		.replaceAll(/[()]/g, "")
		.trim();
	return withoutWildcards === ""
		? "UNLICENSED"
		: withoutWildcards.toUpperCase();
};

export const isAllowedLicense = (value: string | undefined): boolean => {
	const normalized = normalizeLicense(value);
	if (normalized === "UNLICENSED") {
		return false;
	}
	const tokens = normalized
		.replaceAll(/[()]/g, " ")
		.split(/\s+OR\s+|\s+AND\s+/)
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
	return tokens.every((token) => ALLOWED_LICENSES.has(token));
};

export type LicenseViolationReason =
	| "disallowed-license"
	| "unreadable-package";

export type LicenseViolation = Readonly<{
	name: string;
	version: string | null;
	reason: LicenseViolationReason;
	license: string | null;
}>;

export type LicenseAuditResult = Readonly<{
	checkedPackages: number;
	violations: readonly LicenseViolation[];
}>;

const isRecord = (
	value: unknown,
): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const readPackageManifest = (file: string): Record<string, unknown> | null => {
	try {
		const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

const workspacePackageDirectories = (workspaceRoot: string): string[] => {
	const workspaceGroupDirectories = [
		join(workspaceRoot, "apps"),
		join(workspaceRoot, "packages"),
		join(workspaceRoot, "packages", "tax-analysis-modules"),
		join(workspaceRoot, "tools"),
	];
	const directories: string[] = [];
	for (const groupDir of workspaceGroupDirectories) {
		if (!existsSync(groupDir)) {
			continue;
		}
		for (const entry of readdirSync(groupDir)) {
			const entryDir = join(groupDir, entry);
			if (existsSync(join(entryDir, "package.json"))) {
				directories.push(entryDir);
			}
		}
	}
	return directories;
};

const stringField = (
	manifest: Record<string, unknown>,
	field: string,
): string | undefined => {
	const value = manifest[field];
	return typeof value === "string" ? value : undefined;
};

const productionDependenciesOf = (
	manifest: Record<string, unknown>,
): readonly { name: string; version: string }[] => {
	const dependencies = manifest.dependencies;
	if (!isRecord(dependencies)) {
		return [];
	}
	return Object.entries(dependencies)
		.filter((entry): entry is [string, string] => typeof entry[1] === "string")
		.filter(([, version]) => !version.startsWith("workspace:"))
		.map(([name, version]) => ({ name, version }));
};

export const auditWorkspaceLicenses = ({
	workspaceRoot,
}: Readonly<{ workspaceRoot: string }>): LicenseAuditResult => {
	const violations: LicenseViolation[] = [];
	const visited = new Set<string>();
	let checkedPackages = 0;

	const resolveDependencyDir = (
		name: string,
		fromDirectory: string,
	): string | undefined => {
		let current = fromDirectory;
		while (true) {
			const candidate = join(current, "node_modules", name);
			if (existsSync(join(candidate, "package.json"))) {
				return candidate;
			}
			const parent = dirname(current);
			if (parent === current) {
				return undefined;
			}
			current = parent;
		}
	};

	const auditDependency = (name: string, fromDirectory: string): void => {
		const packageDir = resolveDependencyDir(name, fromDirectory);
		if (packageDir === undefined) {
			violations.push({
				name,
				version: null,
				reason: "unreadable-package",
				license: null,
			});
			return;
		}

		let realPackageDir = packageDir;
		try {
			realPackageDir = realpathSync(packageDir);
		} catch {
			realPackageDir = packageDir;
		}
		if (visited.has(realPackageDir)) {
			return;
		}
		visited.add(realPackageDir);

		const manifest = readPackageManifest(
			join(realPackageDir, "package.json"),
		);
		if (manifest === null) {
			violations.push({
				name,
				version: null,
				reason: "unreadable-package",
				license: null,
			});
			return;
		}
		const license = stringField(manifest, "license");
		const version = stringField(manifest, "version") ?? null;
		if (license === undefined) {
			violations.push({
				name,
				version,
				reason: "unreadable-package",
				license: null,
			});
			return;
		}
		checkedPackages += 1;

		if (!isAllowedLicense(license)) {
			violations.push({
				name,
				version,
				reason: "disallowed-license",
				license: normalizeLicense(license),
			});
		}

		for (const dependency of productionDependenciesOf(manifest)) {
			auditDependency(dependency.name, realPackageDir);
		}
	};

	for (const directory of workspacePackageDirectories(workspaceRoot)) {
		const manifest = readPackageManifest(join(directory, "package.json"));
		if (manifest === null) {
			continue;
		}
		for (const dependency of productionDependenciesOf(manifest)) {
			auditDependency(dependency.name, directory);
		}
	}

	violations.sort((left, right) => left.name.localeCompare(right.name));

	return { checkedPackages, violations };
};
