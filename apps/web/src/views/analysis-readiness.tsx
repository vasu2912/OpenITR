import {
	Alert,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

import type { AnalysisReadiness } from "../session/analysis-readiness";
import { readinessPresentationOf } from "./analysis-readiness-presentation";

export const AnalysisReadinessView = ({
	readiness,
}: Readonly<{ readiness: AnalysisReadiness }>) => {
	const state = readinessPresentationOf(readiness);
	return (
		<Card className="openitr-analysis-readiness" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Analysis readiness
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title={state.title} variant={state.variant}>
					{state.explanation} This status describes educational analysis only. It
					does not mean filing-ready, portal-accepted, or guaranteed correct.
				</Alert>

				{readiness.issues.length === 0 ? null : (
					<section aria-labelledby="readiness-issues-heading">
						<h3 id="readiness-issues-heading">Items affecting readiness</h3>
						<ul className="openitr-readiness-issues">
							{readiness.issues.map((issue) => (
								<li key={issue.id}>
									<strong>{issue.explanation}</strong>
									<p>
										Facts: {issue.factKeys.length === 0 ? "Not applicable" : issue.factKeys.join(", ")}
									</p>
									<p>Affects: {issue.affectedResults.join(", ")}</p>
									<p>
										Next step: {issue.recoveryAction}
										{issue.targetId === undefined ? null : (
											<>
												{" "}
												<a href={`#${issue.targetId}`}>Review this item</a>
											</>
										)}
									</p>
								</li>
							))}
						</ul>
					</section>
				)}

				<section aria-labelledby="available-analysis-heading">
					<h3 id="available-analysis-heading">
						{readiness.state === "analysis-ready"
							? "Available analysis results"
							: "Available partial analysis"}
					</h3>
					{readiness.availableResults.length === 0 ? (
						<p>No partial calculation is available yet.</p>
					) : (
						<ul className="openitr-available-results">
							{readiness.availableResults.map((result) => (
								<li key={result.id}>
									<strong>{result.label}</strong>
									<p>Limit: {result.limitation}</p>
								</li>
							))}
						</ul>
					)}
				</section>

				<section aria-labelledby="educational-limits-heading">
					<h3 id="educational-limits-heading">Educational limits</h3>
					<ul>
						{readiness.educationalLimitations.map((limitation) => (
							<li key={limitation}>{limitation}</li>
						))}
					</ul>
				</section>
			</CardBody>
		</Card>
	);
};
