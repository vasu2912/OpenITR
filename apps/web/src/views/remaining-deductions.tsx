import type { RemainingDeductionComputation, RemainingDeductionFact } from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const originLabel = (fact: RemainingDeductionFact): string =>
	fact.origin.kind === "attested-answer"
		? `Attested answer ${fact.origin.answerId}`
		: `Accepted evidence: ${fact.origin.sourceDocumentIds.join(", ")}`;

const valueLabel = (fact: RemainingDeductionFact): string =>
	typeof fact.value === "boolean" ? (fact.value ? "Yes" : "No") : `₹ ${rupeeFormat(fact.value)}`;

export const RemainingDeductionsView = ({ computation }: Readonly<{ computation: RemainingDeductionComputation | undefined }>) => {
	if (computation === undefined) return null;
	return (
		<Card className="openitr-remaining-deductions-card" component="section">
			<CardTitle><Title headingLevel="h2" size="lg">Deposit-interest and remaining deductions</Title></CardTitle>
			<CardBody>
				<Alert isInline title="Named ITR-1 categories only" variant="info">
					OpenITR applies sections 80TTA and 80TTB once from the recorded interest and taxpayer category. Other supported sections use their named facts and pinned limits; no generic deduction amount is accepted.
				</Alert>
				{computation.kind !== "computed" ? (
					<div className="openitr-deduction-issues">
						{computation.issues.map((currentIssue) => (
							<Alert isInline key={String(currentIssue.code)} title={String(currentIssue.code)} variant="warning">
								<p>{currentIssue.recoveryAction}</p>
								<p>Affected facts: {currentIssue.affectedFacts.map(String).join(", ")}</p>
							</Alert>
						))}
					</div>
				) : (
					<>
						<h3>Deduction results</h3>
						<ul className="openitr-deduction-claims">
							{computation.results.map((result) => (
								<li key={result.section}>
									<strong>Section {result.section}</strong>
									<span>Status: {result.status === "allowed" ? "Allowed" : result.status === "rejected" ? "Rejected" : "Not applicable"}</span>
									<span>Old regime ₹ {rupeeFormat(result.oldRegimeAllowed)} · New regime ₹ {rupeeFormat(result.newRegimeAllowed)}</span>
								</li>
							))}
						</ul>
						{computation.issues.length === 0 ? null : (
							<div className="openitr-deduction-issues">
								{computation.issues.map((currentIssue) => (
									<Alert isInline key={String(currentIssue.code)} title={String(currentIssue.code)} variant="warning">{currentIssue.recoveryAction}</Alert>
								))}
							</div>
						)}
						<div className="openitr-deduction-regimes">
							<section aria-label="Old-regime remaining deductions" className="openitr-deduction-regime"><h3>Old-regime deduction</h3><p>₹ {rupeeFormat(computation.oldRegimeTotal)}</p></section>
							<section aria-label="New-regime remaining deductions" className="openitr-deduction-regime"><h3>New-regime deduction</h3><p>₹ {rupeeFormat(computation.newRegimeTotal)}</p><small>Only section 80CCH remains available here under the pinned new-regime rule.</small></section>
						</div>
						<details className="openitr-health-facts"><summary>Recorded facts and origins</summary><ul>
							{computation.facts.map((fact, index) => <li key={`${String(fact.factKey)}:${index}`}><strong>{String(fact.factKey)}</strong>: {valueLabel(fact)}<small>{originLabel(fact)}</small></li>)}
						</ul></details>
						{computation.trace.length === 0 ? null : <><p className="openitr-trace-heading">Cited computation trace</p><div className="openitr-trace-list">
							{computation.trace.map((node, index) => <details className="openitr-trace-node" key={`${String(node.ruleId)}:${index}`}><summary><strong>{node.label}</strong><span className="openitr-trace-node-value">₹ {rupeeFormat(node.result)}</span></summary><dl className="openitr-trace-details"><dt>Rule</dt><dd>{node.ruleId}</dd><dt>Operation</dt><dd>{node.operation}</dd><dt>Inputs</dt><dd>{node.inputs.map(String).join(", ")}</dd></dl></details>)}
						</div></>}
					</>
				)}
			</CardBody>
		</Card>
	);
};
