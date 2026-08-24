import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createForm26AsExcelFixture,
	utf8Bytes,
} from "../testing";
import { createForm26AsExcelAdapter } from "./form26as-excel-adapter";

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

const inspectOf = async (bytes: Uint8Array<ArrayBuffer>) =>
	createForm26AsExcelAdapter().inspect({
		identity: await identityOf(bytes),
		displayName: "synthetic-form26as.xlsx",
		bytes,
	});

const extractWith = async (bytes: Uint8Array<ArrayBuffer>) => {
	const adapter = createForm26AsExcelAdapter();
	if (adapter.extract === undefined) {
		throw new Error("the Form 26AS Excel adapter must support extraction");
	}
	return adapter.extract({
		identity: await identityOf(bytes),
		displayName: "synthetic-form26as.xlsx",
		bytes,
	});
};

describe("Form 26AS Excel identification", () => {
	test("exact-matches the reviewed spreadsheet revision", async () => {
		expect(await inspectOf(createForm26AsExcelFixture())).toEqual({
			verdict: "exact-match",
		});
	});

	test.each([
		["a renamed sheet", { sheetName: "Statement 2026" }],
		["an unsupported assessment year", { assessmentYear: "2027-28" }],
		[
			"a workbook missing its shared strings part",
			{ omitSharedStringsPart: true },
		],
		[
			"a workbook carrying an embedded macro part",
			{
				extraZipEntries: {
					"xl/vbaProject.bin": "synthetic macro payload that must never run",
				},
			},
		],
		[
			"a workbook carrying an external link part",
			{
				extraZipEntries: {
					"xl/externalLinks/externalLink1.xml":
						"<externalLink/> synthetic external workbook reference",
				},
			},
		],
	] as const)("does not match %s", async (_label, options) => {
		expect(
			await inspectOf(createForm26AsExcelFixture(options)),
		).toEqual({ verdict: "no-match" });
	});

	test("does not match plain-text bytes", async () => {
		expect(
			await inspectOf(utf8Bytes("FORM 26AS\r\nnot a spreadsheet\r\n")),
		).toEqual({ verdict: "no-match" });
	});

	test("does not match truncated workbook bytes", async () => {
		const bytes = createForm26AsExcelFixture();

		expect(await inspectOf(bytes.slice(0, 64))).toEqual({
			verdict: "no-match",
		});
	});
});

describe("Form 26AS Excel manifest", () => {
	test("declares its own adapter identity beside the text adapter", () => {
		const { manifest } = createForm26AsExcelAdapter();

		expect(manifest.adapterId).toBe("form26as-excel");
		expect(manifest.documentKind).toBe("form26as");
		expect(manifest.templateRevision).toBe("2026-27");
	});
});

describe("Form 26AS Excel fail-closed extraction gate", () => {
	test("rejects an unknown revision before extracting any fact", async () => {
		const outcome = await extractWith(
			createForm26AsExcelFixture({ assessmentYear: "2027-28" }),
		);

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
			issue: { code: "DOCUMENT_UNKNOWN_FORMAT" },
		});
	});

	test("rejects bytes that are not a workbook at all", async () => {
		const outcome = await extractWith(utf8Bytes("not a workbook"));

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});

	test("produces byte-for-byte identical observations when the same input is extracted twice", async () => {
		const bytes = createForm26AsExcelFixture();
		const firstOutcome = await extractWith(bytes);
		const secondOutcome = await extractWith(bytes);

		if (
			firstOutcome.kind !== "extracted" ||
			secondOutcome.kind !== "extracted"
		) {
			throw new Error("expected two extracted outcomes");
		}
		expect(JSON.stringify(secondOutcome.tdsObservations)).toBe(
			JSON.stringify(firstOutcome.tdsObservations),
		);
	});
});
