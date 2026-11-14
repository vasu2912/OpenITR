import type {
	ComputedHouseProperty,
	HousePropertyComputation,
	SignedHousePropertyAmount,
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

const SignedAmount = ({
	amount,
}: Readonly<{ amount: SignedHousePropertyAmount }>) => (
	<>
		₹ {rupeeFormat(amount.amount)} {amount.kind}
	</>
);

const RegimeResult = ({
	name,
	property,
	regime,
}: Readonly<{
	name: string;
	property: ComputedHouseProperty;
	regime: "old" | "new";
}>) => {
	const interestDeduction =
		regime === "old"
			? property.interestDeduction
			: property.newRegimeInterestDeduction;
	const income = regime === "old" ? property.income : property.newRegimeIncome;
	const trace = regime === "old" ? property.trace : property.newRegimeTrace;
	return (
		<section className="openitr-property-regime">
			<h4>{name}</h4>
			<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
				{property.grossAnnualValue === undefined ? null : (
					<DescriptionListGroup>
						<DescriptionListTerm>Gross annual value</DescriptionListTerm>
						<DescriptionListDescription>
							₹ {rupeeFormat(property.grossAnnualValue)}
						</DescriptionListDescription>
					</DescriptionListGroup>
				)}
				<DescriptionListGroup>
					<DescriptionListTerm>Annual value</DescriptionListTerm>
					<DescriptionListDescription>
						₹ {rupeeFormat(property.annualValue)}
					</DescriptionListDescription>
				</DescriptionListGroup>
				<DescriptionListGroup>
					<DescriptionListTerm>Standard deduction</DescriptionListTerm>
					<DescriptionListDescription>
						₹ {rupeeFormat(property.standardDeduction)}
					</DescriptionListDescription>
				</DescriptionListGroup>
				<DescriptionListGroup>
					<DescriptionListTerm>Interest deduction</DescriptionListTerm>
					<DescriptionListDescription>
						₹ {rupeeFormat(interestDeduction)}
					</DescriptionListDescription>
				</DescriptionListGroup>
				<DescriptionListGroup>
					<DescriptionListTerm>Property income</DescriptionListTerm>
					<DescriptionListDescription>
						<SignedAmount amount={income} />
					</DescriptionListDescription>
				</DescriptionListGroup>
			</DescriptionList>
			<p>Cited computation details</p>
			<div>
				{trace.map((node) => (
					<TraceStep
						key={`${name}-${node.label}-${String(node.ruleId)}`}
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
		</section>
	);
};

export const HousePropertyComputationView = ({
	computation,
}: Readonly<{ computation: HousePropertyComputation | undefined }>) => {
	if (computation === undefined || computation.kind === "not-applicable")
		return null;
	return (
		<section className="openitr-property-card">
			<Title headingLevel="h2" size="lg">
				House-property analysis
			</Title>{" "}
			{computation.kind === "computed" ? (
				<>
					<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
						<DescriptionListGroup>
							<DescriptionListTerm>
								Old-regime combined result
							</DescriptionListTerm>
							<DescriptionListDescription>
								<SignedAmount amount={computation.combined} />
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup>
							<DescriptionListTerm>
								New-regime combined result
							</DescriptionListTerm>
							<DescriptionListDescription>
								<SignedAmount amount={computation.newRegimeCombined} />
							</DescriptionListDescription>
						</DescriptionListGroup>
					</DescriptionList>
					<div className="openitr-property-list">
						{computation.properties.map((property) => (
							<section
								className="openitr-property-item"
								key={property.propertyNumber}
							>
								<h3>
									Property {property.propertyNumber}:{" "}
									{property.occupancy === "let-out"
										? "Let-out"
										: "Self-occupied"}
								</h3>
								<div className="openitr-property-regimes">
									<RegimeResult
										name="Old regime"
										property={property}
										regime="old"
									/>
									<RegimeResult
										name="New regime"
										property={property}
										regime="new"
									/>
								</div>
							</section>
						))}
					</div>
				</>
			) : (
				<IssueAlert issue={computation.issue} />
			)}
		</section>
	);
};
