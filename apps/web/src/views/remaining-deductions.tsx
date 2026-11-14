import type {
	RemainingDeductionComputation,
	RemainingDeductionFact,
} from "@openitr/itr1-ay2026-27";
import { Alert, ExpandableSection, Title } from "@patternfly/react-core";

import { rupeeFormat, TraceDetail, TraceStep } from "./computation-trace-view";
import { keyed } from "./keyed";
import { FactLabel, IssueAlert } from "./plain-language";

const originLabel = (fact: RemainingDeductionFact): string =>
	fact.origin.kind === "attested-answer"
		? `Attested answer ${fact.origin.answerId}`
		: `Accepted evidence: ${fact.origin.sourceDocumentIds.join(", ")}`;

const valueLabel = (fact: RemainingDeductionFact): string =>
	typeof fact.value === "boolean"
		? fact.value
			? "Yes"
			: "No"
		: `₹ ${rupeeFormat(fact.value)}`;

export const RemainingDeductionsView = ({
	computation,
}: Readonly<{ computation: RemainingDeductionComputation | undefined }>) => {
	if (computation === undefined) return null;
	return (
		<section className="openitr-remaining-deductions-card">
			<Title headingLevel="h2" size="lg">
				Deposit-interest and remaining deductions
			</Title>{" "}
			<Alert isInline title="Named ITR-1 categories only" variant="info">
				OpenITR applies sections 80TTA and 80TTB once from the recorded interest
				and taxpayer category. Other supported sections use their named facts
				and pinned limits; no generic deduction amount is accepted.
			</Alert>
			{computation.kind !== "computed" ? (
				<div className="openitr-deduction-issues">
					{computation.issues.map((currentIssue) => (
						<IssueAlert issue={currentIssue} key={String(currentIssue.code)} />
					))}
				</div>
			) : (
				<>
					<h3>Deduction results</h3>
					<ul className="openitr-deduction-claims">
						{computation.results.map((result) => (
							<li key={result.section}>
								<strong>Section {result.section}</strong>
								<span>
									Status:{" "}
									{result.status === "allowed"
										? "Allowed"
										: result.status === "rejected"
											? "Rejected"
											: "Not applicable"}
								</span>
								<span>
									Old regime ₹ {rupeeFormat(result.oldRegimeAllowed)} · New
									regime ₹ {rupeeFormat(result.newRegimeAllowed)}
								</span>
							</li>
						))}
					</ul>
					{computation.issues.length === 0 ? null : (
						<div className="openitr-deduction-issues">
							{computation.issues.map((currentIssue) => (
								<IssueAlert
									issue={currentIssue}
									key={String(currentIssue.code)}
								/>
							))}
						</div>
					)}
					<div className="openitr-deduction-regimes">
						<section
							aria-label="Old-regime remaining deductions"
							className="openitr-deduction-regime"
						>
							<h3>Old-regime deduction</h3>
							<p>₹ {rupeeFormat(computation.oldRegimeTotal)}</p>
						</section>
						<section
							aria-label="New-regime remaining deductions"
							className="openitr-deduction-regime"
						>
							<h3>New-regime deduction</h3>
							<p>₹ {rupeeFormat(computation.newRegimeTotal)}</p>
							<small>
								Only section 80CCH remains available here under the pinned
								new-regime rule.
							</small>
						</section>
					</div>
					<ExpandableSection toggleText="Recorded facts and origins">
						<ul>
							{keyed(computation.facts, (fact) => String(fact.factKey)).map(
								({ key, item: fact }) => (
									<li key={key}>
										<strong>
											<FactLabel factKey={fact.factKey} />
										</strong>
										: {valueLabel(fact)}
										<small>{originLabel(fact)}</small>
									</li>
								),
							)}
						</ul>
					</ExpandableSection>
					{computation.trace.length === 0 ? null : (
						<>
							<p>Cited computation trace</p>
							<div>
								{keyed(computation.trace, (node) => String(node.ruleId)).map(
									({ key, item: node }) => (
										<TraceStep
											key={key}
											label={node.label}
											value={`₹ ${rupeeFormat(node.result)}`}
										>
											<TraceDetail term="Rule">{node.ruleId}</TraceDetail>
											<TraceDetail term="Operation">
												{node.operation}
											</TraceDetail>
											<TraceDetail term="Inputs">
												{node.inputs.map(String).join(", ")}
											</TraceDetail>
										</TraceStep>
									),
								)}
							</div>
						</>
					)}
				</>
			)}
		</section>
	);
};
