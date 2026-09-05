import {
	parseAssessmentYear,
	parseDocumentKind,
	parseFactKey,
	parseFinancialYear,
	parseIssueCode,
	parseQuestionId,
	parseRuleId,
	parseRulePackId,
	parseSha256Digest,
	parseSourceId,
	parseTaxFormId,
} from "@openitr/model";
import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	parseExactMoney,
} from "@openitr/model";
import type {
	CompiledHousePropertyTaxConstants,
	CompiledAgriculturalIncomeTaxConstants,
	CompiledNewRegimeTaxConstants,
	CompiledOtherSourcesTaxConstants,
	CompiledSavingsPensionDeductionTaxConstants,
	CompiledSection112aCapitalGainTaxConstants,
	CompiledSelfOccupiedHousePropertyTaxConstants,
	CompiledRulePack,
	EligibilityAnswerValue,
	EligibilityQuestion,
	FactAnswerSchema,
	FactQuestion,
	OfficialSource,
	RuleCitation,
	RuleId,
	RulePackManifest,
	RulePackManifestFactQuestionRecord,
	RulePackManifestRuleRecord,
	RulePackManifestSourceRecord,
	RulePackSlabBand,
	ScopeCheckResult,
	SourceId,
	AnalysisScopeCatalog,
	RulePackManifestAnalysisScopeRecord,
	ScopeFactSchema,
	ScopeQuestionAnswerSchema,
	ScopeRuleCondition,
} from "@openitr/model";

const compareStrings = (left: string, right: string): number => {
	if (left < right) {
		return -1;
	}
	return left > right ? 1 : 0;
};

const isNonEmpty = (value: string): boolean => value.trim().length > 0;

const requireNonEmpty = (
	value: string,
	description: string,
): string => {
	if (!isNonEmpty(value)) {
		throw new Error(`Missing ${description}`);
	}
	return value;
};

const supportedEngineContractVersions: readonly string[] = Object.freeze([
	"1",
]);

const isIsoCalendarDate = (value: string): boolean => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const parsed = Date.parse(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed);
};

const isHttpsUrl = (value: string): boolean => {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
};

const compileOfficialSource = (
	record: RulePackManifestSourceRecord,
): OfficialSource => {
	const id = parseSourceId(record.id);
	requireNonEmpty(record.title, `title for official source "${id}"`);
	requireNonEmpty(record.authority, `authority for official source "${id}"`);
	if (!isHttpsUrl(record.url)) {
		throw new Error(
			`Official source "${id}" must cite an https:// URL: ${record.url}`,
		);
	}
	if (!isIsoCalendarDate(record.releaseDate)) {
		throw new Error(
			`Official source "${id}" needs an ISO release date (YYYY-MM-DD): ${record.releaseDate}`,
		);
	}
	if (!isIsoCalendarDate(record.retrievedDate)) {
		throw new Error(
			`Official source "${id}" needs an ISO retrieval date (YYYY-MM-DD): ${record.retrievedDate}`,
		);
	}
	if (!/^[a-f0-9]{64}$/.test(record.contentSha256)) {
		throw new Error(
			`Malformed SHA-256 checksum for official source "${id}": ${record.contentSha256}`,
		);
	}
	if (record.redistributionStatus !== "not-redistributed") {
		throw new Error(
			`Unsupported redistribution status for official source "${id}": ${record.redistributionStatus}`,
		);
	}

	return Object.freeze({
		id,
		title: record.title,
		authority: record.authority,
		url: record.url,
		releaseDate: record.releaseDate,
		retrievedDate: record.retrievedDate,
		contentSha256: parseSha256Digest(record.contentSha256),
		redistributionStatus: "not-redistributed",
	});
};

type CompiledRule = Readonly<{
	citation: RuleCitation;
	sourceId: SourceId;
	sourceLocation: string;
}>;

const requireWholePercentage = (value: number, description: string): number => {
	if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
		throw new Error(
			`${description} must be a whole percentage between 0 and 100: ${value}`,
		);
	}
	return value;
};

const requireBasisPointRate = (value: number, description: string): number => {
	if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
		throw new Error(
			`${description} must be a whole basis-point rate between 0 and 10000: ${value}`,
		);
	}
	return value;
};

const requireNonNegativeWholeRupees = (
	value: number,
	description: string,
): number => {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(
			`${description} must be a non-negative whole rupee amount: ${value}`,
		);
	}
	return value;
};

const requirePositiveWholeRupees = (
	value: number,
	description: string,
): number => {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(
			`${description} must be a positive whole rupee amount: ${value}`,
		);
	}
	return value;
};

const compileSlabBands = <
	Bands extends readonly [RulePackSlabBand, ...RulePackSlabBand[]],
>(
	bands: Bands,
): Bands => {
	let previousUpperBound = 0;
	for (const [index, band] of bands.entries()) {
		const label = `Slab band ${index + 1}`;
		requireWholePercentage(band.ratePercent, `${label} rate`);
		if (band.upperBoundWholeRupees === null) {
			if (index !== bands.length - 1) {
				throw new Error("Only the last slab band may be open-ended");
			}
			break;
		}
		const upperBound = requirePositiveWholeRupees(
			band.upperBoundWholeRupees,
			`${label} upper bound`,
		);
		if (upperBound <= previousUpperBound) {
			throw new Error(
				`${label} upper bound must exceed the previous band's upper bound (${previousUpperBound})`,
			);
		}
		previousUpperBound = upperBound;
	}
	const finalBand = bands[bands.length - 1];
	if (
		finalBand === undefined ||
		finalBand.upperBoundWholeRupees !== null
	) {
		throw new Error("The last slab band must be open-ended");
	}
	return bands;
};

const compileSurchargeTiers = (
	tiers: readonly { exceedsTotalIncomeWholeRupees: number; ratePercent: number }[],
): readonly { exceedsTotalIncomeWholeRupees: number; ratePercent: number }[] => {
	let previousThreshold = 0;
	for (const [index, tier] of tiers.entries()) {
		const label = `Surcharge tier ${index + 1}`;
		requireWholePercentage(tier.ratePercent, `${label} rate`);
		const threshold = requirePositiveWholeRupees(
			tier.exceedsTotalIncomeWholeRupees,
			`${label} threshold`,
		);
		if (threshold <= previousThreshold) {
			throw new Error(
				`${label} threshold must exceed the previous tier's threshold (${previousThreshold})`,
			);
		}
		previousThreshold = threshold;
	}
	return tiers;
};

