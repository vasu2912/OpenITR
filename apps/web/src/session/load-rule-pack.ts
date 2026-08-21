import type {
	ScopeRulePack,
	TaxAnalysisModule,
	TaxAnalysisModuleId,
} from "@openitr/model";

import type { AnalysisRelease } from "../app/release-manifest";
import { activeAnalysisRelease } from "../app/release-manifest";

type TaxAnalysisModuleLoader = () => Promise<TaxAnalysisModule>;

const taxAnalysisModuleLoaders: ReadonlyMap<
	TaxAnalysisModuleId,
	TaxAnalysisModuleLoader
> = new Map([
	[
		activeAnalysisRelease.taxAnalysisModule.id,
		async () => {
			const module = await import("@openitr/itr1-ay2026-27");
			return module.itr1Ay202627TaxAnalysisModule;
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

	const taxAnalysisModule = await load();
	if (
		taxAnalysisModule.identity.id !== release.taxAnalysisModule.id ||
		taxAnalysisModule.identity.compiledModuleSha256 !==
			release.taxAnalysisModule.compiledModuleSha256
	) {
		throw new Error(
			`Tax-analysis module identity mismatch: ${release.taxAnalysisModule.id}`,
		);
	}

	const { identity } = taxAnalysisModule.rulePack;
	if (
		identity.id !== release.rulePack.id ||
		identity.sourceManifestSha256 !== release.rulePack.sourceManifestSha256 ||
		identity.compiledPackSha256 !== release.rulePack.compiledPackSha256
	) {
		throw new Error(`Rule-pack identity mismatch: ${release.rulePack.id}`);
	}
	return taxAnalysisModule.rulePack;
};
