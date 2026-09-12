import { describe, expect, test } from "vitest";

import { readinessPresentationOf } from "./analysis-readiness-presentation";

describe("analysis readiness presentation", () => {
	test("uses only the domain readiness state", () => {
		expect(readinessPresentationOf({ state: "blocked" })).toMatchObject({
			title: "Blocked",
			variant: "danger",
		});
		expect(readinessPresentationOf({ state: "analysis-ready" })).toMatchObject({
			title: "Analysis-ready",
			variant: "success",
		});
	});
});
