import type { DocumentExtractionOutcome } from "@openitr/model";
import { parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { buildSyntheticPdf } from "../fixtures/pdf-fixture-builder";
import {
	createDamagedPdfFixture,
	createEpayTaxPdfFixture,
	EPAY_SENTINEL_BANK_REFERENCE,
	EPAY_SENTINEL_BSR_CODE,
	EPAY_SENTINEL_CHALLAN_SERIAL,
	EPAY_SENTINEL_PAYMENT_DATE,
	EPAY_SENTINEL_PAN,
	EPAY_SENTINEL_TAXPAYER_NAME,
	EPAY_SENTINEL_TOTAL_TAX_PAID,
	utf8Bytes,
} from "../testing";
import { createEpayTaxPdfAdapter } from "./epay-tax-pdf-adapter";

const copyBytes = (pdfBytes: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(pdfBytes.length));
	out.set(pdfBytes);
	return out;
};

const identityOf = (tag: string) => parseSha256Digest(`${tag}`.padEnd(64, "0"));

const extractFixture = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<DocumentExtractionOutcome> => {
	const adapter = createEpayTaxPdfAdapter();
	const extract = adapter.extract;
	if (extract === undefined) {
		throw new Error("the e-Pay Tax adapter must support extraction");
	}
	return extract(
		{
			identity: identityOf("e"),
			displayName: "epay-tax-receipt.pdf",
			bytes: copyBytes(bytes),
		},
	);
};

const extractedOrThrow = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Extract<DocumentExtractionOutcome, { kind: "extracted" }>> => {
	const outcome = await extractFixture(bytes);
	if (outcome.kind !== "extracted") {
		throw new Error(`expected extraction, got ${outcome.rejection}`);
	}
	return outcome;
};

describe("e-Pay Tax receipt PDF adapter inspection", () => {
	test("matches an official e-Pay Tax receipt text layer exactly", async () => {
		const verdict = await createEpayTaxPdfAdapter().inspect({
			identity: identityOf("c"),
			displayName: "challan-receipt.pdf",
			bytes: copyBytes(createEpayTaxPdfFixture()),
		});

		expect(verdict.verdict).toBe("exact-match");
	});

	test("does not match a plain text layer without the e-Pay Tax markers", async () => {
		const bytes = copyBytes(
			buildSyntheticPdf({
				pages: [{ textLines: ["Nothing relevant here"] }],
			}),
		);

		const verdict = await createEpayTaxPdfAdapter().inspect({
			identity: identityOf("b"),
			displayName: "other.pdf",
			bytes,
		});

		expect(verdict.verdict).toBe("no-match");
	});
});

describe("e-Pay Tax receipt payment extraction", () => {
	test("creates one verified tax-payment observation for a paid self-assessment challan", async () => {
		const outcome = await extractedOrThrow(createEpayTaxPdfFixture());

		expect(outcome.issues).toEqual([]);
		expect(outcome.taxPaymentObservations).toHaveLength(1);
		const observation = outcome.taxPaymentObservations[0];
		expect(observation).toBeDefined();
		if (observation === undefined) {
			return;
		}
		expect(String(observation.factKey)).toBe(
			"tax-payment.self-assessment-tax",
		);
		expect(observation.adapterId).toBe("epay-tax-receipt-pdf");
		expect(observation.adapterVersion).toBe("1");
		expect(observation.originalValue).toBe(
			`Rs ${EPAY_SENTINEL_TOTAL_TAX_PAID}`,
		);
		expect(String(observation.normalizedValue)).toBe("45670");
		expect(observation.transformationSteps).toEqual([
			{
				order: 1,
				operation: "trim-whitespace",
				input: "Rs 45,670.00",
				output: "Rs 45,670.00",
			},
			{
				order: 2,
				operation: "strip-currency-prefix",
				input: "Rs 45,670.00",
				output: "45,670.00",
			},
			{
				order: 3,
				operation: "remove-indian-digit-grouping",
				input: "45,670.00",
				output: "45670.00",
			},
			{
				order: 4,
				operation: "parse-exact-rupees",
				input: "45670.00",
				output: "45670",
			},
		]);
		expect(observation.ruleCitation.ruleId).toBe(
			"EPAY-TAX-RECEIPT-SELF-ASSESSMENT-TAX",
		);
	});

	test("preserves the challan identity, payment date, taxpayer identity, and bank reference", async () => {
		const outcome = await extractedOrThrow(createEpayTaxPdfFixture());

		const observation = outcome.taxPaymentObservations[0];
		expect(observation).toBeDefined();
		if (observation === undefined) {
			return;
		}
		expect(observation.record).toEqual({
			medium: "pdf",
			page: 1,
			taxpayerName: EPAY_SENTINEL_TAXPAYER_NAME,
			taxpayerPan: EPAY_SENTINEL_PAN,
			assessmentYear: "2026-27",
			bsrCode: EPAY_SENTINEL_BSR_CODE,
			challanSerialNumber: EPAY_SENTINEL_CHALLAN_SERIAL,
			paymentDateDayMonthYear: EPAY_SENTINEL_PAYMENT_DATE,
			typeOfPaymentCode: "300",
			typeOfPaymentLabel: "(300) Self Assessment Tax",
			bankReferenceNumber: EPAY_SENTINEL_BANK_REFERENCE,
			totalAmountRaw: `Rs ${EPAY_SENTINEL_TOTAL_TAX_PAID}`,
		});
		expect(observation.observationId).toBe(
			`tax-payment.self-assessment-tax@${identityOf("e")}:cin-${EPAY_SENTINEL_BSR_CODE}-${EPAY_SENTINEL_CHALLAN_SERIAL}`,
		);
	});

	test("points its evidence locator at the printed Total Tax Paid line", async () => {
		const outcome = await extractedOrThrow(createEpayTaxPdfFixture());

		const observation = outcome.taxPaymentObservations[0];
		expect(observation?.evidence).toEqual({
			kind: "pdf-page-region",
			page: 1,
			x: 72,
			y: 544,
			width: expect.any(Number),
			height: 12,
		});
		const pageLines = outcome.pages[0]?.lines ?? [];
		expect(pageLines.map((line) => line.text)).toContain(
			`Total Tax Paid : Rs ${EPAY_SENTINEL_TOTAL_TAX_PAID}`,
		);
	});

	test("credits an advance-tax receipt to the advance-tax fact", async () => {
		const outcome = await extractedOrThrow(
			createEpayTaxPdfFixture({ typeOfPayment: "(100) Advance Tax" }),
		);

		expect(outcome.issues).toEqual([]);
		expect(
			outcome.taxPaymentObservations.map((observation) =>
				String(observation.factKey),
			),
		).toEqual(["tax-payment.advance-tax"]);
		expect(outcome.taxPaymentObservations[0]?.ruleCitation.ruleId).toBe(
			"EPAY-TAX-RECEIPT-ADVANCE-TAX",
		);
	});

	test("is deterministic for byte-identical receipts", async () => {
		const bytes = createEpayTaxPdfFixture();
		const first = await extractFixture(bytes);
		const second = await extractFixture(bytes);

		expect(second).toEqual(first);
	});
});

