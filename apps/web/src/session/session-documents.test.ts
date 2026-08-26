import type {
	BankInterestObservation,
	CandidateDocument,
	DocumentExtractionOutcome,
	DocumentInspectionOutcome,
	SalaryObservation,
	Sha256Digest,
} from "@openitr/model";
import {
	DOCUMENT_REVIEW_ISSUE_CODES,
	parseDocumentKind,
	parseExactMoney,
	parseFactKey,
	parseRuleId,
	parseTemplateRevision,
} from "@openitr/model";
import {
	createAisCsvBankInterestFixture,
	createAisJsonBankInterestFixture,
	createAisJsonFixture,
	createAmbiguousPdfFixture,
	createDamagedPdfFixture,
	createEpayTaxPdfFixture,
	createEncryptedPdfFixture,
	createForm16PdfFixture,
	createForm16APdfFixture,
	createImageOnlyPdfFixture,
	createPrivateStatementCsvFixture,
	createForm16SalaryPdfFixture,
	createForm26AsTextFixture,
	createUnknownBytesFixture,
	utf8Bytes,
} from "@openitr/document-adapters/testing";
import { describe, expect, test } from "vitest";

import {
	createSessionOrchestrator,
} from "./session-orchestrator";
import type { DocumentProcessingFacility } from "./session-orchestrator";
import type {
	SessionCommand,
	SessionOrchestrator,
} from "./session-orchestrator";
import { inProcessInspectionFacility } from "./in-process-inspection-facility";
import { itr1Ay202627RulePack } from "@openitr/itr1-ay2026-27";

const fixedAnswerTime = "2026-08-22T00:00:00.000Z";

const readerOf = (bytes: Uint8Array<ArrayBuffer>) => (): Promise<Uint8Array<ArrayBuffer>> =>
		Promise.resolve(bytes);

