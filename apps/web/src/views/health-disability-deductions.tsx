import type {
	HealthDisabilityDeductionCategoryResult,
	HealthDisabilityDeductionComputation,
	HealthDisabilityDeductionFact,
} from "@openitr/itr1-ay2026-27";
import { Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";
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
					<details className="openitr-health-facts">
						<summary>Recorded facts and origins</summary>
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
					</details>
					{computation.trace.length === 0 ? null : (
						<>
							<p className="openitr-trace-heading">Cited computation trace</p>
							<div className="openitr-trace-list">
								{keyed(computation.trace, (node) => String(node.ruleId)).map(
									({ key, item: node }) => (
										<details className="openitr-trace-node" key={key}>
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
