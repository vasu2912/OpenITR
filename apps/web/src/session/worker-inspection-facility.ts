import type {
	DocumentExtractionOutcome,
	DocumentInspectionOutcome,
	InspectableSourceDocument,
} from "@openitr/model";

import type { DocumentProcessingFacility } from "./session-orchestrator";
import type {
	InspectionWorkerRequest,
	InspectionWorkerResponse,
} from "../workers/document-inspection.worker";

type PendingResolution = Readonly<{
	resolve: (payload: DocumentInspectionOutcome | DocumentExtractionOutcome) => void;
	reject: (reason: unknown) => void;
}>;

export const workerInspectionFacility = (): DocumentProcessingFacility => {
	let worker: Worker | undefined;
	let nextRequestId = 1;
	const pending = new Map<number, PendingResolution>();

	const terminateWhenIdle = () => {
		if (pending.size === 0 && worker !== undefined) {
			worker.terminate();
			worker = undefined;
		}
	};

	const ensureWorker = (): Worker => {
		if (worker !== undefined) {
			return worker;
		}
		const next = new Worker(
			new URL("../workers/document-inspection.worker.ts", import.meta.url),
			{ type: "module" },
		);
		next.onmessage = (event: MessageEvent<InspectionWorkerResponse>) => {
			const message = event.data;
			const awaiting = pending.get(message.requestId);
			if (awaiting === undefined) {
				return;
			}
			pending.delete(message.requestId);
			if (message.type === "cancelled") {
				awaiting.reject(new DOMException("Inspection cancelled", "AbortError"));
			} else {
				awaiting.resolve(message.payload);
			}
			terminateWhenIdle();
		};
		next.onerror = () => {
			for (const awaiting of pending.values()) {
				awaiting.reject(new Error("Worker failure"));
			}
			pending.clear();
			next.terminate();
			if (worker === next) {
				worker = undefined;
			}
		};
		worker = next;
		return next;
	};

	const runInWorker = (
		type: "inspect" | "extract",
		input: InspectableSourceDocument,
		signal: AbortSignal,
	): Promise<DocumentInspectionOutcome | DocumentExtractionOutcome> => {
		const current = ensureWorker();
		const requestId = nextRequestId;
		nextRequestId += 1;
		const promise = new Promise<
			DocumentInspectionOutcome | DocumentExtractionOutcome
		>((resolve, reject) => {
			pending.set(requestId, { resolve, reject });
		});
		// Transfer the whole buffer when the view covers it exactly; copy once
		// otherwise so the worker never sees a shifted window.
		const view = input.bytes;
		const coversWholeBuffer =
			view.byteOffset === 0 && view.byteLength === view.buffer.byteLength;
		const transferredBytes = coversWholeBuffer
			? new Uint8Array(view.buffer)
			: Uint8Array.from(view);
		const transferableBuffer = transferredBytes.buffer;
		const onAbort = (): void => {
			current.postMessage({
				type: "cancel",
				requestId,
			} satisfies InspectionWorkerRequest);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		current.postMessage(
			{
				type,
				requestId,
				input: { ...input, bytes: transferredBytes },
			} satisfies InspectionWorkerRequest,
			[transferableBuffer],
		);
		return promise.finally(() => {
			signal.removeEventListener("abort", onAbort);
		});
	};

	return {
		inspect: (input, signal) =>
			runInWorker("inspect", input, signal) as Promise<DocumentInspectionOutcome>,
		extract: (input, signal) =>
			runInWorker("extract", input, signal) as Promise<DocumentExtractionOutcome>,
	};
};