describe("e-Pay Tax fail-closed extraction", () => {
	test("reports a receipt without any challan fields as section missing", async () => {
		const outcome = await extractedOrThrow(
			createEpayTaxPdfFixture({ omitReceiptFields: true }),
		);

		expect(outcome.taxPaymentObservations).toEqual([]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_EPAY_RECEIPT_SECTION_MISSING",
		]);
		expect(outcome.issues[0]?.severity).toBe("review");
		expect(outcome.issues[0]?.recoveryAction.length).toBeGreaterThan(0);
	});

	test.each([
		{
			name: "a non-paid status",
			options: { status: "Failed" },
		},
		{
			name: "another assessment year",
			options: { assessmentYear: "2027-28" },
		},
		{
			name: "an unparseable total amount",
			options: { malformedTotalTaxPaid: true },
		},
		{
			name: "missing challan identity fields",
			options: { omitChallanDetails: true },
		},
	])("reports $name as malformed and creates no payment", async ({
		options,
	}) => {
		const outcome = await extractedOrThrow(createEpayTaxPdfFixture(options));

		expect(outcome.taxPaymentObservations).toEqual([]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_EPAY_RECEIPT_RECORD_MALFORMED",
		]);
		expect(outcome.issues[0]?.affectedFactKeys.length).toBeGreaterThan(0);
	});

	test("drops a receipt whose challan identity repeats with conflicting values as ambiguous", async () => {
		const outcome = await extractedOrThrow(
			createEpayTaxPdfFixture({ duplicateChallanIdentity: "conflicting" }),
		);

		expect(outcome.taxPaymentObservations).toEqual([]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_EPAY_RECEIPT_RECORD_AMBIGUOUS",
		]);
	});

	test("collapses an identical reprinted challan block into one payment", async () => {
		const outcome = await extractedOrThrow(
			createEpayTaxPdfFixture({ duplicateChallanIdentity: "identical" }),
		);

		expect(outcome.issues).toEqual([]);
		expect(outcome.taxPaymentObservations).toHaveLength(1);
	});

	test("contributes nothing from an unrecognized type of payment", async () => {
		const outcome = await extractedOrThrow(
			createEpayTaxPdfFixture({ typeOfPayment: "(102) Surcharge" }),
		);

		expect(outcome.taxPaymentObservations).toEqual([]);
		expect(outcome.issues.map((issue) => String(issue.code))).toEqual([
			"DOCUMENT_EPAY_RECEIPT_TYPE_OF_PAYMENT_UNKNOWN",
		]);
		expect(outcome.issues[0]?.affectedFactKeys).toEqual([]);
	});
});

describe("e-Pay Tax rejection classes stay closed at extraction", () => {
	test.each([
		{
			name: "encrypted",
			bytes: (): Uint8Array<ArrayBuffer> =>
				buildSyntheticPdf({
					pages: [
						{ textLines: ["e-Pay Tax Receipt", "Income Tax Department"] },
					],
					encryptionPassword: "openitr-synthetic-lock",
				}),
			rejection: "encrypted",
		},
		{
			name: "damaged",
			bytes: (): Uint8Array<ArrayBuffer> => createDamagedPdfFixture(),
			rejection: "damaged",
		},
		{
			name: "scanned image-only",
			bytes: (): Uint8Array<ArrayBuffer> =>
				buildSyntheticPdf({ pages: [{ imageOnly: true }] }),
			rejection: "image-only",
		},
	])("rejects a %s receipt before extracting any fact", async ({
		bytes,
		rejection,
	}) => {
		const outcome = await extractFixture(bytes());

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe(rejection);
		}
	});

	test("rejects non-PDF bytes that no adapter claims", async () => {
		const outcome = await extractFixture(utf8Bytes("not a pdf at all"));

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("unknown-format");
		}
	});
});
