import type { TdsObservation } from "@openitr/model";
import { addExactMoney, parseExactMoney } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createForm26AsExcelFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "../testing";
import { createForm26AsExcelAdapter } from "./form26as-excel-adapter";
import { createForm26AsTextAdapter } from "./form26as-text-adapter";
import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

const extractForm26As = async (
	format: "text" | "excel",
	options?: {
		partOneRows?: readonly (readonly string[])[];
		omitPartOne?: boolean;
		omitColumnHeader?: boolean;
		assessmentYear?: string;
	},
) => {
	const adapter =
		format === "text"
			? createForm26AsTextAdapter()
			: createForm26AsExcelAdapter();
	const { extract } = adapter;
	if (extract === undefined) {
		throw new Error("the Form 26AS adapters must support extraction");
	}
	const bytes =
		format === "text"
			? utf8Bytes(
					createForm26AsTextFixture({
						...(options?.partOneRows === undefined
							? {}
							: {
									partOneRows: options.partOneRows.map((cells) =>
										cells.join("\t"),
									),
								}),
						...(options?.omitPartOne === undefined
							? {}
							: { omitPartOne: options.omitPartOne }),
						...(options?.omitColumnHeader === undefined
							? {}
							: { omitColumnHeader: options.omitColumnHeader }),
						...(options?.assessmentYear === undefined
							? {}
							: { assessmentYear: options.assessmentYear }),
					}),
				)
			: createForm26AsExcelFixture({
					...(options?.partOneRows === undefined
						? {}
						: { partOneRows: options.partOneRows }),
					...(options?.omitPartOne === undefined
						? {}
						: { omitPartOne: options.omitPartOne }),
					...(options?.omitColumnHeader === undefined
						? {}
						: { omitColumnHeader: options.omitColumnHeader }),
					...(options?.assessmentYear === undefined
						? {}
						: { assessmentYear: options.assessmentYear }),
				});
	const outcome = await extract({
		identity: await identityOf(bytes),
		displayName:
			format === "text" ? "synthetic-form26as.txt" : "synthetic-form26as.xlsx",
		bytes,
	});
	if (outcome.kind !== "extracted") {
		throw new Error(`expected ${format} extraction to succeed`);
	}
	return outcome;
};

// The canonical fact fields both representations must agree on. Identity
// fields differ because the bytes differ; evidence and raw value live on
// each representation's own side, and the record block carries a
// representation-specific location, so all of them stay outside fact
// equality.
const canonicalFactOf = (observation: TdsObservation) => {
	const {
		sourceDocumentId: _sourceDocumentId,
		observationId: _observationId,
		adapterId: _adapterId,
		adapterVersion: _adapterVersion,
		evidence: _evidence,
		originalValue: _originalValue,
		record: _record,
		...canonicalFact
	} = observation;
	return canonicalFact;
};

// The Part I record identity both representations must agree on even though
// their locations differ.
const recordIdentityOf = (observation: TdsObservation) => {
	const {
		medium: _medium,
		firstLine: _firstLine,
		lastLine: _lastLine,
		sheet: _sheet,
		rowNumber: _rowNumber,
		...identity
	} =
		observation.record.medium === "spreadsheet"
			? { ...observation.record, firstLine: undefined, lastLine: undefined }
			: { ...observation.record, sheet: undefined, rowNumber: undefined };
	return identity;
};

describe("equivalent Form 26AS text and spreadsheet fixtures", () => {
	test("produce equivalent canonical tax-deducted-at-source facts", async () => {
		const textOutcome = await extractForm26As("text");
		const excelOutcome = await extractForm26As("excel");

		expect(excelOutcome.tdsObservations).toHaveLength(
			textOutcome.tdsObservations.length,
		);
		expect(excelOutcome.tdsObservations.map(canonicalFactOf)).toEqual(
			textOutcome.tdsObservations.map(canonicalFactOf),
		);
		expect(excelOutcome.tdsObservations.map(recordIdentityOf)).toEqual(
			textOutcome.tdsObservations.map(recordIdentityOf),
		);
		expect(excelOutcome.issues).toEqual(textOutcome.issues);

		expect(
			textOutcome.tdsObservations.map((observation) => observation.adapterId),
		).toEqual(["form26as-text", "form26as-text", "form26as-text", "form26as-text", "form26as-text"]);
		expect(
			excelOutcome.tdsObservations.map((observation) => observation.adapterId),
		).toEqual(["form26as-excel", "form26as-excel", "form26as-excel", "form26as-excel", "form26as-excel"]);
	});

	test("each representation preserves its own evidence location", async () => {
		const textOutcome = await extractForm26As("text");
		const excelOutcome = await extractForm26As("excel");

		const [firstText] = textOutcome.tdsObservations;
		expect(firstText?.evidence).toEqual({
			kind: "text-line-range",
			firstLine: 7,
			lastLine: 7,
		});

		const [firstExcel] = excelOutcome.tdsObservations;
		expect(firstExcel?.evidence).toEqual({
			kind: "spreadsheet-cell",
			sheet: "Form 26AS",
			cell: "D7",
			rowNumber: 7,
			columnIndex: 3,
			columnHeader: "Total Amount Paid/Credited",
			rawValue: "10,00,000.00",
		});
	});

	test("feed downstream totals that do not depend on the source representation", async () => {
		const textOutcome = await extractForm26As("text");
		const excelOutcome = await extractForm26As("excel");

		const depositedTotalOf = (observations: readonly TdsObservation[]) =>
			observations
				.filter((observation) => observation.factKey === "tds.tds-deposited")
				.map((observation) => observation.normalizedValue)
				.reduce((left, right) => addExactMoney(left, right), parseExactMoney("0"));

		expect(depositedTotalOf(excelOutcome.tdsObservations)).toBe(
			depositedTotalOf(textOutcome.tdsObservations),
		);
	});

	test("stay equivalent when an amount cell prints blank in both representations", async () => {
		const blankDeductedRow = [
			"1",
			"OpenITR Synthetic Employer Private Limited",
			"MUMA12345B",
			"10,00,000.00",
			"",
			"48,750.00",
		] as const;
		const textOutcome = await extractForm26As("text", {
			partOneRows: [blankDeductedRow],
		});
		const excelOutcome = await extractForm26As("excel", {
			partOneRows: [blankDeductedRow],
		});

		expect(excelOutcome.tdsObservations.map(canonicalFactOf)).toEqual(
			textOutcome.tdsObservations.map(canonicalFactOf),
		);
		expect(excelOutcome.tdsObservations.map(recordIdentityOf)).toEqual(
			textOutcome.tdsObservations.map(recordIdentityOf),
		);
		expect(excelOutcome.issues).toEqual([]);
	});
});
