import type { FactKey } from "@openitr/model";

// Each computation checks that its facts are present before it reads them.
// This turns that ordering assumption into a loud failure instead of letting
// `undefined` flow into tax arithmetic.
export const requireFact = <T>(value: T | undefined, factKey: FactKey): T => {
	if (value === undefined) {
		throw new Error(`Fact ${String(factKey)} was read before validation`);
	}
	return value;
};
