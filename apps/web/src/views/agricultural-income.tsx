import type { AgriculturalIncomeComputation } from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

export const AgriculturalIncomeView = ({
	computation,
}: Readonly<{ computation: AgriculturalIncomeComputation | undefined }>) => {
	if (computation === undefined || computation.kind === "not-applicable") {
		return null;
	}
	return (
		<Card className="openitr-agricultural-income-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Agricultural-income explanation
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					OpenITR applies the pinned AY 2026-27 ITR-1 limit and exempt-income
					reporting rule. Review the amount, provenance, and cited rules yourself.
				</Alert>
				{computation.kind === "computed" ? (
					<>
						<dl className="openitr-result-details openitr-agricultural-income-summary">
							<div>
								<dt>Agricultural income reported as exempt</dt>
								<dd>₹ {rupeeFormat(computation.exemptIncome)}</dd>
							</div>
							<div>
								<dt>Included in taxable total income</dt>
								<dd>₹ {rupeeFormat(computation.includedInTaxableIncome)}</dd>
							</div>
						</dl>
						<p className="openitr-trace-heading">Cited treatment details</p>
						<div className="openitr-trace-list">
							{computation.trace.map((node) => (
								<details className="openitr-trace-node" key={String(node.ruleId)}>
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