const compileSupportedRule = (
	record: RulePackManifestRuleRecord,
	sourcesById: ReadonlyMap<string, OfficialSource>,
): CompiledRule => {
	const id = parseRuleId(record.id);
	requireNonEmpty(record.citation, `citation for rule "${id}"`);
	requireNonEmpty(
		record.sourceLocation,
		`source location for rule "${id}"`,
	);
	const source = sourcesById.get(record.sourceId);
	if (source === undefined) {
		throw new Error(
			`Unknown source reference: rule "${id}" cites undeclared source "${record.sourceId}"`,
		);
	}

	return Object.freeze({
		citation: Object.freeze({
			id,
			citation: record.citation,
			sourceUrl: source.url,
		}),
		sourceId: parseSourceId(record.sourceId),
		sourceLocation: record.sourceLocation,
	});
};

const canonicalizeJson = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(canonicalizeJson);
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => compareStrings(left, right))
				.map(([key, entryValue]) => [key, canonicalizeJson(entryValue)]),
		);
	}
	return value;
};

export const canonicalJson = (value: unknown): string =>
	JSON.stringify(canonicalizeJson(value));

const sha256Hex = async (text: string): Promise<string> => {
	const bytes = new TextEncoder().encode(text);
	const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
};

const deepFreeze = <T>(value: T): T => {
	if (value !== null && typeof value === "object") {
		for (const entry of Object.values(value)) {
			deepFreeze(entry);
		}
		Object.freeze(value);
	}
	return value;
};

const answerOptions: EligibilityQuestion["answers"] = deepFreeze([
	{ value: "yes", label: "Yes" },
	{ value: "no", label: "No" },
] as const);

const compileMissingFactQuestions = ({
	records,
	rulesById,
}: Readonly<{
	records: readonly RulePackManifestFactQuestionRecord[];
	rulesById: ReadonlyMap<string, CompiledRule>;
}>): readonly FactQuestion[] => {
	const seenQuestionIds = new Set<string>();
	const seenSuppliedFactKeys = new Set<string>();
	const answerSchemasByFact = new Map<string, FactAnswerSchema>();
	const questions: FactQuestion[] = [];
	for (const record of records) {
		const id = parseQuestionId(record.id);
		if (seenQuestionIds.has(id)) {
			throw new Error(
				`Duplicate missing-fact question identifier: "${id}"`,
			);
		}
		seenQuestionIds.add(id);

		const requiresRuleId = parseRuleId(record.requiresRuleId);
		const requiredRule = rulesById.get(requiresRuleId);
		if (requiredRule === undefined) {
			throw new Error(
				`Unknown rule reference: missing-fact question "${id}" requires undeclared rule "${record.requiresRuleId}"`,
			);
		}

		const suppliesFact = parseFactKey(record.suppliesFactKey);
		if (seenSuppliedFactKeys.has(suppliesFact)) {
			throw new Error(
				`Missing-fact question "${id}" supplies the fact key "${suppliesFact}" more than once in one catalog`,
			);
		}
		seenSuppliedFactKeys.add(suppliesFact);

		const schemaKind = record.answerSchema.kind;
		let answerSchema: FactAnswerSchema;
		switch (schemaKind) {
			case "exact-money": {
				const minimum = requireNonNegativeWholeRupees(
					record.answerSchema.minimumWholeRupees,
					`The minimum for missing-fact question "${id}"`,
				);
				const authoredMaximum = record.answerSchema.maximumWholeRupees;
				const maximum =
					authoredMaximum === null
						? null
						: requireNonNegativeWholeRupees(
								authoredMaximum,
								`The maximum for missing-fact question "${id}"`,
							);
				if (maximum !== null && maximum < minimum) {
					throw new Error(
						`The maximum for missing-fact question "${id}" must not be less than its minimum: ${maximum} < ${minimum}`,
					);
				}
				answerSchema = deepFreeze({
					kind: "exact-money",
					minimumWholeRupees: minimum,
					maximumWholeRupees: maximum,
				});
				break;
			}
			case "boolean":
				answerSchema = deepFreeze({ kind: "boolean" });
				break;
			default: {
				const _exhaustive: never = schemaKind;
				return _exhaustive;
			}
		}
		let visibility: FactQuestion["visibility"];
		const authoredVisibility = record.visibility;
		if (authoredVisibility !== undefined) {
			switch (authoredVisibility.kind) {
				case "always":
					visibility = deepFreeze({ kind: "always" });
					break;
				case "fact-boolean-equals": {
					const factKey = parseFactKey(authoredVisibility.factKey);
					if (answerSchemasByFact.get(factKey)?.kind !== "boolean") {
						throw new Error(
							`Visibility for missing-fact question "${id}" must refer to an earlier boolean question fact: "${factKey}"`,
						);
					}
					visibility = deepFreeze({
						kind: "fact-boolean-equals",
						factKey,
						value: authoredVisibility.value,
					});
					break;
				}
				case "fact-money-greater-than": {
					const factKey = parseFactKey(authoredVisibility.factKey);
					if (answerSchemasByFact.get(factKey)?.kind !== "exact-money") {
						throw new Error(
							`Visibility for missing-fact question "${id}" must refer to an earlier money question fact: "${factKey}"`,
						);
					}
					visibility = deepFreeze({
						kind: "fact-money-greater-than",
						factKey,
						wholeRupees: requireNonNegativeWholeRupees(
							authoredVisibility.wholeRupees,
							`Visibility threshold for missing-fact question "${id}"`,
						),
					});
					break;
				}
			}
		}
		answerSchemasByFact.set(suppliesFact, answerSchema);

		questions.push(
			deepFreeze({
				id,
				prompt: requireNonEmpty(
					record.prompt,
					`prompt for missing-fact question "${id}"`,
				),
				helpText: requireNonEmpty(
					record.helpText,
					`helpText for missing-fact question "${id}"`,
				),
				requiresRuleId,
				suppliesFact,
				whyRequired: requireNonEmpty(
					record.whyRequired,
					`whyRequired rationale for missing-fact question "${id}"`,
				),
				affectedResult: deepFreeze({
					resultId: requireNonEmpty(
						record.affectedResult.resultId,
						`affected result id for missing-fact question "${id}"`,
					),
					label: requireNonEmpty(
						record.affectedResult.label,
						`affected result label for missing-fact question "${id}"`,
					),
				}),
				answerSchema,
				...(visibility === undefined ? {} : { visibility }),
				sourceReference: deepFreeze({
					sourceId: requiredRule.sourceId,
					location: requiredRule.sourceLocation,
				}),
			}),
		);
	}
	return questions;
};

