import type { DocumentReviewIssue, FactKey } from "@openitr/model";
import {
	DOCUMENT_REVIEW_ISSUE_CODES,
	TDS_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION,
	TDS_RECORD_MALFORMED_RECOVERY_ACTION,
	TDS_SECTION_MISSING_RECOVERY_ACTION,
	parseFactKey,
	parseRuleId,
} from "@openitr/model";
// The reviewed vocabulary of Form 26AS Part I, shared by every adapter that
// maps the statement's tax-deducted-at-source records onto canonical facts,
// so the plain-text and spreadsheet adapters cannot drift apart.

export const FORM26AS_PART_ONE_TITLE = "Part I - Tax Deducted at Source";

export const FORM26AS_COLUMN_HEADER_CELLS = Object.freeze([
	"Sr. No.",
	"Name of Deductor",
	"TAN of Deductor",
	"Total Amount Paid/Credited",
	"Total Tax Deducted",
	"Total TDS Deposited",
]);

export type TdsAmountCellDefinition = Readonly<{
	columnIndex: number;
	columnHeader: string;
	factKey: FactKey;
	ruleId: ReturnType<typeof parseRuleId>;
	description: string;
}>;

// One definition per amount column of the reviewed Part I layout. This table
// is the single source of truth for every amount cell's position, canonical
// fact, and rule citation.
export const TDS_AMOUNT_COLUMNS = {
	paidCredited: Object.freeze({
		columnIndex: 3,
		columnHeader: "Total Amount Paid/Credited",
		factKey: parseFactKey("tds.amount-paid-credited"),
		ruleId: parseRuleId("FORM26AS-TDS-AMOUNT-PAID-CREDITED"),
		description:
			"Form 26AS Part I record fact for the total amount paid or credited.",
	}),
	taxDeducted: Object.freeze({
		columnIndex: 4,
		columnHeader: "Total Tax Deducted",
		factKey: parseFactKey("tds.tax-deducted"),
		ruleId: parseRuleId("FORM26AS-TDS-TAX-DEDUCTED"),
		description:
			"Form 26AS Part I record fact for the total tax deducted at source.",
	}),
	deposited: Object.freeze({
		columnIndex: 5,
		columnHeader: "Total TDS Deposited",
		factKey: parseFactKey("tds.tds-deposited"),
		ruleId: parseRuleId("FORM26AS-TDS-DEPOSITED"),
		description:
			"Form 26AS Part I record fact for the total tax deposited with the government.",
	}),
} as const satisfies Readonly<
	Record<string, TdsAmountCellDefinition>
>;

export const AMOUNT_CELL_DEFINITIONS: readonly TdsAmountCellDefinition[] =
	Object.values(TDS_AMOUNT_COLUMNS);

// A malformed or rejected Part I record affects every tax-paid fact the
// reviewed layout can extract from it.
export const affectedTdsFactKeys = (): readonly FactKey[] =>
	AMOUNT_CELL_DEFINITIONS.map((definition) => definition.factKey);

export const SERIAL_NUMBER_PATTERN = /^[0-9]+$/;
export const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;

// A strict part-title boundary such as "Part II - ..." or "Part-II(A)" ends
// the section. Loose prose that merely starts with "part" does not match and
// therefore fails closed as a malformed record instead of hiding records.
export const NEXT_PART_PATTERN = /^part[\s-]*[ivx]+\b/i;
export const AGGREGATE_ROW_LABEL = "Total";

export const tdsSectionMissingIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.tdsSectionMissing,
	severity: "review",
	affectedFactKeys: affectedTdsFactKeys(),
	recoveryAction: TDS_SECTION_MISSING_RECOVERY_ACTION,
});

export const tdsColumnHeaderMalformedIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.tdsColumnHeaderMalformed,
	severity: "review",
	affectedFactKeys: affectedTdsFactKeys(),
	recoveryAction: TDS_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION,
});

// The recovery action names the reviewed source family, so adapters for
// other representations of the same records pass their own guidance.
export const tdsRecordMalformedIssue = (
	recoveryAction: string = TDS_RECORD_MALFORMED_RECOVERY_ACTION,
): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.tdsRecordMalformed,
	severity: "review",
	affectedFactKeys: affectedTdsFactKeys(),
	recoveryAction,
});