const createEligibleSession = () => {
	const session = createSessionOrchestrator({
		rulePack: itr1Ay202627RulePack,
		documents: inProcessInspectionFacility(),
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
	documents: files.map((file) => ({
		displayName: file.displayName,
		...(file.suppliedMediaType === undefined
			? {}
			: { suppliedMediaType: file.suppliedMediaType }),
		readBytes: readerOf(file.bytes),
	})),
});

const intakeDocuments = (
	session: SessionOrchestrator,
): readonly CandidateDocument[] => {
	const snapshot = session.getSnapshot();
	return snapshot.kind === "document-intake" ? snapshot.documents : [];
};

const extractionRecords = (session: SessionOrchestrator) => {
	const snapshot = session.getSnapshot();
	return snapshot.kind === "document-intake" ? snapshot.extractions : [];
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

describe("cross-source conflict resolution", () => {
	const estimateOf = (session: SessionOrchestrator) => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake"
			? snapshot.estimateComputation
			: undefined;
	};
	const salaryOf = (session: SessionOrchestrator) => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake"
			? snapshot.salaryComputation
			: undefined;
	};
	const intakeSnapshot = (session: SessionOrchestrator) => {
		const snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("expected the document-intake stage");
		}
		return snapshot;
	};

	const selectSalaryAndAisSources = (
		session: SessionOrchestrator,
		csvSavingsAmount: string,
	): void => {
		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(createAisJsonBankInterestFixture()),
				},
				{
					displayName: "openitr-sentinel-ais-export.csv",
					bytes: utf8Bytes(
						createAisCsvBankInterestFixture({
							bankInterestRows: [
								{
									recordCategory: "SAVINGS_ACCOUNT",
									institutionName: "OpenITR Synthetic Bank",
									maskedAccountNumber: "XXXXXX0001",
									interestAmount: csvSavingsAmount,
								},
								{
									recordCategory: "DEPOSITS",
									institutionName: "OpenITR Synthetic Co-operative Bank",
									maskedAccountNumber: "XXXXXX0002",
									interestAmount: "45,678.90",
								},
							],
						}),
					),
				},
				{
					displayName: "openitr-sentinel-26as-export.txt",
					bytes: utf8Bytes(createForm26AsTextFixture()),
				},
			]),
		);
	};

	const waitUntilAllExtracted = async (session: SessionOrchestrator) => {
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 4 &&
				records.every((record) => record.status === "done")
			);
		});
	};

	test("identical values from an AIS JSON and an AIS CSV export coexist without a conflict", async () => {
		const session = createEligibleSession();

		selectSalaryAndAisSources(session, "7,890.25");
		await waitUntilAllExtracted(session);

		const snapshot = intakeSnapshot(session);
		expect(snapshot.factConflicts).toEqual([]);
		expect(snapshot.factResolutions).toEqual([]);

		const estimate = estimateOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		// The shared savings value enters once, not once per source.
		expect(estimate.summary.bankInterestTotal).toBe("53569.15");

		session.stop();
	});

	test("disagreeing sources create one conflict naming both documents and the blocked result", async () => {
		const session = createEligibleSession();

		selectSalaryAndAisSources(session, "9,000.00");
		await waitUntilAllExtracted(session);

		const snapshot = intakeSnapshot(session);
		expect(snapshot.factConflicts).toHaveLength(1);
		const conflict = snapshot.factConflicts[0];
		if (conflict === undefined) {
			throw new Error("expected a conflict");
		}
		expect(String(conflict.factKey)).toBe("bank-interest.savings-account");
		expect(conflict.attestationPermitted).toBe(true);
		const sourceDocuments = new Set(
			conflict.candidates.map((candidate) =>
				String(candidate.sourceDocumentId),
			),
		);
		expect(sourceDocuments.size).toBe(2);
		for (const candidate of conflict.candidates) {
			expect(candidate.value).toMatch(/^(7890\.25|9000)$/);
		}
		expect(conflict.affectedResults).toEqual([
			{
				resultId: "refund-or-payable-estimate",
				label: "Estimated refund or amount payable",
			},
		]);

		// Only the disputed fact blocks the estimate; the salary scenario
		// needs no bank-interest facts and still computes.
		expect(salaryOf(session)?.kind).toBe("computed");
		const estimate = estimateOf(session);
		expect(estimate?.kind).toBe("blocked");
		if (estimate?.kind !== "blocked") {
			throw new Error("expected a blocked estimate");
		}
		expect(
			estimate.issues.some(
				(issue) => String(issue.code) === "FACT_TAX_FACT_CONFLICTED",
			),
		).toBe(true);

		session.stop();
	});

	test("resolving by selecting a source's value stores a separate resolution fact and unblocks the estimate", async () => {
		const session = createEligibleSession();

		selectSalaryAndAisSources(session, "9,000.00");
		await waitUntilAllExtracted(session);
		const before = intakeSnapshot(session);

		const jsonRecord = before.extractions.find(
			(record) =>
				record.status === "done" && record.bankInterestObservations.length > 0,
		);
		if (jsonRecord?.status !== "done") {
			throw new Error("expected a done AIS record");
		}
		const jsonObservation = jsonRecord.bankInterestObservations.find(
			(observation) =>
				String(observation.factKey) === "bank-interest.savings-account" &&
				jsonRecord.documentId === observation.sourceDocumentId &&
				observation.normalizedValue === "7890.25",
		);
		if (jsonRecord.status !== "done" || jsonObservation === undefined) {
			throw new Error("expected the JSON savings observation");
		}
		const conflictGroup = before.factConflicts.find(
			(conflict) => String(conflict.factKey) === "bank-interest.savings-account",
		);
		if (conflictGroup === undefined) {
			throw new Error("expected the savings-account conflict");
		}

		session.send({
			kind: "resolve-fact-conflict",
			groupId: conflictGroup.groupId,
			choice: { kind: "observed", observationId: jsonObservation.observationId },
			reason: "The JSON export matches the bank statement I checked.",
			executionContext: { recordedAt: fixedAnswerTime },
		});

		const after = intakeSnapshot(session);
		expect(after.factConflicts).toEqual([]);
		expect(after.factResolutions).toHaveLength(1);
		const resolution = after.factResolutions[0];
		if (resolution === undefined) {
			throw new Error("expected a stored resolution");
		}
		expect(resolution.groupId).toBe(conflictGroup.groupId);
		expect(resolution.choice).toEqual({
			kind: "observed",
			observationId: jsonObservation.observationId,
			value: "7890.25",
		});
		expect(resolution.reason).toContain("JSON export");
		expect(resolution.recordedAt).toBe(fixedAnswerTime);

		// Original evidence is untouched: every observation, issue, and page
		// stays exactly as extracted.
		expect(after.extractions).toEqual(before.extractions);

		const estimate = estimateOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		expect(estimate.summary.bankInterestTotal).toBe("53569.15");

		session.stop();
	});

	test("attesting a permitted value resolves the conflict and feeds the attested amount", async () => {
		const session = createEligibleSession();

		selectSalaryAndAisSources(session, "9,000.00");
		await waitUntilAllExtracted(session);
		const conflictGroup = intakeSnapshot(session).factConflicts.find(
			(conflict) => String(conflict.factKey) === "bank-interest.savings-account",
		);
		if (conflictGroup === undefined) {
			throw new Error("expected the savings-account conflict");
		}

		session.send({
			kind: "resolve-fact-conflict",
			groupId: conflictGroup.groupId,
			choice: { kind: "attested", value: "8000" },
			reason: "The bank confirmed 8,000 by letter.",
			executionContext: { recordedAt: fixedAnswerTime },
		});

		const after = intakeSnapshot(session);
		expect(after.factConflicts).toEqual([]);
		const estimate = estimateOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		expect(estimate.summary.bankInterestTotal).toBe("53678.9");

		session.stop();
	});

	test("a resolution without a reason is refused", async () => {
		const session = createEligibleSession();

		selectSalaryAndAisSources(session, "9,000.00");
		await waitUntilAllExtracted(session);

		const conflictGroup = intakeSnapshot(session).factConflicts.find(
			(conflict) => String(conflict.factKey) === "bank-interest.savings-account",
		);
		if (conflictGroup === undefined) {
			throw new Error("expected the savings-account conflict");
		}
		expect(() =>
			session.send({
				kind: "resolve-fact-conflict",
				groupId: conflictGroup.groupId,
				choice: { kind: "attested", value: "8000" },
				reason: "   ",
				executionContext: { recordedAt: fixedAnswerTime },
			}),
		).toThrow(/reason/i);

		session.stop();
	});

	test("removing the disagreeing source re-evaluates the conflict away", async () => {
		const session = createEligibleSession();

		selectSalaryAndAisSources(session, "9,000.00");
		await waitUntilAllExtracted(session);
		expect(intakeSnapshot(session).factConflicts).toHaveLength(1);

		const csvCandidate = intakeDocuments(session).find(
			(candidate) =>
				candidate.displayName === "openitr-sentinel-ais-export.csv",
		);
		if (csvCandidate === undefined) {
			throw new Error("CSV candidate missing");
		}
		session.send({
			kind: "remove-source-document",
			documentId: csvCandidate.documentId,
		});
		await waitFor(
			() => intakeSnapshot(session).factConflicts.length === 0,
		);

		const estimate = estimateOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		expect(estimate.summary.bankInterestTotal).toBe("53569.15");

		session.stop();
	});

	const selectTrioPlusReceipts = (
		session: SessionOrchestrator,
		receipts: readonly {
			displayName: string;
			bytes: Uint8Array<ArrayBuffer>;
		}[],
	): void => {
		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(createAisJsonBankInterestFixture()),
				},
				{
					displayName: "openitr-sentinel-26as-export.txt",
					bytes: utf8Bytes(createForm26AsTextFixture()),
				},
				...receipts,
			]),
		);
	};

	test("agreeing reprints of one paid challan coalesce so the payment counts once", async () => {
		const session = createEligibleSession();

		selectTrioPlusReceipts(session, [
			{
				displayName: "openitr-sentinel-epay-tax-receipt.pdf",
				bytes: createEpayTaxPdfFixture(),
			},
			{
				displayName: "openitr-sentinel-epay-tax-receipt-reprint.pdf",
				bytes: createEpayTaxPdfFixture({
					bankReference: "OPENITRBNK7654321",
				}),
			},
		]);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 5 &&
				records.every((record) => record.status === "done")
			);
		});

		const snapshot = intakeSnapshot(session);
		expect(snapshot.factConflicts).toEqual([]);
		const estimate = estimateOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		// 61,250 deposits plus the single 45,670 challan payment.
		expect(estimate.summary.taxesPaid).toBe("106920");
		expect(estimate.acceptedTaxPayments).toHaveLength(1);

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