const compileScopeFactSchema = (
	{ schema, description }: Readonly<{ schema: ScopeFactSchema; description: string; }>,
): ScopeFactSchema => {
	switch (schema.kind) {
		case "boolean":
			return deepFreeze({ kind: "boolean" });
		case "exact-money": {
			const minimum = requireNonNegativeWholeRupees(
				schema.minimumWholeRupees,
				`${description} minimum`,
			);
			const maximum =
				schema.maximumWholeRupees === null
					? null
					: requireNonNegativeWholeRupees(
							schema.maximumWholeRupees,
							`${description} maximum`,
						);
			if (maximum !== null && maximum < minimum) {
				throw new Error(
					`${description} maximum must not be less than its minimum`,
				);
			}
			return deepFreeze({
				kind: "exact-money",
				minimumWholeRupees: minimum,
				maximumWholeRupees: maximum,
			});
		}
		case "whole-number": {
			const minimum = requireNonNegativeWholeRupees(
				schema.minimum,
				`${description} minimum`,
			);
			const maximum =
				schema.maximum === null
					? null
					: requireNonNegativeWholeRupees(
							schema.maximum,
							`${description} maximum`,
						);
			if (maximum !== null && maximum < minimum) {
				throw new Error(
					`${description} maximum must not be less than its minimum`,
				);
			}
			return deepFreeze({ kind: "whole-number", minimum, maximum });
		}
		case "choice": {
			if (schema.values.length === 0) {
				throw new Error(`${description} needs at least one choice value`);
			}
			const values = schema.values.map((value) =>
				requireNonEmpty(value, `${description} choice value`),
			);
			if (new Set(values).size !== values.length) {
				throw new Error(`${description} contains duplicate choice values`);
			}
			return deepFreeze({ kind: "choice", values: Object.freeze([...values]) });
		}
		default: {
			const _exhaustive: never = schema;
			return _exhaustive;
		}
	}
};

const compileScopeQuestionSchema = (
	{ schema, description }: Readonly<{ schema: ScopeQuestionAnswerSchema; description: string; }>,
): ScopeQuestionAnswerSchema => {
	switch (schema.kind) {
		case "boolean":
			return deepFreeze({ kind: "boolean" });
		case "exact-money":
			return compileScopeFactSchema({ schema, description });
		case "whole-number":
			return compileScopeFactSchema({ schema, description });
		case "choice":
			return compileScopeFactSchema({ schema, description });
		default: {
			const _exhaustive: never = schema;
			return _exhaustive;
		}
	}
};

const scopeSchemasAreCompatible = (
	{ factSchema, questionSchema }: Readonly<{ factSchema: ScopeFactSchema; questionSchema: ScopeQuestionAnswerSchema; }>,
): boolean => {
	if (factSchema.kind !== questionSchema.kind) {
		return false;
	}
	if (factSchema.kind === "boolean") {
		return true;
	}
	if (factSchema.kind === "choice" && questionSchema.kind === "choice") {
		return questionSchema.values.every((value) => factSchema.values.includes(value));
	}
	if (factSchema.kind === "exact-money" && questionSchema.kind === "exact-money") {
		const minimumCompatible =
			compareExactMoney(
				exactMoneyFromWholeRupees(questionSchema.minimumWholeRupees),
				exactMoneyFromWholeRupees(factSchema.minimumWholeRupees),
			) >= 0;
		const maximumCompatible =
			factSchema.maximumWholeRupees === null ||
			(questionSchema.maximumWholeRupees !== null &&
				questionSchema.maximumWholeRupees <= factSchema.maximumWholeRupees);
		return minimumCompatible && maximumCompatible;
	}
	if (factSchema.kind === "whole-number" && questionSchema.kind === "whole-number") {
		return (
			questionSchema.minimum >= factSchema.minimum &&
			(factSchema.maximum === null ||
				(questionSchema.maximum !== null && questionSchema.maximum <= factSchema.maximum))
		);
	}
	return false;
};

