import { describe, expect, it } from "vitest";

import { keyed } from "./keyed";

describe("keyed", () => {
	it("keys items by content and numbers repeats", () => {
		expect(keyed(["a", "b", "a"], (value) => value).map(({ key }) => key)).toEqual([
			"a",
			"b",
			"a#2",
		]);
	});

	it("keeps a key when an earlier, different item is removed", () => {
		const before = keyed(["x", "y"], (value) => value);
		const after = keyed(["y"], (value) => value);
		expect(after[0]?.key).toBe(before[1]?.key);
	});
});
