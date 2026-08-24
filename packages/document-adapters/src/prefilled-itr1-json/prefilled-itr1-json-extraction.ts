import type {
	DocumentReviewIssue,
	FactKey,
	SalaryObservation,
	Sha256Digest,
	TdsObservation,
} from "@openitr/model";
import {
	DOCUMENT_REVIEW_ISSUE_CODES,
	SALARY_FIELD_MALFORMED_RECOVERY_ACTION,
} from "@openitr/model";

import type { AdapterIdentity } from "../extraction-support";
import { isRecordObject } from "../extraction-support";
import type { GroupedRupeeAmount } from "../grouped-rupee-amount";
import { parseGroupedRupeeAmount } from "../grouped-rupee-amount";
import {
	SERIAL_NUMBER_PATTERN,
	TAN_PATTERN,
	TDS_AMOUNT_COLUMNS,
	tdsRecordMalformedIssue,
} from "../form26as/tds-part-one";
import type { PrefilledItr1JsonDocument } from "./prefilled-itr1-json-revision";
import { PREFILLED_ITR1_SALARY_FIELD_DEFINITIONS } from "./prefilled-itr1-json-fields";
import type { JsonTdsSourceRecord } from "@openitr/model";

const SALARY_SECTION_POINTER = "/salaryInformation";
const TDS_SECTION_POINTER = "/tdsOnSalary";

// The reviewed TDS record properties, keyed by the shared Part I amount
// column vocabulary so this adapter cannot drift from the canonical facts.
const TDS_AMOUNT_PROPERTY_NAMES = {
	paidCredited: "amountPaidCredited",
	taxDeducted: "taxDeducted",
	deposited: "tdsDeposited",
} as const satisfies Record<keyof typeof TDS_AMOUNT_COLUMNS, string>;

// The reviewed salary properties print Indian digit-grouped whole-rupee
// strings such as "12,00,000". Every normalization step is recorded in
// order; anything that is not a plain non-negative whole-rupee amount is
// malformed so the caller can fail closed.
const parseGroupedWholeRupees = (
	raw: unknown,
):
	| Readonly<{
			steps: SalaryObservation["transformationSteps"];
			value: number;
	  }>
	| undefined => {
	if (typeof raw !== "string") {
		return undefined;
	}
	const trimmed = raw.replace(/\s+/g, " ").trim();
	const digitsWithoutGrouping = trimmed.replace(/,/g, "");
	if (!/^[0-9]+$/.test(digitsWithoutGrouping)) {
		return undefined;
	}
	const value = Number.parseInt(digitsWithoutGrouping, 10);
	if (!Number.isSafeInteger(value) || value < 0) {
		return undefined;
	}
	return {
		value,
		steps: [
			{
				order: 1,
				operation: "trim-whitespace",
				input: raw,
				output: trimmed,
			},
			{
				order: 2,
				operation: "remove-indian-digit-grouping",
				input: trimmed,
				output: digitsWithoutGrouping,
			},
			{
				order: 3,
				operation: "parse-whole-rupees",
				input: digitsWithoutGrouping,
				output: String(value),
			},
		],
	};
};

export type PrefilledItr1JsonExtraction = Readonly<{
	salaryObservations: readonly SalaryObservation[];
	tdsObservations: readonly TdsObservation[];
	issues: readonly DocumentReviewIssue[];
}>;

export const extractPrefilledItr1Observations = ({
	document,
	sourceDocumentId,
	adapter,
}: Readonly<{
	document: PrefilledItr1JsonDocument;
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
}>): PrefilledItr1JsonExtraction => {
	const issues: DocumentReviewIssue[] = [];
	const { salaryInformation, tdsOnSalary } = document;

	const salaryObservations =
		salaryInformation === undefined
			? []
			: collectSalaryObservations({
					section: salaryInformation,
					sourceDocumentId,
					adapter,
					issues,
				});

	const tdsObservations =
		tdsOnSalary === undefined
			? []
			: collectTdsObservations({
					records: tdsOnSalary,
					sourceDocumentId,
					adapter,
					issues,
				});

	return {
		salaryObservations,
		tdsObservations,
		issues,
	};
};

