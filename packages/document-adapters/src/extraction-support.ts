import type { DocumentAdapterManifest } from "./registry";

// The subset of a manifest that every observation records as its origin.
export type AdapterIdentity = Pick<
	DocumentAdapterManifest,
	"adapterId" | "adapterVersion"
>;

export const compareByCodepoint = (left: string, right: string): number => {
	if (left < right) {
		return -1;
	}
	return left > right ? 1 : 0;
};
