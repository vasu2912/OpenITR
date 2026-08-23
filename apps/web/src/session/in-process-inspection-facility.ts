import type { DocumentProcessingFacility } from "./session-orchestrator";
import { createDocumentInspectionRegistry } from "@openitr/document-adapters";

// Runs inspection and extraction on the current thread. Test support only;
// the application processes documents through the worker facility.
export const inProcessInspectionFacility = (): DocumentProcessingFacility => {
	const registry = createDocumentInspectionRegistry();
	return {
		inspect: (input, signal) =>
			Promise.race([
				registry.inspect(input, { signal }),
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
		extract: (input, signal) =>
			Promise.race([
				registry.extractDocument(input, { signal }),
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
