import { isRecordObject } from "../extraction-support";

// The one reviewed revision this adapter claims: an official prefilled
// ITR-1 JSON export whose signature carries the document type and the
// assessment-year schema version. The signature and every reviewed
// section's shape are validated before any value is read, so a different
// revision or a structurally invalid file never yields observations.
export const ITR1_PREFILLED_SUPPORTED_DOCUMENT_TYPE = "ITR1_PREFILLED";
export const ITR1_PREFILLED_SUPPORTED_SCHEMA_VERSION = "2026-27";

// The projection of the reviewed revision onto its reviewed sections. A
// prefill legitimately omits a section it has nothing to say about;
// properties outside the reviewed sections belong to the official format,
// not to OpenITR facts, and are dropped here at the boundary.
export type PrefilledItr1JsonDocument = Readonly<{
	salaryInformation?: Readonly<Record<string, unknown>>;
	tdsOnSalary?: readonly unknown[];
}>;

export type PrefilledItr1JsonParseOutcome =
	| Readonly<{ kind: "supported"; document: PrefilledItr1JsonDocument }>
	| Readonly<{ kind: "unsupported" }>;

// A reviewed section that is present must carry the reviewed shape: the
// salary section an object of named properties, the TDS section an array
// of record nodes.
const projectedDocumentOf = (
	parsed: Record<string, unknown>,
): PrefilledItr1JsonDocument => {
	const salaryInformation = parsed["salaryInformation"];
	const tdsOnSalary = parsed["tdsOnSalary"];
	return {
		...(isRecordObject(salaryInformation)
			? { salaryInformation }
			: {}),
		...(Array.isArray(tdsOnSalary) ? { tdsOnSalary } : {}),
	};
};

export const parsePrefilledItr1JsonRevision = (
	text: string,
): PrefilledItr1JsonParseOutcome => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return { kind: "unsupported" };
	}
	if (!isRecordObject(parsed)) {
		return { kind: "unsupported" };
	}
	if (
		parsed.documentType !== ITR1_PREFILLED_SUPPORTED_DOCUMENT_TYPE ||
		parsed.schemaVersion !== ITR1_PREFILLED_SUPPORTED_SCHEMA_VERSION
	) {
		return { kind: "unsupported" };
	}
	if (
		parsed["salaryInformation"] !== undefined &&
		!isRecordObject(parsed["salaryInformation"])
	) {
		return { kind: "unsupported" };
	}
	if (
		parsed["tdsOnSalary"] !== undefined &&
		!Array.isArray(parsed["tdsOnSalary"])
	) {
		return { kind: "unsupported" };
	}
	return { kind: "supported", document: projectedDocumentOf(parsed) };
};
