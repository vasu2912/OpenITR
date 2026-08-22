import { parseSha256Digest } from "@openitr/model";
import { describe, expect, test } from "vitest";

import { createDocumentInspectionRegistry } from "./registry";
import {
	PRIVATE_STATEMENT_SENTINEL_HEADER,
	createPrivateStatementDetector,
} from "./private-statements/private-statement-detector";

const asciiBytes = (text: string): Uint8Array<ArrayBuffer> => {
	const encoded = new TextEncoder().encode(text);
	const buffer = new ArrayBuffer(encoded.length);
	new Uint8Array(buffer).set(encoded);
	return new Uint8Array(buffer);
};

describe("private-institution statement detection", () => {
	test("rejects a private bank statement layout as private-institution", async () => {
		const bytes = asciiBytes(
			[
				PRIVATE_STATEMENT_SENTINEL_HEADER,
				"01-Jan-2026,Opening balance,,, ,",
			].join("\n"),
		);

		const outcome = await createDocumentInspectionRegistry(
			[],
			[createPrivateStatementDetector()],
		).inspect({
			identity: parseSha256Digest("a".repeat(64)),
			displayName: "statement.csv",
			bytes,
		});

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("private-institution");
			expect(outcome.issue.code).toBe("DOCUMENT_PRIVATE_INSTITUTION_TEMPLATE");
			expect(outcome.issue.severity).toBe("blocking");
			expect(outcome.issue.affectedDocumentIds).toEqual([
				parseSha256Digest("a".repeat(64)),
			]);
			expect(outcome.issue.recoveryAction).toContain("AIS");
		}
	});

	test("does not reject ordinary CSV content that lacks the private header", async () => {
		const bytes = asciiBytes("name,amount\nsynthetic,100\n");

		const outcome = await createDocumentInspectionRegistry(
			[],
			[createPrivateStatementDetector()],
		).inspect({
			identity: parseSha256Digest("b".repeat(64)),
			displayName: "table.csv",
			bytes,
		});

		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.rejection).toBe("unknown-format");
		}
	});
});
