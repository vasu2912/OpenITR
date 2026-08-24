import type {
	DocumentExtractionRecord,
	SalaryObservation,
} from "@openitr/model";
import {
	Alert,
	Button,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";
import { useState } from "react";

type PagesList = Extract<DocumentExtractionRecord, { status: "done" }>["pages"];

const rupeeDisplay = new Intl.NumberFormat("en-IN", {
	maximumFractionDigits: 0,
});

const ObservationEvidencePanel = ({
	observation,
	pages,
}: Readonly<{
	observation: SalaryObservation;
	pages: PagesList;
}>) => {
	const evidence = observation.evidence;
	let locator: {
		heading: string;
		description: string;
		lines: PagesList[number]["lines"];
		isEvidenceLine: (text: string) => boolean;
	};
	if (evidence.kind === "pdf-page-region") {
		const page = pages.find((candidate) => candidate.page === evidence.page);
		locator = {
			heading: `Evidence — Page ${evidence.page}`,
			description: `Evidence location: Page ${evidence.page} · x ${evidence.x} · y ${evidence.y} · width ${Math.round(evidence.width)} pt · height ${Math.round(evidence.height)} pt`,
			lines: page?.lines ?? [],
			isEvidenceLine: (text: string): boolean =>
				text === observation.originalText,
		};
	} else if (evidence.kind === "json-pointer") {
		locator = {
			heading: "Evidence — JSON Pointer",
			description: `Evidence location: ${evidence.pointer}`,
			lines: [
				{
					lineNumber: 1,
					text: observation.originalText,
				},
			],
			isEvidenceLine: (): boolean => true,
		};
	} else {
		const _exhaustive: never = evidence;
		throw new Error(
			`Unsupported salary evidence locator: ${String(_exhaustive)}`,
		);
	}
	return (
		<div
			aria-label={`Evidence for ${observation.factKey}`}
			className="openitr-evidence-panel"
			id={`evidence-${observation.observationId}`}
			role="region"
		>
			<p className="openitr-evidence-heading">{locator.heading}</p>
			<p className="openitr-evidence-locator">{locator.description}</p>
			<ol className="openitr-evidence-lines">
				{locator.lines.map((line) => {
					const isEvidence = locator.isEvidenceLine(line.text);
					return (
						<li
							aria-current={isEvidence ? "location" : undefined}
							className="openitr-evidence-line"
							data-evidence-current={isEvidence ? "true" : undefined}
							key={line.lineNumber}
						>
							<span aria-hidden="true" className="openitr-evidence-marker">
								{isEvidence ? "▸" : " "}
							</span>
							<span className="openitr-evidence-number">
								{line.lineNumber}
							</span>
							<span className="openitr-evidence-text">
								{isEvidence ? <strong>{line.text}</strong> : line.text}
							</span>
						</li>
					);
				})}
			</ol>
		</div>
	);
};

const ObservationCard = ({
	observation,
	pages,
}: Readonly<{ observation: SalaryObservation; pages: PagesList }>) => {
	const [evidenceOpen, setEvidenceOpen] = useState(false);
	const detailsId = `evidence-${observation.observationId}`;
	return (
		<article className="openitr-observation" data-fact-key={observation.factKey}>
			<header className="openitr-observation-header">
				<strong>{observation.factKey}</strong>
				<span className="openitr-observation-value">
					₹ {rupeeDisplay.format(observation.normalizedValue)}
				</span>
			</header>
			<p className="openitr-observation-original">
				Original text: <q>{observation.originalText}</q>
			</p>
			<details className="openitr-observation-steps">
				<summary>Normalization steps</summary>
				<ol className="openitr-step-list">
					{observation.transformationSteps.map((step) => (
						<li key={step.order}>
							<code>{step.operation}</code> ({step.order}):{" "}
							<q>{step.input}</q> → <q>{step.output}</q>
						</li>
					))}
				</ol>
			</details>
			<p className="openitr-observation-rule">
				Field definition {observation.ruleCitation.ruleId}:{" "}
				{observation.ruleCitation.description}
			</p>
			<Button
				aria-controls={detailsId}
				aria-expanded={evidenceOpen}
				isInline
				onClick={() => setEvidenceOpen((open) => !open)}
				variant="link"
			>
				{evidenceOpen ? "Hide evidence" : "Show evidence"}
			</Button>
			{evidenceOpen ? (
				<ObservationEvidencePanel observation={observation} pages={pages} />
			) : null}
		</article>
	);
};

export const SalaryReviewView = ({
	extractions,
}: Readonly<{ extractions: readonly DocumentExtractionRecord[] }>) => {
	const doneRecords = extractions.filter((record) => record.status === "done");
	if (doneRecords.length === 0) {
		return null;
	}

	return (
		<Card className="openitr-review-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Extracted salary observations
				</Title>
			</CardTitle>
			<CardBody>
				<Alert
					isInline
					title="Review every observation against its evidence"
					variant="info"
				>
					Each value below was read locally from your document. The original
					text stays beside the normalized value, and every normalization step
					is listed in order.
				</Alert>
				{doneRecords.map((record) => (
					<section
						className="openitr-review-document"
						data-document-id={record.documentId}
						key={record.candidateKey}
					>
						{record.issues.map((issue, issueIndex) => (
							<Alert
								key={`${String(issue.code)}-${issueIndex}`}
								title={`${String(issue.code)}: ${issue.affectedFactKeys.join(", ")}`}
								variant="warning"
							>
								{issue.recoveryAction}
							</Alert>
						))}
						{record.observations.length === 0 ? (
							<p>No salary fields could be extracted from this document.</p>
						) : (
							record.observations.map((observation) => (
								<ObservationCard
									key={observation.observationId}
									observation={observation}
									pages={record.pages}
								/>
							))
						)}
					</section>
				))}
			</CardBody>
		</Card>
	);
};
