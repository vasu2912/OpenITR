import type {
	OtherSourceCategory,
	OtherSourcesComputation,
} from "@openitr/itr1-ay2026-27";
import { Alert, Card, CardBody, CardTitle, Title } from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";

const categoryLabels: Readonly<Record<OtherSourceCategory["kind"], string>> = Object.freeze({
	dividends: "Ordinary dividends",
	"other-interest": "Other permitted interest",
	"family-pension": "Family pension",
});

export const OtherSourcesComputationView = ({
	computation,
}: Readonly<{ computation: OtherSourcesComputation | undefined }>) => {
	if (computation === undefined || computation.kind === "not-applicable") return null;
	return (
		<Card className="openitr-other-sources-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">Income from other sources analysis</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					This local analysis applies the pinned other-source rules to accepted evidence and answers. Review each category and cited step yourself.
				</Alert>
				{computation.kind === "computed" ? (
					<>
						<dl className="openitr-result-details openitr-other-sources-summary">
							<div><dt>Gross other-source income</dt><dd>₹ {rupeeFormat(computation.grossTotal)}</dd></div>
							<div><dt>Old-regime family-pension deduction</dt><dd>₹ {rupeeFormat(computation.oldRegime.familyPensionDeduction)}</dd></div>
							<div><dt>Old-regime other-source income</dt><dd>₹ {rupeeFormat(computation.oldRegime.total)}</dd></div>
							<div><dt>New-regime family-pension deduction</dt><dd>₹ {rupeeFormat(computation.newRegime.familyPensionDeduction)}</dd></div>
							<div><dt>New-regime other-source income</dt><dd>₹ {rupeeFormat(computation.newRegime.total)}</dd></div>
						</dl>
						<h3>Category amounts</h3>
						<dl className="openitr-result-details openitr-other-sources-categories">
							{computation.categories.map((category) => (
								<div key={category.kind}>
									<dt>{categoryLabels[category.kind]}</dt>
									<dd>₹ {rupeeFormat(category.amount)}</dd>
								</div>
							))}
						</dl>
						<p className="openitr-trace-heading">Cited computation details</p>
						<div className="openitr-trace-list">
							{computation.trace.map((node) => (
								<details className="openitr-trace-node" key={String(node.ruleId)}>
									<summary><strong>{node.label}</strong><span className="openitr-trace-node-value">₹ {rupeeFormat(node.result)}</span></summary>
									<dl className="openitr-trace-details">
										<dt>Rule</dt><dd>{node.ruleId}</dd>
										<dt>Operation</dt><dd>{node.operation}</dd>
										<dt>Inputs</dt><dd>{node.inputs.map(String).join(", ")}</dd>
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
