import type {
	ScopeRulePack,
	TaxAnalysisModuleArtifact,
	TaxAnalysisModuleId,
} from "@openitr/model";

import type { AnalysisRelease } from "../app/release-manifest";
import { activeAnalysisRelease } from "../app/release-manifest";

type TaxAnalysisModuleArtifactLoader = () => Promise<TaxAnalysisModuleArtifact>;

const taxAnalysisModuleLoaders: ReadonlyMap<
	TaxAnalysisModuleId,
	TaxAnalysisModuleArtifactLoader
> = new Map([
	[
		activeAnalysisRelease.taxAnalysisModule.id,
		async () => {
			const module = await import("@openitr/itr1-ay2026-27");
			return module.itr1Ay202627TaxAnalysisModuleArtifact;
		},
	],
]);

export const loadRulePack = async (
	release: AnalysisRelease,
): Promise<ScopeRulePack> => {
	const load = taxAnalysisModuleLoaders.get(release.taxAnalysisModule.id);
	if (load === undefined) {
		throw new Error(
			`Unknown tax-analysis module: ${release.taxAnalysisModule.id}`,
		);
	}

	const moduleArtifact = await load();
	if (
		moduleArtifact.identity.id !== release.taxAnalysisModule.id ||
		moduleArtifact.identity.compiledModuleSha256 !==
			release.taxAnalysisModule.compiledModuleSha256
	) {
		throw new Error(
			`Tax-analysis module identity mismatch: ${release.taxAnalysisModule.id}`,
		);
	}

	const { identity } = moduleArtifact.rulePack;
	if (
		identity.id !== release.rulePack.id ||
		identity.sourceManifestSha256 !== release.rulePack.sourceManifestSha256 ||
		identity.compiledPackSha256 !== release.rulePack.compiledPackSha256
	) {
		throw new Error(`Rule-pack identity mismatch: ${release.rulePack.id}`);
	}
	return moduleArtifact.rulePack;
};
