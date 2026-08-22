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
	CompiledRulePack,
	EligibilityAnswerValue,
	EligibilityQuestion,
	OfficialSource,
	RuleCitation,
	RulePackManifest,
	RulePackManifestRuleRecord,
	RulePackManifestSourceRecord,
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

	const sourceManifestSha256 = parseSha256Digest(
		await sha256Hex(canonicalJson(officialSources)),
	);

	const compiledPackSha256 = parseSha256Digest(
		await sha256Hex(
			canonicalJson({
				identity: { ...identityWithoutHashes, sourceManifestSha256 },
				officialSources,
				supportedRuleIds,
				ruleCitations,
				scopeCheck: { question, results },
			}),
		),
	);

	return deepFreeze({
		identity: {
			...identityWithoutHashes,
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
	});
};