type GatedCall = Readonly<{
	stage: "inspect" | "extract";
	signal: AbortSignal;
	resolve: (outcome: DocumentInspectionOutcome | DocumentExtractionOutcome) => void;
}>;

const createGatedFacility = (): {
	facility: DocumentProcessingFacility;
	calls: GatedCall[];
} => {
	const calls: GatedCall[] = [];
	const gated =
		(stage: "inspect" | "extract") =>
		(
			_input: unknown,
			signal: AbortSignal,
		): Promise<DocumentInspectionOutcome | DocumentExtractionOutcome> =>
			new Promise((resolve, reject) => {
				calls.push({ stage, signal, resolve });
				if (signal.aborted) {
					reject(new DOMException("Inspection cancelled", "AbortError"));
					return;
				}
				signal.addEventListener("abort", () => {
					reject(new DOMException("Inspection cancelled", "AbortError"));
				});
			});
	return {
		facility: {
			inspect: gated("inspect") as DocumentProcessingFacility["inspect"],
			extract: gated("extract") as DocumentProcessingFacility["extract"],
		},
		calls,
	};
};

const createGatedSession = () => {
	const { facility, calls } = createGatedFacility();
	const session = createSessionOrchestrator({
		rulePack: itr1Ay202627RulePack,
		documents: facility,
	});
	session.send({
		kind: "answer-eligibility-question",
		questionId: itr1Ay202627RulePack.question.id,
		answer: "yes",
		executionContext: { answerTime: fixedAnswerTime },
	});
	return { session, calls };
};

const createIdentifiedGatedSession = async () => {
	const { session, calls } = createGatedSession();

	session.send(
		selectCommand([
			{
				displayName: "openitr-sentinel-form16.pdf",
				bytes: utf8Bytes("irrelevant-for-gated"),
			},
		]),
	);
	await waitFor(() => calls.some((call) => call.stage === "inspect"));

	calls
		.filter((call) => call.stage === "inspect")
		.forEach((call) =>
			call.resolve({
				kind: "identified",
				document: {
					documentKind: parseDocumentKind("form16-pdf"),
					templateRevision: parseTemplateRevision("2026-27"),
				},
				adapter: { adapterId: "form16-pdf", adapterVersion: "1" },
			} satisfies DocumentInspectionOutcome),
		);
	return { session, calls };
};

