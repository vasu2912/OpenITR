import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { createDocumentInspectionRegistry } from "./registry";
import { utf8Bytes } from "./testing";

const identityOf = async (
	bytes: Uint8Array<ArrayBuffer>,
): Promise<Sha256Digest> => {
	const { computeSourceDocumentIdentity } = await import("@openitr/model");
	return (await computeSourceDocumentIdentity({ bytes })).contentSha256;
};

describe("document inspection registry", () => {
	test("identifies a synthetic AIS JSON document exactly", async () => {
		const registry = createDocumentInspectionRegistry();
		const bytes = utf8Bytes(
			JSON.stringify({
				documentType: "AIS",
				schemaVersion: "2026-27",
				taxpayerInformation: {},
				transactionSummary: [],
			}),
		);

		const outcome = await registry.inspect({
			identity: await identityOf(bytes),
			displayName: "annual-information-statement.json",
			suppliedMediaType: "application/json",
			bytes,
		});

		expect(outcome.kind).toBe("identified");
		if (outcome.kind === "identified") {
			expect(outcome.document.documentKind).toBe("ais-json");
			expect(outcome.document.templateRevision).toBe("2026-27");
			expect(outcome.adapter.adapterId).toBe("ais-json");
		}
	});

	test("rejects bytes that no adapter matches as unknown format", async () => {
		const registry = createDocumentInspectionRegistry();
		const bytes = utf8Bytes("definitely not any reviewed document");

		const outcome = await registry.inspect({
			identity: await identityOf(bytes),
			displayName: "form16.pdf",
			suppliedMediaType: "application/pdf",
			bytes,
		});

		expect(outcome).toEqual({
			kind: "rejected",
			rejection: "unknown-format",
			issue: {
				code: "DOCUMENT_UNKNOWN_FORMAT",
				severity: "blocking",
				affectedDocumentIds: [await identityOf(bytes)],
				recoveryAction:
					"Select a supported source document, or continue with a permitted attested answer.",
			},
		});
	});
});
