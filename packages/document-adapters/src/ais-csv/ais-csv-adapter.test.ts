import { computeSourceDocumentIdentity } from "@openitr/model";
import type { Sha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { createDocumentInspectionRegistry } from "../registry";
import { createAisCsvBankInterestFixture, utf8Bytes } from "../testing";

const identityOf = async (text: string): Promise<Sha256Digest> =>
	(await computeSourceDocumentIdentity({ bytes: utf8Bytes(text) }))
		.contentSha256;

describe("AIS CSV detection", () => {
	test("identifies a synthetic AIS CSV document exactly through the registry", async () => {
		const text = createAisCsvBankInterestFixture();
		const bytes = utf8Bytes(text);

		const outcome = await createDocumentInspectionRegistry().inspect({
			identity: await identityOf(text),
			displayName: "synthetic-ais.csv",
			suppliedMediaType: "text/csv",
			bytes,
		});

		expect(outcome.kind).toBe("identified");
		if (outcome.kind === "identified") {
			expect(outcome.document.documentKind).toBe("ais-csv");
			expect(outcome.document.templateRevision).toBe("2026-27");
			expect(outcome.adapter.adapterId).toBe("ais-csv");
			expect(outcome.adapter.adapterVersion).toBe("1");
		}
	});
});
