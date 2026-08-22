import { createDocumentInspectionRegistry } from "@openitr/document-adapters";

import type { SourceDocumentInspectionFacility } from "./session-orchestrator";

// Runs inspection on the current thread. Test support only; the application
// inspects documents through the worker facility.
export const inProcessInspectionFacility = (): SourceDocumentInspectionFacility => {
	const registry = createDocumentInspectionRegistry();
	return {
		inspect: (input, signal) =>
			Promise.race([
				registry.inspect(input),
				new Promise<never>((_resolve, reject) => {
					if (signal.aborted) {
						reject(new DOMException("Inspection cancelled", "AbortError"));
						return;
					}
					signal.addEventListener("abort", () => {
						reject(new DOMException("Inspection cancelled", "AbortError"));
					});
				}),
			]),
	};
};
