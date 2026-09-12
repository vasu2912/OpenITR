import {
	Alert,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

import type {
	AnalysisAmount,
	AnalysisReport,
} from "../session/analysis-report";
import { rupeeFormat } from "./computation-trace-view";

const regimeLabel = (regime: AnalysisReport["regime"]): string =>
	regime === "old" ? "Old regime" : "New regime";

const AmountLinks = ({ item }: Readonly<{ item: AnalysisAmount }>) => (
	<span className="openitr-analysis-links">
		{item.traceTargetIds.map((targetId, index) => (
			<a href={`#${targetId}`} key={targetId}>
				{index === 0 ? "Computation trace" : `Trace ${index + 1}`}
			</a>
		))}
		{item.evidenceTargetIds.map((targetId, index) => (
			<a href={`#${targetId}`} key={targetId}>
				Evidence {index + 1}
			</a>
		))}
	</span>
);

const AmountRow = ({ item }: Readonly<{ item: AnalysisAmount }>) => (
	<div data-analysis-amount={item.id}>
		<dt>{item.label}</dt>
		<dd>
			<a className="openitr-analysis-value" href={`#${item.traceTargetIds[0]}`}>
				₹ {rupeeFormat(item.amount)}
			</a>
			<AmountLinks item={item} />
		</dd>
	</div>
);

const IncomeChart = ({
	items,
}: Readonly<{ items: readonly AnalysisAmount[] }>) => {
	const maximum = Math.max(
		1,
		...items.map((item) => Math.max(0, Number(item.amount))),
	);
	return (
		<figure className="openitr-income-chart">
			<figcaption>
				Income composition. Every bar repeats its exact readable value below.
			</figcaption>
			<ul>
				{items.map((item) => (
					<li key={item.id}>
						<span className="openitr-income-chart-label">{item.label}</span>
						<span
							aria-hidden="true"
							className="openitr-income-chart-track"
						>
							<span
								className="openitr-income-chart-bar"
								style={{
									width: `${(Math.max(0, Number(item.amount)) / maximum) * 100}%`,
								}}
							/>
						</span>
						<a href={`#${item.traceTargetIds[0]}`}>
							₹ {rupeeFormat(item.amount)}
						</a>
					</li>
				))}
			</ul>
		</figure>
	);
};

export const CompleteAnalyticsView = ({
	report,
}: Readonly<{ report: AnalysisReport | undefined }>) => {
	if (report === undefined) return null;
	const current = report.currentYear;
	return (
		<Card className="openitr-complete-analytics" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Complete analysis
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title={`${regimeLabel(report.regime)} selected`} variant="info">
					All current-year values below come from fact-set revision {report.factSetRevision} and rule-pack revision {report.rulePackRevision}. Change the primary scenario above to rebuild this report from the other completed computation.
				</Alert>

				<section aria-labelledby="analysis-income-heading">
					<h3 id="analysis-income-heading">Current-year income composition</h3>
					<IncomeChart items={current.incomeComposition} />
					<dl className="openitr-analysis-amounts">
						{current.incomeComposition.map((item) => (
							<AmountRow item={item} key={item.id} />
						))}
					</dl>
				</section>

				<section aria-labelledby="analysis-result-heading">
					<h3 id="analysis-result-heading">Current-year tax summary</h3>
					<dl className="openitr-analysis-amounts openitr-analysis-result-grid">
						<AmountRow item={current.taxableIncome} />
						<AmountRow item={current.totalTaxLiability} />
						<AmountRow item={current.taxesPaid} />
						<AmountRow item={current.estimatedBalance} />
					</dl>
				</section>

				<section aria-labelledby="analysis-deductions-heading">
					<h3 id="analysis-deductions-heading">Current-year deduction use</h3>
					<dl className="openitr-analysis-amounts">
						{current.deductions.map((item) => (
							<AmountRow item={item} key={item.id} />
						))}
					</dl>
				</section>

				<section aria-labelledby="analysis-adjustments-heading">
					<h3 id="analysis-adjustments-heading">
						Current-year limits and exclusions
					</h3>
					{current.adjustments.length === 0 ? (
						<p>No deduction or loss amount was limited or excluded in this selected scenario.</p>
					) : (
						<ul className="openitr-analysis-adjustments">
							{current.adjustments.map((item) => (
								<li key={item.id}>
									<strong>{item.label}: </strong>
									<a href={`#${item.traceTargetId}`}>
										₹ {rupeeFormat(item.affectedAmount)}
									</a>
									<p>{item.explanation}</p>
									<p>
										Rule {item.ruleId} · revision {item.rulePackRevision} ·{" "}
										<a href={`#${item.traceTargetId}`}>Computation trace</a>
										{item.evidenceTargetIds.map((targetId, index) => (
											<span key={targetId}>
												{" · "}
												<a href={`#${targetId}`}>Evidence {index + 1}</a>
											</span>
										))}
									</p>
								</li>
							))}
						</ul>
					)}
				</section>

				<section
					aria-labelledby="future-planning-heading"
					className="openitr-future-planning"
				>
					<h3 id="future-planning-heading">Future-year planning ideas</h3>
					<p>
						These conditional ideas apply only to a future financial year. They do not alter the FY 2025-26 facts, computation, liability, refund, or amount payable above.
					</p>
					<ul>
						{report.futurePlanning.map((idea) => (
							<li key={idea.id}>
								<strong>{idea.title}</strong>
								<p>
									<strong>Condition:</strong> {idea.condition}.
								</p>
								<p>{idea.explanation}</p>
								{idea.ruleReference === undefined ? null : (
									<p>
										Current rule reference: {idea.ruleReference.ruleId} · revision {idea.ruleReference.rulePackRevision}. Recheck the published rule for the future year.
									</p>
								)}
							</li>
						))}
					</ul>
				</section>
			</CardBody>
		</Card>
	);
};
