import type { NewRegimeSalaryComputation } from "@openitr/itr1-ay2026-27";
import type { CandidateDocument } from "@openitr/model";
import {
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	Title,
} from "@patternfly/react-core";

import { ComputationTraceList, rupeeFormat } from "./computation-trace-view";
import { IssueAlert } from "./plain-language";

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
		<section className="openitr-computation-card">
			<Title headingLevel="h2" size="lg">
				New-regime salary scenario
			</Title>
			{computation.kind === "blocked" ? (
				computation.issues.map((issue) => (
					<IssueAlert issue={issue} key={String(issue.code)} />
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
										<DescriptionList isCompact isHorizontal>
											<DescriptionListGroup>
												<DescriptionListTerm>Gross salary</DescriptionListTerm>
												<DescriptionListDescription>
													₹ {rupeeFormat(source.grossSalary)}
												</DescriptionListDescription>
											</DescriptionListGroup>
											<DescriptionListGroup>
												<DescriptionListTerm>
													Section 10 exemptions
												</DescriptionListTerm>
												<DescriptionListDescription>
													₹ {rupeeFormat(source.exemptAllowances)}
												</DescriptionListDescription>
											</DescriptionListGroup>
											<DescriptionListGroup>
												<DescriptionListTerm>
													Taxable salary contribution
												</DescriptionListTerm>
												<DescriptionListDescription>
													₹ {rupeeFormat(source.taxableSalary)}
												</DescriptionListDescription>
											</DescriptionListGroup>
										</DescriptionList>
									</article>
								);
							})}
						</div>
					</section>
					<DescriptionList columnModifier={{ default: "1Col", lg: "2Col" }}>
						{summaryRows(computation).map((row) => (
							<DescriptionListGroup key={row.label}>
								<DescriptionListTerm>{row.label}</DescriptionListTerm>
								<DescriptionListDescription>
									<strong>{row.value}</strong>
									{row.hint ? (
										<small className="openitr-summary-hint"> {row.hint}</small>
									) : null}
								</DescriptionListDescription>
							</DescriptionListGroup>
						))}
					</DescriptionList>
					<ComputationTraceList nodes={computation.nodes} />
				</>
			)}
		</section>
	);
};
