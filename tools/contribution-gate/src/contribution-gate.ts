import { canonicalJson, compileRulePack } from "@openitr/rulepack-compiler";
import type {
	RulePackIdentity,
	RulePackManifest,
	TaxAnalysisModuleArtifact,
} from "@openitr/model";

export type ContributionFindingCode =
	| "unregistered-revision"
	| "stale-registration"
	| "checksum-mismatch"
	| "nondeterministic-output"
	| "release-pins-unregistered-pack"
	| "release-module-mismatch";

export type ContributionFinding = Readonly<{
	code: ContributionFindingCode;
	detail: string;
}>;

export type ReleasePin = Readonly<{
	taxAnalysisModule: Readonly<{
		id: TaxAnalysisModuleArtifact["identity"]["id"];
		compiledModuleSha256: TaxAnalysisModuleArtifact["identity"]["compiledModuleSha256"];
	}>;
	rulePack: Pick<
		RulePackIdentity,
		"id" | "sourceManifestSha256" | "compiledPackSha256"
	>;
}>;

export type AuditTaxAnalysisModuleContributionInput = Readonly<{
	manifests: readonly RulePackManifest[];
	artifact: TaxAnalysisModuleArtifact;
	release: ReleasePin;
}>;

const digestDifferences = (
	label: string,
	expected: RulePackIdentity,
	actual: Pick<RulePackIdentity, "sourceManifestSha256" | "compiledPackSha256">,
): string[] => {
	const differences: string[] = [];
	if (expected.sourceManifestSha256 !== actual.sourceManifestSha256) {
		differences.push(
			`sourceManifestSha256 ${actual.sourceManifestSha256} != ${label} ${expected.sourceManifestSha256}`,
		);
	}
	if (expected.compiledPackSha256 !== actual.compiledPackSha256) {
		differences.push(
			`compiledPackSha256 ${actual.compiledPackSha256} != ${label} ${expected.compiledPackSha256}`,
		);
	}
	return differences;
};

const identityDifferences = (
	fresh: RulePackIdentity,
	registered: RulePackIdentity,
): string[] => {
	const differences: string[] = [];
	if (fresh.id !== registered.id) {
		differences.push(`id ${registered.id} != freshly compiled ${fresh.id}`);
	}
	return [
		...differences,
		...digestDifferences("freshly compiled", fresh, registered),
	];
};

export const auditTaxAnalysisModuleContribution = async ({
	manifests,
	artifact,
	release,
}: AuditTaxAnalysisModuleContributionInput): Promise<
	readonly ContributionFinding[]
> => {
	const findings: ContributionFinding[] = [];

	const compiledIdentities = new Map<string, RulePackIdentity>();
	for (const manifest of manifests) {
		const firstPass = await compileRulePack({ manifest });
		const secondPass = await compileRulePack({ manifest });
		if (canonicalJson(firstPass.identity) !== canonicalJson(secondPass.identity)) {
			findings.push({
				code: "nondeterministic-output",
				detail: `Compiling rule pack "${manifest.rulePackId}" twice produced different identities (${firstPass.identity.compiledPackSha256} then ${secondPass.identity.compiledPackSha256}).`,
			});
		}
		compiledIdentities.set(firstPass.identity.id, firstPass.identity);
	}

	for (const [packId, fresh] of compiledIdentities) {
		const registered = artifact.rulePackRevisions.revisions.find(
			(revision) => revision.identity.id === fresh.id,
		);
		if (registered === undefined) {
			findings.push({
				code: "unregistered-revision",
				detail: `Rule-pack revision "${packId}" compiles from a shipped manifest but is absent from the module registry. Register it in the tax-analysis module artifact.`,
			});
			continue;
		}
		const differences = identityDifferences(fresh, registered.identity);
		if (differences.length > 0) {
			findings.push({
				code: "checksum-mismatch",
				detail: `Registered identity of "${packId}" disagrees with a fresh compile of its manifest: ${differences.join("; ")}.`,
			});
		}
	}

	for (const revision of artifact.rulePackRevisions.revisions) {
		if (!compiledIdentities.has(revision.identity.id)) {
			findings.push({
				code: "stale-registration",
				detail: `Registry entry "${revision.identity.id}" is not backed by any shipped manifest. Remove the entry or ship its manifest.`,
			});
		}
	}

	if (
		release.taxAnalysisModule.id !== artifact.identity.id ||
		release.taxAnalysisModule.compiledModuleSha256 !==
			artifact.identity.compiledModuleSha256
	) {
		findings.push({
			code: "release-module-mismatch",
			detail: `Release pins tax-analysis module "${release.taxAnalysisModule.id}" but the artifact identifies as "${artifact.identity.id}".`,
		});
	}

	const releaseRevision = artifact.rulePackRevisions.revisions.find(
		(revision) => revision.identity.id === release.rulePack.id,
	);
	if (releaseRevision === undefined) {
		findings.push({
			code: "release-pins-unregistered-pack",
			detail: `Release pins rule pack "${release.rulePack.id}", which no registry revision provides.`,
		});
	} else {
		const differences = digestDifferences(
			"registered revision",
			releaseRevision.identity,
			release.rulePack,
		);
		if (differences.length > 0) {
			findings.push({
				code: "checksum-mismatch",
				detail: `Release pin for "${release.rulePack.id}" disagrees with the registered revision: ${differences.join("; ")}.`,
			});
		}
	}

	return findings.sort((left, right) =>
		left.code === right.code
			? left.detail.localeCompare(right.detail)
			: left.code.localeCompare(right.code),
	);
};
