import type {
	LoanInterestDeductionComputation,
	LoanInterestDeductionFact,
} from "@openitr/itr1-ay2026-27";
import { isIsoDate } from "@openitr/model";
import { Alert, ExpandableSection, Title } from "@patternfly/react-core";

import { rupeeFormat, TraceDetail, TraceStep } from "./computation-trace-view";
import { keyed } from "./keyed";
import { FactLabel, IssueAlert } from "./plain-language";

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
		? fact.value
			? "Yes"
			: "No"
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
		<section className="openitr-loan-interest-card">
			<Title headingLevel="h2" size="lg">
				Loan-interest deductions
			</Title>
			<Alert
				isInline
				title="Separate from house-property interest"
				variant="info"
			>
				Sections 80EE and 80EEA use only eligible interest left after section
				24(b). OpenITR also checks the pinned purpose, sanction-date, amount,
				first-home, lender, and overlap rules before showing a deduction.
			</Alert>
			{computation.kind !== "computed" ? (
				<div className="openitr-deduction-issues">
					{computation.issues.map((currentIssue) => (
						<IssueAlert
							issue={currentIssue}
							key={`${String(currentIssue.code)}:${currentIssue.category}`}
						/>
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
										<span>
											Interest supplied ₹{" "}
											{rupeeFormat(category.claimedInterest)}
										</span>
										<span>
											Old regime ₹ {rupeeFormat(category.oldRegimeAllowed)} ·
											New regime ₹ {rupeeFormat(category.newRegimeAllowed)}
										</span>
										<small>{purposeLabel[category.loanPurpose]}</small>
									</li>
								))}
							</ul>
						</>
					)}
					<div className="openitr-deduction-regimes">
						<section
							aria-label="Old-regime loan-interest deduction"
							className="openitr-deduction-regime"
						>
							<h3>Old-regime deduction</h3>
							<p>₹ {rupeeFormat(computation.oldRegimeTotal)}</p>
						</section>
						<section
							aria-label="New-regime loan-interest deduction"
							className="openitr-deduction-regime"
						>
							<h3>New-regime deduction</h3>
							<p>₹ {rupeeFormat(computation.newRegimeTotal)}</p>
							<small>
								Sections 80E, 80EE, 80EEA, and 80EEB are excluded under the
								pinned new-regime rule.
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
										: {factValue(fact)}
										<small>{factOrigin(fact)}</small>
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