describe("cancellation and removal timing", () => {
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

describe("observation extraction lifecycle", () => {
	test("extracts salary observations automatically after identification", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		const record = extractionRecords(session)[0];
		expect(record?.status).toBe("done");
		if (record?.status !== "done") {
			throw new Error("extraction did not complete");
		}
		expect(record.observations.map((o) => o.normalizedValue)).toEqual([
			150000,
			1200000,
			1050000,
		]);
		expect(record.issues).toEqual([]);
		expect(record.pages[0]?.lines.length).toBe(8);

		session.stop();
	});

	test("extracts bank-interest observations from an identified AIS JSON document", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(createAisJsonBankInterestFixture()),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		const record = extractionRecords(session)[0];
		expect(record?.status).toBe("done");
		if (record?.status !== "done") {
			throw new Error("extraction did not complete");
		}
		expect(record.observations).toEqual([]);
		expect(
			record.bankInterestObservations.map((observation) => {
				const { evidence } = observation;
				if (evidence.kind !== "json-pointer") {
					throw new Error(
						"an AIS JSON observation must carry JSON Pointer evidence",
					);
				}
				return [
					observation.factKey,
					String(observation.normalizedValue),
					evidence.pointer,
				];
			}),
		).toEqual([
			[
				"bank-interest.deposits",
				"45678.9",
				"/interestInformation/bankInterest/1",
			],
			[
				"bank-interest.savings-account",
				"7890.25",
				"/interestInformation/bankInterest/0",
			],
		]);
		expect(record.issues).toEqual([]);

		session.stop();
	});

	test("extracts bank-interest observations from an identified AIS CSV document", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-ais-export.csv",
					bytes: utf8Bytes(createAisCsvBankInterestFixture()),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		const record = extractionRecords(session)[0];
		expect(record?.status).toBe("done");
		if (record?.status !== "done") {
			throw new Error("extraction did not complete");
		}
		expect(record.observations).toEqual([]);
		expect(
			record.bankInterestObservations.map((observation) => {
				const { evidence } = observation;
				if (evidence.kind !== "csv-record-column") {
					throw new Error(
						"an AIS CSV observation must carry CSV record evidence",
					);
				}
				return [
					observation.factKey,
					String(observation.normalizedValue),
					[
						evidence.line,
						evidence.columnIndex,
						evidence.columnHeader,
						evidence.rawValue,
					],
				];
			}),
		).toEqual([
			[
				"bank-interest.deposits",
				"45678.9",
				[6, 3, "interestAmount", '"45,678.90"'],
			],
			[
				"bank-interest.savings-account",
				"7890.25",
				[5, 3, "interestAmount", '"7,890.25"'],
			],
		]);
		expect(record.issues).toEqual([]);

		session.stop();
	});

	test("extracts tax-deducted-at-source observations from an identified Form 26AS text document", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-26as-export.txt",
					bytes: utf8Bytes(createForm26AsTextFixture()),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		const record = extractionRecords(session)[0];
		expect(record?.status).toBe("done");
		if (record?.status !== "done") {
			throw new Error("extraction did not complete");
		}
		expect(record.observations).toEqual([]);
		expect(record.bankInterestObservations).toEqual([]);
		expect(
			record.tdsObservations.map((observation) => [
				observation.factKey,
				String(observation.normalizedValue),
				observation.evidence.kind === "text-line-range"
					? [observation.evidence.firstLine, observation.evidence.lastLine]
					: undefined,
			]),
		).toEqual([
			["tds.amount-paid-credited", "1000000", [7, 7]],
			["tds.tax-deducted", "50000", [7, 7]],
			["tds.tds-deposited", "48750", [7, 7]],
			["tds.amount-paid-credited", "250000", [8, 8]],
			["tds.tds-deposited", "12500", [8, 8]],
		]);
		expect(record.issues).toEqual([]);

		session.stop();
	});

	test("extracts non-salary income and tax-paid observations from an identified Form 16A certificate", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16a-certificate.pdf",
					bytes: createForm16APdfFixture(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		const record = extractionRecords(session)[0];
		expect(record?.status).toBe("done");
		if (record?.status !== "done") {
			throw new Error("extraction did not complete");
		}
		expect(record.observations).toEqual([]);
		expect(record.bankInterestObservations).toEqual([]);
		expect(
			record.nonSalaryIncomeObservations.map((observation) => [
				observation.factKey,
				String(observation.normalizedValue),
				observation.evidence.kind,
			]),
		).toEqual([
			["non-salary-income.dividends", "25000", "pdf-page-region"],
			[
				"non-salary-income.interest-other-than-securities",
				"120000",
				"pdf-page-region",
			],
		]);
		expect(
			record.tdsObservations.map((observation) => [
				observation.factKey,
				String(observation.normalizedValue),
			]),
		).toEqual([
			["tds.tax-deducted", "12000"],
			["tds.tds-deposited", "12000"],
			["tds.tax-deducted", "2500"],
		]);
		expect(record.issues).toEqual([]);

		session.stop();
	});

	test("a rejected file produces no extraction record or observations", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{ displayName: "unknown.bin", bytes: createUnknownBytesFixture() },
			]),
		);
		await waitUntilSettled(session);

		expect(intakeDocuments(session)[0]?.status).toBe("rejected");
		expect(extractionRecords(session)).toEqual([]);

		session.stop();
	});

	test("cancelling during extraction ignores a late worker response", async () => {
		const { session, calls } = await createIdentifiedGatedSession();

		await waitFor(() => calls.some((call) => call.stage === "extract"));
		await waitFor(
			() => extractionRecords(session)[0]?.status === "extracting",
		);

		const documentId = intakeDocuments(session)[0]?.documentId;
		if (documentId === undefined) {
			throw new Error("candidate missing");
		}
		session.send({ kind: "cancel-document-inspection", documentId });
		await waitFor(() => extractionRecords(session).length === 0);

		calls
			.filter((call) => call.stage === "extract")
			.forEach((call) =>
				call.resolve({
					kind: "extracted",
					taxPaymentObservations: [],
					observations: [
						fakeObservation(documentId, "salary.section-17-1", 1),
					],
					bankInterestObservations: [],
					tdsObservations: [],
					nonSalaryIncomeObservations: [],
					issues: [],
					pages: [],
				} satisfies DocumentExtractionOutcome),
			);
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(extractionRecords(session)).toEqual([]);

		session.stop();
	});

	test("removing an extracting candidate ignores a late worker response", async () => {
		const { session, calls } = await createIdentifiedGatedSession();

		await waitFor(() => calls.some((call) => call.stage === "extract"));
		const documentId = intakeDocuments(session)[0]?.documentId;
		if (documentId === undefined) {
			throw new Error("candidate missing");
		}

		session.send({ kind: "remove-source-document", documentId });
		await waitFor(() => extractionRecords(session).length === 0);

		calls
			.filter((call) => call.stage === "extract")
			.forEach((call) =>
				call.resolve({
					kind: "extracted",
					taxPaymentObservations: [],
					observations: [
						fakeObservation(documentId, "salary.section-17-1", 1),
					],
					bankInterestObservations: [],
					tdsObservations: [],
					nonSalaryIncomeObservations: [],
					issues: [],
					pages: [],
				} satisfies DocumentExtractionOutcome),
			);
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(extractionRecords(session)).toEqual([]);
		expect(intakeDocuments(session)[0]?.status).toBe("removed");

		session.stop();
	});
});

