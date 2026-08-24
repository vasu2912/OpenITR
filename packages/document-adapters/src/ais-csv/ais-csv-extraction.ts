import type { DocumentReviewIssue, Sha256Digest } from "@openitr/model";

import type { AdapterIdentity } from "../extraction-support";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import type {
	BankInterestCategoryDefinition,
	BankInterestExtraction,
	CanonicalBankInterestRecord,
} from "../ais-bank-interest-canonical";
import {
	bankInterestCategoryByCategoryName,
	bankInterestCategoryUnknownIssue,
	bankInterestIdentityKey,
	bankInterestRecordMalformedIssue,
	bankInterestSectionMissingIssue,
	foldCanonicalBankInterestRecords,
} from "../ais-bank-interest-canonical";
import type {
	AisCsvRecordRow,
	AisCsvRevisionDocument,
} from "./ais-csv-revision";
import { AIS_CSV_BANK_INTEREST_COLUMN_HEADERS } from "./ais-csv-revision";

// Cell positions inside the reviewed record layout, aligned with the
// AIS_CSV_BANK_INTEREST_COLUMN_HEADERS order the revision gate enforces.
const CATEGORY_COLUMN_INDEX = 0;
const INSTITUTION_COLUMN_INDEX = 1;
const ACCOUNT_COLUMN_INDEX = 2;
const AMOUNT_COLUMN_INDEX = 3;

const AMOUNT_COLUMN_HEADER =
	AIS_CSV_BANK_INTEREST_COLUMN_HEADERS[AMOUNT_COLUMN_INDEX];

type RowParseOutcome =
	| Readonly<{ kind: "parsed"; record: CanonicalBankInterestRecord }>
	| Readonly<{ kind: "category-unknown" }>
	| Readonly<{
			kind: "malformed";
			factKey: BankInterestCategoryDefinition["factKey"];
	  }>;

type AmountCell = Readonly<{ value: string; raw: string }>;

const amountCellOf = (row: AisCsvRecordRow): AmountCell | undefined => {
	const cell = row.cells[AMOUNT_COLUMN_INDEX];
	if (cell === undefined) {
		return undefined;
	}
	return { value: cell.value, raw: cell.raw };
};

const parseRow = (row: AisCsvRecordRow): RowParseOutcome => {
	const categoryDefinition = bankInterestCategoryByCategoryName(
		row.cells[CATEGORY_COLUMN_INDEX]?.value,
	);
	if (categoryDefinition === undefined) {
		return { kind: "category-unknown" };
	}

	const institutionName = row.cells[INSTITUTION_COLUMN_INDEX]?.value.trim();
	const maskedAccountNumber = row.cells[ACCOUNT_COLUMN_INDEX]?.value.trim();
	const amountCell = amountCellOf(row);
	const amount =
		amountCell === undefined
			? undefined
			: parseGroupedRupeeAmount(amountCell.value);
	if (
		institutionName === undefined ||
		maskedAccountNumber === undefined ||
		institutionName === "" ||
		maskedAccountNumber === "" ||
		amountCell === undefined ||
		amount === undefined
	) {
		return { kind: "malformed", factKey: categoryDefinition.factKey };
	}

	const observationIdKey = `csv/line/${row.line}/column/${AMOUNT_COLUMN_INDEX}`;
	return {
		kind: "parsed",
		record: {
			categoryDefinition,
			identityKey: bankInterestIdentityKey(
				categoryDefinition,
				institutionName,
				maskedAccountNumber,
			),
			institutionName,
			maskedAccountNumber,
			amount,
			originalValue: amountCell.raw,
			evidence: {
				kind: "csv-record-column",
				line: row.line,
				columnIndex: AMOUNT_COLUMN_INDEX,
				columnHeader: AMOUNT_COLUMN_HEADER,
				rawValue: amountCell.raw,
			},
			observationIdKey,
			sortKey: `${institutionName}\u0000${maskedAccountNumber}`,
		},
	};
};

export const extractAisCsvBankInterestObservations = ({
	document,
	sourceDocumentId,
	adapter,
}: Readonly<{
	document: AisCsvRevisionDocument;
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): BankInterestExtraction => {
	if (!document.hasBankInterestSection) {
		return {
			observations: [],
			issues: [bankInterestSectionMissingIssue()],
		};
	}

	const parsedIssues: DocumentReviewIssue[] = [];
	const canonicalRecords: CanonicalBankInterestRecord[] = [];
	for (const row of document.bankInterestRows) {
		const outcome = parseRow(row);
		if (outcome.kind === "category-unknown") {
			parsedIssues.push(bankInterestCategoryUnknownIssue());
			continue;
		}
		if (outcome.kind === "malformed") {
			parsedIssues.push(bankInterestRecordMalformedIssue(outcome.factKey));
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
