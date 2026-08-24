import {
	computeSourceDocumentIdentity,
	DOCUMENT_ISSUE_CODES,
} from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createForm26AsExcelFixture,
	createForm26AsTextFixture,
	utf8Bytes,
} from "./testing";
import { createDocumentInspectionRegistry } from "./registry";

const copyBytes = (source: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(source.length));
	out.set(source);
	return out;
};

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

describe("registry inspection of Form 26AS spreadsheet exports", () => {
	test("identifies the reviewed Form 26AS spreadsheet revision", async () => {
		const bytes = createForm26AsExcelFixture();
		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(bytes),
			displayName: "synthetic-form26as.xlsx",
			bytes: copyBytes(bytes),
			suppliedMediaType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		expect(outcome).toEqual({
			kind: "identified",
			document: {
				documentKind: "form26as",
				templateRevision: "2026-27",
			},
			adapter: { adapterId: "form26as-excel", adapterVersion: "1" },
		});
	});

	test("keeps the text and spreadsheet revisions distinct without ambiguity", async () => {
		const registry = createDocumentInspectionRegistry();
		const excelBytes = createForm26AsExcelFixture();
		const textBytes = utf8Bytes(createForm26AsTextFixture());

		const excelOutcome = await registry.inspect({
			identity: await identityOf(excelBytes),
			displayName: "synthetic-form26as.xlsx",
			bytes: copyBytes(excelBytes),
		});
		const textOutcome = await registry.inspect({
			identity: await identityOf(textBytes),
			displayName: "synthetic-form26as.txt",
			bytes: copyBytes(textBytes),
		});

		expect(
			excelOutcome.kind === "identified" ? excelOutcome.adapter.adapterId : undefined,
		).toBe("form26as-excel");
		expect(
			textOutcome.kind === "identified" ? textOutcome.adapter.adapterId : undefined,
		).toBe("form26as-text");
	});

	test("rejects an unsupported spreadsheet revision as unknown format", async () => {
		const bytes = createForm26AsExcelFixture({
			assessmentYear: "2027-28",
		});
		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(bytes),
			displayName: "synthetic-form26as.xlsx",
			bytes: copyBytes(bytes),
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
			issue: { code: DOCUMENT_ISSUE_CODES.documentUnknownFormat },
		});
	});

	test("routes an identified Form 26AS spreadsheet revision to its TDS extraction", async () => {
		const bytes = createForm26AsExcelFixture();
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "synthetic-form26as.xlsx",
			bytes: copyBytes(bytes),
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(outcome.tdsObservations).toHaveLength(5);
			expect(
				outcome.tdsObservations.map(
					(observation) => observation.adapterId,
				),
			).toEqual([
				"form26as-excel",
				"form26as-excel",
				"form26as-excel",
				"form26as-excel",
				"form26as-excel",
			]);
			expect(outcome.issues).toEqual([]);
			for (const observation of outcome.tdsObservations) {
				expect(observation.evidence.kind).toBe("spreadsheet-cell");
				expect(observation.record.medium).toBe("spreadsheet");
			}
		}
	});

	test("rejects extraction of an unsupported spreadsheet revision before any fact exists", async () => {
		const bytes = createForm26AsExcelFixture({
			sheetName: "Statement 2026",
		});
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "synthetic-form26as.xlsx",
			bytes: copyBytes(bytes),
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});
});