type IssueSink = { push(issue: DocumentReviewIssue): void };

// A prefill legitimately omits fields and prints blanks; both stay absent
// from the facts without any issue. A printed value that does not parse is
// malformed and produces a typed review issue instead of a guessed fact.
const collectSalaryObservations = ({
	section,
	sourceDocumentId,
	adapter,
	issues,
}: Readonly<{
	section: Readonly<Record<string, unknown>>;
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
	issues: IssueSink;
}>): readonly SalaryObservation[] => {
	const observations: SalaryObservation[] = [];
	for (const definition of PREFILLED_ITR1_SALARY_FIELD_DEFINITIONS) {
		const value = section[definition.propertyName];
		if (value === undefined) {
			continue;
		}
		if (typeof value === "string" && value.trim() === "") {
			continue;
		}
		const parsed = parseGroupedWholeRupees(value);
		if (parsed === undefined) {
			issues.push({
				code: DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldMalformed,
				severity: "review",
				affectedFactKeys: [definition.factKey],
				recoveryAction: SALARY_FIELD_MALFORMED_RECOVERY_ACTION,
			});
			continue;
		}
		const pointer = `${SALARY_SECTION_POINTER}/${definition.propertyName}`;
		observations.push({
			observationId: `${definition.factKey}@${sourceDocumentId}:${pointer}`,
			factKey: definition.factKey,
			sourceDocumentId,
			adapterId: adapter.adapterId,
			adapterVersion: adapter.adapterVersion,
			originalText: JSON.stringify(value),
			normalizedValue: parsed.value,
			transformationSteps: parsed.steps,
			evidence: { kind: "json-pointer", pointer },
			ruleCitation: {
				ruleId: definition.ruleId,
				description: definition.description,
			},
		});
	}

	return observations.sort((first, second) =>
		first.factKey < second.factKey ? -1 : first.factKey > second.factKey ? 1 : 0,
	);
};

type ParsedAmountCell =
	| Readonly<{ kind: "unknown"; raw: string | undefined }>
	| Readonly<{ kind: "value"; amount: GroupedRupeeAmount; raw: string }>
	| Readonly<{ kind: "malformed" }>;

// An absent property and a printed blank both stay unknown; only a present
// non-blank value parses, keeping its exact characters as the record's raw
// value.
const parseTdsAmountProperty = (value: unknown): ParsedAmountCell => {
	if (value === undefined) {
		return { kind: "unknown", raw: undefined };
	}
	if (typeof value === "string") {
		if (value.trim() === "") {
			return { kind: "unknown", raw: value };
		}
		const amount = parseGroupedRupeeAmount(value);
		if (amount === undefined) {
			return { kind: "malformed" };
		}
		return { kind: "value", amount, raw: value };
	}
	return { kind: "malformed" };
};

type ParsedJsonTdsRecord = Readonly<{
	facts: JsonTdsSourceRecord;
	amounts: ReadonlyMap<
		FactKey,
		Readonly<{ amount: GroupedRupeeAmount; originalValue: string }>
	>;
}>;

type RecordParseOutcome =
	| Readonly<{ kind: "parsed"; record: ParsedJsonTdsRecord }>
	| Readonly<{ kind: "malformed" }>;

