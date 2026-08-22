import type {
	CandidateDocument,
	DocumentKind,
	TemplateRevision,
} from "@openitr/model";
import {
	Alert,
	Button,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";
import type { ChangeEvent } from "react";

import type { SessionOrchestrator } from "../session/session-orchestrator";

const CANDIDATE_STATUS_PRESENTATION: Readonly<
	Record<
		CandidateDocument["status"],
		Readonly<{ marker: string; label: string }>
	>
> = Object.freeze({
	queued: Object.freeze({ marker: "•", label: "Queued" }),
	inspecting: Object.freeze({ marker: "⟳", label: "Inspecting" }),
	identified: Object.freeze({ marker: "✓", label: "Identified" }),
	rejected: Object.freeze({ marker: "✗", label: "Rejected" }),
	cancelled: Object.freeze({ marker: "⊘", label: "Cancelled" }),
	removed: Object.freeze({ marker: "—", label: "Removed" }),
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

export const DocumentsIntakeView = ({
	session,
	documents,
}: Readonly<{
	session: SessionOrchestrator;
	documents: readonly CandidateDocument[];
}>) => {
	const handleFiles = async (
		event: ChangeEvent<HTMLInputElement>,
	): Promise<void> => {
		const fileList = event.target.files;
		if (fileList === null || fileList.length === 0) {
			return;
		}
		const selected = await Promise.all(
			[...fileList].map(async (file) => ({
				displayName: file.name,
				...(file.type === ""
					? {}
					: { suppliedMediaType: file.type }),
				bytes: new Uint8Array(await file.arrayBuffer()),
			})),
		);
		event.target.value = "";
		session.send({
			kind: "select-source-documents",
			documents: selected,
		});
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
				<Alert
					className="openitr-privacy-note"
					isInline
					title="Your documents stay in this browser"
					variant="info"
				>
					OpenITR inspects every file locally in this tab. No document bytes,
					file names, or extracted values leave your browser.
				</Alert>

				<form className="openitr-document-form">
					<label className="openitr-document-label" htmlFor="document-input">
						Add one or more source documents, in any order
					</label>
					<input
						className="openitr-document-input"
						id="document-input"
						multiple
						onChange={(event) => {
							void handleFiles(event);
						}}
						type="file"
					/>
				</form>

				<p aria-live="polite" className="openitr-document-live">
					{activeCount > 0
						? `Inspecting ${activeCount} document${activeCount === 1 ? "" : "s"}`
						: "No inspections running"}
				</p>

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
								<span
									aria-hidden="true"
									className="openitr-document-marker"
									data-status={candidate.status}
								>
									{presentation.marker}
								</span>
								<span className="openitr-document-summary">
									<strong>{candidate.displayName}</strong>
									<small>
										{presentation.label}
										{detail ? ` — ${detail}` : ""}
									</small>
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
			</CardBody>
		</Card>
	);
};
