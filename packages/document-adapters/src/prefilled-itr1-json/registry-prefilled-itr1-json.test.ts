import {
	computeSourceDocumentIdentity,
	DOCUMENT_ISSUE_CODES,
	parseSha256Digest,
} from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import {
	createPrefilledItr1JsonFixture,
	utf8Bytes,
} from "../testing";
import { createDocumentInspectionRegistry } from "../registry";

const copyBytes = (source: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(source.length));
	out.set(source);
	return out;
};

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes })).contentSha256;

describe("registry inspection of official prefilled ITR-1 JSON", () => {
	test("identifies the reviewed prefilled ITR-1 JSON revision", async () => {
		const bytes = utf8Bytes(createPrefilledItr1JsonFixture());
		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(bytes),
			displayName: "synthetic-prefilled-itr1.json",
			bytes: copyBytes(bytes),
			suppliedMediaType: "application/json",
		});

		expect(outcome).toEqual({
			kind: "identified",
			document: {
				documentKind: "prefilled-itr1-json",
				templateRevision: "2026-27",
			},
			adapter: {
				adapterId: "prefilled-itr1-json",
				adapterVersion: "1",
			},
		});
	});

	test.each([
		["a different assessment-year schema version", { schemaVersion: "2027-28" }],
		["a different document type", { documentType: "ITR2_PREFILLED" }],
	] as const)("rejects %s as unknown format", async (_label, override) => {
		const text = JSON.stringify({
			documentType: "ITR1_PREFILLED",
			schemaVersion: "2026-27",
			salaryInformation: {},
			tdsOnSalary: [],
			...override,
		});
		const bytes = utf8Bytes(text);
		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(bytes),
			displayName: "synthetic-prefilled-itr1.json",
			bytes: copyBytes(bytes),
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
			issue: { code: DOCUMENT_ISSUE_CODES.documentUnknownFormat },
		});
	});

	test.each([
		[
			"a salary section that is not an object",
			{ salaryInformation: ["12,00,000"] },
		],
		["a TDS section that is not an array", { tdsOnSalary: {} }],
	] as const)(
		"rejects %s before extracting any fact",
		async (_label, override) => {
			const text = JSON.stringify({
				documentType: "ITR1_PREFILLED",
				schemaVersion: "2026-27",
				...override,
			});
			const bytes = utf8Bytes(text);
			const outcome = await createDocumentInspectionRegistry().inspect({
				identity: await identityOf(bytes),
				displayName: "synthetic-prefilled-itr1.json",
				bytes: copyBytes(bytes),
			});

			expect(outcome).toMatchObject({
				kind: "rejected",
				rejection: "unknown-format",
			});
		},
	);

	test("rejects bytes that are not JSON at all", async () => {
		const bytes = utf8Bytes("definitely not json");
		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(bytes),
			displayName: "synthetic-prefilled-itr1.json",
			bytes: copyBytes(bytes),
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});

	test("rejects bytes that are not valid UTF-8", async () => {
		const bytes = new Uint8Array(new ArrayBuffer(4));
		bytes.set([0xff, 0xfe, 0x7b, 0x7d]);
		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: parseSha256Digest("b".repeat(64)),
			displayName: "synthetic-prefilled-itr1.json",
			bytes,
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
		});
	});

	test("routes an identified prefilled ITR-1 revision to its salary and TDS extraction", async () => {
		const bytes = utf8Bytes(createPrefilledItr1JsonFixture());
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "synthetic-prefilled-itr1.json",
			bytes: copyBytes(bytes),
		});

		expect(outcome.kind).toBe("extracted");
		if (outcome.kind === "extracted") {
			expect(outcome.observations).toHaveLength(3);
			expect(outcome.tdsObservations).toHaveLength(5);
			expect(outcome.bankInterestObservations).toEqual([]);
			expect(outcome.issues).toEqual([]);
			for (const observation of outcome.observations) {
				expect(observation.evidence.kind).toBe("json-pointer");
				expect(observation.adapterId).toBe("prefilled-itr1-json");
			}
			for (const observation of outcome.tdsObservations) {
				expect(observation.record.medium).toBe("json");
			}
		}
	});

	test("rejects extraction of an unsupported revision before any fact exists", async () => {
		const bytes = utf8Bytes(
			createPrefilledItr1JsonFixture({ schemaVersion: "2027-28" }),
		);
		const outcome = await createDocumentInspectionRegistry().extractDocument({
			identity: await identityOf(bytes),
			displayName: "synthetic-prefilled-itr1.json",
			bytes: copyBytes(bytes),
		});

		expect(outcome).toMatchObject({
			kind: "rejected",
			rejection: "unknown-format",
			issue: { code: DOCUMENT_ISSUE_CODES.documentUnknownFormat },
		});
	});
});
