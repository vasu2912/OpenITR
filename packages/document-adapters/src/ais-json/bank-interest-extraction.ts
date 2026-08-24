import type {
	BankInterestObservation,
	DocumentReviewIssue,
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

import type { AisJsonRevisionDocument } from "./ais-json-revision";
import { isRecordObject } from "./ais-json-revision";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import type { GroupedRupeeAmount } from "../grouped-rupee-amount";
import type { AdapterIdentity } from "../extraction-support";
import { compareByCodepoint } from "../extraction-support";

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

const BANK_INTEREST_RECORD_POINTER_PREFIX = "/interestInformation/bankInterest";

const pointerForRecord = (recordIndex: number): string =>
	`${BANK_INTEREST_RECORD_POINTER_PREFIX}/${recordIndex}`;

type ParsedBankInterestRecord = Readonly<{
	identityKey: string;
	categoryDefinition: BankInterestCategoryDefinition;
	institutionName: string;
	maskedAccountNumber: string;
	amount: GroupedRupeeAmount;
	originalValue: string;
	recordIndex: number;
}>;

type RecordParseOutcome =
	| Readonly<{ kind: "parsed"; record: ParsedBankInterestRecord }>
	| Readonly<{ kind: "category-unknown" }>
	| Readonly<{
			kind: "malformed";
			factKey: BankInterestCategoryDefinition["factKey"];
	  }>;

const parseBankInterestRecord = (
	record: unknown,
	recordIndex: number,
): RecordParseOutcome => {
	if (!isRecordObject(record)) {
		return { kind: "category-unknown" };
	}
	const categoryDefinition =
		typeof record.recordCategory === "string"
			? categoryByCategoryName.get(record.recordCategory)
			: undefined;
	if (categoryDefinition === undefined) {
		return { kind: "category-unknown" };
	}

	const { institutionName, maskedAccountNumber } = record;
	const amount = parseGroupedRupeeAmount(record.interestAmount);
	if (
		typeof institutionName !== "string" ||
		typeof maskedAccountNumber !== "string" ||
		amount === undefined
	) {
		return { kind: "malformed", factKey: categoryDefinition.factKey };
	}

	const trimmedInstitutionName = institutionName.trim();
	const trimmedMaskedAccountNumber = maskedAccountNumber.trim();
	if (trimmedInstitutionName === "" || trimmedMaskedAccountNumber === "") {
		return { kind: "malformed", factKey: categoryDefinition.factKey };
	}

	return {
		kind: "parsed",
		record: {
			identityKey: `${categoryDefinition.category}\u0000${trimmedInstitutionName}\u0000${trimmedMaskedAccountNumber}`,
			categoryDefinition,
			institutionName: trimmedInstitutionName,
			maskedAccountNumber: trimmedMaskedAccountNumber,
			amount,
			originalValue: JSON.stringify(record.interestAmount),
			recordIndex,
		},
	};
};

const sectionMissingIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestSectionMissing,
	severity: "review",
	affectedFactKeys: BANK_INTEREST_CATEGORY_DEFINITIONS.map(
		(definition) => definition.factKey,
	),
	recoveryAction: BANK_INTEREST_SECTION_MISSING_RECOVERY_ACTION,
});

export type BankInterestExtraction = Readonly<{
	observations: readonly BankInterestObservation[];
	issues: readonly DocumentReviewIssue[];
}>;

// Deterministic handling of duplicate and repeated records: records are
// identified by category plus trimmed institution and masked account. A
// repeat carrying the same normalized amount collapses into the first
// occurrence's observation; a repeat carrying a different amount is
// ambiguous and produces a review issue instead of any observation.
export const extractBankInterestObservations = ({
	document,
	sourceDocumentId,
	adapter,
}: Readonly<{
	document: AisJsonRevisionDocument;
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): BankInterestExtraction => {
	const section = document["interestInformation"];
	if (!isRecordObject(section)) {
		return { observations: [], issues: [sectionMissingIssue()] };
	}
	const records = section["bankInterest"];
	if (!Array.isArray(records)) {
		return { observations: [], issues: [sectionMissingIssue()] };
	}

	const issues: DocumentReviewIssue[] = [];
	const firstRecordByIdentityKey = new Map<
		string,
		ParsedBankInterestRecord
	>();
	const ambiguousIdentityKeys = new Set<string>();

	for (let index = 0; index < records.length; index += 1) {
		const outcome = parseBankInterestRecord(records[index], index);
		if (outcome.kind === "category-unknown") {
			issues.push({
				code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestCategoryUnknown,
				severity: "review",
				affectedFactKeys: [],
				recoveryAction: BANK_INTEREST_CATEGORY_UNKNOWN_RECOVERY_ACTION,
			});
			continue;
		}
		if (outcome.kind === "malformed") {
			issues.push({
				code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestRecordMalformed,
				severity: "review",
				affectedFactKeys: [outcome.factKey],
				recoveryAction: BANK_INTEREST_RECORD_MALFORMED_RECOVERY_ACTION,
			});
			continue;
		}

		const existing = firstRecordByIdentityKey.get(outcome.record.identityKey);
		if (existing === undefined) {
			firstRecordByIdentityKey.set(outcome.record.identityKey, outcome.record);
			continue;
		}
		if (existing.amount.value !== outcome.record.amount.value) {
			ambiguousIdentityKeys.add(outcome.record.identityKey);
		}
	}

	const keptRecords = [...firstRecordByIdentityKey.values()].filter(
		(record) => !ambiguousIdentityKeys.has(record.identityKey),
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

	const observations = keptRecords.map((record) => {
		const pointer = pointerForRecord(record.recordIndex);
		return {
			observationId: `${record.categoryDefinition.factKey}@${sourceDocumentId}:${pointer}`,
			factKey: record.categoryDefinition.factKey,
			sourceDocumentId,
			adapterId: adapter.adapterId,
			adapterVersion: adapter.adapterVersion,
			originalValue: record.originalValue,
			normalizedValue: record.amount.value,
			transformationSteps: record.amount.steps,
			evidence: { kind: "json-pointer", pointer },
			ruleCitation: {
				ruleId: record.categoryDefinition.ruleId,
				description: record.categoryDefinition.description,
			},
		} satisfies BankInterestObservation;
	});
	observations.sort(
		(first, second) =>
			compareByCodepoint(first.factKey, second.factKey) ||
			compareByCodepoint(first.evidence.pointer, second.evidence.pointer),
	);
	return { observations, issues };
};
