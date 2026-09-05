import type {
	HealthDisabilityDeductionCategoryResult,
	HealthDisabilityDeductionComputation,
	HealthDisabilityDeductionFact,
} from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const personLabel: Readonly<
	Record<HealthDisabilityDeductionCategoryResult["applicablePerson"], string>
> = Object.freeze({
	"self-spouse-dependent-children-and-or-parents":
		"Self, spouse, dependent children, and/or parents",
	"eligible-dependent": "Eligible dependent",
	"taxpayer-or-eligible-dependent": "Taxpayer or eligible dependent",
	"resident-taxpayer": "Resident taxpayer",
});

const factOrigin = (fact: HealthDisabilityDeductionFact): string =>
	fact.origin.kind === "attested-answer"
		? `Attested answer ${fact.origin.answerId}`
		: `Accepted evidence: ${fact.origin.sourceDocumentIds.join(", ")}`;

const factValue = (fact: HealthDisabilityDeductionFact): string =>
	typeof fact.value === "boolean"
		? fact.value
			? "Yes"
			: "No"
		: `₹ ${rupeeFormat(fact.value)}`;

export const HealthDisabilityDeductionsView = ({
	computation,
}: Readonly<{
	computation: HealthDisabilityDeductionComputation | undefined;
}>) => {
	if (computation === undefined) return null;
	return (
		<Card className="openitr-health-disability-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Health and disability deductions
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					OpenITR applies the pinned section 80D, 80DD, 80DDB, and 80U
					category and regime rules. Review the facts, certificates, and payment
					details before relying on this analysis.
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
								<p>
									Affected facts: {currentIssue.affectedFacts.map(String).join(", ")}
								</p>
							</Alert>
						))}
					</div>
				) : (
					<>
						{computation.issues.map((currentIssue) => (
							<Alert
								isInline
								key={`${String(currentIssue.code)}:${currentIssue.category}`}
								title={`${currentIssue.category}: ${String(currentIssue.code)}`}
								variant="warning"
							>
								{currentIssue.recoveryAction}
							</Alert>
						))}
						{computation.categories.length === 0 ? (
							<p>No health or disability deduction category was selected.</p>
						) : (
							<>
								<h3>Category results</h3>
								<ul className="openitr-deduction-claims">
									{computation.categories.map((category) => (
										<li key={category.category}>
											<strong>Section {category.category}</strong>
											<span>Claimed ₹ {rupeeFormat(category.claimedAmount)}</span>
											<span>
												Old regime ₹ {rupeeFormat(category.oldRegimeAllowed)} · New
												regime ₹ {rupeeFormat(category.newRegimeAllowed)}
											</span>
											<small>{personLabel[category.applicablePerson]}</small>
										</li>
									))}
								</ul>
							</>
						)}
						<div className="openitr-deduction-regimes">
							<section aria-label="Old-regime health and disability deduction" className="openitr-deduction-regime">
								<h3>Old-regime deduction</h3>
								<p>₹ {rupeeFormat(computation.oldRegimeTotal)}</p>
							</section>
							<section aria-label="New-regime health and disability deduction" className="openitr-deduction-regime">
								<h3>New-regime deduction</h3>
								<p>₹ {rupeeFormat(computation.newRegimeTotal)}</p>
								<small>These four categories are excluded under the pinned new-regime rules.</small>
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
											<summary>
												<strong>{node.label}</strong>
												<span className="openitr-trace-node-value">₹ {rupeeFormat(node.result)}</span>
											</summary>
											<dl className="openitr-trace-details">
												<dt>Rule</dt>
												<dd>{node.ruleId}</dd>
												<dt>Operation</dt>
												<dd>{node.operation}</dd>
												<dt>Inputs</dt>
												<dd>{node.inputs.map(String).join(", ")}</dd>
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
