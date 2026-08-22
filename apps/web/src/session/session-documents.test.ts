import type {
	CandidateDocument,
	DocumentInspectionOutcome,
} from "@openitr/model";
import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";
import {
	createAisJsonFixture,
	createAmbiguousPdfFixture,
	createDamagedPdfFixture,
	createEncryptedPdfFixture,
	createForm16PdfFixture,
	createImageOnlyPdfFixture,
	createPrivateStatementCsvFixture,
	createUnknownBytesFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { describe, expect, test } from "vitest";

import {
	createSessionOrchestrator,
} from "./session-orchestrator";
import type {
	SessionCommand,
	SessionOrchestrator,
} from "./session-orchestrator";
import { inProcessInspectionFacility } from "./in-process-inspection-facility";
import { itr1Ay202627RulePack } from "@openitr/itr1-ay2026-27";

const fixedAnswerTime = "2026-08-22T00:00:00.000Z";

const createEligibleSession = () => {
	const session = createSessionOrchestrator({
		rulePack: itr1Ay202627RulePack,
		inspection: inProcessInspectionFacility(),
	});
	session.send({
		kind: "answer-eligibility-question",
		questionId: itr1Ay202627RulePack.question.id,
		answer: "yes",
		executionContext: { answerTime: fixedAnswerTime },
	});
	return session;
};

const selectCommand = (
	files: readonly {
		displayName: string;
		bytes: Uint8Array<ArrayBuffer>;
		suppliedMediaType?: string;
	}[],
): SessionCommand => ({
	kind: "select-source-documents",
	documents: files,
});

const intakeDocuments = (
	session: SessionOrchestrator,
): readonly CandidateDocument[] => {
	const snapshot = session.getSnapshot();
	return snapshot.kind === "document-intake" ? snapshot.documents : [];
};

const identifiedKindOf = (candidate: CandidateDocument | undefined): string => {
	if (candidate?.status !== "identified") {
		return "";
	}
	return candidate.identification.documentKind;
};

const rejectionOf = (
	candidate: CandidateDocument | undefined,
): string | undefined =>
	candidate?.status === "rejected" ? candidate.rejection : undefined;

const issueCodeOf = (candidate: CandidateDocument | undefined): string =>
	candidate?.status === "rejected" ? String(candidate.issue.code) : "";

const waitFor = async (
	predicate: () => boolean,
	budgetMs = 20_000,
): Promise<void> => {
	const deadline = Date.now() + budgetMs;
	for (;;) {
		if (predicate()) {
			return;
		}
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for session condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
};

const waitUntilSettled = async (
	session: SessionOrchestrator,
	budgetMs = 20_000,
): Promise<readonly CandidateDocument[]> => {
	await waitFor(() => {
		const documents = intakeDocuments(session).filter(
			(doc) => doc.status !== "removed",
		);
		return (
			documents.length > 0 &&
			documents.every(
				(doc) => doc.status === "identified" || doc.status === "rejected",
			)
		);
	}, budgetMs);
	return intakeDocuments(session);
};

describe("source document intake", () => {
	test("advances to the documents stage after the scope check", () => {
		const session = createEligibleSession();

		expect(session.getSnapshot().kind).toBe("scope-check-complete");

		session.stop();
	});

	test("queues selected documents and identifies them in selection order", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{ displayName: "statement.json", bytes: utf8Bytes(createAisJsonFixture()) },
				{
					displayName: "notes.txt",
					bytes: createUnknownBytesFixture(),
				},
			]),
		);

		const settled = await waitUntilSettled(session);

		expect(settled.map((doc) => doc.displayName)).toEqual([
			"statement.json",
			"notes.txt",
		]);
		expect(settled[0]?.status).toBe("identified");
		expect(identifiedKindOf(settled[0])).toBe("ais-json");
		expect(settled[1]?.status).toBe("rejected");
		expect(rejectionOf(settled[1])).toBe("unknown-format");

		session.stop();
	});

	test("gives byte-identical selections the same identity regardless of name or media type", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "salary-certificate.pdf",
					bytes: createForm16PdfFixture(),
				},
			]),
		);

		await waitUntilSettled(session);
		const firstIdentity = intakeDocuments(session)[0]?.documentId;
		if (firstIdentity === undefined) {
			throw new Error("first candidate missing");
		}

		session.send({
			kind: "remove-source-document",
			documentId: firstIdentity,
		});
		await waitFor(() => intakeDocuments(session)[0]?.status === "removed");

		session.send(
			selectCommand([
				{
					displayName: "mislabeled-name.json",
					suppliedMediaType: "application/json",
					bytes: createForm16PdfFixture(),
				},
			]),
		);

		await waitUntilSettled(session);
		const documents = intakeDocuments(session);
		expect(documents.length).toBe(2);
		expect(documents[0]?.status).toBe("removed");
		expect(documents[1]?.displayName).toBe("mislabeled-name.json");
		expect(identifiedKindOf(documents[1])).toBe("form16-pdf");
		expect(documents[1]?.documentId).toBe(firstIdentity);

		session.stop();
	});

	test("gives different bytes sharing a filename different identities", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "form16.pdf",
					bytes: createForm16PdfFixture(),
				},
				{
					displayName: "form16.pdf",
					bytes: createForm16PdfFixture(["extra synthetic line"]),
				},
			]),
		);

		await waitUntilSettled(session);
		const documents = intakeDocuments(session);
		const [first, second] = documents;
		expect(first?.documentId).toBeDefined();
		expect(second?.documentId).toBeDefined();
		expect(first?.documentId).not.toBe(second?.documentId);
		expect(first?.displayName).toBe("form16.pdf");
		expect(second?.displayName).toBe("form16.pdf");
		expect(first?.status).toBe("identified");
		expect(second?.status).toBe("identified");

		session.stop();
	});

	test("ignores a re-selection of byte-identical content while the candidate exists", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "ais.json",
					bytes: utf8Bytes(createAisJsonFixture()),
				},
			]),
		);
		await waitUntilSettled(session);

		session.send(
			selectCommand([
				{
					displayName: "ais.json",
					bytes: utf8Bytes(createAisJsonFixture()),
				},
			]),
		);
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(intakeDocuments(session).length).toBe(1);

		session.stop();
	});
});

