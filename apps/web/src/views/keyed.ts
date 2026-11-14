// React keys built from item content. Repeated content gets an occurrence
// suffix, so a key never depends on list position and per-item UI state
// (an open details panel, for example) stays with the right item.
export const keyed = <T>(
	items: readonly T[],
	keyOf: (item: T) => string,
): readonly Readonly<{ key: string; item: T }>[] => {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const base = keyOf(item);
		const occurrence = (seen.get(base) ?? 0) + 1;
		seen.set(base, occurrence);
		return { key: occurrence === 1 ? base : `${base}#${occurrence}`, item };
	});
};
