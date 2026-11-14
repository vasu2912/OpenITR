import type {
	OtherSourceCategory,
	OtherSourcesComputation,
} from "@openitr/itr1-ay2026-27";
import {
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	Title,
} from "@patternfly/react-core";

import { rupeeFormat, TraceDetail, TraceStep } from "./computation-trace-view";
import { IssueAlert } from "./plain-language";

const categoryLabels: Readonly<Record<OtherSourceCategory["kind"], string>> =
	Object.freeze({
		dividends: "Ordinary dividends",
		"other-interest": "Other permitted interest",
		"family-pension": "Family pension",
	});

export const OtherSourcesComputationView = ({
	computation,
}: Readonly<{ computation: OtherSourcesComputation | undefined }>) => {
	if (computation === undefined || computation.kind === "not-applicable")
		return null;
	return (
		<section className="openitr-other-sources-card">
			<Title headingLevel="h2" size="lg">
				Income from other sources analysis
			</Title>
			{computation.kind === "computed" ? (
				<>
					<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Gross other-source income
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.grossTotal)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Old-regime family-pension deduction
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.oldRegime.familyPensionDeduction)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Old-regime other-source income
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.oldRegime.total)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								New-regime family-pension deduction
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.newRegime.familyPensionDeduction)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								New-regime other-source income
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.newRegime.total)}
							</DescriptionListDescription>
						</DescriptionListGroup>
					</DescriptionList>
					<h3>Category amounts</h3>
					<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
						{computation.categories.map((category) => (
							<DescriptionListGroup key={category.kind}>
								<DescriptionListTerm>
									{categoryLabels[category.kind]}
								</DescriptionListTerm>
								<DescriptionListDescription>
									₹ {rupeeFormat(category.amount)}
								</DescriptionListDescription>
							</DescriptionListGroup>
						))}
					</DescriptionList>
					<p>Cited computation details</p>
					<div>
						{computation.trace.map((node) => (
							<TraceStep
								key={String(node.ruleId)}
								label={node.label}
								value={`₹ ${rupeeFormat(node.result)}`}
							>
								<TraceDetail term="Rule">{node.ruleId}</TraceDetail>
								<TraceDetail term="Operation">{node.operation}</TraceDetail>
								<TraceDetail term="Inputs">
									{node.inputs.map(String).join(", ")}
								</TraceDetail>
							</TraceStep>
						))}
					</div>
				</>
			) : (
				<IssueAlert issue={computation.issue} />
			)}
		</section>
	);
};
