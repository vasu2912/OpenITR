import {
	Alert,
	Button,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

import { buildFinalReview } from "../session/final-review-model";
import type {
	DocumentIntakeSnapshot,
	SessionOrchestrator,
} from "../session/session-orchestrator";

const originLabels = Object.freeze({
	"source-observation": "Source observation",
	"user-attestation": "User attestation",
	"conflict-resolution": "Conflict resolution",
	derived: "Derived fact",
});

const computationIssuesOf = (
	intake: DocumentIntakeSnapshot,
): readonly Readonly<{
	id: string;
	label: string;
	affectedResults: readonly string[];
}>[] => {
	const results: {
		label: string;
		computation:
			| DocumentIntakeSnapshot["oldRegimeComputation"]
			| DocumentIntakeSnapshot["newRegimeComputation"];
	}[] = [
		{ label: "Old regime", computation: intake.oldRegimeComputation },
		{ label: "New regime", computation: intake.newRegimeComputation },
	];
	return results.flatMap(({ label, computation }) =>
		computation === undefined || computation.kind === "computed"
			? []
			: computation.issues.map((issue) => ({
					id: `${label}-${String(issue.code)}`,
					label: `${String(issue.code)}: ${issue.recoveryAction}`,
					affectedResults: Object.freeze([label]),
				})),
	);
};

export const FinalReviewView = ({
	intake,
	session,
}: Readonly<{
	intake: DocumentIntakeSnapshot;
	session: SessionOrchestrator;
}>) => {
	const comparison = intake.regimeComparison;
	const derivedNodes = [
		...(intake.oldRegimeComputation?.kind === "computed"
			? intake.oldRegimeComputation.nodes
			: []),
		...(intake.newRegimeComputation?.kind === "computed"
			? intake.newRegimeComputation.nodes
			: []),
	];
	const review = buildFinalReview({
		acceptedFacts: intake.acceptedFacts,
		answers: intake.factAnswers,
		resolutions: intake.factResolutions,
		extractions: intake.extractions,
		derivedNodes,
		missingQuestions: intake.questionnaire.questions.map((question) => ({
			id: String(question.id),
			factKey: question.suppliesFact,
			prompt: question.prompt,
			affectedResult: question.affectedResult,
		})),
		conflicts: intake.factConflicts,
		analysisScope: intake.analysisScope,
		computationIssues: computationIssuesOf(intake),
	});
	const blockingItems = review.openItems.filter(
		(item) => item.kind !== "warning",
	);
	const currentRevision =
		comparison?.kind === "computed" ? comparison.factSetRevision : undefined;
	const hasCurrentPrimary =
		currentRevision !== undefined &&
		intake.primaryRegime?.factSetRevision === currentRevision;
	const confirmation =
		intake.finalReviewConfirmation?.factSetRevision === currentRevision
			? intake.finalReviewConfirmation
			: undefined;
	const canConfirm =
		currentRevision !== undefined &&
		hasCurrentPrimary &&
		blockingItems.length === 0 &&
		intake.pendingRecomputation.kind === "idle";

	return (
		<Card className="openitr-final-review" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Final fact and evidence review
				</Title>
			</CardTitle>
			<CardBody>
				<p>
					Inspect the accepted facts, their provenance, transformations, and
					downstream uses before confirming this analysis.
				</p>
				<p className="openitr-final-review-revision">
					{currentRevision === undefined
						? "A fact-set revision will appear when both regime calculations are ready."
						: `Fact-set revision ${currentRevision}`}
				</p>

				{review.openItems.length === 0 ? (
					<Alert isInline title="No unresolved review items" variant="success">
						The grouped facts below are ready for final review.
					</Alert>
				) : (
					<Alert
						isInline
						title="Warnings and unresolved review items"
						variant="warning"
					>
						<ul className="openitr-final-review-open-items">
							{review.openItems.map((item) => (
								<li key={item.id}>
									<strong>{item.label}</strong>
									<br />
									Affects: {item.affectedResults.join(", ")}
									{item.targetId === undefined ? null : (
										<>
											{" · "}
											<a href={`#${item.targetId}`}>Review item</a>
										</>
									)}
								</li>
							))}
						</ul>
					</Alert>
				)}

				<div className="openitr-final-review-topics">
					{review.topics.map((topic) => (
						<section aria-labelledby={`final-review-${topic.id}`} key={topic.id}>
							<h3 id={`final-review-${topic.id}`}>{topic.label}</h3>
							{topic.facts.length === 0 ? (
								<p>No accepted facts in this topic.</p>
							) : (
								<ul className="openitr-final-review-facts">
									{topic.facts.map((fact) => (
										<li data-origin={fact.originKind} key={fact.id}>
											<header>
												<code>{fact.factKey}</code>
												<strong>{fact.value}</strong>
											</header>
											<dl>
												<div>
													<dt>Origin</dt>
													<dd>
														{originLabels[fact.originKind]} · {fact.origin}
													</dd>
												</div>
												<div>
													<dt>Evidence</dt>
													<dd>{fact.evidence}</dd>
												</div>
												<div>
													<dt>Transformation</dt>
													<dd>{fact.transformation}</dd>
												</div>
												<div>
													<dt>Downstream use</dt>
													<dd>
														{fact.downstreamUses.length === 0
															? "No direct downstream use recorded"
															: fact.downstreamUses.join(", ")}
													</dd>
												</div>
											</dl>
											{fact.targetId === undefined ? null : (
								<a href={`#${fact.targetId}`}>
									Return to source or decision
								</a>
											)}
										</li>
									))}
								</ul>
							)}
						</section>
					))}
				</div>

				<div className="openitr-final-review-confirmation">
					<Button
						isDisabled={!canConfirm || confirmation !== undefined}
						onClick={() =>
							session.send({
								kind: "confirm-final-review",
								executionContext: { confirmedAt: new Date().toISOString() },
							})
						}
						variant="primary"
					>
						Confirm reviewed fact set
					</Button>
					<p aria-live="polite">
						{confirmation !== undefined
							? `Confirmed revision ${confirmation.factSetRevision} at ${confirmation.confirmedAt}. This confirmation exists only in this browser session.`
							: !hasCurrentPrimary
								? "Choose a primary regime scenario before confirming."
								: blockingItems.length > 0
									? "Resolve the listed items before confirming."
									: "This confirmation is stored only for the current fact-set revision and session."}
					</p>
				</div>
			</CardBody>
		</Card>
	);
};
