import type { Section112aCapitalGainComputation } from "@openitr/itr1-ay2026-27";
import {
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	Title,
} from "@patternfly/react-core";

import { rupeeFormat, TraceDetail, TraceStep } from "./computation-trace-view";
import { IssueAlert } from "./plain-language";

export const Section112aCapitalGainView = ({
	computation,
}: Readonly<{
	computation: Section112aCapitalGainComputation | undefined;
}>) => {
	if (computation === undefined || computation.kind === "not-applicable") {
		return null;
	}
	return (
		<section className="openitr-section112a-card">
			<Title headingLevel="h2" size="lg">
				Section 112A capital-gain analysis
			</Title>
			{computation.kind === "computed" ? (
				<>
					<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Total sale consideration
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.saleConsideration)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Total cost of acquisition
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.costOfAcquisition)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Section 112A long-term capital gain
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.gain)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Gain subject to section 112A tax
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.taxableGain)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Section 112A tax component
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.tax)}
							</DescriptionListDescription>
						</DescriptionListGroup>
					</DescriptionList>
					<p>Cited computation details</p>
					<div>
						{computation.trace.map((node) => (
							<TraceStep
								key={String(node.ruleId)}
								label={node.label}
								value={node.result}
							>
								<TraceDetail term="Rule">{node.ruleId}</TraceDetail>
								<TraceDetail term="Operation">{node.operation}</TraceDetail>
								<TraceDetail term="Rounding">{node.rounding}</TraceDetail>
								{node.roundingRuleId === undefined ? null : (
									<TraceDetail term="Rounding rule">
										{node.roundingRuleId}
									</TraceDetail>
								)}
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
