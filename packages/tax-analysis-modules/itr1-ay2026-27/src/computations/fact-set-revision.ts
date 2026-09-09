export type FactSetRevision = `fact-set-${number}`;

export const factSetRevisionFor = (generation: number): FactSetRevision =>
	`fact-set-${generation}`;
