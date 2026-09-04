import {
	buildSyntheticPdf,
	corruptSyntheticPdf,
} from "./fixtures/pdf-fixture-builder";
import {
	buildXlsxWorkbookFixture,
	blankCell,
	rowXmlOf,
	SharedStringTableBuilder,
	textCell,
	type FixtureCell,
} from "./fixtures/xlsx-fixture-builder";
import { PRIVATE_STATEMENT_SENTINEL_HEADER } from "./private-statements/private-statement-detector";

export { PRIVATE_STATEMENT_SENTINEL_HEADER };

export const utf8Bytes = (text: string): Uint8Array<ArrayBuffer> => {
	const encoded = new TextEncoder().encode(text);
	const buffer = new ArrayBuffer(encoded.length);
	new Uint8Array(buffer).set(encoded);
	return new Uint8Array(buffer);
};

const AIS_JSON_FIXTURE_MARKERS = {
	documentType: "AIS",
	schemaVersion: "2026-27",
} as const;

export const createAisJsonFixture = (): string =>
	JSON.stringify({
		...AIS_JSON_FIXTURE_MARKERS,
		taxpayerInformation: {},
		transactionSummary: [],
	});

export const AIS_JSON_SENTINEL_SAVINGS_INTEREST = "7,890.25";
export const AIS_JSON_SENTINEL_DEPOSITS_INTEREST = "45,678.90";

export const AIS_BANK_INTEREST_SAVINGS_RECORD = Object.freeze({
	recordCategory: "SAVINGS_ACCOUNT",
	institutionName: "OpenITR Synthetic Bank",
	maskedAccountNumber: "XXXXXX0001",
	interestAmount: AIS_JSON_SENTINEL_SAVINGS_INTEREST,
});

export const AIS_BANK_INTEREST_DEPOSITS_RECORD = Object.freeze({
	recordCategory: "DEPOSITS",
	institutionName: "OpenITR Synthetic Co-operative Bank",
	maskedAccountNumber: "XXXXXX0002",
	interestAmount: AIS_JSON_SENTINEL_DEPOSITS_INTEREST,
});

export type AisJsonBankInterestFixtureOptions = Readonly<{
	bankInterestRecords?: readonly unknown[];
	omitInterestSection?: boolean;
}>;

export const createAisJsonBankInterestFixture = (
	options: AisJsonBankInterestFixtureOptions = {},
): string =>
	JSON.stringify({
		...AIS_JSON_FIXTURE_MARKERS,
		taxpayerInformation: {},
		transactionSummary: [],
		...(options.omitInterestSection
			? {}
			: {
					interestInformation: {
						bankInterest:
							options.bankInterestRecords ?? [
								AIS_BANK_INTEREST_SAVINGS_RECORD,
								AIS_BANK_INTEREST_DEPOSITS_RECORD,
							],
					},
				}),
	});

// Machine-generated synthetic AIS CSV export for the one supported revision:
// two marker lines, an optional bank-interest section with one reviewed
// column header row, and one line per record with four cells. Amounts carry
// Indian digit grouping so they always print quoted. The layout constants
// below intentionally mirror the adapter's expectations without importing
// them, so any drift fails tests.
export const AIS_CSV_DOCUMENT_TYPE_MARKER = "documentType,AIS";
export const AIS_CSV_SCHEMA_VERSION_MARKER = "schemaVersion,2026-27";
export const AIS_CSV_SECTION_MARKER = "section,bankInterest";

export const AIS_CSV_BANK_INTEREST_COLUMN_HEADER_LINE =
	"recordCategory,institutionName,maskedAccountNumber,interestAmount";