// One reviewed TDS record occupies one array node with three identity
// properties and three optional amount properties. Identity properties must
// carry reviewed values; an amount may stay unknown but never malformed.
// Records leave in source array order, so their positional pointers stay
// deterministic regardless of object property order.
const parseJsonTdsRecord = (
	record: unknown,
	recordIndex: number,
): RecordParseOutcome => {
	if (!isRecordObject(record)) {
		return { kind: "malformed" };
	}

	const serialNumber = record["serialNumber"];
	const deductorName = record["deductorName"];
	const deductorTan = record["deductorTan"];
	if (
		typeof serialNumber !== "string" ||
		serialNumber === "" ||
		!SERIAL_NUMBER_PATTERN.test(serialNumber) ||
		typeof deductorName !== "string" ||
		deductorName.trim() === "" ||
		typeof deductorTan !== "string" ||
		deductorTan.trim() === "" ||
		!TAN_PATTERN.test(deductorTan)
	) {
		return { kind: "malformed" };
	}

	const pointer = `${TDS_SECTION_POINTER}/${recordIndex}`;
	const parsedAmounts = Object.entries(TDS_AMOUNT_PROPERTY_NAMES).map(
		([columnKey, propertyName]) => ({
			columnKey: columnKey as keyof typeof TDS_AMOUNT_PROPERTY_NAMES,
			definition:
				TDS_AMOUNT_COLUMNS[columnKey as keyof typeof TDS_AMOUNT_COLUMNS],
			propertyName,
			outcome: parseTdsAmountProperty(record[propertyName]),
		}),
	);
	if (parsedAmounts.some(({ outcome }) => outcome.kind === "malformed")) {
		return { kind: "malformed" };
	}

	const amounts = new Map<
		FactKey,
		{ amount: GroupedRupeeAmount; originalValue: string }
	>();
	for (const { definition, propertyName, outcome } of parsedAmounts) {
		if (outcome.kind === "value") {
			amounts.set(definition.factKey, {
				amount: outcome.amount,
				originalValue: JSON.stringify(record[propertyName]),
			});
		}
	}

	const rawOf = (
		columnKey: keyof typeof TDS_AMOUNT_PROPERTY_NAMES,
	): string | undefined => {
		const outcome = parsedAmounts.find(
			(entry) => entry.columnKey === columnKey,
		)?.outcome;
		return outcome === undefined || outcome.kind === "malformed"
			? undefined
			: outcome.raw;
	};

	const facts: JsonTdsSourceRecord = {
		medium: "json",
		pointer,
		serialNumber,
		deductorName,
		deductorTan,
		amountPaidCreditedRaw: rawOf("paidCredited"),
		taxDeductedRaw: rawOf("taxDeducted"),
		tdsDepositedRaw: rawOf("deposited"),
	};
	return { kind: "parsed", record: { facts, amounts } };
};

const collectTdsObservations = ({
	records,
	sourceDocumentId,
	adapter,
	issues,
}: Readonly<{
	records: readonly unknown[];
	sourceDocumentId: Sha256Digest;
	adapter: AdapterIdentity;
	issues: IssueSink;
}>): readonly TdsObservation[] => {
	const parsedRecords: ParsedJsonTdsRecord[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const outcome = parseJsonTdsRecord(records[index], index);
		if (outcome.kind === "malformed") {
			issues.push(tdsRecordMalformedIssue());
			continue;
		}
		parsedRecords.push(outcome.record);
	}

	// Records leave in source array order and the amount column definitions
	// enumerate a record's facts in fact-key order, so flatMap yields
	// observations ordered by record pointer and then fact key.
	return parsedRecords.flatMap((record) =>
		Object.entries(TDS_AMOUNT_PROPERTY_NAMES).flatMap(
			([columnKey, propertyName]) => {
				const definition =
					TDS_AMOUNT_COLUMNS[
						columnKey as keyof typeof TDS_AMOUNT_COLUMNS
					];
				const parsed = record.amounts.get(definition.factKey);
				if (parsed === undefined) {
					return [];
				}
				return [
					{
						observationId: `${definition.factKey}@${sourceDocumentId}:${record.facts.pointer}/${propertyName}`,
						factKey: definition.factKey,
						sourceDocumentId,
						adapterId: adapter.adapterId,
						adapterVersion: adapter.adapterVersion,
						originalValue: parsed.originalValue,
						normalizedValue: parsed.amount.value,
						transformationSteps: parsed.amount.steps,
						evidence: {
							kind: "json-pointer",
							pointer: `${record.facts.pointer}/${propertyName}`,
						},
						ruleCitation: {
							ruleId: definition.ruleId,
							description: definition.description,
						},
						record: record.facts,
					} satisfies TdsObservation,
				];
			},
		),
	);
};