describe("rejected documents contribute nothing", () => {
	test("a rejected candidate carries its issue and carries no observations or facts", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "unknown.bin",
					bytes: createUnknownBytesFixture(),
				},
			]),
		);
		await waitUntilSettled(session);

		const documents = intakeDocuments(session);
		const rejected = documents[0];
		expect(rejected?.status).toBe("rejected");
		expect(issueCodeOf(rejected)).toBe("DOCUMENT_UNKNOWN_FORMAT");
		expect(rejectionOf(rejected)).toBe("unknown-format");
		const candidateKeys = Object.keys(rejected ?? {}).sort();
		expect(candidateKeys).toEqual([
			"candidateKey",
			"displayName",
			"documentId",
			"issue",
			"rejection",
			"status",
		]);
		const snapshotKeys = Object.keys(session.getSnapshot()).sort();
		expect(snapshotKeys).not.toContain("observations");
		expect(snapshotKeys).not.toContain("taxFacts");

		const modelSnapshot = session.getSnapshot();
		if (modelSnapshot.kind === "document-intake") {
			const rejectedCandidate = modelSnapshot.documents.find(
				(doc) => doc.status === "rejected",
			);
			expect(rejectedCandidate?.issue.severity).toBe("blocking");
			expect(rejectedCandidate?.issue.affectedDocumentIds).toEqual([
				rejected?.documentId,
			]);
			expect(rejectedCandidate?.issue.recoveryAction).toContain("supported");
		}

		session.stop();
	});
});


