import type { DocumentInspectionOutcome, InspectableSourceDocument } from "@openitr/model";

import type { SourceDocumentInspectionFacility } from "./session-orchestrator";
import type {
	InspectionWorkerRequest,
	InspectionWorkerResponse,
} from "../workers/document-inspection.worker";

type PendingInspection = Readonly<{
	resolve: (outcome: DocumentInspectionOutcome) => void;
	reject: (reason: unknown) => void;
}>;

export const workerInspectionFacility = (): SourceDocumentInspectionFacility => {
	let worker: Worker | undefined;
	let nextRequestId = 1;
	const pending = new Map<number, PendingInspection>();

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
			if (message.type === "outcome") {
				awaiting.resolve(message.outcome);
			} else {
				awaiting.reject(new DOMException("Inspection cancelled", "AbortError"));
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

	return {
		inspect: (input: InspectableSourceDocument, signal) => {
			const current = ensureWorker();
			const requestId = nextRequestId;
			nextRequestId += 1;
			const promise = new Promise<DocumentInspectionOutcome>(
				(resolve, reject) => {
					pending.set(requestId, { resolve, reject });
				},
			);
			const transferableBuffer = input.bytes.buffer;
			current.postMessage(
				{
					type: "inspect",
					requestId,
					input: {
						...input,
						bytes: new Uint8Array(transferableBuffer),
					},
				} satisfies InspectionWorkerRequest,
				[transferableBuffer],
			);
			signal.addEventListener(
				"abort",
				() => {
					current.postMessage({
						type: "cancel",
						requestId,
					} satisfies InspectionWorkerRequest);
				},
				{ once: true },
			);
			return promise;
		},
	};
};
