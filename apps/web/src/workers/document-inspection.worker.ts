import type {
	DocumentInspectionOutcome,
	InspectableSourceDocument,
} from "@openitr/model";
import {
	createInspectionFailedOutcome,
} from "@openitr/model";
import { createDocumentInspectionRegistry } from "@openitr/document-adapters";

export type InspectionWorkerRequest =
	| Readonly<{
			type: "inspect";
			requestId: number;
			input: InspectableSourceDocument;
	  }>
	| Readonly<{ type: "cancel"; requestId: number }>;

export type InspectionWorkerResponse =
	| Readonly<{
			type: "outcome";
			requestId: number;
			outcome: DocumentInspectionOutcome;
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
	registry
		.inspect(message.input, { signal: controller.signal })
		.then((outcome) => {
			workerScope.postMessage({
				type: "outcome",
				requestId: message.requestId,
				outcome,
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
				type: "outcome",
				requestId: message.requestId,
				outcome: createInspectionFailedOutcome(message.input.identity),
			});
		})
		.finally(() => {
			active.delete(message.requestId);
		});
});
