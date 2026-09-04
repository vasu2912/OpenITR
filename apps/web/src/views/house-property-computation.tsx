import type { SelfOccupiedHousePropertyComputation } from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const RegimeResult = ({
	name,
	result,
}: Readonly<{
	name: string;
	result: Extract<
		SelfOccupiedHousePropertyComputation,
		{ kind: "computed" }
	>["oldRegime"];
}>) => (
	<section className="openitr-property-regime">
		<h3>{name}</h3>
		<dl className="openitr-result-details">
			<div><dt>Annual value</dt><dd>₹ {rupeeFormat(result.annualValue)}</dd></div>
			<div><dt>Interest deduction</dt><dd>₹ {rupeeFormat(result.interestDeduction)}</dd></div>
			<div><dt>Taxable-income effect</dt><dd>₹ {rupeeFormat(result.taxableIncomeEffect.replace("-", ""))} {result.taxableIncomeEffect.startsWith("-") ? "reduction" : "change"}</dd></div>
			{result.limitApplied === undefined ? null : (
				<div><dt>Interest limit applied</dt><dd>₹ {rupeeFormat(result.limitApplied)}</dd></div>
			)}
		</dl>
		<p className="openitr-trace-heading">Cited computation details</p>
		<div className="openitr-trace-list">
			{result.trace.map((node) => (
				<details className="openitr-trace-node" key={`${name}-${String(node.ruleId)}`}>
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

export const HousePropertyComputationView = ({
	computation,
}: Readonly<{
	computation: SelfOccupiedHousePropertyComputation | undefined;
}>) => {
	if (computation === undefined || computation.kind === "not-applicable") return null;
	return (
		<Card className="openitr-property-card" component="section">
			<CardTitle><Title headingLevel="h2" size="lg">Self-occupied house property</Title></CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					This local analysis applies the pinned house-property rules to facts you attested. Review the evidence and cited steps yourself.
				</Alert>
				{computation.kind === "computed" ? (
					<div className="openitr-property-regimes">
						<RegimeResult name="Old regime" result={computation.oldRegime} />
						<RegimeResult name="New regime" result={computation.newRegime} />
					</div>
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
