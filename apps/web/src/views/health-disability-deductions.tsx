import type {
	HealthDisabilityDeductionCategoryResult,
	HealthDisabilityDeductionComputation,
	HealthDisabilityDeductionFact,
} from "@openitr/itr1-ay2026-27";
import { ExpandableSection, Title } from "@patternfly/react-core";

import { rupeeFormat, TraceDetail, TraceStep } from "./computation-trace-view";
import { keyed } from "./keyed";
import { FactLabel, IssueAlert } from "./plain-language";

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
		<section className="openitr-health-disability-card">
			<Title headingLevel="h2" size="lg">
				Health and disability deductions
			</Title>
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
					{computation.issues.map((currentIssue) => (
						<IssueAlert
							issue={currentIssue}
							key={`${String(currentIssue.code)}:${currentIssue.category}`}
						/>
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
											Old regime ₹ {rupeeFormat(category.oldRegimeAllowed)} ·
											New regime ₹ {rupeeFormat(category.newRegimeAllowed)}
										</span>
										<small>{personLabel[category.applicablePerson]}</small>
									</li>
								))}
							</ul>
						</>
					)}
					<div className="openitr-deduction-regimes">
						<section
							aria-label="Old-regime health and disability deduction"
							className="openitr-deduction-regime"
						>
							<h3>Old-regime deduction</h3>
							<p>₹ {rupeeFormat(computation.oldRegimeTotal)}</p>
						</section>
						<section
							aria-label="New-regime health and disability deduction"
							className="openitr-deduction-regime"
						>
							<h3>New-regime deduction</h3>
							<p>₹ {rupeeFormat(computation.newRegimeTotal)}</p>
							<small>
								These four categories are excluded under the pinned new-regime
								rules.
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
