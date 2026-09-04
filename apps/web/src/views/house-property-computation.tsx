import type {
	ComputedHouseProperty,
	HousePropertyComputation,
	SignedHousePropertyAmount,
} from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const SignedAmount = ({ amount }: Readonly<{ amount: SignedHousePropertyAmount }>) => (
	<>₹ {rupeeFormat(amount.amount)} {amount.kind}</>
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
	const interestDeduction = regime === "old" ? property.interestDeduction : property.newRegimeInterestDeduction;
	const income = regime === "old" ? property.income : property.newRegimeIncome;
	const trace = regime === "old" ? property.trace : property.newRegimeTrace;
	return (
		<section className="openitr-property-regime">
			<h4>{name}</h4>
			<dl className="openitr-result-details">
				{property.grossAnnualValue === undefined ? null : (
					<div><dt>Gross annual value</dt><dd>₹ {rupeeFormat(property.grossAnnualValue)}</dd></div>
				)}
				<div><dt>Annual value</dt><dd>₹ {rupeeFormat(property.annualValue)}</dd></div>
				<div><dt>Standard deduction</dt><dd>₹ {rupeeFormat(property.standardDeduction)}</dd></div>
				<div><dt>Interest deduction</dt><dd>₹ {rupeeFormat(interestDeduction)}</dd></div>
				<div><dt>Property income</dt><dd><SignedAmount amount={income} /></dd></div>
			</dl>
			<p className="openitr-trace-heading">Cited computation details</p>
			<div className="openitr-trace-list">
				{trace.map((node) => (
					<details className="openitr-trace-node" key={`${name}-${node.label}-${String(node.ruleId)}`}>
						<summary><strong>{node.label}</strong><span className="openitr-trace-node-value">₹ {rupeeFormat(node.result)}</span></summary>
						<dl className="openitr-trace-details">
							<dt>Rule</dt><dd>{node.ruleId}</dd>
							<dt>Operation</dt><dd>{node.operation}</dd>
							<dt>Inputs</dt><dd>{node.inputs.map(String).join(", ")}</dd>
						</dl>
					</details>
				))}
			</div>
		</section>
	);
};

export const HousePropertyComputationView = ({
	computation,
}: Readonly<{ computation: HousePropertyComputation | undefined }>) => {
	if (computation === undefined || computation.kind === "not-applicable") return null;
	return (
		<Card className="openitr-property-card" component="section">
			<CardTitle><Title headingLevel="h2" size="lg">House-property analysis</Title></CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					This local analysis applies the pinned house-property rules to facts you attested. Review each amount, source, and cited step yourself.
				</Alert>
				{computation.kind === "computed" ? (
					<>
						<dl className="openitr-result-details openitr-property-summary">
							<div><dt>Old-regime combined result</dt><dd><SignedAmount amount={computation.combined} /></dd></div>
							<div><dt>New-regime combined result</dt><dd><SignedAmount amount={computation.newRegimeCombined} /></dd></div>
						</dl>
						<div className="openitr-property-list">
							{computation.properties.map((property) => (
								<section className="openitr-property-item" key={property.propertyNumber}>
									<h3>Property {property.propertyNumber}: {property.occupancy === "let-out" ? "Let-out" : "Self-occupied"}</h3>
									<div className="openitr-property-regimes">
										<RegimeResult name="Old regime" property={property} regime="old" />
										<RegimeResult name="New regime" property={property} regime="new" />
									</div>
								</section>
							))}
						</div>
					</>
				) : (
					<Alert
						isInline
						title={`${String(computation.issue.code)}: ${computation.issue.affectedFacts.map(String).join(", ")}`}
						variant="warning"
					>
						{computation.issue.recoveryAction}
					</Alert>
				)}
			</CardBody>
		</Card>
	);
};
