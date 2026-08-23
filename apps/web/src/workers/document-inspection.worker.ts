import type {
	DocumentExtractionOutcome,
	DocumentInspectionOutcome,
	InspectableSourceDocument,
} from "@openitr/model";
import {
	createExtractionRejectionOutcome,
	createInspectionFailedOutcome,
} from "@openitr/model";
import { createDocumentInspectionRegistry } from "@openitr/document-adapters";

export type InspectionWorkerRequest =
	| Readonly<{
			type: "inspect" | "extract";
			requestId: number;
			input: InspectableSourceDocument;
	  }>
	| Readonly<{ type: "cancel"; requestId: number }>;

export type InspectionWorkerResponse =
	| Readonly<{
			type: "outcome" | "observations";
			requestId: number;
			payload:
				| DocumentInspectionOutcome
				| DocumentExtractionOutcome;
	  }>
	| Readonly<{ type: "cancelled"; requestId: number }>;

const registry = createDocumentInspectionRegistry();

const workerScope = self as unknown as {
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<InspectionWorkerRequest>) => void,
	): void;
	postMessage(message: InspectionWorkerResponse): void;
};

const active = new Map<number, AbortController>();

const isAbortError = (error: unknown): boolean =>
	error instanceof Error && error.name === "AbortError";

workerScope.addEventListener("message", (event) => {
	const message = event.data;
	if (message.type === "cancel") {
		active.get(message.requestId)?.abort();
		return;
	}
	const controller = new AbortController();
	active.set(message.requestId, controller);
	const run =
		message.type === "inspect"
			? registry.inspect(message.input, { signal: controller.signal })
			: registry.extractDocument(message.input, {
					signal: controller.signal,
				});
	run
		.then((payload) => {
			workerScope.postMessage({
				type: message.type === "inspect" ? "outcome" : "observations",
				requestId: message.requestId,
				payload,
			});
		})
		.catch((error: unknown) => {
			if (isAbortError(error)) {
				workerScope.postMessage({
					type: "cancelled",
					requestId: message.requestId,
				});
				return;
			}
			workerScope.postMessage({
				type: message.type === "inspect" ? "outcome" : "observations",
				requestId: message.requestId,
				payload:
					message.type === "inspect"
						? createInspectionFailedOutcome(message.input.identity)
						: createExtractionRejectionOutcome(
								"inspection-failed",
								message.input.identity,
							),
			});
		})
		.finally(() => {
			active.delete(message.requestId);
		});
});
