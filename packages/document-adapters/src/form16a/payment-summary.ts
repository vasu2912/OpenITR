import type { DocumentReviewIssue, FactKey } from "@openitr/model";
import {
	DOCUMENT_REVIEW_ISSUE_CODES,
	FORM16A_CATEGORY_UNKNOWN_RECOVERY_ACTION,
	FORM16A_RECORD_AMBIGUOUS_RECOVERY_ACTION,
	FORM16A_RECORD_MALFORMED_RECOVERY_ACTION,
	FORM16A_SUMMARY_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION,
	FORM16A_SUMMARY_SECTION_MISSING_RECOVERY_ACTION,
	parseFactKey,
	parseRuleId,
} from "@openitr/model";

import { SERIAL_NUMBER_PATTERN, TDS_AMOUNT_COLUMNS } from "../form26as/tds-part-one";// The reviewed vocabulary of a machine-generated Form 16A certificate's
// Summary of Payment(s) table, so the adapter and its fixtures cannot drift
// apart and the certificate's tax-paid facts reuse the same canonical keys
// as every other TDS source.

export const FORM16A_SUMMARY_SECTION_TITLE = "Summary of Payment(s)";

export const FORM16A_COLUMN_HEADER_CELLS = Object.freeze([
	"Sr. No.",
	"Section",
	"Nature of Payment",
	"Gross Amount Paid/Credited",
	"Tax Deducted",
	"TDS Deposited",
]);

export const FORM16A_DEDUCTOR_NAME_PREFIX =
	"Name and address of the Deductor:";
export const FORM16A_DEDUCTOR_TAN_PREFIX = "TAN of the Deductor:";

// Rows print six cells separated by " | ". The separator survives PDF text
// extraction verbatim where tab characters do not.
export const FORM16A_ROW_CELL_SEPARATOR = "|";

export type Form16APaymentCategoryDefinition = Readonly<{
	section: string;
	natureOfPayment: string;
	factKey: FactKey;
	ruleId: ReturnType<typeof parseRuleId>;
	description: string;
}>;

// One definition per reviewed nature of payment whose gross receipt is an
// ITR-1 income-from-other-sources fact. This table is the single source of
// truth for which summary records produce non-salary income observations.
export const FORM16A_PAYMENT_CATEGORIES: readonly Form16APaymentCategoryDefinition[] =
	Object.freeze([
		Object.freeze({
			section: "194A",
			natureOfPayment: "Interest other than interest on securities",
			factKey: parseFactKey("non-salary-income.interest-other-than-securities"),
			ruleId: parseRuleId("FORM16A-INCOME-INTEREST-OTHER-THAN-SECURITIES"),
			description:
				"Form 16A summary record for interest other than interest on securities.",
		}),
		Object.freeze({
			section: "194",
			natureOfPayment: "Dividends",
			factKey: parseFactKey("non-salary-income.dividends"),
			ruleId: parseRuleId("FORM16A-INCOME-DIVIDENDS"),
			description: "Form 16A summary record for dividend income.",
		}),
	]);

const categoryBySectionAndNature = new Map(
	FORM16A_PAYMENT_CATEGORIES.map((definition) => [
		`${definition.section}\u0000${definition.natureOfPayment}`,
		definition,
	]),
);

export const form16APaymentCategoryByCells = (
	section: string,
	natureOfPayment: string,
): Form16APaymentCategoryDefinition | undefined =>
	categoryBySectionAndNature.get(`${section}\u0000${natureOfPayment}`);

type Form16AAmountColumnDefinition = Readonly<{
	columnIndex: number;
	columnHeader: string;
	recordProperty: "amountPaidCreditedRaw" | "taxDeductedRaw" | "tdsDepositedRaw";
	factKey: FactKey;
	ruleId: ReturnType<typeof parseRuleId>;
	description: string;
}>;

// One definition per reviewed amount column. The tax-paid columns share the
// canonical TDS facts with every other statement family while citing this
// certificate's own rule.
export const FORM16A_AMOUNT_COLUMNS = {
	paidCredited: Object.freeze({
		columnIndex: 3,
		columnHeader: "Gross Amount Paid/Credited",
		recordProperty: "amountPaidCreditedRaw",
		factKey: TDS_AMOUNT_COLUMNS.paidCredited.factKey,
		ruleId: parseRuleId("FORM16A-TDS-AMOUNT-PAID-CREDITED"),
		description:
			"Form 16A summary record fact for the gross amount paid or credited.",
	}),
	taxDeducted: Object.freeze({
		columnIndex: 4,
		columnHeader: "Tax Deducted",
		recordProperty: "taxDeductedRaw",
		factKey: TDS_AMOUNT_COLUMNS.taxDeducted.factKey,
		ruleId: parseRuleId("FORM16A-TDS-TAX-DEDUCTED"),
		description:
			"Form 16A summary record fact for the tax deducted at source.",
	}),
	deposited: Object.freeze({
		columnIndex: 5,
		columnHeader: "TDS Deposited",
		recordProperty: "tdsDepositedRaw",
		factKey: TDS_AMOUNT_COLUMNS.deposited.factKey,
		ruleId: parseRuleId("FORM16A-TDS-TDS-DEPOSITED"),
		description:
			"Form 16A summary record fact for the tax deposited with the government.",
	}),
} as const satisfies Readonly<
	Record<string, Form16AAmountColumnDefinition>
>;

export const FORM16A_SERIAL_NUMBER_PATTERN = SERIAL_NUMBER_PATTERN;
export const FORM16A_TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;

export const FORM16A_AGGREGATE_ROW_LABEL = "Total";

// A missing or malformed part of the certificate affects every fact the
// reviewed layout can extract from it.
export const affectedForm16AFactKeys = (): readonly FactKey[] => [
	...FORM16A_PAYMENT_CATEGORIES.map((definition) => definition.factKey),
	FORM16A_AMOUNT_COLUMNS.taxDeducted.factKey,
	FORM16A_AMOUNT_COLUMNS.deposited.factKey,
];

export const form16aSectionMissingIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.form16aSectionMissing,
	severity: "review",
	affectedFactKeys: affectedForm16AFactKeys(),
	recoveryAction: FORM16A_SUMMARY_SECTION_MISSING_RECOVERY_ACTION,
});

export const form16aColumnHeaderMalformedIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.form16aColumnHeaderMalformed,
	severity: "review",
	affectedFactKeys: affectedForm16AFactKeys(),
	recoveryAction: FORM16A_SUMMARY_COLUMN_HEADER_MALFORMED_RECOVERY_ACTION,
});

export const form16aRecordMalformedIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.form16aRecordMalformed,
	severity: "review",
	affectedFactKeys: affectedForm16AFactKeys(),
	recoveryAction: FORM16A_RECORD_MALFORMED_RECOVERY_ACTION,
});

export const form16aRecordAmbiguousIssue = (
	affectedFactKeys: readonly FactKey[],
): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.form16aRecordAmbiguous,
	severity: "review",
	affectedFactKeys,
	recoveryAction: FORM16A_RECORD_AMBIGUOUS_RECOVERY_ACTION,
});

export const form16aCategoryUnknownIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.form16aCategoryUnknown,
	severity: "review",
	affectedFactKeys: [],
	recoveryAction: FORM16A_CATEGORY_UNKNOWN_RECOVERY_ACTION,
});
