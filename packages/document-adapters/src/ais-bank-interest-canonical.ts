import type {
	BankInterestObservation,
	CsvEvidenceLocator,
	DocumentReviewIssue,
	JsonPointerEvidenceLocator,
	Sha256Digest,
} from "@openitr/model";
import {
	BANK_INTEREST_CATEGORY_UNKNOWN_RECOVERY_ACTION,
	BANK_INTEREST_RECORD_AMBIGUOUS_RECOVERY_ACTION,
	BANK_INTEREST_RECORD_MALFORMED_RECOVERY_ACTION,
	BANK_INTEREST_SECTION_MISSING_RECOVERY_ACTION,
	DOCUMENT_REVIEW_ISSUE_CODES,
	parseFactKey,
	parseRuleId,
} from "@openitr/model";

import type { GroupedRupeeAmount } from "./grouped-rupee-amount";
import type { AdapterIdentity } from "./extraction-support";
import { compareByCodepoint } from "./extraction-support";

export type BankInterestCategoryDefinition = Readonly<{
	category: string;
	factKey: ReturnType<typeof parseFactKey>;
	ruleId: ReturnType<typeof parseRuleId>;
	description: string;
}>;

export const BANK_INTEREST_CATEGORY_DEFINITIONS: readonly BankInterestCategoryDefinition[] =
	Object.freeze([
		Object.freeze({
			category: "SAVINGS_ACCOUNT",
			factKey: parseFactKey("bank-interest.savings-account"),
			ruleId: parseRuleId("AIS-BANK-INTEREST-SAVINGS-ACCOUNT"),
			description:
				"AIS bank-interest record for interest from a savings account.",
		}),
		Object.freeze({
			category: "DEPOSITS",
			factKey: parseFactKey("bank-interest.deposits"),
			ruleId: parseRuleId("AIS-BANK-INTEREST-DEPOSITS"),
			description: "AIS bank-interest record for interest from deposits.",
		}),
	]);

const categoryByCategoryName = new Map(
	BANK_INTEREST_CATEGORY_DEFINITIONS.map((definition) => [
		definition.category,
		definition,
	]),
);

export const bankInterestCategoryByCategoryName = (
	category: unknown,
): BankInterestCategoryDefinition | undefined =>
	typeof category === "string"
		? categoryByCategoryName.get(category)
		: undefined;

// One fully parsed AIS bank-interest record in the canonical shape both
// AIS representations map into. `identityKey` identifies the underlying
// bank account across repeats; `sortKey` is a content-derived, position-
// free ordering key so source ordering cannot leak into canonical order.
export type CanonicalBankInterestRecord = Readonly<{
	categoryDefinition: BankInterestCategoryDefinition;
	identityKey: string;
	institutionName: string;
	maskedAccountNumber: string;
	amount: GroupedRupeeAmount;
	originalValue: string;
	evidence: JsonPointerEvidenceLocator | CsvEvidenceLocator;
	observationIdKey: string;
	sortKey: string;
}>;

export const bankInterestIdentityKey = (
	categoryDefinition: BankInterestCategoryDefinition,
	institutionName: string,
	maskedAccountNumber: string,
): string =>
	`${categoryDefinition.category}\u0000${institutionName}\u0000${maskedAccountNumber}`;

export type BankInterestExtraction = Readonly<{
	observations: readonly BankInterestObservation[];
	issues: readonly DocumentReviewIssue[];
}>;

export const bankInterestSectionMissingIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestSectionMissing,
	severity: "review",
	affectedFactKeys: BANK_INTEREST_CATEGORY_DEFINITIONS.map(
		(definition) => definition.factKey,
	),
	recoveryAction: BANK_INTEREST_SECTION_MISSING_RECOVERY_ACTION,
});

export const bankInterestCategoryUnknownIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestCategoryUnknown,
	severity: "review",
	affectedFactKeys: [],
	recoveryAction: BANK_INTEREST_CATEGORY_UNKNOWN_RECOVERY_ACTION,
});

export const bankInterestRecordMalformedIssue = (
	factKey: BankInterestCategoryDefinition["factKey"],
): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestRecordMalformed,
	severity: "review",
	affectedFactKeys: [factKey],
	recoveryAction: BANK_INTEREST_RECORD_MALFORMED_RECOVERY_ACTION,
});

const issueOrderKey = (issue: DocumentReviewIssue): string =>
	[
		issue.code,
		issue.affectedFactKeys.join("\u0000"),
		issue.recoveryAction,
	].join("\u0001");

// Deterministic handling of duplicate and repeated records: records are
// identified by category plus trimmed institution and masked account. A
// repeat carrying the same normalized amount collapses into the first
// occurrence's observation; a repeat carrying a different amount is
// ambiguous and produces a review issue instead of any observation.
// Observations order by fact key and then each record's content-derived
// sort key, and issues order by their own content, so neither depends on
// the order records arrived in.
export const foldCanonicalBankInterestRecords = ({
	records,
	parsedIssues,
	sourceDocumentId,
	adapter,
}: Readonly<{
	records: readonly CanonicalBankInterestRecord[];
	parsedIssues?: readonly DocumentReviewIssue[];
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): BankInterestExtraction => {
	const issues: DocumentReviewIssue[] = [...(parsedIssues ?? [])];
	const firstRecordByIdentityKey = new Map<
		string,
		CanonicalBankInterestRecord
	>();
	const ambiguousIdentityKeys = new Set<string>();

	for (const record of records) {
		const existing = firstRecordByIdentityKey.get(record.identityKey);
		if (existing === undefined) {
			firstRecordByIdentityKey.set(record.identityKey, record);
			continue;
		}
		if (existing.amount.value !== record.amount.value) {
			ambiguousIdentityKeys.add(record.identityKey);
		}
	}

	const keptRecords = [...firstRecordByIdentityKey.values()]
		.filter((record) => !ambiguousIdentityKeys.has(record.identityKey))
		.sort(
			(first, second) =>
				compareByCodepoint(
					first.categoryDefinition.factKey,
					second.categoryDefinition.factKey,
				) || compareByCodepoint(first.sortKey, second.sortKey),
		);

	for (const identityKey of ambiguousIdentityKeys) {
		const record = firstRecordByIdentityKey.get(identityKey);
		if (record === undefined) {
			continue;
		}
		issues.push({
			code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestRecordAmbiguous,
			severity: "review",
			affectedFactKeys: [record.categoryDefinition.factKey],
			recoveryAction: BANK_INTEREST_RECORD_AMBIGUOUS_RECOVERY_ACTION,
		});
	}

	const observations = keptRecords.map((record) => ({
		observationId: `${record.categoryDefinition.factKey}@${sourceDocumentId}:${record.observationIdKey}`,
		factKey: record.categoryDefinition.factKey,
		sourceDocumentId,
		adapterId: adapter.adapterId,
		adapterVersion: adapter.adapterVersion,
		originalValue: record.originalValue,
		normalizedValue: record.amount.value,
		transformationSteps: record.amount.steps,
		evidence: record.evidence,
		ruleCitation: {
			ruleId: record.categoryDefinition.ruleId,
			description: record.categoryDefinition.description,
		},
	}) satisfies BankInterestObservation);

	return {
		observations,
		issues: issues
			.map((issue) => ({ issue, key: issueOrderKey(issue) }))
			.sort((first, second) =>
				compareByCodepoint(first.key, second.key),
			)
			.map((entry) => entry.issue),
	};
};
