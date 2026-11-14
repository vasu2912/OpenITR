import type { Section112aCapitalGainComputation } from "@openitr/itr1-ay2026-27";
import {
	Title,
} from "@patternfly/react-core";

import { rupeeFormat } from "./computation-trace-view";
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
						<dl className="openitr-result-details openitr-section112a-summary">
							<div>
								<dt>Total sale consideration</dt>
								<dd>₹ {rupeeFormat(computation.saleConsideration)}</dd>
							</div>
							<div>
								<dt>Total cost of acquisition</dt>
								<dd>₹ {rupeeFormat(computation.costOfAcquisition)}</dd>
							</div>
							<div>
								<dt>Section 112A long-term capital gain</dt>
								<dd>₹ {rupeeFormat(computation.gain)}</dd>
							</div>
							<div>
								<dt>Gain subject to section 112A tax</dt>
								<dd>₹ {rupeeFormat(computation.taxableGain)}</dd>
							</div>
							<div>
								<dt>Section 112A tax component</dt>
								<dd>₹ {rupeeFormat(computation.tax)}</dd>
							</div>
						</dl>
						<p className="openitr-trace-heading">Cited computation details</p>
						<div className="openitr-trace-list">
							{computation.trace.map((node) => (
								<details className="openitr-trace-node" key={String(node.ruleId)}>
									<summary>
										<strong>{node.label}</strong>
										<span className="openitr-trace-node-value">
											{node.result}
										</span>
									</summary>
									<dl className="openitr-trace-details">
										<dt>Rule</dt>
										<dd>{node.ruleId}</dd>
										<dt>Operation</dt>
										<dd>{node.operation}</dd>
										<dt>Rounding</dt>
										<dd>{node.rounding}</dd>
										{node.roundingRuleId === undefined ? null : (
											<>
												<dt>Rounding rule</dt>
												<dd>{node.roundingRuleId}</dd>
											</>
										)}
										<dt>Inputs</dt>
										<dd>{node.inputs.map(String).join(", ")}</dd>
									</dl>
								</details>
							))}
						</div>
					</>
				) : (
					<IssueAlert issue={computation.issue} />
				)}
		</section>
	);
};
