import type {
	SavingsPensionDeductionClaim,
	SavingsPensionDeductionComputation,
	SavingsPensionRegimeResult,
} from "@openitr/itr1-ay2026-27";
import {
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	Title,
} from "@patternfly/react-core";

import { rupeeFormat, TraceDetail, TraceStep } from "./computation-trace-view";
import { keyed } from "./keyed";
import { IssueAlert } from "./plain-language";

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
		<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
			<DescriptionListGroup>
				<DescriptionListTerm>
					80C, 80CCC, and 80CCD(1) before shared limit
				</DescriptionListTerm>
				<DescriptionListDescription>
					₹ {rupeeFormat(result.sharedClaimed)}
				</DescriptionListDescription>
			</DescriptionListGroup>
			<DescriptionListGroup>
				<DescriptionListTerm>
					{newRegime ? "Shared categories allowed" : "After shared limit"}
				</DescriptionListTerm>
				<DescriptionListDescription>
					₹ {rupeeFormat(result.sharedAllowed)}
				</DescriptionListDescription>
			</DescriptionListGroup>
			<DescriptionListGroup>
				<DescriptionListTerm>Additional 80CCD(1B) allowed</DescriptionListTerm>
				<DescriptionListDescription>
					₹ {rupeeFormat(result.section80ccd1bAllowed)}
				</DescriptionListDescription>
			</DescriptionListGroup>
			<DescriptionListGroup>
				<DescriptionListTerm>
					Government-employer 80CCD(2) allowed
				</DescriptionListTerm>
				<DescriptionListDescription>
					₹ {rupeeFormat(result.governmentEmployerAllowed)}
				</DescriptionListDescription>
			</DescriptionListGroup>
			<DescriptionListGroup>
				<DescriptionListTerm>
					Other-employer 80CCD(2) allowed
				</DescriptionListTerm>
				<DescriptionListDescription>
					₹ {rupeeFormat(result.otherEmployerAllowed)}
				</DescriptionListDescription>
			</DescriptionListGroup>
			<DescriptionListGroup>
				<DescriptionListTerm>Total allowed</DescriptionListTerm>
				<DescriptionListDescription>
					₹ {rupeeFormat(result.totalAllowed)}
				</DescriptionListDescription>
			</DescriptionListGroup>
		</DescriptionList>
	</section>
);

export const SavingsPensionDeductionsView = ({
	computation,
}: Readonly<{
	computation: SavingsPensionDeductionComputation | undefined;
}>) => {
	if (computation === undefined) return null;
	return (
		<section className="openitr-savings-pension-card">
			<Title headingLevel="h2" size="lg">
				Savings and pension-contribution deductions
			</Title>
			{computation.kind !== "computed" ? (
				<IssueAlert issue={computation.issue} />
			) : (
				<>
					{computation.issues.map((currentIssue) => (
						<IssueAlert issue={currentIssue} key={String(currentIssue.code)} />
					))}
					{computation.claims.length === 0 ? (
						<p>
							No savings or pension contribution was reported for this analysis.
						</p>
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