const compileAnalysisScope = ({
	record,
	rulesById,
	sourcesById,
}: Readonly<{
	record: RulePackManifestAnalysisScopeRecord;
	rulesById: ReadonlyMap<string, CompiledRule>;
	sourcesById: ReadonlyMap<string, OfficialSource>;
}>): AnalysisScopeCatalog => {
	const facts = record.facts.map((fact) => ({
		key: parseFactKey(fact.key),
		label: requireNonEmpty(fact.label, `scope fact label for "${fact.key}"`),
		schema: compileScopeFactSchema({ schema: fact.schema, description: `scope fact "${fact.key}"` }),
	}));
	const factsByKey = new Map(facts.map((fact) => [fact.key, fact]));
	if (factsByKey.size !== facts.length) {
		throw new Error("Duplicate full analysis-scope fact identifier");
	}

	const rules = record.rules.map((rule) => {
		const id = parseRuleId(rule.id);
		const factKey = parseFactKey(rule.factKey);
		const supportedRule = rulesById.get(id);
		if (supportedRule === undefined) {
			throw new Error(
				`Unknown rule reference: scope rule "${id}" is absent from supportedRules`,
			);
		}
		if (!factsByKey.has(factKey)) {
			throw new Error(
				`Unknown fact reference: scope rule "${id}" refers to undeclared fact "${rule.factKey}"`,
			);
		}
		const sourceId = parseSourceId(rule.sourceId);
		const source = sourcesById.get(sourceId);
		if (source === undefined) {
			throw new Error(
				`Unknown source reference: scope rule "${id}" cites undeclared source "${rule.sourceId}"`,
			);
		}
		const citation = requireNonEmpty(rule.citation, `citation for scope rule "${id}"`);
		const sourceLocation = requireNonEmpty(
			rule.sourceLocation,
			`source location for scope rule "${id}"`,
		);
		if (
			citation !== supportedRule.citation.citation ||
			sourceId !== supportedRule.sourceId ||
			sourceLocation !== supportedRule.sourceLocation
		) {
			throw new Error(
				`Scope rule "${id}" citation differs from its supportedRules citation or source location`,
			);
		}
		const fact = factsByKey.get(factKey);
		if (fact === undefined) {
			throw new Error(`Unknown fact reference: scope rule "${id}"`);
		}
		const factSchemaKind = fact.schema.kind;
		const conditionSchemaKind =
			rule.condition.kind === "must-be-true" || rule.condition.kind === "must-be-false"
				? "boolean"
				: rule.condition.kind === "at-most-exact-money"
					? "exact-money"
					: "whole-number";
		if (factSchemaKind !== conditionSchemaKind) {
			throw new Error(
				`Scope rule "${id}" condition ${conditionSchemaKind} is incompatible with fact "${rule.factKey}" schema ${factSchemaKind}`,
			);
		}
		let condition: ScopeRuleCondition;
		switch (rule.condition.kind) {
			case "must-be-true":
			case "must-be-false":
				condition = { kind: rule.condition.kind };
				break;
			case "at-most-exact-money":
				{
					const limit = parseExactMoney(rule.condition.limit);
					if (
						fact.schema.kind !== "exact-money" ||
						(fact.schema.maximumWholeRupees !== null &&
							compareExactMoney(
								limit,
								exactMoneyFromWholeRupees(fact.schema.maximumWholeRupees),
							) > 0) ||
						compareExactMoney(
							limit,
							exactMoneyFromWholeRupees(fact.schema.minimumWholeRupees),
						) < 0
					) {
						throw new Error(
							`Scope rule "${id}" condition limit is incompatible with fact "${rule.factKey}" schema`,
						);
					}
				condition = {
					kind: "at-most-exact-money",
					limit,
				};
				}
				break;
			case "at-most-whole-number":
				{
					const limit = requireNonNegativeWholeRupees(
						rule.condition.limit,
						`Scope rule "${id}" limit`,
					);
					if (
						fact.schema.kind !== "whole-number" ||
						limit < fact.schema.minimum ||
						(fact.schema.maximum !== null && limit > fact.schema.maximum)
					) {
						throw new Error(
							`Scope rule "${id}" condition limit is incompatible with fact "${rule.factKey}" schema`,
						);
					}
				condition = {
					kind: "at-most-whole-number",
					limit,
				};
				}
				break;
			default: {
				const _exhaustive: never = rule.condition;
				return _exhaustive;
			}
		}
		return deepFreeze({
			id,
			factKey,
			condition,
			citation: deepFreeze({
				id,
				citation,
					sourceId: source.id,
					sourceUrl: source.url,
					sourceLocation,
			}),
			supportedTitle: requireNonEmpty(rule.supportedTitle, `supported title for scope rule "${id}"`),
			supportedExplanation: requireNonEmpty(rule.supportedExplanation, `supported explanation for scope rule "${id}"`),
			unsupportedTitle: requireNonEmpty(rule.unsupportedTitle, `unsupported title for scope rule "${id}"`),
			unsupportedExplanation: requireNonEmpty(rule.unsupportedExplanation, `unsupported explanation for scope rule "${id}"`),
			unknownExplanation: requireNonEmpty(rule.unknownExplanation, `unknown explanation for scope rule "${id}"`),
			blockedExplanation: requireNonEmpty(rule.blockedExplanation, `blocked explanation for scope rule "${id}"`),
			recoveryAction: requireNonEmpty(rule.recoveryAction, `recovery action for scope rule "${id}"`),
		});
	});
	const rulesByScopeId = new Map<string, (typeof rules)[number]>();
	for (const rule of rules) {
		if (rulesByScopeId.has(rule.id)) {
			throw new Error(`Duplicate full analysis-scope rule identifier: ${rule.id}`);
		}
		rulesByScopeId.set(rule.id, rule);
	}

	const questions = record.questions.map((question) => {
		const id = parseQuestionId(question.id);
		const factKey = parseFactKey(question.factKey);
		const ruleId =
			question.requiresRuleId === undefined
				? undefined
				: parseRuleId(question.requiresRuleId);
		const rule = ruleId === undefined ? undefined : rulesByScopeId.get(ruleId);
		if (question.requiresRuleId !== undefined && rule === undefined) {
			throw new Error(
				`Unknown rule reference: scope question "${id}" requires undeclared scope rule "${question.requiresRuleId}"`,
			);
		}
		if (rule !== undefined && rule.factKey !== factKey) {
			throw new Error(
				`Scope question "${id}" supplies ${question.factKey}, but rule "${question.requiresRuleId}" evaluates ${rule.factKey}`,
			);
		}
		const fact = factsByKey.get(factKey);
		if (fact === undefined) {
			throw new Error(
				`Scope question "${id}" refers to undeclared fact "${question.factKey}"`,
			);
		}
		const answerSchema = compileScopeQuestionSchema(
			{ schema: question.answerSchema, description: `scope question "${id}" answer schema` },
		);
		if (!scopeSchemasAreCompatible({ factSchema: fact.schema, questionSchema: answerSchema })) {
			throw new Error(
				`Scope question "${id}" answer schema ${question.answerSchema.kind} is incompatible with fact "${question.factKey}" schema ${fact.schema.kind}`,
			);
		}
		return deepFreeze({
			id,
			prompt: requireNonEmpty(question.prompt, `scope question prompt for "${id}"`),
			helpText: requireNonEmpty(question.helpText, `scope question help text for "${id}"`),
			factKey,
			...(ruleId === undefined ? {} : { requiresRuleId: ruleId }),
			whyRequired: requireNonEmpty(question.whyRequired, `scope question rationale for "${id}"`),
			answerSchema,
			...(rule === undefined
				? {}
				: {
						sourceReference: deepFreeze({
							sourceId: rule.citation.sourceId,
							location: rule.citation.sourceLocation,
						}),
					}),
		});
	});
	const seenQuestionIds = new Set<string>();
	for (const question of questions) {
		if (seenQuestionIds.has(question.id)) {
			throw new Error(`Duplicate full analysis-scope question identifier: ${question.id}`);
		}
		seenQuestionIds.add(question.id);
	}

	const documentExpectations = record.documentExpectations.map((expectation) => {
		const id = requireNonEmpty(expectation.id, "scope document expectation ID");
		const documentKinds = expectation.documentKinds.map((kind) => parseDocumentKind(kind));
		const factKeys = expectation.factKeys.map((factKey) => {
			const parsed = parseFactKey(factKey);
			if (!factsByKey.has(parsed)) {
				throw new Error(
					`Unknown fact reference: scope document expectation "${id}" refers to "${factKey}"`,
				);
			}
			return parsed;
		});
		return deepFreeze({
			id,
			label: requireNonEmpty(expectation.label, `scope document expectation label for "${id}"`),
			documentKinds: deepFreeze([...documentKinds]),
			factKeys: deepFreeze([...factKeys]),
			parserSupport: expectation.parserSupport,
			purpose: requireNonEmpty(expectation.purpose, `scope document expectation purpose for "${id}"`),
		});
	});
	const documentExpectationIds = new Set<string>();
	for (const expectation of documentExpectations) {
		if (documentExpectationIds.has(expectation.id)) {
			throw new Error(
				`Duplicate full analysis-scope document expectation identifier: ${expectation.id}`,
			);
		}
		documentExpectationIds.add(expectation.id);
	}
	return deepFreeze({
		facts: deepFreeze(facts),
		rules: deepFreeze(rules),
		questions: deepFreeze(questions),
		documentExpectations: deepFreeze(documentExpectations),
		educationalLimitations: deepFreeze(
			record.educationalLimitations.map((limitation) =>
				requireNonEmpty(limitation, "scope educational limitation"),
			),
		),
	});
};

