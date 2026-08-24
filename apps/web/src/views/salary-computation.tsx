import type {
	NewRegimeSalaryComputation,
} from "@openitr/itr1-ay2026-27";
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
}: Readonly<{ computation: NewRegimeSalaryComputation | undefined }>) => {
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
