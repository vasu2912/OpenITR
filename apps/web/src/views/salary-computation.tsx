import type {
	NewRegimeSalaryComputation,
} from "@openitr/itr1-ay2026-27";
import type { CandidateDocument } from "@openitr/model";
import {
	Alert,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

import { ComputationTraceList, rupeeFormat } from "./computation-trace-view";

type SummaryRow = Readonly<{ label: string; value: string; hint?: string }>;

const summaryRows = (
	computation: Extract<NewRegimeSalaryComputation, { kind: "computed" }>,
): readonly SummaryRow[] => [
	{
		label: "Salary total",
		value: `₹ ${rupeeFormat(computation.summary.salaryTotal)}`,
		hint: "Accepted Part A salary observations",
	},
	{
		label: "Taxable income",
		value: `₹ ${rupeeFormat(computation.summary.taxableIncome)}`,
		hint: "After exemptions, standard deduction, and statutory rounding",
	},
	{
		label: "Slab tax",
		value: `₹ ${rupeeFormat(computation.summary.incomeTaxBeforeAdjustments)}`,
		hint: "Before rebate, relief, surcharge, and cess",
	},
	{
		label: "Rebate applied",
		value: `₹ ${rupeeFormat(computation.summary.rebateApplied)}`,
	},
	{
		label: "Marginal relief applied",
		value: `₹ ${rupeeFormat(computation.summary.marginalReliefApplied)}`,
	},
	{
		label: "Surcharge",
		value: `₹ ${rupeeFormat(computation.summary.surcharge)}`,
	},
	{
		label: "Health and education cess",
		value: `₹ ${rupeeFormat(computation.summary.cess)}`,
	},
	{
		label: "Final tax liability",
		value: `₹ ${rupeeFormat(computation.summary.finalTaxLiability)}`,
		hint: "Rounded under the pinned rounding rule",
	},
];

export const SalaryComputationView = ({
	computation,
	documents,
}: Readonly<{
	computation: NewRegimeSalaryComputation | undefined;
	documents: readonly CandidateDocument[];
}>) => {
	if (computation === undefined) {
		return null;
	}

	return (
		<Card className="openitr-computation-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					New-regime salary scenario
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					This estimate comes from your accepted salary evidence, your
					recorded answers, and the pinned rule pack. It is not tax advice
					and not a filing result. Review every figure yourself.
				</Alert>
				{computation.kind === "blocked" ? (
					computation.issues.map((issue) => (
						<Alert
							key={String(issue.code)}
							title={`${String(issue.code)}: ${issue.affectedFactKeys.join(", ") || "salary facts"}`}
							variant="warning"
						>
							{issue.recoveryAction}
						</Alert>
					))
				) : (
					<>
						<section aria-labelledby="salary-sources-heading">
							<h3 id="salary-sources-heading">Salary and pension sources</h3>
							<div className="openitr-salary-source-list">
								{computation.sources.map((source) => {
									const sourceDocuments = source.sourceDocumentIds
										.map((documentId) =>
											documents.find(
												(document) => document.documentId === documentId,
											),
										)
										.filter((document) => document !== undefined);
									const sourceLabel =
										source.sourceKind === "form16"
											? `Form 16 · TAN ${source.sourceId.replace("form16:", "")}`
											: source.sourceKind === "prefilled-aggregate"
												? "Prefilled ITR-1 aggregate"
												: "Salary source";
									return (
										<article
											className="openitr-salary-source"
											key={source.sourceId}
										>
											<h4>{sourceLabel}</h4>
											<p className="openitr-salary-source-documents">
												{sourceDocuments.length > 0
													? sourceDocuments
														.map((document) => document.displayName)
														.join(", ")
													: `Document ${String(source.documentId).slice(0, 12)}…`}
											</p>
											<dl>
												<div><dt>Gross salary</dt><dd>₹ {rupeeFormat(source.grossSalary)}</dd></div>
												<div><dt>Section 10 exemptions</dt><dd>₹ {rupeeFormat(source.exemptAllowances)}</dd></div>
												<div><dt>Taxable salary contribution</dt><dd>₹ {rupeeFormat(source.taxableSalary)}</dd></div>
											</dl>
										</article>
									);
								})}
							</div>
						</section>
						<dl className="openitr-result-details">
							{summaryRows(computation).map((row) => (
								<div key={row.label}>
									<dt>{row.label}</dt>
									<dd>
										<strong>{row.value}</strong>
										{row.hint ? (
											<small className="openitr-summary-hint">
												{" "}
												{row.hint}
											</small>
										) : null}
									</dd>
								</div>
							))}
						</dl>
						<ComputationTraceList nodes={computation.nodes} />
					</>
				)}
			</CardBody>
		</Card>
	);
};