export type CompileRulePackInput = Readonly<{
	manifest: RulePackManifest;
}>;

export const compileRulePack = async ({
	manifest,
}: CompileRulePackInput): Promise<CompiledRulePack> => {
	const minimumEngineContractVersion = requireNonEmpty(
		manifest.engineContractVersion,
		"engine contract version",
	);
	if (!supportedEngineContractVersions.includes(minimumEngineContractVersion)) {
		throw new Error(
			`Incompatible engine contract version: ${minimumEngineContractVersion}. This compiler supports: ${supportedEngineContractVersions.join(", ")}`,
		);
	}

	const identityWithoutHashes = {
		id: parseRulePackId(requireNonEmpty(manifest.rulePackId, "rule-pack ID")),
		form: parseTaxFormId(manifest.form),
		financialYear: parseFinancialYear(manifest.financialYear),
		assessmentYear: parseAssessmentYear(manifest.assessmentYear),
		revision: requireNonEmpty(manifest.packRevision, "pack revision"),
		minimumEngineContractVersion,
	};

	if (manifest.officialSources.length === 0) {
		throw new Error("Missing official sources in rule-pack manifest");
	}
	if (manifest.supportedRules.length === 0) {
		throw new Error("Missing supported rules in rule-pack manifest");
	}

	const sourcesById = new Map<string, OfficialSource>();
	for (const record of manifest.officialSources) {
		const source = compileOfficialSource(record);
		if (sourcesById.has(source.id)) {
			throw new Error(`Duplicate official source identifier: ${source.id}`);
		}
		sourcesById.set(source.id, source);
	}

	const rulesById = new Map<string, CompiledRule>();
	for (const record of manifest.supportedRules) {
		const compiledRule = compileSupportedRule(record, sourcesById);
		if (rulesById.has(compiledRule.citation.id)) {
			throw new Error(
				`Duplicate rule identifier: ${compiledRule.citation.id}`,
			);
		}
		rulesById.set(compiledRule.citation.id, compiledRule);
	}

	for (const source of sourcesById.values()) {
		const isReferenced = [...rulesById.values()].some(
			(compiledRule) => compiledRule.sourceId === source.id,
		);
		if (!isReferenced) {
			throw new Error(
				`Unresolved source reference: official source "${source.id}" is declared but never cited by a supported rule`,
			);
		}
	}

	const sortedRules = [...manifest.supportedRules].sort((left, right) =>
		compareStrings(left.id, right.id),
	);
	const supportedRuleIds = sortedRules.map((record) => parseRuleId(record.id));

	const ruleCitations: Record<string, RuleCitation> = {};
	for (const record of sortedRules) {
		const compiledRule = rulesById.get(parseRuleId(record.id));
		if (compiledRule !== undefined) {
			ruleCitations[compiledRule.citation.id] = compiledRule.citation;
		}
	}

	const scopeCheck = manifest.scopeCheck;
	const questionId = parseQuestionId(scopeCheck.questionId);
	const requiresRuleId = parseRuleId(scopeCheck.requiresRuleId);
	const requiredRule = rulesById.get(requiresRuleId);
	if (requiredRule === undefined) {
		throw new Error(
			`Unknown rule reference: scope check requires undeclared rule "${scopeCheck.requiresRuleId}"`,
		);
	}
	const suppliesFactKey = parseFactKey(scopeCheck.suppliesFactKey);
	const blockingIssueCode = parseIssueCode(scopeCheck.blockingIssueCode);

	const question: EligibilityQuestion = deepFreeze({
		id: questionId,
		prompt: requireNonEmpty(scopeCheck.prompt, "question prompt"),
		helpText: requireNonEmpty(scopeCheck.helpText, "question help text"),
		answers: answerOptions,
		suppliesFact: suppliesFactKey,
		requiresRuleId,
		answerSchema: deepFreeze({
			kind: "choice",
			values: deepFreeze(["yes", "no"]),
		}),
		visibility: deepFreeze({ kind: "always" }),
		blockingEffect: deepFreeze({
			kind: "block-on-answer",
			answer: "no",
			issueCode: blockingIssueCode,
		}),
		sourceReference: deepFreeze({
			sourceId: requiredRule.sourceId,
			location: requiredRule.sourceLocation,
		}),
	});

	const supportedResult = scopeCheck.supportedResult;
	const unsupportedResult = scopeCheck.unsupportedResult;
	const results = deepFreeze<
		Record<EligibilityAnswerValue, ScopeCheckResult>
	>({
		yes: {
			kind: "supported",
			title: requireNonEmpty(supportedResult.title, "supported result title"),
			explanation: requireNonEmpty(
				supportedResult.explanation,
				"supported result explanation",
			),
			rule: requiredRule.citation,
		},
		no: {
			kind: "unsupported",
			title: requireNonEmpty(
				unsupportedResult.title,
				"unsupported result title",
			),
			explanation: requireNonEmpty(
				unsupportedResult.explanation,
				"unsupported result explanation",
			),
			rule: requiredRule.citation,
			issue: {
				code: blockingIssueCode,
				severity: "blocking",
				affectedFacts: [suppliesFactKey],
				sourceReferences: [question.sourceReference],
				recoveryAction: requireNonEmpty(
					unsupportedResult.recoveryAction,
					"recovery action",
				),
			},
		},
	});

	const officialSources = deepFreeze(
		[...sourcesById.values()].sort((left, right) =>
			compareStrings(left.id, right.id),
		),
	);

	const compiledQuestions =
		manifest.missingFactQuestions === undefined
			? undefined
			: deepFreeze(
					compileMissingFactQuestions({
						records: manifest.missingFactQuestions,
						rulesById,
				}),
			);
	for (const question of compiledQuestions ?? []) {
		if (question.id === questionId) {
			throw new Error(
				`Missing-fact question identifier "${question.id}" duplicates the scope-check question`,
			);
		}
		if (question.suppliesFact === suppliesFactKey) {
			throw new Error(
				`Missing-fact question "${question.id}" supplies the scope-check fact key "${question.suppliesFact}"`,
			);
		}
	}

	const resolveConstantRule = (
		ruleId: string,
		description: string,
	): RuleId => {
		const parsed = parseRuleId(ruleId);
		if (!rulesById.has(parsed)) {
			throw new Error(
				`Unknown rule reference: ${description} requires undeclared rule "${ruleId}"`,
			);
		}
		return parsed;
	};

	let compiledTaxConstants: CompiledRulePack["taxConstants"];
	const authoredTaxConstants = manifest.taxConstants;
	if (authoredTaxConstants !== undefined) {
		const authored = authoredTaxConstants.newRegime;
		const newRegime: CompiledNewRegimeTaxConstants = {
			slabBands: compileSlabBands(authored.slabBands),
			slabRuleId: resolveConstantRule(
				authored.slabRuleId,
				"The slab schedule",
			),
			standardDeductionWholeRupees: requireNonNegativeWholeRupees(
				authored.standardDeductionWholeRupees,
				"The standard deduction",
			),
			standardDeductionRuleId: resolveConstantRule(
				authored.standardDeductionRuleId,
				"The standard deduction",
			),
			rebateMaxTotalIncomeWholeRupees: requirePositiveWholeRupees(
				authored.rebateMaxTotalIncomeWholeRupees,
				"The rebate total-income limit",
			),
			rebateMaxAmountWholeRupees: requireNonNegativeWholeRupees(
				authored.rebateMaxAmountWholeRupees,
				"The maximum rebate amount",
			),
			rebateRuleId: resolveConstantRule(
				authored.rebateRuleId,
				"The rebate limit",
			),
			rebateMarginalReliefRuleId: resolveConstantRule(
				authored.rebateMarginalReliefRuleId,
				"The rebate marginal relief",
			),
			surchargeTiers: compileSurchargeTiers(authored.surchargeTiers),
			surchargeRuleId: resolveConstantRule(
				authored.surchargeRuleId,
				"The surcharge schedule",
			),
			cessRatePercent: requireWholePercentage(
				authored.cessRatePercent,
				"The cess rate",
			),
			cessRuleId: resolveConstantRule(
				authored.cessRuleId,
				"The cess rate",
			),
			totalIncomeRoundingBaseWholeRupees: requirePositiveWholeRupees(
				authored.totalIncomeRoundingBaseWholeRupees,
				"The total-income rounding base",
			),
			totalIncomeRoundingRuleId: resolveConstantRule(
				authored.totalIncomeRoundingRuleId,
				"The total-income rounding base",
			),
			taxRoundingBaseWholeRupees: requirePositiveWholeRupees(
				authored.taxRoundingBaseWholeRupees,
				"The tax rounding base",
			),
			taxRoundingRuleId: resolveConstantRule(
				authored.taxRoundingRuleId,
				"The tax rounding base",
			),
		};
		const authoredHouseProperty =
			authoredTaxConstants.selfOccupiedHouseProperty;
		let selfOccupiedHouseProperty:
			| CompiledSelfOccupiedHousePropertyTaxConstants
			| undefined;
		if (authoredHouseProperty !== undefined) {
			const enhancedInterestLimitWholeRupees = requirePositiveWholeRupees(
				authoredHouseProperty.enhancedInterestLimitWholeRupees,
				"The enhanced self-occupied interest limit",
			);
			const basicInterestLimitWholeRupees = requirePositiveWholeRupees(
				authoredHouseProperty.basicInterestLimitWholeRupees,
				"The basic self-occupied interest limit",
			);
			if (basicInterestLimitWholeRupees > enhancedInterestLimitWholeRupees) {
				throw new Error(
					"The basic self-occupied interest limit must not exceed the enhanced limit",
				);
			}
			selfOccupiedHouseProperty = {
				enhancedInterestLimitWholeRupees,
				basicInterestLimitWholeRupees,
				annualValueRuleId: resolveConstantRule(
					authoredHouseProperty.annualValueRuleId,
					"The self-occupied annual-value rule",
				),
				oldRegimeInterestRuleId: resolveConstantRule(
					authoredHouseProperty.oldRegimeInterestRuleId,
					"The old-regime self-occupied interest rule",
				),
				newRegimeInterestRuleId: resolveConstantRule(
					authoredHouseProperty.newRegimeInterestRuleId,
					"The new-regime self-occupied interest rule",
				),
			};
		}
		const authoredCompleteHouseProperty = authoredTaxConstants.houseProperty;
		let houseProperty: CompiledHousePropertyTaxConstants | undefined;
		if (authoredCompleteHouseProperty !== undefined) {
			const selfOccupiedEnhancedInterestLimitWholeRupees =
				requirePositiveWholeRupees(
					authoredCompleteHouseProperty.selfOccupiedEnhancedInterestLimitWholeRupees,
					"The enhanced self-occupied interest limit",
				);
			const selfOccupiedBasicInterestLimitWholeRupees =
				requirePositiveWholeRupees(
					authoredCompleteHouseProperty.selfOccupiedBasicInterestLimitWholeRupees,
					"The basic self-occupied interest limit",
				);
			if (selfOccupiedBasicInterestLimitWholeRupees > selfOccupiedEnhancedInterestLimitWholeRupees) {
				throw new Error(
					"The basic self-occupied interest limit must not exceed the enhanced limit",
				);
			}
			houseProperty = {
				selfOccupiedEnhancedInterestLimitWholeRupees,
				selfOccupiedBasicInterestLimitWholeRupees,
				letOutStandardDeductionPercent: requireWholePercentage(
					authoredCompleteHouseProperty.letOutStandardDeductionPercent,
					"The let-out standard-deduction rate",
				),
				selfOccupiedAnnualValueRuleId: resolveConstantRule(authoredCompleteHouseProperty.selfOccupiedAnnualValueRuleId, "The self-occupied annual-value rule"),
				selfOccupiedOldRegimeInterestRuleId: resolveConstantRule(authoredCompleteHouseProperty.selfOccupiedOldRegimeInterestRuleId, "The old-regime self-occupied interest rule"),
				selfOccupiedNewRegimeInterestRuleId: resolveConstantRule(authoredCompleteHouseProperty.selfOccupiedNewRegimeInterestRuleId, "The new-regime self-occupied interest rule"),
				letOutGrossAnnualValueRuleId: resolveConstantRule(authoredCompleteHouseProperty.letOutGrossAnnualValueRuleId, "The let-out gross annual-value rule"),
				letOutMunicipalTaxRuleId: resolveConstantRule(authoredCompleteHouseProperty.letOutMunicipalTaxRuleId, "The let-out municipal-tax rule"),
				letOutStandardDeductionRuleId: resolveConstantRule(authoredCompleteHouseProperty.letOutStandardDeductionRuleId, "The let-out standard-deduction rule"),
				letOutInterestRuleId: resolveConstantRule(authoredCompleteHouseProperty.letOutInterestRuleId, "The let-out interest rule"),
			};
		}
		const authoredOtherSources = authoredTaxConstants.otherSources;
		let otherSources: CompiledOtherSourcesTaxConstants | undefined;
		if (authoredOtherSources !== undefined) {
			otherSources = {
				familyPensionDeductionDivisor: requirePositiveWholeRupees(authoredOtherSources.familyPensionDeductionDivisor, "The family-pension deduction divisor"),
				oldRegimeFamilyPensionDeductionLimitWholeRupees: requirePositiveWholeRupees(authoredOtherSources.oldRegimeFamilyPensionDeductionLimitWholeRupees, "The old-regime family-pension deduction limit"),
				newRegimeFamilyPensionDeductionLimitWholeRupees: requirePositiveWholeRupees(authoredOtherSources.newRegimeFamilyPensionDeductionLimitWholeRupees, "The new-regime family-pension deduction limit"),
				dividendRuleId: resolveConstantRule(authoredOtherSources.dividendRuleId, "The dividend income rule"),
				interestRuleId: resolveConstantRule(authoredOtherSources.interestRuleId, "The other-interest income rule"),
				familyPensionIncomeRuleId: resolveConstantRule(authoredOtherSources.familyPensionIncomeRuleId, "The family-pension income rule"),
				oldRegimeFamilyPensionDeductionRuleId: resolveConstantRule(authoredOtherSources.oldRegimeFamilyPensionDeductionRuleId, "The old-regime family-pension deduction rule"),
				newRegimeFamilyPensionDeductionRuleId: resolveConstantRule(authoredOtherSources.newRegimeFamilyPensionDeductionRuleId, "The new-regime family-pension deduction rule"),
				totalRuleId: resolveConstantRule(authoredOtherSources.totalRuleId, "The other-source total rule"),
			};
		}
		const authoredSection112a = authoredTaxConstants.section112aCapitalGain;
		let section112aCapitalGain:
			| CompiledSection112aCapitalGainTaxConstants
			| undefined;
		if (authoredSection112a !== undefined) {
			const itr1GainLimitWholeRupees = requirePositiveWholeRupees(
				authoredSection112a.itr1GainLimitWholeRupees,
				"The ITR-1 section 112A gain limit",
			);
			const taxFreeThresholdWholeRupees = requirePositiveWholeRupees(
				authoredSection112a.taxFreeThresholdWholeRupees,
				"The section 112A tax-free threshold",
			);
			if (taxFreeThresholdWholeRupees !== itr1GainLimitWholeRupees) {
				throw new Error(
					"The ITR-1 section 112A limit must equal the section 112A tax-free threshold",
				);
			}
			section112aCapitalGain = {
				itr1GainLimitWholeRupees,
				taxFreeThresholdWholeRupees,
				taxRateBasisPoints: requireBasisPointRate(
					authoredSection112a.taxRateBasisPoints,
					"The section 112A tax rate",
				),
				taxRoundingBaseWholeRupees: requirePositiveWholeRupees(
					authoredSection112a.taxRoundingBaseWholeRupees,
					"The section 112A tax rounding base",
				),
				classificationRuleId: resolveConstantRule(authoredSection112a.classificationRuleId, "The section 112A classification rule"),
				gainRuleId: resolveConstantRule(authoredSection112a.gainRuleId, "The section 112A gain rule"),
				itr1LimitRuleId: resolveConstantRule(authoredSection112a.itr1LimitRuleId, "The ITR-1 section 112A limit rule"),
				taxRuleId: resolveConstantRule(authoredSection112a.taxRuleId, "The section 112A tax rule"),
				taxRoundingRuleId: resolveConstantRule(authoredSection112a.taxRoundingRuleId, "The section 112A tax rounding rule"),
			};
		}
		const authoredAgriculturalIncome = authoredTaxConstants.agriculturalIncome;
		let agriculturalIncome: CompiledAgriculturalIncomeTaxConstants | undefined;
		if (authoredAgriculturalIncome !== undefined) {
			agriculturalIncome = {
				itr1LimitWholeRupees: requirePositiveWholeRupees(
					authoredAgriculturalIncome.itr1LimitWholeRupees,
					"The ITR-1 agricultural-income limit",
				),
				exemptReportingRuleId: resolveConstantRule(
					authoredAgriculturalIncome.exemptReportingRuleId,
					"The agricultural-income exempt-reporting rule",
				),
				itr1LimitRuleId: resolveConstantRule(
					authoredAgriculturalIncome.itr1LimitRuleId,
					"The ITR-1 agricultural-income limit rule",
				),
			};
		}
		const authoredSavingsPension = authoredTaxConstants.savingsPensionDeductions;
		let savingsPensionDeductions:
			| CompiledSavingsPensionDeductionTaxConstants
			| undefined;
		if (authoredSavingsPension !== undefined) {
			const rule = (id: string, description: string): RuleId =>
				resolveConstantRule(id, description);
			savingsPensionDeductions = {
				sharedLimitWholeRupees: requirePositiveWholeRupees(
					authoredSavingsPension.sharedLimitWholeRupees,
					"The sections 80C, 80CCC, and 80CCD(1) shared limit",
				),
				section80ccd1EmployeeSalaryPercent: requireWholePercentage(
					authoredSavingsPension.section80ccd1EmployeeSalaryPercent,
					"The section 80CCD(1) employee salary percentage",
				),
				section80ccd1OtherGrossTotalIncomePercent: requireWholePercentage(
					authoredSavingsPension.section80ccd1OtherGrossTotalIncomePercent,
					"The section 80CCD(1) non-employee gross-total-income percentage",
				),
				section80ccd1bLimitWholeRupees: requirePositiveWholeRupees(
					authoredSavingsPension.section80ccd1bLimitWholeRupees,
					"The section 80CCD(1B) limit",
				),
				oldRegimeGovernmentEmployerSalaryPercent: requireWholePercentage(
					authoredSavingsPension.oldRegimeGovernmentEmployerSalaryPercent,
					"The old-regime government-employer contribution percentage",
				),
				oldRegimeOtherEmployerSalaryPercent: requireWholePercentage(
					authoredSavingsPension.oldRegimeOtherEmployerSalaryPercent,
					"The old-regime other-employer contribution percentage",
				),
				newRegimeEmployerSalaryPercent: requireWholePercentage(
					authoredSavingsPension.newRegimeEmployerSalaryPercent,
					"The new-regime employer contribution percentage",
				),
				sharedLimitRuleId: rule(authoredSavingsPension.sharedLimitRuleId, "The shared deduction-limit rule"),
				section80ccd1EmployeeLimitRuleId: rule(authoredSavingsPension.section80ccd1EmployeeLimitRuleId, "The employee section 80CCD(1) limit rule"),
				section80ccd1OtherLimitRuleId: rule(authoredSavingsPension.section80ccd1OtherLimitRuleId, "The non-employee section 80CCD(1) limit rule"),
				section80ccd1bLimitRuleId: rule(authoredSavingsPension.section80ccd1bLimitRuleId, "The section 80CCD(1B) limit rule"),
				oldRegimeGovernmentEmployerLimitRuleId: rule(authoredSavingsPension.oldRegimeGovernmentEmployerLimitRuleId, "The old-regime government-employer contribution rule"),
				oldRegimeOtherEmployerLimitRuleId: rule(authoredSavingsPension.oldRegimeOtherEmployerLimitRuleId, "The old-regime other-employer contribution rule"),
				newRegimeEmployerLimitRuleId: rule(authoredSavingsPension.newRegimeEmployerLimitRuleId, "The new-regime employer contribution rule"),
				newRegimeExclusionRuleId: rule(authoredSavingsPension.newRegimeExclusionRuleId, "The new-regime Chapter VI-A exclusion rule"),
				proofRuleId: rule(authoredSavingsPension.proofRuleId, "The supporting-detail rule"),
			};
		}
		compiledTaxConstants = deepFreeze({
			newRegime,
			...(selfOccupiedHouseProperty === undefined
				? {}
				: { selfOccupiedHouseProperty }),
			...(houseProperty === undefined ? {} : { houseProperty }),
			...(otherSources === undefined ? {} : { otherSources }),
			...(section112aCapitalGain === undefined
				? {}
				: { section112aCapitalGain }),
			...(agriculturalIncome === undefined ? {} : { agriculturalIncome }),
			...(savingsPensionDeductions === undefined
				? {}
				: { savingsPensionDeductions }),
		});
	}

	const compiledAnalysisScope =
		manifest.analysisScope === undefined
			? undefined
			: compileAnalysisScope({
					record: manifest.analysisScope,
				rulesById,
				sourcesById,
			});

	const sourceManifestSha256 = parseSha256Digest(
		await sha256Hex(canonicalJson(officialSources)),
	);

	const identityWithSourceHashes = {
		...identityWithoutHashes,
		sourceManifestSha256,
	};

	const hashedContents = {
		identity: { ...identityWithSourceHashes, officialSourceRevisionIds: officialSources.map((source) => source.id) },
		officialSources,
		supportedRuleIds,
		ruleCitations,
		scopeCheck: { question, results },
		...(compiledQuestions === undefined
			? {}
			: { missingFactQuestions: compiledQuestions }),
		...(compiledAnalysisScope === undefined
			? {}
			: { analysisScope: compiledAnalysisScope }),
		taxConstants: compiledTaxConstants,
	};

	const compiledPackSha256 = parseSha256Digest(
		await sha256Hex(canonicalJson(hashedContents)),
	);

	return deepFreeze({
		identity: {
			...identityWithSourceHashes,
			officialSourceRevisionIds: officialSources.map(
				(source) => source.id,
			),
			sourceManifestSha256,
			compiledPackSha256,
		},
		officialSources,
		supportedRuleIds,
		ruleCitations,
		scopeCheck: { question, results },
		...(compiledQuestions === undefined
			? {}
			: { missingFactQuestions: compiledQuestions }),
		...(compiledAnalysisScope === undefined
			? {}
			: { analysisScope: compiledAnalysisScope }),
		...(compiledTaxConstants === undefined
			? {}
			: { taxConstants: compiledTaxConstants }),
	});
};
