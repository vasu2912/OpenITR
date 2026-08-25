import type { ExactMoney, ObservationTransformationStep } from "@openitr/model";
import { parseExactMoney } from "@openitr/model";

export type GroupedRupeeAmount = Readonly<{
	steps: readonly ObservationTransformationStep[];
	value: ExactMoney;
}>;

const normalizeWhitespace = (text: string): string =>
	text.replace(/\s+/g, " ").trim();

// Parses the Indian digit-grouped rupee strings that official statement
// exports print, such as "10,00,000.00", into an exact decimal value while
// recording every transformation step. Returns undefined for anything that
// is not a plain non-negative amount within a plausible statement magnitude,
// so callers can fail closed.
const MAX_AMOUNT_DIGITS = 15;

export const parseGroupedRupeeAmount = (
	raw: unknown,
): GroupedRupeeAmount | undefined => {
	if (typeof raw !== "string") {
		return undefined;
	}
	const trimmed = normalizeWhitespace(raw);
	const digitsWithoutGrouping = trimmed.replace(/,/g, "");
	if (!/^[0-9]+(?:\.[0-9]+)?$/.test(digitsWithoutGrouping)) {
		return undefined;
	}
	// No official statement prints a rupee amount beyond fifteen digits;
	// longer digit strings are hostile input, not data, and fail closed
	// instead of becoming an unbounded money fact.
	if (digitsWithoutGrouping.replace(".", "").length > MAX_AMOUNT_DIGITS) {
		return undefined;
	}
	let value: ExactMoney;
	try {
		value = parseExactMoney(digitsWithoutGrouping);
	} catch {
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
				operation: "parse-exact-rupees",
				input: digitsWithoutGrouping,
				output: value,
			},
		],
	};
};