const createForm16SalaryPdfFixtureBytes = (): Uint8Array<ArrayBuffer> =>
	createForm16SalaryPdfFixture();

const fakeObservation = (
	documentId: Sha256Digest,
	factKey: string,
	value: number,
): SalaryObservation => ({
	observationId: `${factKey}@${documentId}`,
	factKey: parseFactKey(factKey),
	sourceDocumentId: documentId,
	adapterId: "form16-pdf",
	adapterVersion: "1",
	originalText: "x",
	normalizedValue: value,
	transformationSteps: [],
	evidence: { kind: "pdf-page-region", page: 1, x: 0, y: 0, width: 1, height: 1 },
	ruleCitation: { ruleId: parseRuleId("FORM16-PARTA-TAXABLE-SALARY"), description: "d" },
});

const fakeBankInterestObservation = (
	documentId: Sha256Digest,
	factKey: string,
	amount: string,
): BankInterestObservation => ({
	observationId: `${factKey}@${documentId}:/interestInformation/bankInterest/0`,
	factKey: parseFactKey(factKey),
	sourceDocumentId: documentId,
	adapterId: "ais-json",
	adapterVersion: "1",
	originalValue: JSON.stringify(amount),
	normalizedValue: parseExactMoney(amount),
	transformationSteps: [],
	evidence: {
		kind: "json-pointer",
		pointer: "/interestInformation/bankInterest/0",
	},
	ruleCitation: {
		ruleId: parseRuleId("AIS-BANK-INTEREST-SAVINGS-ACCOUNT"),
		description: "AIS bank-interest record",
	},
	record: {
		institutionName: "OpenITR Synthetic Bank",
		maskedAccountNumber: "XXXXXX0001",
	},
});

describe("new-regime salary computation exposure", () => {
	const salaryComputationOf = (session: SessionOrchestrator) => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake"
			? snapshot.salaryComputation
			: undefined;
	};

	test("exposes a computed scenario once accepted observations arrive", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		expect(salaryComputationOf(session)?.kind).toBe("computed");
		const computation = salaryComputationOf(session);
		if (computation?.kind !== "computed") {
			throw new Error("expected a computed salary scenario");
		}
		expect(computation.scenario).toBe(
			"one-employer-new-regime-salary-fy-2025-26",
		);
		expect(computation.summary.salaryTotal).toBe("1200000");
		expect(computation.summary.finalTaxLiability).toBe("0");
		expect(computation.rulePackRevision).toBe(
			itr1Ay202627RulePack.identity.revision,
		);

		session.stop();
	});

	test("stays absent until an extraction record exists", async () => {
		const { session } = await createIdentifiedGatedSession();

		expect(salaryComputationOf(session)).toBeUndefined();

		session.stop();
	});

	test("excludes observations under review issues and blocks instead of guessing", async () => {
		const { session, calls } = await createIdentifiedGatedSession();

		await waitFor(() => calls.some((call) => call.stage === "extract"));
		const documentId = intakeDocuments(session)[0]?.documentId;
		if (documentId === undefined) {
			throw new Error("candidate missing");
		}
		calls
			.filter((call) => call.stage === "extract")
			.forEach((call) =>
				call.resolve({
					kind: "extracted",
					taxPaymentObservations: [],
					observations: [
						fakeObservation(documentId, "salary.section-17-1", 1200000),
						fakeObservation(documentId, "salary.section-17-1", 1300000),
						fakeObservation(
							documentId,
							"salary.taxable-total",
							1050000,
						),
					],
					bankInterestObservations: [],
					tdsObservations: [],
					nonSalaryIncomeObservations: [],
					issues: [
						{
							code: DOCUMENT_REVIEW_ISSUE_CODES.salaryFieldAmbiguous,
							severity: "review",
							affectedFactKeys: [parseFactKey("salary.section-17-1")],
							recoveryAction: "Select the official Form 16 download.",
						},
					],
					pages: [],
				} satisfies DocumentExtractionOutcome),
			);
		await waitFor(() => salaryComputationOf(session)?.kind === "blocked");

		const computation = salaryComputationOf(session);
		if (computation?.kind !== "blocked") {
			throw new Error("expected a blocked salary scenario");
		}
		expect(
			computation.issues.some(
				(issue) =>
					String(issue.code) === "FACT_SALARY_FIELD_MISSING" &&
					issue.affectedFactKeys.includes(parseFactKey("salary.section-17-1")),
			),
		).toBe(true);

		session.stop();
	});

	test("clears the computation when every document is removed", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		const documentId = intakeDocuments(session)[0]?.documentId;
		if (documentId === undefined) {
			throw new Error("candidate missing");
		}
		session.send({ kind: "remove-source-document", documentId });
		await waitFor(() => intakeDocuments(session)[0]?.status === "removed");

		expect(salaryComputationOf(session)).toBeUndefined();

		session.stop();
	});
});