// Minimal RFC 4180 quoting: a cell prints quoted only when it carries a
// comma, quote, or line break, and embedded quotes double.
const csvCellText = (value: string): string =>
	/[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export type AisCsvBankInterestFixtureRow = Readonly<{
	recordCategory: string;
	institutionName: string;
	maskedAccountNumber: string;
	interestAmount: string;
}>;

export type AisCsvBankInterestFixtureOptions = Readonly<{
	bankInterestRows?: readonly AisCsvBankInterestFixtureRow[];
	omitBankInterestSection?: boolean;
}>;

export const createAisCsvBankInterestFixture = (
	options: AisCsvBankInterestFixtureOptions = {},
): string => {
	if (options.omitBankInterestSection === true) {
		return [
			AIS_CSV_DOCUMENT_TYPE_MARKER,
			AIS_CSV_SCHEMA_VERSION_MARKER,
		].join("\n");
	}
	const rows =
		options.bankInterestRows ??
		[
			AIS_BANK_INTEREST_SAVINGS_RECORD,
			AIS_BANK_INTEREST_DEPOSITS_RECORD,
		].map((record) => ({
			recordCategory: record.recordCategory,
			institutionName: record.institutionName,
			maskedAccountNumber: record.maskedAccountNumber,
			interestAmount: record.interestAmount,
		}));
	return [
		AIS_CSV_DOCUMENT_TYPE_MARKER,
		AIS_CSV_SCHEMA_VERSION_MARKER,
		AIS_CSV_SECTION_MARKER,
		AIS_CSV_BANK_INTEREST_COLUMN_HEADER_LINE,
		...rows.map((row) =>
			[
				row.recordCategory,
				row.institutionName,
				row.maskedAccountNumber,
				row.interestAmount,
			]
				.map(csvCellText)
				.join(","),
		),
	].join("\n");
};

const FORM16_MARKER_LINES = [
	"PART A",
	"Certificate under section 203 of the Income-tax Act, 1961",
] as const;

const FORM16A_MARKER_LINES = [
	"FORM 16A",
	"Certificate under section 203(2A) of the Income-tax Act, 1961",
] as const;

export const createForm16PdfFixture = (
	extraTextLines: readonly string[] = [],
): Uint8Array<ArrayBuffer> =>
	buildSyntheticPdf({
		pages: [
			{
				textLines: [...FORM16_MARKER_LINES, ...extraTextLines],
			},
		],
	});

export const createAmbiguousPdfFixture = (): Uint8Array<ArrayBuffer> =>
	buildSyntheticPdf({
		pages: [
			{
				textLines: [...FORM16_MARKER_LINES, ...FORM16A_MARKER_LINES],
			},
		],
	});

export const createEncryptedPdfFixture = (): Uint8Array<ArrayBuffer> =>
	buildSyntheticPdf({
		pages: [{ textLines: [...FORM16_MARKER_LINES] }],
		encryptionPassword: "openitr-synthetic-lock",
	});

export const createDamagedPdfFixture = (): Uint8Array<ArrayBuffer> =>
	corruptSyntheticPdf();

export const createImageOnlyPdfFixture = (): Uint8Array<ArrayBuffer> =>
	buildSyntheticPdf({
		pages: [{ imageOnly: true }],
	});

const FORM16_SALARY_ROW_AMOUNTS: Readonly<Record<string, string>> =
	Object.freeze({
		"Salary as per provisions contained in section 17(1)": "12,00,000",
		"Less: Allowance to the extent exempt u/s 10": "1,50,000",
		"Taxable salary": "10,50,000",
	});

export const FORM16_SALARY_FIXTURE_SENTINEL_AMOUNT = "12,00,000";

export type Form16SalaryFixtureOptions = Readonly<{
	omitLabel?: string;
	duplicateLabel?: string;
	deductorTan?: string;
	additionalTextLine?: string;
	amounts?: Readonly<{
		section17_1: string;
		exemptAllowancesSection10: string;
		taxableSalary: string;
	}>;
}>;

// Machine-generated synthetic Form 16 Part A salary detail page. One content
// stream line per printed row, so every row's evidence locator follows the
// generator layout: x=72, baseline y = 720 - 16 * rowIndex, height = 12.
export const createForm16SalaryPdfFixture = (
	options: Form16SalaryFixtureOptions = {},
): Uint8Array<ArrayBuffer> => {
	const amounts = options.amounts ?? {
		section17_1:
			FORM16_SALARY_ROW_AMOUNTS[
				"Salary as per provisions contained in section 17(1)"
			],
		exemptAllowancesSection10:
			FORM16_SALARY_ROW_AMOUNTS[
				"Less: Allowance to the extent exempt u/s 10"
			],
		taxableSalary: FORM16_SALARY_ROW_AMOUNTS["Taxable salary"],
	};
	const rows: readonly string[] = [
		`Salary as per provisions contained in section 17(1): Rs ${amounts.section17_1}`,
		`Less: Allowance to the extent exempt u/s 10: Rs ${amounts.exemptAllowancesSection10}`,
		`Taxable salary: Rs ${amounts.taxableSalary}`,
	];
	const filteredRows = rows.filter(
		(row) => options.omitLabel === undefined || !row.startsWith(options.omitLabel),
	);
	const duplicatedRows =
		options.duplicateLabel === undefined
			? []
			: [
					`${options.duplicateLabel}: Rs 99,99,999`,
				];

	return buildSyntheticPdf({
		pages: [
			{
				textLines: [
					"PART A",
					"Certificate under section 203 of the Income-tax Act, 1961",
					"Assessment Year 2026-27",
					`Permanent Account Number of Deductor (TAN): ${options.deductorTan ?? "SYNTO1234E"}`,
					"Name and address of the Employee: OpenITR Synthetic Employee",
					...(options.additionalTextLine === undefined
						? []
						: [options.additionalTextLine]),
					...filteredRows,
					...duplicatedRows,
				],
			},
		],
	});
};

// Machine-generated synthetic Form 16A non-salary TDS certificate for the
// one supported revision: two marker lines, a certificate header block, the
// Summary of Payment(s) section title, one reviewed column header row, and
// one line per payment record with six " | "-separated cells, followed by an
// aggregate row that starts with "Total". Amounts print Indian digit-grouped
// exact rupees. Every value is invented; sentinel amounts exist so privacy
// tests can detect leakage. The layout constants below intentionally mirror
// the adapter's expectations without importing them, so any drift fails
// tests.
export const FORM16A_SENTINEL_INTEREST_GROSS = "1,20,000.00";
export const FORM16A_SENTINEL_INTEREST_TAX_DEDUCTED = "12,000.00";
export const FORM16A_SENTINEL_INTEREST_TDS_DEPOSITED = "12,000.00";
export const FORM16A_SENTINEL_DIVIDEND_GROSS = "25,000.00";
export const FORM16A_SENTINEL_DIVIDEND_TAX_DEDUCTED = "2,500.00";

export const FORM16A_DEDUCTOR_NAME_LINE =
	"Name and address of the Deductor: OpenITR Synthetic Payers Private Limited";
export const FORM16A_DEDUCTOR_TAN_LINE = "TAN of the Deductor: MUMA12345B";
export const FORM16A_SUMMARY_SECTION_TITLE_LINE = "Summary of Payment(s)";
export const FORM16A_SUMMARY_COLUMN_HEADER_LINE =
	"Sr. No. | Section | Nature of Payment | Gross Amount Paid/Credited | Tax Deducted | TDS Deposited";

const form16aSummaryRow = (cells: readonly string[]): string =>
	cells.join(" | ");

// Record two prints a blank TDS Deposited cell so tests can prove that a
// blank cell stays unknown instead of becoming zero.
export const FORM16A_SUMMARY_ROW_CELLS = Object.freeze([
	Object.freeze([
		"1",
		"194A",
		"Interest other than interest on securities",
		FORM16A_SENTINEL_INTEREST_GROSS,
		FORM16A_SENTINEL_INTEREST_TAX_DEDUCTED,
		FORM16A_SENTINEL_INTEREST_TDS_DEPOSITED,
	]),
	Object.freeze([
		"2",
		"194",
		"Dividends",
		FORM16A_SENTINEL_DIVIDEND_GROSS,
		FORM16A_SENTINEL_DIVIDEND_TAX_DEDUCTED,
		"",
	]),
] as const);

const FORM16A_AGGREGATE_ROW = form16aSummaryRow([
	"Total",
	"",
	"",
	"1,45,000.00",
	"14,500.00",
	"12,000.00",
]);

export type Form16AFixtureOptions = Readonly<{
	omitSummarySection?: boolean;
	omitColumnHeader?: boolean;
	rows?: readonly string[];
	duplicateSerial?: "identical" | "conflicting";
	addUnknownCategoryRow?: boolean;
}>;

export const createForm16APdfFixture = (
	options: Form16AFixtureOptions = {},
): Uint8Array<ArrayBuffer> => {
	const summaryRows =
		options.rows ??
		FORM16A_SUMMARY_ROW_CELLS.map((cells) => form16aSummaryRow([...cells]));
	const firstSummaryRow = summaryRows[0];
	const repeatedRow =
		options.duplicateSerial === undefined || firstSummaryRow === undefined
			? []
			: [
					options.duplicateSerial === "identical"
						? firstSummaryRow
						: form16aSummaryRow([
								...FORM16A_SUMMARY_ROW_CELLS[0].slice(0, 3),
								"9,99,999.00",
								"99,999.00",
								"99,999.00",
							]),
				];
	const unknownCategoryRows =
		options.addUnknownCategoryRow === true
			? [
					form16aSummaryRow([
						"3",
						"194J",
						"Professional fees",
						"50,000.00",
						"5,000.00",
						"5,000.00",
					]),
				]
			: [];
	return buildSyntheticPdf({
		pages: [
			{
				textLines: [
					...FORM16A_MARKER_LINES,
					"Assessment Year 2026-27",
					FORM16A_DEDUCTOR_NAME_LINE,
					FORM16A_DEDUCTOR_TAN_LINE,
					"PAN of the Deductee: PANXXXX9999X",
					...(options.omitSummarySection
						? []
						: [
								FORM16A_SUMMARY_SECTION_TITLE_LINE,
								...(options.omitColumnHeader
									? []
									: [FORM16A_SUMMARY_COLUMN_HEADER_LINE]),
								...summaryRows,
								...repeatedRow,
								...unknownCategoryRows,
								FORM16A_AGGREGATE_ROW,
							]),
				],
			},
		],
	});
};

// Machine-generated synthetic official e-Pay Tax receipt PDF for the one
// supported revision: two marker lines and one "Label : Value" line per
// reviewed challan field, ending with the Total Tax Paid amount line. Every
// value is invented; sentinel values exist so privacy tests can detect
// leakage. The layout constants below intentionally mirror the adapter's
// expectations without importing them, so any drift fails tests.
export const EPAY_SENTINEL_TAXPAYER_NAME = "OpenITR Synthetic Taxpayer";
export const EPAY_SENTINEL_PAN = "PANPD9999E";
export const EPAY_SENTINEL_ASSESSMENT_YEAR = "2026-27";
export const EPAY_SENTINEL_BSR_CODE = "0004321";
export const EPAY_SENTINEL_PAYMENT_DATE = "26/03/2026";
export const EPAY_SENTINEL_CHALLAN_SERIAL = "00517";
export const EPAY_SENTINEL_BANK_REFERENCE = "OPENITRBNK1234567";
export const EPAY_SENTINEL_TOTAL_TAX_PAID = "45,670.00";

const EPAY_MARKER_LINES = [
	"e-Pay Tax Receipt",
	"Income Tax Department",
] as const;

const epayFieldLine = (label: string, value: string): string =>
	`${label} : ${value}`;

export type EpayTaxReceiptFixtureOptions = Readonly<{
	status?: string;
	assessmentYear?: string;
	typeOfPayment?: string;
	totalTaxPaid?: string;
	malformedTotalTaxPaid?: boolean;
	omitChallanDetails?: boolean;
	bankReference?: string;
	duplicateChallanIdentity?: "identical" | "conflicting";
}>;

export const createEpayTaxPdfFixture = (
	options: EpayTaxReceiptFixtureOptions = {},
): Uint8Array<ArrayBuffer> => {
	const bsrCode = options.duplicateChallanIdentity === "conflicting"
		? "0004329"
		: EPAY_SENTINEL_BSR_CODE;
	const paymentDate = options.duplicateChallanIdentity === "conflicting"
		? "27/03/2026"
		: EPAY_SENTINEL_PAYMENT_DATE;
	const challanSerial = options.duplicateChallanIdentity === "conflicting"
		? "00999"
		: EPAY_SENTINEL_CHALLAN_SERIAL;
	const challanLines = [
		epayFieldLine("BSR Code", EPAY_SENTINEL_BSR_CODE),
		epayFieldLine("Date of Receipt (CIN)", EPAY_SENTINEL_PAYMENT_DATE),
		epayFieldLine("Challan Serial Number", EPAY_SENTINEL_CHALLAN_SERIAL),
	];
	const repeatedChallanLines =
		options.duplicateChallanIdentity === undefined
			? []
			: [
					epayFieldLine("BSR Code", bsrCode),
					epayFieldLine("Date of Receipt (CIN)", paymentDate),
					epayFieldLine("Challan Serial Number", challanSerial),
				];
	const totalAmount = options.malformedTotalTaxPaid === true
		? "45.670.00"
		: (options.totalTaxPaid ?? EPAY_SENTINEL_TOTAL_TAX_PAID);
	return buildSyntheticPdf({
		pages: [
			{
				textLines: [
					...EPAY_MARKER_LINES,
					epayFieldLine(
						"Status of Payment",
						options.status ?? "Paid",
					),
					epayFieldLine(
						"Assessment Year",
						options.assessmentYear ?? EPAY_SENTINEL_ASSESSMENT_YEAR,
					),
					epayFieldLine("Name of Taxpayer", EPAY_SENTINEL_TAXPAYER_NAME),
					epayFieldLine(
						"Permanent Account Number (PAN)",
						EPAY_SENTINEL_PAN,
					),
					...(options.omitChallanDetails === true ? [] : challanLines),
					epayFieldLine(
						"Type of Payment",
						options.typeOfPayment ?? "(300) Self Assessment Tax",
					),
					epayFieldLine(
						"Bank Reference Number",
						options.bankReference ?? EPAY_SENTINEL_BANK_REFERENCE,
					),
					epayFieldLine("Total Tax Paid", `Rs ${totalAmount}`),
					...repeatedChallanLines,
				],
			},
		],
	});
};

export const createUnknownBytesFixture = (): Uint8Array<ArrayBuffer> => {
	const text =
		"openitr-synthetic-unknown-document-bytes that no reviewed adapter claims";
	const encoded = new TextEncoder().encode(text);
	const buffer = new ArrayBuffer(encoded.length);
	new Uint8Array(buffer).set(encoded);
	return new Uint8Array(buffer);
};

export const createPrivateStatementCsvFixture = (): string =>
	[
		PRIVATE_STATEMENT_SENTINEL_HEADER,
		"01-Jan-2026,Opening balance,,,,,1000.00",
	].join("\n");

// Machine-generated synthetic Form 26AS plain-text export. The tab-separated
// layout below is the exact supported revision: a four-line header block, the
// Part I section title, one reviewed column header row, and one line per TDS
// record with six cells, followed by an aggregate row that starts with
// "Total". Every value is invented; sentinel amounts exist so privacy tests
// can detect leakage. The layout constants below intentionally mirror the
// adapter's expectations without importing them, so any drift fails tests.
export const FORM26AS_TEXT_ASSESSMENT_YEAR = "2026-27";
export const FORM26AS_PART_ONE_TITLE = "Part I - Tax Deducted at Source";

export const FORM26AS_COLUMN_HEADER_CELLS = Object.freeze([
	"Sr. No.",
	"Name of Deductor",
	"TAN of Deductor",
	"Total Amount Paid/Credited",
	"Total Tax Deducted",
	"Total TDS Deposited",
]);

export const FORM26AS_SENTINEL_PAID_CREDITED = "10,00,000.00";
export const FORM26AS_SENTINEL_TAX_DEDUCTED = "50,000.00";
export const FORM26AS_SENTINEL_TDS_DEPOSITED = "48,750.00";
export const FORM26AS_SENTINEL_CONTRACTOR_PAID = "2,50,000.00";
export const FORM26AS_SENTINEL_CONTRACTOR_DEPOSITED = "12,500.00";

const tdsRecordLine = (cells: readonly string[]): string =>
	cells.join("\t");

export const FORM26AS_TDS_RECORD_ONE_CELLS = Object.freeze([
	"1",
	"OpenITR Synthetic Employer Private Limited",
	"MUMA12345B",
	FORM26AS_SENTINEL_PAID_CREDITED,
	FORM26AS_SENTINEL_TAX_DEDUCTED,
	FORM26AS_SENTINEL_TDS_DEPOSITED,
]);

// Record two prints a blank Total Tax Deducted cell so tests can prove that
// blank cells stay unknown instead of becoming zero.
export const FORM26AS_TDS_RECORD_TWO_CELLS = Object.freeze([
	"2",
	"OpenITR Synthetic Contractor",
	"PUNE23456C",
	FORM26AS_SENTINEL_CONTRACTOR_PAID,
	"",
	FORM26AS_SENTINEL_CONTRACTOR_DEPOSITED,
]);

export type Form26AsTextFixtureOptions = Readonly<{
	partOneRows?: readonly string[];
	omitPartOne?: boolean;
	omitColumnHeader?: boolean;
	assessmentYear?: string;
}>;

export const createForm26AsTextFixture = (
	options: Form26AsTextFixtureOptions = {},
): string => {
	const partOneRows =
		options.partOneRows ??
		[
			tdsRecordLine(FORM26AS_TDS_RECORD_ONE_CELLS),
			tdsRecordLine(FORM26AS_TDS_RECORD_TWO_CELLS),
			tdsRecordLine([
				"Total",
				"",
				"",
				"12,50,000.00",
				"50,000.00",
				"61,250.00",
			]),
		];
	return [
		"FORM 26AS",
		"Annual Tax Statement under Section 203AA of the Income Tax Act, 1961",
		`Permanent Account Number (PAN)\tPANXXXX9999X`,
		`Assessment Year\t${options.assessmentYear ?? FORM26AS_TEXT_ASSESSMENT_YEAR}`,
		...(options.omitPartOne
			? []
			: [
					FORM26AS_PART_ONE_TITLE,
					...(options.omitColumnHeader
						? []
						: [tdsRecordLine(FORM26AS_COLUMN_HEADER_CELLS)]),
					...partOneRows,
				]),
		"",
	].join("\r\n");
};

// Machine-generated synthetic Form 26AS spreadsheet export for the one
// supported revision: one worksheet named after the statement, a four-row
// header block, the Part I section title row, one reviewed column header
// row, and one row per TDS record with six cells, followed by an aggregate
// row that starts with "Total". Every reviewed cell is a text cell carrying
// exactly the characters the plain-text export prints. The layout constants
// below intentionally mirror the adapter's expectations without importing
// them, so any drift fails tests.
export const FORM26AS_EXCEL_SHEET_NAME = "Form 26AS";
export const FORM26AS_EXCEL_ASSESSMENT_YEAR = FORM26AS_TEXT_ASSESSMENT_YEAR;

const FORM26AS_EXCEL_TITLE = "FORM 26AS";
const FORM26AS_EXCEL_SUBTITLE =
	"Annual Tax Statement under Section 203AA of the Income Tax Act, 1961";
const FORM26AS_EXCEL_PAN_LABEL = "Permanent Account Number (PAN)";
const FORM26AS_EXCEL_PAN_VALUE = "PANXXXX9999X";
const FORM26AS_EXCEL_ASSESSMENT_YEAR_LABEL = "Assessment Year";

export type Form26AsExcelFixtureOptions = Readonly<{
	partOneRows?: readonly (readonly (string | undefined)[])[];
	omitPartOne?: boolean;
	omitColumnHeader?: boolean;
	assessmentYear?: string;
	sheetName?: string;
	extraZipEntries?: Readonly<Record<string, string>>;
	omitSharedStringsPart?: boolean;
}>;

// "" prints a blank cell; undefined omits the cell entirely so fixtures can
// distinguish the two states a real workbook can carry.
const fixtureRowOf = (
	rowNumber: number,
	values: readonly (string | FixtureCell | undefined)[],
	table: SharedStringTableBuilder,
): string =>
	rowXmlOf(
		rowNumber,
		values.map((value) => {
			if (value === undefined) {
				return undefined;
			}
			if (value === "") {
				return blankCell();
			}
			return typeof value === "string" ? textCell(value) : value;
		}),
		table,
	);

export const createForm26AsExcelFixture = (
	options: Form26AsExcelFixtureOptions = {},
): Uint8Array<ArrayBuffer> => {
	const table = new SharedStringTableBuilder();
	const partOneRows =
		options.partOneRows ??
		[
			[...FORM26AS_TDS_RECORD_ONE_CELLS],
			[...FORM26AS_TDS_RECORD_TWO_CELLS],
			["Total", "", "", "12,50,000.00", "50,000.00", "61,250.00"],
		];
	const rows: readonly string[] = [
		fixtureRowOf(1, [FORM26AS_EXCEL_TITLE], table),
		fixtureRowOf(2, [FORM26AS_EXCEL_SUBTITLE], table),
		fixtureRowOf(
			3,
			[FORM26AS_EXCEL_PAN_LABEL, FORM26AS_EXCEL_PAN_VALUE],
			table,
		),
		fixtureRowOf(
			4,
			[
				FORM26AS_EXCEL_ASSESSMENT_YEAR_LABEL,
				options.assessmentYear ?? FORM26AS_EXCEL_ASSESSMENT_YEAR,
			],
			table,
		),
		...(options.omitPartOne
			? []
			: [
					fixtureRowOf(5, [FORM26AS_PART_ONE_TITLE], table),
					...(options.omitColumnHeader
						? []
						: [fixtureRowOf(6, [...FORM26AS_COLUMN_HEADER_CELLS], table)]),
					...partOneRows.map((cells, index) =>
						fixtureRowOf(
							(options.omitColumnHeader ? 6 : 7) + index,
							cells,
							table,
						),
					),
				]),
	];
	return buildXlsxWorkbookFixture({
		sheetName: options.sheetName ?? FORM26AS_EXCEL_SHEET_NAME,
		rows,
		sharedStrings: table.items,
		...(options.extraZipEntries === undefined
			? {}
			: { extraEntries: options.extraZipEntries }),
		...(options.omitSharedStringsPart === true
			? { omitParts: ["xl/sharedStrings.xml"] }
			: {}),
	});
};

// Machine-generated synthetic official prefilled ITR-1 JSON for the one
// supported revision: two signature markers, an optional salary-information
// object with one reviewed property per agreed salary fact, and an optional
// TDS-on-salary array with one reviewed record per employer. Every value is
// invented; sentinel amounts exist so privacy tests can detect leakage.
// The layout constants below intentionally mirror the adapter's expectations
// without importing them, so any drift fails tests.
export const PREFILLED_ITR1_JSON_DOCUMENT_TYPE = "ITR1_PREFILLED";
export const PREFILLED_ITR1_JSON_SCHEMA_VERSION = "2026-27";

const PREFILLED_ITR1_JSON_FIXTURE_MARKERS = {
	documentType: PREFILLED_ITR1_JSON_DOCUMENT_TYPE,
	schemaVersion: PREFILLED_ITR1_JSON_SCHEMA_VERSION,
} as const;

export const PREFILLED_ITR1_SENTINEL_SECTION_17_1_SALARY = "12,00,000";
export const PREFILLED_ITR1_SENTINEL_EXEMPT_ALLOWANCES = "1,50,000";
export const PREFILLED_ITR1_SENTINEL_TAXABLE_SALARY = "10,50,000";

export const PREFILLED_ITR1_SALARY_INFORMATION = Object.freeze({
	section17_1Salary: PREFILLED_ITR1_SENTINEL_SECTION_17_1_SALARY,
	exemptAllowancesSection10: PREFILLED_ITR1_SENTINEL_EXEMPT_ALLOWANCES,
	taxableSalaryTotal: PREFILLED_ITR1_SENTINEL_TAXABLE_SALARY,
});

// Record two omits taxDeducted so tests can prove that an absent amount
// property stays unknown instead of becoming zero.
export const PREFILLED_ITR1_TDS_RECORD_ONE = Object.freeze({
	serialNumber: "1",
	deductorName: "OpenITR Synthetic Employer Private Limited",
	deductorTan: "MUMA12345B",
	amountPaidCredited: FORM26AS_SENTINEL_PAID_CREDITED,
	taxDeducted: FORM26AS_SENTINEL_TAX_DEDUCTED,
	tdsDeposited: FORM26AS_SENTINEL_TDS_DEPOSITED,
});

export const PREFILLED_ITR1_TDS_RECORD_TWO = Object.freeze({
	serialNumber: "2",
	deductorName: "OpenITR Synthetic Contractor",
	deductorTan: "PUNE23456C",
	amountPaidCredited: FORM26AS_SENTINEL_CONTRACTOR_PAID,
	tdsDeposited: FORM26AS_SENTINEL_CONTRACTOR_DEPOSITED,
});

export type PrefilledItr1JsonFixtureOptions = Readonly<{
	documentType?: string;
	schemaVersion?: string;
	salaryInformation?: Readonly<Record<string, unknown>>;
	tdsOnSalary?: readonly unknown[];
	omitSalaryInformation?: boolean;
	omitTdsOnSalary?: boolean;
}>;

export const createPrefilledItr1JsonFixture = (
	options: PrefilledItr1JsonFixtureOptions = {},
): string =>
	JSON.stringify({
		...PREFILLED_ITR1_JSON_FIXTURE_MARKERS,
		...(options.documentType === undefined
			? {}
			: { documentType: options.documentType }),
		...(options.schemaVersion === undefined
			? {}
			: { schemaVersion: options.schemaVersion }),
		...(options.omitSalaryInformation === true
			? {}
			: {
					salaryInformation:
						options.salaryInformation ??
						PREFILLED_ITR1_SALARY_INFORMATION,
				}),
		...(options.omitTdsOnSalary === true
			? {}
			: {
					tdsOnSalary:
						options.tdsOnSalary ?? [
							PREFILLED_ITR1_TDS_RECORD_ONE,
							PREFILLED_ITR1_TDS_RECORD_TWO,
						],
				}),
	});
