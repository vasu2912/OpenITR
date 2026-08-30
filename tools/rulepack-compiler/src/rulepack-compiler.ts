import {
	parseAssessmentYear,
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
import type {
	CompiledNewRegimeTaxConstants,
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
			default: {
				const _exhaustive: never = schemaKind;
				return _exhaustive;
			}
		}

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
				sourceReference: deepFreeze({
					sourceId: requiredRule.sourceId,
					location: requiredRule.sourceLocation,
				}),
			}),
		);
	}
	return questions;
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
		compiledTaxConstants = deepFreeze({ newRegime });
	}

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
		...(compiledTaxConstants === undefined
			? {}
			: { taxConstants: compiledTaxConstants }),
	});
};
