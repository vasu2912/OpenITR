import type {
	CandidateDocument,
	DocumentExtractionRecord,
	DocumentKind,
	TemplateRevision,
} from "@openitr/model";
import type { LabelProps } from "@patternfly/react-core";
import {
	Alert,
	Button,
	Content,
	DataList,
	DataListAction,
	DataListCell,
	DataListItem,
	DataListItemCells,
	DataListItemRow,
	Label,
	MultipleFileUpload,
	MultipleFileUploadMain,
	Stack,
	Title,
} from "@patternfly/react-core";

import LockIcon from "@patternfly/react-icons/dist/esm/icons/lock-icon";
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

const documentKindNames: Readonly<Record<string, string>> = {
	"ais-csv": "Annual Information Statement (CSV)",
	"ais-json": "Annual Information Statement (JSON)",
	"epay-tax-receipt-pdf": "e-Pay Tax receipt (PDF)",
	"form16-pdf": "Form 16 (PDF)",
	"form16a-pdf": "Form 16A (PDF)",
	form26as: "Form 26AS",
	"form26as-text": "Form 26AS (text)",
	"prefilled-itr1-json": "Prefilled ITR-1 (JSON)",
};

const formatDocumentType = (
	documentKind: DocumentKind,
	templateRevision: TemplateRevision,
): string =>
	`${documentKindNames[documentKind] ?? documentKind} · template ${templateRevision}`;

const candidateDetailLine = (candidate: CandidateDocument): string => {
	switch (candidate.status) {
		case "identified":
			return formatDocumentType(
				candidate.identification.documentKind,
				candidate.identification.templateRevision,
			);
		case "rejected":
			return candidate.issue.recoveryAction;
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
					file
						.arrayBuffer()
						.then(
							(buffer) => new Uint8Array(buffer) as Uint8Array<ArrayBuffer>,
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
		<section className="openitr-documents-card">
			<Title headingLevel="h2" size="lg">
				Select source documents
			</Title>
			<Stack hasGutter>
				<Alert
					customIcon={<LockIcon />}
					isInline
					isPlain
					title="Your documents stay in this browser"
					variant="custom"
				>
					OpenITR reads every file in this tab. No file contents, names, or
					extracted values leave your device.
				</Alert>

				<MultipleFileUpload
					aria-label="Select source documents"
					onFileDrop={(_event, files) => {
						void handleFiles(files);
					}}
				>
					<MultipleFileUploadMain
						browseButtonText="Choose files"
						infoText="Form 16, Form 16A, AIS, Form 26AS, prefilled ITR-1 and e-Pay Tax receipts. PDF, JSON, CSV, XLS, XLSX or TXT."
						titleText="Drop your tax documents here"
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

				{documents.length === 0 ? null : (
					<DataList aria-label="Selected documents">
						{documents.map((candidate) => {
							const presentation =
								CANDIDATE_STATUS_PRESENTATION[candidate.status];
							const detail = candidateDetailLine(candidate);
							const extractionLine = extractionStatusLine(
								extractions.find(
									(record) => record.candidateKey === candidate.candidateKey,
								),
							);
							const isBusy =
								candidate.status === "queued" ||
								candidate.status === "inspecting";
							const nameId = `document-${candidate.candidateKey}-name`;
							return (
								<DataListItem
									aria-labelledby={nameId}
									data-candidate={candidate.displayName}
									data-status={candidate.status}
									key={candidate.candidateKey}
								>
									<DataListItemRow>
										<DataListItemCells
											dataListCells={[
												<DataListCell isFilled={false} key="status">
													<Label isCompact status={presentation.status}>
														{presentation.label}
													</Label>
												</DataListCell>,
												<DataListCell key="name" width={3}>
													<Stack>
														<strong id={nameId}>{candidate.displayName}</strong>
														{detail ? (
															<Content component="small">{detail}</Content>
														) : null}
														{candidate.status === "rejected" ? (
															<Content component="small">
																Code {String(candidate.issue.code)}
															</Content>
														) : null}
													</Stack>
												</DataListCell>,
												<DataListCell alignRight key="extraction" width={2}>
													<Content component="small">{extractionLine}</Content>
												</DataListCell>,
											]}
										/>
										<DataListAction
											aria-label="Document actions"
											aria-labelledby={nameId}
											id={`document-${candidate.candidateKey}-actions`}
										>
											{isBusy ? (
												<Button
													onClick={() =>
														session.send({
															kind: "cancel-document-inspection",
															documentId: candidate.documentId,
														})
													}
													variant="link"
												>
													Cancel
												</Button>
											) : null}
											{candidate.status === "removed" ? null : (
												<Button
													aria-label={`Remove ${candidate.displayName}`}
													isDanger
													onClick={() =>
														session.send({
															kind: "remove-source-document",
															documentId: candidate.documentId,
														})
													}
													variant="link"
												>
													Remove
												</Button>
											)}
										</DataListAction>
									</DataListItemRow>
								</DataListItem>
							);
						})}
					</DataList>
				)}
			</Stack>
		</section>
	);
};
