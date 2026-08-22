import {
	buildSyntheticPdf,
	corruptSyntheticPdf,
} from "./fixtures/pdf-fixture-builder";
import { PRIVATE_STATEMENT_SENTINEL_HEADER } from "./private-statements/private-statement-detector";

export { PRIVATE_STATEMENT_SENTINEL_HEADER };

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