describe("refund-or-payable estimate exposure", () => {
	const estimateComputationOf = (session: SessionOrchestrator) => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake"
			? snapshot.estimateComputation
			: undefined;
	};
	const salaryComputationOf = (session: SessionOrchestrator) => {
		const snapshot = session.getSnapshot();
		return snapshot.kind === "document-intake"
			? snapshot.salaryComputation
			: undefined;
	};

	const selectAllThreeDocuments = (
		session: SessionOrchestrator,
	): void => {
		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(createAisJsonBankInterestFixture()),
				},
				{
					displayName: "openitr-sentinel-26as-export.txt",
					bytes: utf8Bytes(createForm26AsTextFixture()),
				},
			]),
		);
	};

	const waitUntilAllExtracted = async (
		session: SessionOrchestrator,
	): Promise<void> => {
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 3 &&
				records.every((record) => record.status === "done")
			);
		});
	};

	test("reconciles all three accepted slices into one estimated refund", async () => {
		const session = createEligibleSession();

		selectAllThreeDocuments(session);
		await waitUntilAllExtracted(session);

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		expect(estimate.outcome).toEqual({
			kind: "estimated-refund",
			difference: "61250",
		});
		expect(estimate.summary.taxesPaid).toBe("61250");
		expect(estimate.rulePackRevision).toBe(
			itr1Ay202627RulePack.identity.revision,
		);

		session.stop();
	});

	test("blocks with the missing slices named while the salary scenario still computes", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => extractionRecords(session)[0]?.status === "done");

		expect(salaryComputationOf(session)?.kind).toBe("computed");

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("blocked");
		if (estimate?.kind !== "blocked") {
			throw new Error("expected a blocked estimate");
		}
		const codes = estimate.issues.map((issue) => String(issue.code));
		expect(codes).toContain("FACT_BANK_INTEREST_EVIDENCE_REQUIRED");
		expect(codes).toContain("FACT_TDS_EVIDENCE_REQUIRED");
		for (const issue of estimate.issues) {
			expect(issue.severity).toBe("blocking");
			expect(issue.recoveryAction.length).toBeGreaterThan(0);
		}

		session.stop();
	});

	test("excludes disputed bank-interest observations and names the review needed", async () => {
		const { session, calls } = await createIdentifiedGatedSession();

		await waitFor(() => calls.some((call) => call.stage === "extract"));
		const documentId = intakeDocuments(session)[0]?.documentId;
		if (documentId === undefined) {
			throw new Error("candidate missing");
		}
		calls
			.filter((call) => call.stage === "extract")
			.forEach((call) =>
				call.resolve({
					kind: "extracted",
					taxPaymentObservations: [],
					observations: [],
					bankInterestObservations: [
						fakeBankInterestObservation(
							documentId,
							"bank-interest.savings-account",
							"1000",
						),
						fakeBankInterestObservation(
							documentId,
							"bank-interest.savings-account",
							"2000",
						),
					],
					nonSalaryIncomeObservations: [],
					tdsObservations: [],
					issues: [
						{
							code: DOCUMENT_REVIEW_ISSUE_CODES.bankInterestRecordAmbiguous,
							severity: "review",
							affectedFactKeys: [
								parseFactKey("bank-interest.savings-account"),
							],
							recoveryAction: "Select the official AIS JSON export.",
						},
					],
					pages: [],
				} satisfies DocumentExtractionOutcome),
			);
		await waitFor(() => estimateComputationOf(session)?.kind === "blocked");

		const estimate = estimateComputationOf(session);
		if (estimate?.kind !== "blocked") {
			throw new Error("expected a blocked estimate");
		}
		expect(
			estimate.issues.some(
				(issue) =>
					String(issue.code) === "FACT_BANK_INTEREST_EVIDENCE_REQUIRED",
			),
		).toBe(true);

		// Observations the record's own review issue disputes never form
		// reconciliation groups: resolving them could not unblock anything.
		const snapshot = session.getSnapshot();
		expect(
			snapshot.kind === "document-intake" ? snapshot.factConflicts : [],
		).toEqual([]);

		session.stop();
	});

	test("two savings accounts in one export are distinct facts that add up", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(
						createAisJsonBankInterestFixture({
							bankInterestRecords: [
								{
									recordCategory: "SAVINGS_ACCOUNT",
									institutionName: "OpenITR Synthetic Bank",
									maskedAccountNumber: "XXXXXX0001",
									interestAmount: "1,000.00",
								},
								{
									recordCategory: "SAVINGS_ACCOUNT",
									institutionName: "OpenITR Synthetic Co-operative Bank",
									maskedAccountNumber: "XXXXXX0009",
									interestAmount: "2,000.00",
								},
							],
						}),
					),
				},
				{
					displayName: "openitr-sentinel-26as-export.txt",
					bytes: utf8Bytes(createForm26AsTextFixture()),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 3 &&
				records.every((record) => record.status === "done")
			);
		});

		const snapshot = session.getSnapshot();
		expect(
			snapshot.kind === "document-intake" ? snapshot.factConflicts : [],
		).toEqual([]);

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		// 1,000 + 2,000 of savings interest across two accounts, plus the
		// 45,678.90 deposits record absent from this export.
		expect(estimate.summary.bankInterestTotal).toBe("3000");

		session.stop();
	});

	test("reconciles Form 16A certificate evidence into the estimate when it is the only TDS source", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(createAisJsonBankInterestFixture()),
				},
				{
					displayName: "openitr-sentinel-form16a-certificate.pdf",
					bytes: createForm16APdfFixture(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 3 &&
				records.every((record) => record.status === "done")
			);
		});

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		expect(estimate.summary.nonSalaryIncomeTotal).toBe("145000");
		expect(estimate.summary.totalIncome).toBe("1173570");
		expect(estimate.summary.taxesPaid).toBe("12000");
		expect(estimate.outcome).toEqual({
			kind: "estimated-refund",
			difference: "12000",
		});
		expect(
			estimate.sources
				.filter((source) => source.role === "non-salary-income")
				.map((source) => String(source.factKey)),
		).toEqual([
			"non-salary-income.dividends",
			"non-salary-income.interest-other-than-securities",
		]);
		const taxesPaidSource = estimate.sources.find(
			(source) => source.role === "taxes-paid",
		);
		expect(taxesPaidSource?.sourceDocumentId).toBe(
			estimate.sources.find((source) => source.role === "non-salary-income")
				?.sourceDocumentId,
		);

		session.stop();
	});

	test("blocks rather than double-counting deposits across a tax-credit statement and a certificate", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(createAisJsonBankInterestFixture()),
				},
				{
					displayName: "openitr-sentinel-26as-export.txt",
					bytes: utf8Bytes(createForm26AsTextFixture()),
				},
				{
					displayName: "openitr-sentinel-form16a-certificate.pdf",
					bytes: createForm16APdfFixture(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 4 &&
				records.every((record) => record.status === "done")
			);
		});

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("blocked");
		if (estimate?.kind !== "blocked") {
			throw new Error("expected a blocked estimate");
		}
		const codes = estimate.issues.map((issue) => String(issue.code));
		expect(codes).toContain("FACT_TDS_MULTIPLE_DOCUMENTS");
		expect(codes).not.toContain("FACT_NON_SALARY_INCOME_MULTIPLE_DOCUMENTS");

		session.stop();
	});

	test("excludes an unrecognized section's receipt and deposit from the totals", async () => {
		const session = createEligibleSession();

		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-form16-salary.pdf",
					bytes: createForm16SalaryPdfFixtureBytes(),
				},
				{
					displayName: "openitr-sentinel-ais-export.json",
					bytes: utf8Bytes(createAisJsonBankInterestFixture()),
				},
				{
					displayName: "openitr-sentinel-form16a-certificate.pdf",
					bytes: createForm16APdfFixture({ addUnknownCategoryRow: true }),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 3 &&
				records.every((record) => record.status === "done")
			);
		});

		// The 194J row (gross 50,000, deposited 5,000) stays out of both
		// directions until a supported revision classifies it.
		const certificateRecord = extractionRecords(session)
			.filter((record) => record.status === "done")
			.find((record) =>
				record.nonSalaryIncomeObservations.some(
					(observation) =>
						observation.factKey ===
						"non-salary-income.interest-other-than-securities",
				),
			);
		if (certificateRecord?.status !== "done") {
			throw new Error("certificate extraction missing");
		}
		expect(certificateRecord.tdsObservations).toHaveLength(3);

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		expect(estimate.summary.nonSalaryIncomeTotal).toBe("145000");
		expect(estimate.summary.taxesPaid).toBe("12000");

		session.stop();
	});

	test("drops the estimate when a contributing document is removed", async () => {
		const session = createEligibleSession();

		selectAllThreeDocuments(session);
		await waitUntilAllExtracted(session);
		expect(estimateComputationOf(session)?.kind).toBe("computed");

		const aisCandidate = intakeDocuments(session).find(
			(candidate) =>
				candidate.displayName === "openitr-sentinel-ais-export.json",
		);
		if (aisCandidate === undefined) {
			throw new Error("AIS candidate missing");
		}
		session.send({
			kind: "remove-source-document",
			documentId: aisCandidate.documentId,
		});
		await waitFor(() =>
			intakeDocuments(session)
				.find((candidate) => candidate.candidateKey === aisCandidate.candidateKey)
				?.status === "removed",
		);

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("blocked");
		if (estimate?.kind !== "blocked") {
			throw new Error("expected a blocked estimate after removal");
		}
		expect(
			estimate.issues.some(
				(issue) =>
					String(issue.code) === "FACT_BANK_INTEREST_EVIDENCE_REQUIRED",
			),
		).toBe(true);

		session.stop();
	});

	test("feeds an accepted e-Pay Tax receipt into taxes paid and the estimated refund", async () => {
		const session = createEligibleSession();

		selectAllThreeDocuments(session);
		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-epay-tax-receipt.pdf",
					bytes: createEpayTaxPdfFixture(),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 4 &&
				records.every((record) => record.status === "done")
			);
		});

		const receiptRecord = extractionRecords(session).find(
			(record) =>
				record.status === "done" &&
				record.taxPaymentObservations.length > 0,
		);
		expect(receiptRecord?.status).toBe("done");
		if (receiptRecord?.status !== "done") {
			throw new Error("expected a done e-Pay Tax extraction record");
		}
		expect(receiptRecord.issues).toEqual([]);
		expect(receiptRecord.taxPaymentObservations).toHaveLength(1);

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		// 61,250 of accepted TDS deposits plus the 45,670 challan payment.
		expect(estimate.summary.taxesPaid).toBe("106920");
		expect(estimate.outcome).toEqual({
			kind: "estimated-refund",
			difference: "106920",
		});
		expect(
			estimate.acceptedTaxPayments.map(
				(receipt) => receipt.challanReference,
			),
		).toEqual(["BSR 0004321 · Serial 00517 · dated 26/03/2026"]);

		session.stop();
	});

	test("a receipt whose type of payment is unknown creates a review issue and no payment", async () => {
		const session = createEligibleSession();

		selectAllThreeDocuments(session);
		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-epay-tax-receipt.pdf",
					bytes: createEpayTaxPdfFixture({
						typeOfPayment: "(102) Surcharge",
					}),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 4 &&
				records.every((record) => record.status === "done")
			);
		});

		const receiptCandidate = intakeDocuments(session).find(
			(candidate) =>
				candidate.displayName === "openitr-sentinel-epay-tax-receipt.pdf",
		);
		if (receiptCandidate === undefined) {
			throw new Error("e-Pay Tax candidate missing");
		}
		const receiptRecord = extractionRecords(session).find(
			(record) => record.candidateKey === receiptCandidate.candidateKey,
		);
		expect(receiptRecord?.status).toBe("done");
		if (receiptRecord?.status !== "done") {
			throw new Error("expected a done e-Pay Tax extraction record");
		}
		expect(
			receiptRecord.issues.map((issue) => String(issue.code)),
		).toEqual(["DOCUMENT_EPAY_RECEIPT_TYPE_OF_PAYMENT_UNKNOWN"]);

		// The unknown receipt contributes nothing: taxes paid stay at the
		// statement's 61,250 deposits alone.
		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("computed");
		if (estimate?.kind !== "computed") {
			throw new Error("expected a computed estimate");
		}
		expect(estimate.summary.taxesPaid).toBe("61250");

		session.stop();
	});

	test("conflicts on one challan printed with two different amounts instead of counting either", async () => {
		const session = createEligibleSession();

		selectAllThreeDocuments(session);
		session.send(
			selectCommand([
				{
					displayName: "openitr-sentinel-epay-tax-receipt.pdf",
					bytes: createEpayTaxPdfFixture(),
				},
				{
					displayName: "openitr-sentinel-epay-tax-receipt-reprint.pdf",
					bytes: createEpayTaxPdfFixture({
						totalTaxPaid: "45,000",
					}),
				},
			]),
		);
		await waitUntilSettled(session);
		await waitFor(() => {
			const records = extractionRecords(session);
			return (
				records.length === 5 &&
				records.every((record) => record.status === "done")
			);
		});

		const snapshot = session.getSnapshot();
		if (snapshot.kind !== "document-intake") {
			throw new Error("expected the document-intake stage");
		}
		const paymentConflicts = snapshot.factConflicts.filter((conflict) =>
			String(conflict.factKey).startsWith("tax-payment."),
		);
		expect(paymentConflicts).toHaveLength(1);
		expect(paymentConflicts[0]?.attestationPermitted).toBe(false);
		expect(new Set(paymentConflicts[0]?.candidates.map((candidate) => candidate.value)).size).toBe(2);

		const estimate = estimateComputationOf(session);
		expect(estimate?.kind).toBe("blocked");
		if (estimate?.kind !== "blocked") {
			throw new Error("expected a blocked estimate");
		}
		expect(
			estimate.issues.some(
				(issue) => String(issue.code) === "FACT_TAX_FACT_CONFLICTED",
			),
		).toBe(true);

		session.stop();
	});
});
