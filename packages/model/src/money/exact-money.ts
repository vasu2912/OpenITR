import Decimal from "decimal.js";

// An isolated engine so no other package's global Decimal configuration can
// change tax arithmetic. Precision 40 exceeds any reachable digit count;
// ROUND_HALF_UP implements the statutory "five or more rounds up" behavior.
const ExactDecimal = Decimal.clone({
	precision: 40,
	rounding: Decimal.ROUND_HALF_UP,
	toExpNeg: -40,
	toExpPos: 40,
});

// A canonical non-exponential decimal string such as "1200000" or
// "60001.5". Values are always zero or positive.
export type ExactMoney = string & {
	readonly __brand: "ExactMoney";
};

const EXACT_MONEY_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

type ExactDecimalInstance = InstanceType<typeof ExactDecimal>;

const canonical = (value: ExactDecimalInstance): ExactMoney =>
	value.toString() as ExactMoney;

const asExactDecimal = (value: ExactMoney): ExactDecimalInstance =>
	new ExactDecimal(value);

const requireNonNegativeAmount = (
	value: ExactMoney,
	operation: string,
): void => {
	if (asExactDecimal(value).isNegative()) {
		throw new Error(`${operation} requires a non-negative amount: ${value}`);
	}
};

export const parseExactMoney = (value: string): ExactMoney => {
	if (!EXACT_MONEY_PATTERN.test(value)) {
		throw new Error(`Invalid exact money value: ${JSON.stringify(value)}`);
	}
	return canonical(new ExactDecimal(value));
};

export const exactMoneyFromWholeRupees = (value: number): ExactMoney => {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`Invalid whole-rupee amount: ${value}`);
	}
	return canonical(new ExactDecimal(value));
};

export const addExactMoney = (left: ExactMoney, right: ExactMoney): ExactMoney =>
	canonical(asExactDecimal(left).plus(asExactDecimal(right)));

export const subtractExactMoney = (
	left: ExactMoney,
	right: ExactMoney,
): ExactMoney => {
	const difference = asExactDecimal(left).minus(asExactDecimal(right));
	if (difference.isNegative()) {
		throw new Error(
			`Subtraction cannot produce a negative amount: ${left} - ${right}`,
		);
	}
	return canonical(difference);
};

export const multiplyByWholePercent = (
	amount: ExactMoney,
	percent: number,
): ExactMoney => {
	if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
		throw new Error(`Invalid whole percentage: ${percent}`);
	}
	return canonical(
		asExactDecimal(amount).times(percent).dividedBy(100),
	);
};

// Nearest multiple of `base`; an exact half of `base` rounds up, matching
// sections 288A and 288B rounding of income and tax.
export const roundToNearestMultipleOf = (
	amount: ExactMoney,
	base: ExactMoney,
): ExactMoney => {
	requireNonNegativeAmount(amount, "Statutory rounding");
	const baseValue = asExactDecimal(base);
	if (baseValue.comparedTo(0) <= 0) {
		throw new Error(`Rounding base must be positive: ${base}`);
	}
	const multiples = asExactDecimal(amount)
		.dividedBy(baseValue)
		.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
	return canonical(multiples.times(baseValue));
};

export const compareExactMoney = (
	left: ExactMoney,
	right: ExactMoney,
): -1 | 0 | 1 => {
	const comparison = asExactDecimal(left).comparedTo(asExactDecimal(right));
	if (comparison < 0) {
		return -1;
	}
	return comparison > 0 ? 1 : 0;
};

export const minExactMoney = (
	left: ExactMoney,
	right: ExactMoney,
): ExactMoney => (compareExactMoney(left, right) <= 0 ? left : right);

export const maxExactMoney = (
	left: ExactMoney,
	right: ExactMoney,
): ExactMoney => (compareExactMoney(left, right) >= 0 ? left : right);
