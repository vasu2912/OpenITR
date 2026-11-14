import type { ScopeRulePack } from "@openitr/model";

export type FactLabeler = (factKey: unknown) => string;

const capitalize = (text: string): string =>
	text.charAt(0).toUpperCase() + text.slice(1);

const ACRONYMS = new Set([
	"ais",
	"gti",
	"hra",
	"nps",
	"pan",
	"tan",
	"tcs",
	"tds",
]);

// "derived.rebate-section-87a" -> "Rebate section 87A". Content hashes that
// make node ids unique are dropped because they mean nothing to a reader.
export const humanizeKey = (key: unknown): string => {
	const name = String(key).split(".").slice(1).join(" ") || String(key);
	const words = name
		.split("-")
		.filter((word) => !/^[0-9a-f]{16,}$/.test(word))
		.map((word) =>
			/^\d+[a-z]+$/.test(word) || ACRONYMS.has(word)
				? word.toUpperCase()
				: word,
		);
	return capitalize(words.join(" "));
};

export const createFactLabeler = (
	rulePack: ScopeRulePack,
	documentFields: readonly Readonly<{ factKey: unknown; label: string }>[] = [],
): FactLabeler => {
	const labels = new Map<string, string>();
	for (const field of documentFields) {
		labels.set(String(field.factKey), field.label);
	}
	for (const question of rulePack.questions) {
		labels.set(String(question.suppliesFact), question.prompt);
	}
	for (const fact of rulePack.analysisScope?.facts ?? []) {
		labels.set(String(fact.key), capitalize(fact.label));
	}
	return (factKey) => labels.get(String(factKey)) ?? humanizeKey(factKey);
};
