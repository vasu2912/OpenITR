import type { DocumentReviewIssue, FactKey, RuleId } from "@openitr/model";
import {
	DOCUMENT_REVIEW_ISSUE_CODES,
	EPAY_RECEIPT_RECORD_AMBIGUOUS_RECOVERY_ACTION,
	EPAY_RECEIPT_RECORD_MALFORMED_RECOVERY_ACTION,
	EPAY_RECEIPT_SECTION_MISSING_RECOVERY_ACTION,
	EPAY_RECEIPT_TYPE_OF_PAYMENT_UNKNOWN_RECOVERY_ACTION,
	parseFactKey,
	parseRuleId,
} from "@openitr/model";

// The reviewed vocabulary of the official e-Pay Tax challan receipt for the
// supported revision. Every constant here names exactly what the portal's
// machine-generated PDF prints, so extraction stays a lookup rather than a
// guess.
export const EPAY_RECEIPT_TITLE_MARKER = "e-Pay Tax Receipt";
export const EPAY_RECEIPT_AUTHORITY_MARKER = "Income Tax Department";

export const EPAY_REQUIRED_MARKERS: readonly string[] = [
	EPAY_RECEIPT_TITLE_MARKER,
	EPAY_RECEIPT_AUTHORITY_MARKER,
];

export const EPAY_SUPPORTED_ASSESSMENT_YEAR = "2026-27";

// The one separator the reviewed receipt prints between a field label and
// its value. Labels normalize whitespace before comparison, so a wrapped
// label still matches once.
export const EPAY_FIELD_SEPARATOR = " : ";

export const EPAY_STATUS_PAID = "Paid";

export const EPAY_PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const EPAY_BSR_CODE_PATTERN = /^[0-9]{7}$/;
export const EPAY_CHALLAN_SERIAL_PATTERN = /^[0-9]{5}$/;
export const EPAY_PAYMENT_DATE_PATTERN = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/;

// A printed date counts only when it names a real calendar day, so an
// impossible 31/02 cannot become the payment date of a verified payment.
export const isCalendarDay = ({
	day,
	month,
	year,
}: Readonly<{ day: number; month: number; year: number }>): boolean => {
	if (month < 1 || month > 12 || day < 1) {
		return false;
	}
	const daysInMonth: Readonly<Record<number, number>> = Object.freeze({
		1: 31,
		2: (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
		3: 31,
		4: 30,
		5: 31,
		6: 30,
		7: 31,
		8: 31,
		9: 30,
		10: 31,
		11: 30,
		12: 31,
	});
	const limit = daysInMonth[month];
	return limit !== undefined && day <= limit;
};

export type EpayTypeOfPaymentCategory = Readonly<{
	code: string;
	label: string;
	factKey: FactKey;
	ruleId: RuleId;
	description: string;
}>;

// One definition per Type of Payment this revision credits toward taxes
// paid. The printed value is "(code) Label", so both parts must agree with
// the reviewed table before the amount becomes a payment fact.
export const EPAY_TYPE_OF_PAYMENT_CATEGORIES = {
	advanceTax: Object.freeze({
		code: "100",
		label: "Advance Tax",
		factKey: parseFactKey("tax-payment.advance-tax"),
		ruleId: parseRuleId("EPAY-TAX-RECEIPT-ADVANCE-TAX"),
		description:
			"e-Pay Tax receipt fact for a paid advance-tax challan under sections 207 to 211.",
	}),
	selfAssessmentTax: Object.freeze({
		code: "300",
		label: "Self Assessment Tax",
		factKey: parseFactKey("tax-payment.self-assessment-tax"),
		ruleId: parseRuleId("EPAY-TAX-RECEIPT-SELF-ASSESSMENT-TAX"),
		description:
			"e-Pay Tax receipt fact for a paid self-assessment-tax challan under section 140A.",
	}),
} as const satisfies Readonly<
	Record<string, EpayTypeOfPaymentCategory>
>;

export const EPAY_TYPE_OF_PAYMENT_VALUES: readonly EpayTypeOfPaymentCategory[] =
	Object.values(EPAY_TYPE_OF_PAYMENT_CATEGORIES);

const EPAY_TYPE_OF_PAYMENT_PRINTED = /^\(([0-9]{3})\)\s+(.+)$/;

// A printed Type of Payment is well formed when it carries the portal's
// three-digit code and label shape, whether or not this revision credits it.
export const isWellFormedTypeOfPayment = (printed: string): boolean =>
	EPAY_TYPE_OF_PAYMENT_PRINTED.test(printed);

export const epayTypeOfPaymentByPrintedValue = (
	printed: string,
): EpayTypeOfPaymentCategory | undefined => {
	const match = EPAY_TYPE_OF_PAYMENT_PRINTED.exec(printed);
	if (match === null) {
		return undefined;
	}
	const code = match[1];
	const label = (match[2] ?? "").trim();
	return EPAY_TYPE_OF_PAYMENT_VALUES.find(
		(category) => category.code === code && category.label === label,
	);
};

// A malformed or rejected receipt affects every payment fact the reviewed
// layout could have produced, because the broken field decides which challan
// payment the amount belongs to.
export const affectedEpayFactKeys = (): readonly FactKey[] =>
	EPAY_TYPE_OF_PAYMENT_VALUES.map((category) => category.factKey);

export const epaySectionMissingIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.epaySectionMissing,
	severity: "review",
	affectedFactKeys: affectedEpayFactKeys(),
	recoveryAction: EPAY_RECEIPT_SECTION_MISSING_RECOVERY_ACTION,
});

export const epayRecordMalformedIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.epayRecordMalformed,
	severity: "review",
	affectedFactKeys: affectedEpayFactKeys(),
	recoveryAction: EPAY_RECEIPT_RECORD_MALFORMED_RECOVERY_ACTION,
});

export const epayRecordAmbiguousIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.epayRecordAmbiguous,
	severity: "review",
	affectedFactKeys: affectedEpayFactKeys(),
	recoveryAction: EPAY_RECEIPT_RECORD_AMBIGUOUS_RECOVERY_ACTION,
});

// An unknown Type of Payment contributes nothing in either direction: its
// amount has no canonical payment fact, so crediting it would count tax the
// analysis never recognized.
export const epayTypeOfPaymentUnknownIssue = (): DocumentReviewIssue => ({
	code: DOCUMENT_REVIEW_ISSUE_CODES.epayTypeOfPaymentUnknown,
	severity: "review",
	affectedFactKeys: [],
	recoveryAction: EPAY_RECEIPT_TYPE_OF_PAYMENT_UNKNOWN_RECOVERY_ACTION,
});
