import type { DocumentReviewIssue, Sha256Digest } from "@openitr/model";

import type { AisJsonRevisionDocument } from "./ais-json-revision";
import { isRecordObject } from "../extraction-support";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import type { AdapterIdentity } from "../extraction-support";
import type {
	BankInterestCategoryDefinition,
	BankInterestExtraction,
	CanonicalBankInterestRecord,
} from "../ais-bank-interest-canonical";
import {
	BANK_INTEREST_CATEGORY_DEFINITIONS,
	bankInterestCategoryByCategoryName,
	bankInterestCategoryUnknownIssue,
	bankInterestIdentityKey,
	bankInterestRecordMalformedIssue,
	bankInterestSectionMissingIssue,
	foldCanonicalBankInterestRecords,
} from "../ais-bank-interest-canonical";

export type { BankInterestCategoryDefinition, BankInterestExtraction };
export { BANK_INTEREST_CATEGORY_DEFINITIONS };

const BANK_INTEREST_RECORD_POINTER_PREFIX = "/interestInformation/bankInterest";

const pointerForRecord = (recordIndex: number): string =>
	`${BANK_INTEREST_RECORD_POINTER_PREFIX}/${recordIndex}`;

type RecordParseOutcome =
	| Readonly<{ kind: "parsed"; record: CanonicalBankInterestRecord }>
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
	const categoryDefinition = bankInterestCategoryByCategoryName(
		record.recordCategory,
	);
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

	const pointer = pointerForRecord(recordIndex);
	return {
		kind: "parsed",
		record: {
			categoryDefinition,
			identityKey: bankInterestIdentityKey(
				categoryDefinition,
				trimmedInstitutionName,
				trimmedMaskedAccountNumber,
			),
			institutionName: trimmedInstitutionName,
			maskedAccountNumber: trimmedMaskedAccountNumber,
			amount,
			originalValue: JSON.stringify(record.interestAmount),
			evidence: { kind: "json-pointer", pointer },
			observationIdKey: pointer,
			sortKey: pointer,
		},
	};
};

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
		return {
			observations: [],
			issues: [bankInterestSectionMissingIssue()],
		};
	}
	const records = section["bankInterest"];
	if (!Array.isArray(records)) {
		return {
			observations: [],
			issues: [bankInterestSectionMissingIssue()],
		};
	}

	const parsedIssues: DocumentReviewIssue[] = [];
	const canonicalRecords: CanonicalBankInterestRecord[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const outcome = parseBankInterestRecord(records[index], index);
		if (outcome.kind === "category-unknown") {
			parsedIssues.push(bankInterestCategoryUnknownIssue());
			continue;
		}
		if (outcome.kind === "malformed") {
			parsedIssues.push(
				bankInterestRecordMalformedIssue(outcome.factKey),
			);
			continue;
		}
		canonicalRecords.push(outcome.record);
	}

	return foldCanonicalBankInterestRecords({
		records: canonicalRecords,
		parsedIssues,
		sourceDocumentId,
		adapter,
	});
};
