import type { DocumentProcessingFacility } from "./session-orchestrator";
import { createDocumentInspectionRegistry } from "@openitr/document-adapters";

// Runs inspection and extraction on the current thread. Test support only;
// the application processes documents through the worker facility.
export const inProcessInspectionFacility = (): DocumentProcessingFacility => {
	const registry = createDocumentInspectionRegistry();
	const withAbortRace = <T>(
		run: () => Promise<T>,
		signal: AbortSignal,
	): Promise<T> =>
		Promise.race([
			run(),
			new Promise<never>((_resolve, reject) => {
				if (signal.aborted) {
					reject(new DOMException("Inspection cancelled", "AbortError"));
					return;
				}
				signal.addEventListener("abort", () => {
					reject(new DOMException("Inspection cancelled", "AbortError"));
				});
			}),
		]);
	return {
		inspect: (input, signal) =>
			withAbortRace(() => registry.inspect(input, { signal }), signal),
		extract: (input, signal) =>
			withAbortRace(
				() => registry.extractDocument(input, { signal }),
				signal,
			),
	};
};
