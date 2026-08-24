import {
	buildSyntheticPdf,
	corruptSyntheticPdf,
} from "./fixtures/pdf-fixture-builder";
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
}>;

// Machine-generated synthetic Form 16 Part A salary detail page. One content
// stream line per printed row, so every row's evidence locator follows the
// generator layout: x=72, baseline y = 720 - 16 * rowIndex, height = 12.
export const createForm16SalaryPdfFixture = (
	options: Form16SalaryFixtureOptions = {},
): Uint8Array<ArrayBuffer> => {
	const rows: readonly string[] = [
		`Salary as per provisions contained in section 17(1): Rs ${FORM16_SALARY_ROW_AMOUNTS["Salary as per provisions contained in section 17(1)"]}`,
		`Less: Allowance to the extent exempt u/s 10: Rs ${FORM16_SALARY_ROW_AMOUNTS["Less: Allowance to the extent exempt u/s 10"]}`,
		`Taxable salary: Rs ${FORM16_SALARY_ROW_AMOUNTS["Taxable salary"]}`,
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
					"Permanent Account Number of Deductor (TAN): SYNTO1234E",
					"Name and address of the Employee: OpenITR Synthetic Employee",
					...filteredRows,
					...duplicatedRows,
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
