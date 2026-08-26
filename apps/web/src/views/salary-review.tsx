import type {
	BankInterestObservation,
	DocumentExtractionRecord,
	NonSalaryIncomeObservation,
	ObservationTransformationStep,
	SalaryObservation,
	TaxPaymentObservation,
	TdsObservation,
} from "@openitr/model";
import { epayChallanReferenceOf } from "@openitr/model";
import {
	Alert,
	Button,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";
import { useState } from "react";

import { rupeeFormat } from "./computation-trace-view";

type PagesList = Extract<DocumentExtractionRecord, { status: "done" }>["pages"];

const rupeeDisplay = new Intl.NumberFormat("en-IN", {
	maximumFractionDigits: 2,
});

// One view-model entry per extracted observation regardless of which slice
// produced it, so every card renders the same way while its slice decides
// which labelled group it appears under.
type ReviewObservation = Readonly<{
	observationId: string;
	factKey: string;
	valueText: string;
	evidenceText: string;
	transformationSteps: readonly ObservationTransformationStep[];
	ruleId: string;
	ruleDescription: string;
	evidence:
		| SalaryObservation["evidence"]
		| NonSalaryIncomeObservation["evidence"]
		| BankInterestObservation["evidence"]
		| TaxPaymentObservation["evidence"]
		| TdsObservation["evidence"];
	recordDetails?: readonly Readonly<{ label: string; value: string }>[];
}>;

// Exact-money values stay strings all the way into grouped display text.
const moneyDisplay = (value: string): string => rupeeFormat(value);

const salaryToReview = (observation: SalaryObservation): ReviewObservation => ({
	observationId: observation.observationId,
	factKey: String(observation.factKey),
	valueText: rupeeDisplay.format(observation.normalizedValue),
	evidenceText: observation.originalText,
	transformationSteps: observation.transformationSteps,
	ruleId: String(observation.ruleCitation.ruleId),
	ruleDescription: observation.ruleCitation.description,
	evidence: observation.evidence,
});

const nonSalaryIncomeToReview = (
	observation: NonSalaryIncomeObservation,
): ReviewObservation => ({
	observationId: observation.observationId,
	factKey: String(observation.factKey),
	valueText: moneyDisplay(observation.normalizedValue),
	evidenceText: observation.originalText,
	transformationSteps: observation.transformationSteps,
	ruleId: String(observation.ruleCitation.ruleId),
	ruleDescription: observation.ruleCitation.description,
	evidence: observation.evidence,
});

const bankInterestToReview = (
	observation: BankInterestObservation,
): ReviewObservation => ({
	observationId: observation.observationId,
	factKey: String(observation.factKey),
	valueText: moneyDisplay(observation.normalizedValue),
	evidenceText: observation.originalValue,
	transformationSteps: observation.transformationSteps,
	ruleId: String(observation.ruleCitation.ruleId),
	ruleDescription: observation.ruleCitation.description,
	evidence: observation.evidence,
});

const tdsToReview = (observation: TdsObservation): ReviewObservation => ({
	observationId: observation.observationId,
	factKey: String(observation.factKey),
	valueText: moneyDisplay(observation.normalizedValue),
	evidenceText: observation.originalValue,
	transformationSteps: observation.transformationSteps,
	ruleId: String(observation.ruleCitation.ruleId),
	ruleDescription: observation.ruleCitation.description,
	evidence: observation.evidence,
});

const taxPaymentToReview = (
	observation: TaxPaymentObservation,
): ReviewObservation => ({
	observationId: observation.observationId,
	factKey: String(observation.factKey),
	valueText: moneyDisplay(observation.normalizedValue),
	evidenceText: observation.originalValue,
	transformationSteps: observation.transformationSteps,
	ruleId: String(observation.ruleCitation.ruleId),
	ruleDescription: observation.ruleCitation.description,
	evidence: observation.evidence,
	recordDetails: [
		{
			label: "Challan identity",
			value: epayChallanReferenceOf(observation.record),
		},
		{ label: "Type of payment", value: observation.record.typeOfPaymentLabel },
		{ label: "Taxpayer", value: `${observation.record.taxpayerName} (${observation.record.taxpayerPan})` },
		{
			label: "Bank reference",
			value: observation.record.bankReferenceNumber,
		},
	],
});

const ObservationEvidencePanel = ({
	observation,
	pages,
}: Readonly<{
	observation: ReviewObservation;
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
				text === observation.evidenceText ||
				text.includes(observation.evidenceText),
		};
	} else if (evidence.kind === "json-pointer") {
		locator = {
			heading: "Evidence — JSON Pointer",
			description: `Evidence location: ${evidence.pointer}`,
			lines: [
				{
					lineNumber: 1,
					text: observation.evidenceText,
				},
			],
			isEvidenceLine: (): boolean => true,
		};
	} else if (evidence.kind === "text-line-range") {
		locator = {
			heading: "Evidence — Statement lines",
			description: `Evidence location: lines ${evidence.firstLine} to ${evidence.lastLine}`,
			lines: [
				{
					lineNumber: evidence.firstLine,
					text: observation.evidenceText,
				},
			],
			isEvidenceLine: (): boolean => true,
		};
	} else if (evidence.kind === "spreadsheet-cell") {
		locator = {
			heading: "Evidence — Spreadsheet cell",
			description: `Evidence location: sheet ${evidence.sheet}, cell ${evidence.cell}`,
			lines: [
				{
					lineNumber: evidence.rowNumber,
					text: observation.evidenceText,
				},
			],
			isEvidenceLine: (): boolean => true,
		};
	} else if (evidence.kind === "csv-record-column") {
		locator = {
			heading: "Evidence — CSV record",
			description: `Evidence location: line ${evidence.line}, column "${evidence.columnHeader}"`,
			lines: [
				{
					lineNumber: evidence.line,
					text: evidence.rawValue,
				},
			],
			isEvidenceLine: (): boolean => true,
		};
	} else {
		const _exhaustive: never = evidence;
		throw new Error(
			`Unsupported observation evidence locator: ${String(_exhaustive)}`,
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
}: Readonly<{ observation: ReviewObservation; pages: PagesList }>) => {
	const [evidenceOpen, setEvidenceOpen] = useState(false);
	const detailsId = `evidence-${observation.observationId}`;
	return (
		<article className="openitr-observation" data-fact-key={observation.factKey}>
			<header className="openitr-observation-header">
				<strong>{observation.factKey}</strong>
				<span className="openitr-observation-value">
					₹ {observation.valueText}
				</span>
			</header>
			<p className="openitr-observation-original">
				Original text: <q>{observation.evidenceText}</q>
			</p>
			{observation.recordDetails ? (
				<dl className="openitr-observation-details">
					{observation.recordDetails.map((detail) => (
						<div key={detail.label}>
							<dt>{detail.label}:</dt>
							<dd>
								<code>{detail.value}</code>
							</dd>
						</div>
					))}
				</dl>
			) : null}
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
				Field definition {observation.ruleId}: {observation.ruleDescription}
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

type ObservationGroup = Readonly<{
	label: string;
	role:
		| "salary-income"
		| "bank-interest-income"
		| "non-salary-income"
		| "taxes-paid"
		| "tax-payments";
	observations: readonly ReviewObservation[];
}>;

const groupsOfRecord = (
	record: Extract<DocumentExtractionRecord, { status: "done" }>,
): readonly ObservationGroup[] => [
	{
		label: "Salary evidence",
		role: "salary-income",
		observations: record.observations.map(salaryToReview),
	},
	{
		label: "Bank-interest evidence",
		role: "bank-interest-income",
		observations: record.bankInterestObservations.map(bankInterestToReview),
	},
	{
		label: "Non-salary income evidence",
		role: "non-salary-income",
		observations: record.nonSalaryIncomeObservations.map(
			nonSalaryIncomeToReview,
		),
	},
	{
		label: "Tax-paid evidence",
		role: "taxes-paid",
		observations: record.tdsObservations.map(tdsToReview),
	},
	{
		label: "Tax payment evidence",
		role: "tax-payments",
		observations: record.taxPaymentObservations.map(taxPaymentToReview),
	},
];

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
					Extracted observations
				</Title>
			</CardTitle>
			<CardBody>
				<Alert
					isInline
					title="Review every observation against its evidence"
					variant="info"
				>
					Each value below was read locally from your documents. The original
					text stays beside the normalized value, and every normalization
					step is listed in order. Income evidence and tax-paid evidence are
					listed separately because they feed different totals.
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
						{groupsOfRecord(record).map(
							(group) =>
								group.observations.length > 0 && (
									<div
										className="openitr-review-group"
										data-evidence-role={group.role}
										key={group.label}
									>
										<h3 className="openitr-review-group-heading">
											{group.label}
										</h3>
										{group.observations.map((observation) => (
											<ObservationCard
												key={observation.observationId}
												observation={observation}
												pages={record.pages}
											/>
										))}
									</div>
								),
						)}
						{record.observations.length === 0 &&
						record.nonSalaryIncomeObservations.length === 0 &&
						record.tdsObservations.length === 0 &&
						record.taxPaymentObservations.length === 0 ? (
							<p>No observations could be extracted from this document.</p>
						) : null}
					</section>
				))}
			</CardBody>
		</Card>
	);
};
