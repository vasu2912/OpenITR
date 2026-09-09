import type { NewRegimeComputation } from "@openitr/itr1-ay2026-27";
import {
	Alert,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

import { ComputationTraceList, rupeeFormat } from "./computation-trace-view";

type ComputedNewRegime = Extract<NewRegimeComputation, { kind: "computed" }>;

type SummaryRow = Readonly<{
	label: string;
	value: string;
	hint?: string;
}>;

const amount = (value: string): string => `₹ ${rupeeFormat(value)}`;

const SummaryRows = ({ rows }: Readonly<{ rows: readonly SummaryRow[] }>) => (
	<dl className="openitr-result-details">
		{rows.map((row) => (
			<div key={row.label}>
				<dt>{row.label}</dt>
				<dd>
					<strong>{row.value}</strong>
					{row.hint ? (
						<small className="openitr-summary-hint"> {row.hint}</small>
					) : null}
				</dd>
			</div>
		))}
	</dl>
);

const incomeRows = (computation: ComputedNewRegime): readonly SummaryRow[] => [
	{
		label: "Salary income after standard deduction",
		value: amount(computation.summary.salaryIncome),
	},
	{
		label: "House-property income",
		value: amount(computation.summary.housePropertyIncome),
	},
	{
		label: "House-property loss excluded from set-off",
		value: amount(computation.summary.housePropertyLossExcluded),
		hint: "Visible here but not subtracted from another income head",
	},
	{
		label: "Bank-interest income",
		value: amount(computation.summary.bankInterestIncome),
	},
	{
		label: "Other-source income",
		value: amount(computation.summary.otherSourcesIncome),
	},
	{
		label: "Section 112A gain",
		value: amount(computation.summary.section112aGain),
		hint: "Included in total income and kept outside normal slab tax",
	},
	{
		label: "Gross total income",
		value: amount(computation.summary.grossTotalIncome),
	},
	{
		label: "Agricultural income, reported as exempt",
		value: amount(computation.summary.agriculturalIncome),
		hint: "Excluded from taxable income under the pinned rule",
	},
];

const deductionLabels = Object.freeze({
	savingsAndPension: "Savings and pension",
	healthAndDisability: "Health and disability",
	loanInterest: "Loan interest",
	donations: "Donations",
	remaining: "Remaining approved deductions",
});

const deductionRows = (
	computation: ComputedNewRegime,
): readonly SummaryRow[] =>
	(Object.keys(deductionLabels) as (keyof typeof deductionLabels)[]).map(
		(category) => {
			const comparison = computation.deductionComparison[category];
			return {
				label: deductionLabels[category],
				value: amount(comparison.excludedFromNewRegime),
				hint: `${amount(comparison.oldRegimeAllowed)} allowed under the old-regime slice; ${amount(comparison.newRegimeAllowed)} remains allowed here`,
			};
		},
	);

const taxableIncomeRows = (
	computation: ComputedNewRegime,
): readonly SummaryRow[] => [
	{
		label: "Deductions allowed",
		value: amount(computation.summary.deductionsAllowed),
		hint: "Only amounts retained by the completed new-regime slices",
	},
	{
		label: "Total income (taxable income, rounded)",
		value: amount(computation.summary.totalIncome),
		hint: "Gross total income less allowed deductions, then statutory rounding",
	},
	{
		label: "Normal-rate income",
		value: amount(computation.summary.normalRateIncome),
		hint: "Total income after removing the separately treated section 112A gain",
	},
];

const liabilityRows = (
	computation: ComputedNewRegime,
): readonly SummaryRow[] => [
	{
		label: "Slab tax before adjustments",
		value: amount(computation.summary.incomeTaxBeforeAdjustments),
	},
	{
		label: "Section 112A tax",
		value: amount(computation.summary.section112aTax),
	},
	{
		label: "Rebate applied",
		value: amount(computation.summary.rebateApplied),
		hint: "Limited to normal-rate tax for a resident individual",
	},
	{
		label: "Section 87A marginal relief",
		value: amount(computation.summary.marginalReliefApplied),
	},
	{
		label: "Surcharge after marginal relief",
		value: amount(computation.summary.surcharge),
	},
	{
		label: "Surcharge marginal relief",
		value: amount(computation.summary.surchargeMarginalReliefApplied),
	},
	{
		label: "Health and education cess",
		value: amount(computation.summary.cess),
	},
	{
		label: "Final tax liability",
		value: amount(computation.summary.finalTaxLiability),
		hint: "Rounded under the pinned tax-rounding rule",
	},
];

export const NewRegimeComputationView = ({
	computation,
}: Readonly<{ computation: NewRegimeComputation | undefined }>) => {
	if (computation === undefined) return null;

	return (
		<Card className="openitr-new-regime-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					New-regime tax computation
				</Title>
			</CardTitle>
			<CardBody>
				<Alert isInline title="Educational analysis only" variant="info">
					This computation uses accepted evidence, recorded answers, and the
					pinned rule pack. It is not tax advice or a filing result. Review the
					figures and cited steps yourself.
				</Alert>
				{computation.kind === "computed" ? (
					<>
						<section aria-labelledby="new-regime-income-heading">
							<h3 id="new-regime-income-heading">Income reconciliation</h3>
							<SummaryRows rows={incomeRows(computation)} />
						</section>
						<section aria-labelledby="new-regime-exclusions-heading">
							<h3 id="new-regime-exclusions-heading">
								Deductions excluded from new regime
							</h3>
							<p>
								Each row compares the amount allowed by the completed old-regime
								slice with the amount retained by the new-regime slice.
							</p>
							<SummaryRows rows={deductionRows(computation)} />
						</section>
						<section aria-labelledby="new-regime-taxable-income-heading">
							<h3 id="new-regime-taxable-income-heading">
								Taxable-income reconciliation
							</h3>
							<SummaryRows rows={taxableIncomeRows(computation)} />
						</section>
						<section aria-labelledby="new-regime-liability-heading">
							<h3 id="new-regime-liability-heading">
								Tax-liability reconciliation
							</h3>
							<SummaryRows rows={liabilityRows(computation)} />
						</section>
						<ComputationTraceList nodes={computation.nodes} />
					</>
				) : (
					<>
						<p>
							This result is blocked until every cited fact has accepted evidence
							or a permitted recorded answer.
						</p>
						{computation.issues.map((issue, index) => (
							<Alert
								isInline
								key={`${String(issue.code)}-${index}`}
								title={`${String(issue.code)}: ${issue.affectedFacts.map(String).join(", ") || "required facts"}`}
								variant="warning"
							>
								{issue.recoveryAction}
							</Alert>
						))}
					</>
				)}
			</CardBody>
		</Card>
	);
};
