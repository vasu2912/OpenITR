import type {
	DonationDeductionComputation,
	DonationDeductionFact,
} from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const originLabel = (fact: DonationDeductionFact): string =>
	fact.origin.kind === "attested-answer"
		? `Attested answer ${fact.origin.answerId}`
		: `Accepted evidence: ${fact.origin.sourceDocumentIds.join(", ")}`;

const valueLabel = (fact: DonationDeductionFact): string =>
	typeof fact.value === "boolean"
		? fact.value
			? "Yes"
			: "No"
		: `₹ ${rupeeFormat(fact.value)}`;

const categoryLabel = Object.freeze({
	"100-percent-without-qualifying-limit":
		"100% deduction without qualifying limit",
	"50-percent-without-qualifying-limit":
		"50% deduction without qualifying limit",
	"100-percent-subject-to-qualifying-limit":
		"100% deduction subject to qualifying limit",
	"50-percent-subject-to-qualifying-limit":
		"50% deduction subject to qualifying limit",
});

const statusLabel = Object.freeze({
	allowed: "Allowed",
	warning: "Allowed with evidence warning",
	rejected: "Rejected",
});

export const DonationDeductionsView = ({
	computation,
}: Readonly<{
	computation: DonationDeductionComputation | undefined;
}>) => {
	if (computation === undefined) return null;
	return (
		<Card className="openitr-donation-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Donation deduction
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Section 80G analysis" variant="info">
					OpenITR derives the allowed amount from the recipient category,
					payment mode, qualifying percentage, and adjusted-GTI treatment. It
					does not trust an entered deduction total.
				</Alert>
				{computation.kind !== "computed" ? (
					<div className="openitr-deduction-issues">
						{computation.issues.map((currentIssue) => (
							<Alert
								isInline
								key={String(currentIssue.code)}
								title={String(currentIssue.code)}
								variant="warning"
							>
								<p>{currentIssue.recoveryAction}</p>
								<p>
									Affected facts:{" "}
									{currentIssue.affectedFacts.map(String).join(", ")}
								</p>
							</Alert>
						))}
					</div>
				) : (
					<>
						{computation.donations.length === 0 ? (
							<p>No section 80G donation was selected.</p>
						) : (
							<>
								<h3>Donation result</h3>
								<ul className="openitr-deduction-claims">
									{computation.donations.map((donation) => (
										<li key={donation.recipientCategory}>
											<strong>{categoryLabel[donation.recipientCategory]}</strong>
											<span>Status: {statusLabel[donation.status]}</span>
											<span>Donation ₹ {rupeeFormat(donation.amount)}</span>
											<span>
												Old regime ₹ {rupeeFormat(donation.oldRegimeAllowed)} · New
												regime ₹ {rupeeFormat(donation.newRegimeAllowed)}
											</span>
											<small>
												Payment: {donation.paymentMethod === "cash" ? "Cash" : "Other mode"}
											</small>
										</li>
									))}
								</ul>
							</>
						)}
						{computation.issues.length === 0 ? null : (
							<div className="openitr-deduction-issues">
								{computation.issues.map((currentIssue) => (
									<Alert
										isInline
										key={String(currentIssue.code)}
										title={String(currentIssue.code)}
										variant="warning"
									>
										{currentIssue.recoveryAction}
									</Alert>
								))}
							</div>
						)}
						<div className="openitr-deduction-regimes">
							<section
								aria-label="Old-regime donation deduction"
								className="openitr-deduction-regime"
							>
								<h3>Old-regime deduction</h3>
								<p>₹ {rupeeFormat(computation.oldRegimeTotal)}</p>
							</section>
							<section
								aria-label="New-regime donation deduction"
								className="openitr-deduction-regime"
							>
								<h3>New-regime deduction</h3>
								<p>₹ {rupeeFormat(computation.newRegimeTotal)}</p>
								<small>Section 80G is excluded under the pinned new-regime rule.</small>
							</section>
						</div>
						<details className="openitr-health-facts">
							<summary>Recorded facts and origins</summary>
							<ul>
								{computation.facts.map((fact, index) => (
									<li key={`${String(fact.factKey)}:${index}`}>
										<strong>{String(fact.factKey)}</strong>: {valueLabel(fact)}
										<small>{originLabel(fact)}</small>
									</li>
								))}
							</ul>
						</details>
						{computation.trace.length === 0 ? null : (
							<>
								<p className="openitr-trace-heading">Cited computation trace</p>
								<div className="openitr-trace-list">
									{computation.trace.map((node, index) => (
										<details
											className="openitr-trace-node"
											key={`${String(node.ruleId)}:${index}`}
										>
											<summary>
												<strong>{node.label}</strong>
												<span className="openitr-trace-node-value">
													₹ {rupeeFormat(node.result)}
												</span>
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
