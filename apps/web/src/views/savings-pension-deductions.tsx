import type {
	SavingsPensionDeductionClaim,
	SavingsPensionDeductionComputation,
	SavingsPensionRegimeResult,
} from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const personLabel: Readonly<
	Record<SavingsPensionDeductionClaim["applicablePerson"], string>
> = Object.freeze({
	taxpayer: "Taxpayer",
	"taxpayer-or-eligible-family": "Taxpayer or eligible family member",
	"government-employer-for-taxpayer":
		"Central or State Government employer for taxpayer",
	"other-employer-for-taxpayer": "PSU or other employer for taxpayer",
});

const originLabel = (claim: SavingsPensionDeductionClaim): string =>
	claim.origin.kind === "attested-answer"
		? `Attested answer ${claim.origin.answerId}`
		: `Accepted evidence: ${claim.origin.sourceDocumentIds.join(", ")}`;

const RegimeBreakdown = ({
	title,
	result,
	newRegime,
}: Readonly<{
	title: string;
	result: SavingsPensionRegimeResult;
	newRegime: boolean;
}>) => (
	<section aria-label={title} className="openitr-deduction-regime">
		<h3>{title}</h3>
		<dl className="openitr-result-details">
			<div>
				<dt>80C, 80CCC, and 80CCD(1) before shared limit</dt>
				<dd>₹ {rupeeFormat(result.sharedClaimed)}</dd>
			</div>
			<div>
				<dt>{newRegime ? "Shared categories allowed" : "After shared limit"}</dt>
				<dd>₹ {rupeeFormat(result.sharedAllowed)}</dd>
			</div>
			<div>
				<dt>Additional 80CCD(1B) allowed</dt>
				<dd>₹ {rupeeFormat(result.section80ccd1bAllowed)}</dd>
			</div>
			<div>
				<dt>Government-employer 80CCD(2) allowed</dt>
				<dd>₹ {rupeeFormat(result.governmentEmployerAllowed)}</dd>
			</div>
			<div>
				<dt>Other-employer 80CCD(2) allowed</dt>
				<dd>₹ {rupeeFormat(result.otherEmployerAllowed)}</dd>
			</div>
			<div>
				<dt>Total allowed</dt>
				<dd>₹ {rupeeFormat(result.totalAllowed)}</dd>
			</div>
		</dl>
	</section>
);

export const SavingsPensionDeductionsView = ({
	computation,
}: Readonly<{
	computation: SavingsPensionDeductionComputation | undefined;
}>) => {
	if (computation === undefined) return null;
	return (
		<Card className="openitr-savings-pension-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Savings and pension-contribution deductions
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					OpenITR applies the pinned category, shared, percentage-base, and
					regime rules. Review every claimed amount and its supporting details.
				</Alert>
				{computation.kind !== "computed" ? (
					<Alert
						isInline
						title={`${String(computation.issue.code)}: ${computation.issue.affectedFacts.map(String).join(", ")}`}
						variant="warning"
					>
						{computation.issue.recoveryAction}
					</Alert>
				) : (
					<>
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
						{computation.claims.length === 0 ? (
							<p>No savings or pension contribution was reported for this analysis.</p>
						) : (
							<>
								<h3>Recorded category claims</h3>
								<ul className="openitr-deduction-claims">
									{computation.claims.map((claim) => (
										<li key={claim.category}>
											<strong>{claim.category}</strong>
											<span>Claimed ₹ {rupeeFormat(claim.claimedAmount)}</span>
											<span>{personLabel[claim.applicablePerson]}</span>
											<small>{originLabel(claim)}</small>
										</li>
									))}
								</ul>
							</>
						)}
						<div className="openitr-deduction-regimes">
							<RegimeBreakdown
								newRegime={false}
								result={computation.oldRegime}
								title="Old-regime deduction"
							/>
							<RegimeBreakdown
								newRegime
								result={computation.newRegime}
								title="New-regime deduction"
							/>
						</div>
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
