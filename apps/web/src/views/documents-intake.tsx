import type {
	CandidateDocument,
	DocumentExtractionRecord,
	DocumentKind,
	TemplateRevision,
} from "@openitr/model";
import {
	Alert,
	Button,
	Card,
	CardBody,
	CardTitle,
	Label,
	MultipleFileUpload,
	MultipleFileUploadMain,
	Stack,
	Title,
} from "@patternfly/react-core";
import type { LabelProps } from "@patternfly/react-core";

import type { SessionOrchestrator } from "../session/session-orchestrator";

const CANDIDATE_STATUS_PRESENTATION: Readonly<
	Record<
		CandidateDocument["status"],
		Readonly<{
			label: string;
			status: NonNullable<LabelProps["status"]>;
		}>
	>
> = Object.freeze({
	queued: Object.freeze({ label: "Queued", status: "info" }),
	inspecting: Object.freeze({ label: "Inspecting", status: "info" }),
	identified: Object.freeze({ label: "Identified", status: "success" }),
	rejected: Object.freeze({ label: "Rejected", status: "danger" }),
	cancelled: Object.freeze({ label: "Cancelled", status: "warning" }),
	removed: Object.freeze({ label: "Removed", status: "custom" }),
});

const formatDocumentType = (
	documentKind: DocumentKind,
	templateRevision: TemplateRevision,
): string => `${documentKind} (${templateRevision})`;

const candidateDetailLine = (candidate: CandidateDocument): string => {
	switch (candidate.status) {
		case "identified":
			return `Document type: ${formatDocumentType(
				candidate.identification.documentKind,
				candidate.identification.templateRevision,
			)}`;
		case "rejected":
			return `${String(candidate.issue.code)} — ${candidate.issue.recoveryAction}`;
		case "queued":
		case "inspecting":
		case "cancelled":
		case "removed":
			return "";
		default: {
			const _exhaustive: never = candidate;
			return _exhaustive;
		}
	}
};

const extractionStatusLine = (
	record: DocumentExtractionRecord | undefined,
): string => {
	switch (record?.status) {
		case "extracting":
			return "Extracting observations…";
		case "done": {
			const parts = [
				`${record.observations.length} salary observation${record.observations.length === 1 ? "" : "s"}`,
			];
			if (record.nonSalaryIncomeObservations.length > 0) {
				parts.push(
					`${record.nonSalaryIncomeObservations.length} non-salary income`,
				);
			}
			if (record.tdsObservations.length > 0) {
				parts.push(`${record.tdsObservations.length} TDS`);
			}
			if (record.taxPaymentObservations.length > 0) {
				parts.push(
					`${record.taxPaymentObservations.length} tax payment${record.taxPaymentObservations.length === 1 ? "" : "s"}`,
				);
			}
			const issueNote =
				record.issues.length > 0
					? `, ${record.issues.length} review item${record.issues.length === 1 ? "" : "s"}`
					: "";
			return `${parts.join(", ")}${issueNote}`;
		}
		case "failed":
			return `Observation extraction failed (${String(record.issue.code)})`;
		default:
			return "";
	}
};

export const DocumentsIntakeView = ({
	session,
	documents,
	extractions,
}: Readonly<{
	session: SessionOrchestrator;
	documents: readonly CandidateDocument[];
	extractions: readonly DocumentExtractionRecord[];
}>) => {
	const handleFiles = async (files: readonly File[]): Promise<void> => {
		if (files.length === 0) {
			return;
		}
		const selected = await Promise.all(
			files.map(async (file) => ({
				displayName: file.name,
				...(file.type === "" ? {} : { suppliedMediaType: file.type }),
				readBytes: () =>
					file.arrayBuffer().then(
						(buffer) =>
							new Uint8Array(buffer) as Uint8Array<ArrayBuffer>,
					),
			})),
		);
		session.send({ kind: "select-source-documents", documents: selected });
	};

	const activeCount = documents.filter(
		(candidate) =>
			candidate.status === "inspecting" || candidate.status === "queued",
	).length;

	return (
		<Card className="openitr-documents-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Select source documents
				</Title>
			</CardTitle>
			<CardBody>
				<Stack hasGutter>
					<Alert isInline title="Your documents stay in this browser" variant="info">
						OpenITR inspects every file locally in this tab. No document bytes,
						file names, or extracted values leave your browser.
					</Alert>

					<MultipleFileUpload
						aria-label="Select source documents"
						onFileDrop={(_event, files) => {
							void handleFiles(files);
						}}
					>
						<MultipleFileUploadMain
							browseButtonText="Browse source documents"
							infoText="Supported formats include PDF, JSON, CSV, XLS, XLSX, and TXT."
							titleText="Drag and drop source documents here"
							titleTextSeparator="or"
						/>
					</MultipleFileUpload>

					{(() => {
						const extractingCount = extractions.filter(
							(record) => record.status === "extracting",
						).length;
						const doneCount = extractions.filter(
							(record) => record.status === "done",
						).length;
						return (
							<p aria-live="polite" className="openitr-document-live">
								{activeCount > 0
									? `Inspecting ${activeCount} document${activeCount === 1 ? "" : "s"}`
									: "No inspections running"}
								{extractingCount > 0
									? ` · Extracting observations from ${extractingCount}`
									: ""}
								{doneCount > 0
									? ` · ${doneCount} document${doneCount === 1 ? "" : "s"} ready for review`
									: ""}
							</p>
						);
					})()}

					<ul className="openitr-document-list">
						{documents.map((candidate) => {
							const presentation =
								CANDIDATE_STATUS_PRESENTATION[candidate.status];
							const detail = candidateDetailLine(candidate);
							return (
								<li
									className="openitr-document-row"
									data-candidate={candidate.displayName}
									data-status={candidate.status}
									key={candidate.candidateKey}
								>
									<Label isCompact status={presentation.status}>
										{presentation.label}
									</Label>
									<span className="openitr-document-summary">
										<strong>{candidate.displayName}</strong>
										{detail ? <small>{detail}</small> : null}
									</span>
									{(candidate.status === "queued" ||
										candidate.status === "inspecting") && (
										<Button
											onClick={() =>
												session.send({
													kind: "cancel-document-inspection",
													documentId: candidate.documentId,
												})
											}
											variant="link"
										>
											Cancel inspection
										</Button>
									)}
									{(() => {
										const extractionLine = extractionStatusLine(
											extractions.find(
												(record) =>
													record.candidateKey === candidate.candidateKey,
											),
										);
										return extractionLine ? (
											<small className="openitr-extraction-status">
												{extractionLine}
											</small>
										) : null;
									})()}
									{candidate.status !== "removed" && (
										<Button
											onClick={() =>
												session.send({
													kind: "remove-source-document",
													documentId: candidate.documentId,
												})
											}
											variant="secondary"
										>
											Remove
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				</Stack>
			</CardBody>
		</Card>
	);
};