describe("every rejection class reaches the session snapshot distinctly", () => {
	const rejectionCases = [
		{
			displayName: "locked.pdf",
			bytes: (): Uint8Array<ArrayBuffer> => createEncryptedPdfFixture(),
			rejection: "encrypted",
			issueCode: "FILE_ENCRYPTED",
		},
		{
			displayName: "torn.pdf",
			bytes: (): Uint8Array<ArrayBuffer> => createDamagedPdfFixture(),
			rejection: "damaged",
			issueCode: "DOCUMENT_DAMAGED",
		},
		{
			displayName: "scan.pdf",
			bytes: (): Uint8Array<ArrayBuffer> => createImageOnlyPdfFixture(),
			rejection: "image-only",
			issueCode: "DOCUMENT_IMAGE_ONLY",
		},
		{
			displayName: "conflicting.pdf",
			bytes: (): Uint8Array<ArrayBuffer> => createAmbiguousPdfFixture(),
			rejection: "ambiguous",
			issueCode: "DOCUMENT_AMBIGUOUS_MATCH",
		},
		{
			displayName: "bank-statement.csv",
			bytes: (): Uint8Array<ArrayBuffer> =>
				utf8Bytes(createPrivateStatementCsvFixture()),
			rejection: "private-institution",
			issueCode: "DOCUMENT_PRIVATE_INSTITUTION_TEMPLATE",
		},
	] as const;

	for (const rejectionCase of rejectionCases) {
		test(`rejects ${rejectionCase.rejection} with ${rejectionCase.issueCode}`, async () => {
			const session = createEligibleSession();

			session.send(
				selectCommand([
					{ displayName: rejectionCase.displayName, bytes: rejectionCase.bytes() },
				]),
			);
			await waitUntilSettled(session, 20_000);

			const rejected = intakeDocuments(session)[0];
			expect(rejected?.status).toBe("rejected");
			expect(rejectionOf(rejected)).toBe(rejectionCase.rejection);
			expect(issueCodeOf(rejected)).toBe(rejectionCase.issueCode);
			const modelSnapshot = session.getSnapshot();
			if (modelSnapshot.kind === "document-intake") {
				const rejectedCandidate = modelSnapshot.documents.find(
					(doc) => doc.status === "rejected",
				);
				expect(rejectedCandidate?.issue.severity).toBe("blocking");
				expect(rejectedCandidate?.issue.affectedDocumentIds).toEqual([
					rejected?.documentId,
				]);
			}

			session.stop();
		});
	}
});

