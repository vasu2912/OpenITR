import type {
	EstimateEvidenceRole,
	RefundOrAmountPayableEstimate,
} from "@openitr/itr1-ay2026-27";
import {
	Alert,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

import { ComputationTraceList, rupeeFormat } from "./computation-trace-view";

const roleLabels: Readonly<Record<EstimateEvidenceRole, string>> =
	Object.freeze({
		"salary-income": "Salary income",
		"bank-interest-income": "Bank interest",
		"non-salary-income": "Non-salary income (Form 16A)",
		"taxes-paid": "Taxes paid (TDS deposited)",
		"tax-payments": "Tax payments (e-Pay Tax receipt)",
	});

type OutcomePresentation = Readonly<{
	heading: string;
	variant: "success" | "warning" | "info";
}>;

const outcomePresentation = (
	estimate: Extract<RefundOrAmountPayableEstimate, { kind: "computed" }>,
): OutcomePresentation => {
	switch (estimate.outcome.kind) {
		case "estimated-refund":
			return {
				heading: `Estimated refund ₹ ${rupeeFormat(estimate.outcome.difference)}`,
				variant: "success",
			};
		case "estimated-amount-payable":
			return {
				heading: `Estimated amount payable ₹ ${rupeeFormat(estimate.outcome.difference)}`,
				variant: "warning",
			};
		case "balanced":
			return {
				heading: "Balanced — taxes paid match the computed liability",
				variant: "info",
			};
		default: {
			const _exhaustive: never = estimate.outcome;
			return _exhaustive;
		}
	}
};

type SummaryRow = Readonly<{ label: string; value: string; hint?: string }>;

const summaryRows = (
	estimate: Extract<RefundOrAmountPayableEstimate, { kind: "computed" }>,
): readonly SummaryRow[] => {
	const receiptExplanations = estimate.acceptedTaxPayments.map(
		(receipt) =>
			`${String(receipt.factKey)} challan ${receipt.challanReference} (₹ ${rupeeFormat(receipt.amount)})`,
	);
	return [
		{
			label: "Salary income after standard deduction",
			value: `₹ ${rupeeFormat(estimate.summary.salaryAdjustedIncome)}`,
			hint: "From the accepted Form 16 salary slice, before rounding",
		},
		{
			label: "Accepted bank interest",
			value: `₹ ${rupeeFormat(estimate.summary.bankInterestTotal)}`,
			hint: "Savings-account and deposit interest from the AIS export",
		},
		{
			label: "Accepted non-salary income",
			value: `₹ ${rupeeFormat(estimate.summary.nonSalaryIncomeTotal)}`,
			hint: "Gross receipts from accepted Form 16A certificate records",
		},
		{
			label: "Total income (rounded)",
			value: `₹ ${rupeeFormat(estimate.summary.totalIncome)}`,
			hint: "Rounded once under section 288A",
		},
		{
			label: "Slab tax",
			value: `₹ ${rupeeFormat(estimate.summary.incomeTaxBeforeAdjustments)}`,
		},
		{
			label: "Rebate applied",
			value: `₹ ${rupeeFormat(estimate.summary.rebateApplied)}`,
		},
		{
			label: "Marginal relief applied",
			value: `₹ ${rupeeFormat(estimate.summary.marginalReliefApplied)}`,
		},
		{
			label: "Surcharge",
			value: `₹ ${rupeeFormat(estimate.summary.surcharge)}`,
		},
		{
			label: "Health and education cess",
			value: `₹ ${rupeeFormat(estimate.summary.cess)}`,
		},
		{
			label: "Final tax liability",
			value: `₹ ${rupeeFormat(estimate.summary.finalTaxLiability)}`,
			hint: "Rounded under section 288B",
		},
		{
			label: "Taxes paid (TDS deposits and challan payments)",
			value: `₹ ${rupeeFormat(estimate.summary.taxesPaid)}`,
			...(receiptExplanations.length > 0
				? {
						hint: `Changed by accepted e-Pay Tax receipt${receiptExplanations.length === 1 ? "" : "s"}: ${receiptExplanations.join("; ")}`,
					}
				: {}),
		},
	];
};

export const EstimateView = ({
	estimate,
}: Readonly<{ estimate: RefundOrAmountPayableEstimate | undefined }>) => {
	if (estimate === undefined) {
		return null;
	}

	if (estimate.kind === "blocked") {
		return (
			<Card className="openitr-estimate-card" component="section">
				<CardTitle>
					<Title headingLevel="h2" size="lg">
						Estimated refund or amount payable
					</Title>
				</CardTitle>
				<CardBody>
					<Alert isInline title="Educational analysis only" variant="info">
						This estimate reconciles your accepted salary, bank-interest,
						non-salary-income, tax-deducted-at-source, and e-Pay Tax
						receipt evidence with the pinned rule pack. It is not tax
						advice. Review every figure yourself.
					</Alert>
					<p>
						A final estimate needs accepted facts from every slice below.
						The missing or disputed items need review first.
					</p>
					{estimate.issues.map((issue, index) => (
						<Alert
							key={`${String(issue.code)}-${index}`}
							title={`${String(issue.code)}: ${issue.affectedFactKeys.join(", ") || "required facts"}`}
							variant="warning"
						>
							{issue.recoveryAction}
						</Alert>
					))}
				</CardBody>
			</Card>
		);
	}

	const presentation = outcomePresentation(estimate);

	return (
		<Card className="openitr-estimate-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Estimated refund or amount payable
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					This estimate reconciles your accepted salary, bank-interest,
					non-salary-income, tax-deducted-at-source, and e-Pay Tax receipt
					evidence with the pinned rule pack. It is not an official result,
					not tax advice, and not a filing computation. Review every figure
					yourself.
				</Alert>
				<Alert
					isInline
					title={presentation.heading}
					variant={presentation.variant}
				>
					One result from this reconciliation: computed liability compared
					against accepted taxes paid.
				</Alert>
				<dl className="openitr-result-details">
					{summaryRows(estimate).map((row) => (
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
				<p className="openitr-trace-heading">
					Source evidence behind the estimate
				</p>
				<ul className="openitr-evidence-sources">
					{estimate.sources.map((source) => (
						<li key={`${source.role}-${String(source.factKey)}`}>
							<strong>{roleLabels[source.role]}</strong>{" "}
							<code>{String(source.factKey)}</code> ·{" "}
							{source.observationIds.length} observation
							{source.observationIds.length === 1 ? "" : "s"} · document{" "}
							<code>{String(source.sourceDocumentId).slice(0, 16)}…</code>
						</li>
					))}
					{estimate.resolvedFactContributions.map((contribution) => (
						<li key={contribution.resolutionId}>
							<strong>Attested by you</strong>{" "}
							<code>{String(contribution.factKey)}</code> ·{" "}
							{rupeeFormat(contribution.value)} · resolution{" "}
							<code>{contribution.resolutionId.slice(0, 24)}…</code>
						</li>
					))}
				</ul>
				<ComputationTraceList nodes={estimate.nodes} />
			</CardBody>
		</Card>
	);
};
