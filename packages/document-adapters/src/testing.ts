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
