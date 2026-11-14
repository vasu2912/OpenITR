import type { AgriculturalIncomeComputation } from "@openitr/itr1-ay2026-27";
import {
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	Title,
} from "@patternfly/react-core";

import { rupeeFormat, TraceDetail, TraceStep } from "./computation-trace-view";
import { IssueAlert } from "./plain-language";

export const AgriculturalIncomeView = ({
	computation,
}: Readonly<{ computation: AgriculturalIncomeComputation | undefined }>) => {
	if (computation === undefined || computation.kind === "not-applicable") {
		return null;
	}
	return (
		<section className="openitr-agricultural-income-card">
			<Title headingLevel="h2" size="lg">
				Agricultural-income explanation
			</Title>
			{computation.kind === "computed" ? (
				<>
					<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Agricultural income reported as exempt
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.exemptIncome)}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Included in taxable total income
							</DescriptionListTerm>
							<DescriptionListDescription>
								₹ {rupeeFormat(computation.includedInTaxableIncome)}
							</DescriptionListDescription>
						</DescriptionListGroup>
					</DescriptionList>
					<p>Cited treatment details</p>
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