describe("cancellation and removal timing", () => {
	type GatedCall = Readonly<{
		resolve: (outcome: DocumentInspectionOutcome) => void;
	}>;

	const createGatedFacility = () => {
		const calls: GatedCall[] = [];
		return {
			facility: {
				inspect: (): Promise<DocumentInspectionOutcome> =>
					new Promise<DocumentInspectionOutcome>((resolve) => {
						calls.push({ resolve });
					}),
			},
			calls,
		};
	};

	const createGatedSession = () => {
		const { facility, calls } = createGatedFacility();
		const session = createSessionOrchestrator({
			rulePack: itr1Ay202627RulePack,
			inspection: facility,
		});
		session.send({
			kind: "answer-eligibility-question",
			questionId: itr1Ay202627RulePack.question.id,
			answer: "yes",
			executionContext: { answerTime: fixedAnswerTime },
		});
		return { session, calls };
	};

	test("cancelling active inspection ignores any late inspection result", async () => {
		const { session, calls } = createGatedSession();

		session.send(
			selectCommand([
				{ displayName: "slow.json", bytes: utf8Bytes(createAisJsonFixture()) },
			]),
		);
		await waitFor(() => intakeDocuments(session)[0]?.status === "inspecting");

		const documentId = intakeDocuments(session)[0]?.documentId;
		if (documentId === undefined) {
			throw new Error("candidate missing");
		}
		session.send({ kind: "cancel-document-inspection", documentId });
		await waitFor(() => intakeDocuments(session)[0]?.status === "cancelled");

		const settledOutcome: DocumentInspectionOutcome = {
			kind: "identified",
			document: {
				documentKind: parseDocumentKind("ais-json"),
				templateRevision: parseTemplateRevision("2026-27"),
			},
			adapter: { adapterId: "ais-json", adapterVersion: "1" },
		};
		calls[0]?.resolve(settledOutcome);
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(intakeDocuments(session)[0]?.status).toBe("cancelled");
		expect(identifiedKindOf(intakeDocuments(session)[0])).toBe("");

		session.stop();
	});

	test("removing a candidate during inspection ignores any late inspection result", async () => {
		const { session, calls } = createGatedSession();

		session.send(
			selectCommand([
				{ displayName: "slow.json", bytes: utf8Bytes(createAisJsonFixture()) },
			]),
		);
		await waitFor(() => intakeDocuments(session)[0]?.status === "inspecting");

		const documentId = intakeDocuments(session)[0]?.documentId;
		if (documentId === undefined) {
			throw new Error("candidate missing");
		}
		session.send({ kind: "remove-source-document", documentId });
		await waitFor(() => intakeDocuments(session)[0]?.status === "removed");

		const settledOutcome: DocumentInspectionOutcome = {
			kind: "identified",
			document: {
				documentKind: parseDocumentKind("ais-json"),
				templateRevision: parseTemplateRevision("2026-27"),
			},
			adapter: { adapterId: "ais-json", adapterVersion: "1" },
		};
		calls[0]?.resolve(settledOutcome);
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(intakeDocuments(session)[0]?.status).toBe("removed");

		session.stop();
	});

	test("a queued candidate can be removed before inspection starts", async () => {
		const { session } = createGatedSession();

		session.send(
			selectCommand([
				{ displayName: "later.json", bytes: utf8Bytes(createAisJsonFixture()) },
				{ displayName: "first.json", bytes: createUnknownBytesFixture() },
			]),
		);
		await waitFor(() => {
			const documents = intakeDocuments(session);
			return documents.length === 2 && documents[0]?.status !== "queued";
		});

const removedId = intakeDocuments(session)[1]?.documentId;
		if (removedId === undefined) {
			throw new Error("candidate missing");
		}
		session.send({ kind: "remove-source-document", documentId: removedId });
		await waitFor(() => intakeDocuments(session)[1]?.status === "removed");

		expect(intakeDocuments(session)[1]?.displayName).toBe("first.json");

		session.stop();
	});
});

describe("selection order independence", () => {
	test("documents added in different orders reach the same per-identity outcomes", async () => {
		const runSelections = async (
			order: readonly ("ais" | "unknown")[],
		): Promise<Map<string, string>> => {
			const session = createEligibleSession();
			const bytesFor = (kind: "ais" | "unknown"): Uint8Array<ArrayBuffer> =>
				kind === "ais"
					? utf8Bytes(createAisJsonFixture())
					: createUnknownBytesFixture();
			session.send(
				selectCommand(
					order.map((kind) => ({
						displayName: `${kind}.file`,
						bytes: bytesFor(kind),
					})),
				),
			);
			await waitUntilSettled(session);
			const outcomes = new Map(
				intakeDocuments(session).map((doc) => [
					String(doc.documentId),
					`${doc.status}:${identifiedKindOf(doc)}${rejectionOf(doc) ?? ""}`,
				]),
			);
			session.stop();
			return outcomes;
		};

		const forward = await runSelections(["ais", "unknown"]);
		const backward = await runSelections(["unknown", "ais"]);

		expect(backward.size).toBe(forward.size);
		for (const [identity, outcome] of forward) {
			expect(backward.get(identity)).toBe(outcome);
		}
	});
});
