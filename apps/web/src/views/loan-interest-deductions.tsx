import type {
	LoanInterestDeductionComputation,
	LoanInterestDeductionFact,
} from "@openitr/itr1-ay2026-27";
import { isIsoDate } from "@openitr/model";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const purposeLabel = Object.freeze({
	"higher-education": "Higher education",
	"residential-property": "Residential property, after section 24(b)",
	"electric-vehicle": "Exclusively electric vehicle",
});

const factOrigin = (fact: LoanInterestDeductionFact): string =>
	fact.origin.kind === "attested-answer"
		? `Attested answer ${fact.origin.answerId}`
		: `Accepted evidence: ${fact.origin.sourceDocumentIds.join(", ")}`;

const factValue = (fact: LoanInterestDeductionFact): string =>
	typeof fact.value === "boolean"
		? fact.value ? "Yes" : "No"
		: isIsoDate(fact.value)
			? fact.value
			: `₹ ${rupeeFormat(fact.value)}`;

export const LoanInterestDeductionsView = ({
	computation,
}: Readonly<{
	computation: LoanInterestDeductionComputation | undefined;
}>) => {
	if (computation === undefined) return null;
	return (
		<Card className="openitr-loan-interest-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">Loan-interest deductions</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Separate from house-property interest" variant="info">
					Sections 80EE and 80EEA use only eligible interest left after section 24(b).
					OpenITR also checks the pinned purpose, sanction-date, amount, first-home,
					lender, and overlap rules before showing a deduction.
				</Alert>
				{computation.kind !== "computed" ? (
					<div className="openitr-deduction-issues">
						{computation.issues.map((currentIssue) => (
							<Alert
								isInline
								key={`${String(currentIssue.code)}:${currentIssue.category}`}
								title={`${currentIssue.category}: ${String(currentIssue.code)}`}
								variant="warning"
							>
								<p>{currentIssue.recoveryAction}</p>
								<p>Affected facts: {currentIssue.affectedFacts.map(String).join(", ")}</p>
							</Alert>
						))}
					</div>
				) : (
					<>
						{computation.categories.length === 0 ? (
							<p>No loan-interest deduction category was selected.</p>
						) : (
							<>
								<h3>Category results</h3>
								<ul className="openitr-deduction-claims">
									{computation.categories.map((category) => (
										<li key={category.category}>
											<strong>Section {category.category}</strong>
											<span>Interest supplied ₹ {rupeeFormat(category.claimedInterest)}</span>
											<span>Old regime ₹ {rupeeFormat(category.oldRegimeAllowed)} · New regime ₹ {rupeeFormat(category.newRegimeAllowed)}</span>
											<small>{purposeLabel[category.loanPurpose]}</small>
										</li>
									))}
								</ul>
							</>
						)}
						<div className="openitr-deduction-regimes">
							<section aria-label="Old-regime loan-interest deduction" className="openitr-deduction-regime">
								<h3>Old-regime deduction</h3>
								<p>₹ {rupeeFormat(computation.oldRegimeTotal)}</p>
							</section>
							<section aria-label="New-regime loan-interest deduction" className="openitr-deduction-regime">
								<h3>New-regime deduction</h3>
								<p>₹ {rupeeFormat(computation.newRegimeTotal)}</p>
								<small>Sections 80E, 80EE, 80EEA, and 80EEB are excluded under the pinned new-regime rule.</small>
							</section>
						</div>
						<details className="openitr-health-facts">
							<summary>Recorded facts and origins</summary>
							<ul>
								{computation.facts.map((fact, index) => (
									<li key={`${String(fact.factKey)}:${index}`}>
										<strong>{String(fact.factKey)}</strong>: {factValue(fact)}
										<small>{factOrigin(fact)}</small>
									</li>
								))}
							</ul>
						</details>
						{computation.trace.length === 0 ? null : (
							<>
								<p className="openitr-trace-heading">Cited computation trace</p>
								<div className="openitr-trace-list">
									{computation.trace.map((node, index) => (
										<details className="openitr-trace-node" key={`${String(node.ruleId)}:${index}`}>
											<summary><strong>{node.label}</strong><span className="openitr-trace-node-value">₹ {rupeeFormat(node.result)}</span></summary>
											<dl className="openitr-trace-details">
												<dt>Rule</dt><dd>{node.ruleId}</dd>
												<dt>Operation</dt><dd>{node.operation}</dd>
												<dt>Inputs</dt><dd>{node.inputs.map(String).join(", ")}</dd>
											</dl>
										</details>
									))}
								</div>
							</>
						)}
					</>
				)}
			</CardBody>
		</Card>
	);
};
