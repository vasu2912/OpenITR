import type { OldRegimeComputation } from "@openitr/itr1-ay2026-27";
import {
	Alert,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

import { ComputationTraceList, rupeeFormat } from "./computation-trace-view";

type ComputedOldRegime = Extract<OldRegimeComputation, { kind: "computed" }>;

type SummaryRow = Readonly<{
	label: string;
	value: string;
	hint?: string;
}>;

const ageCategoryLabels: Readonly<
	Record<ComputedOldRegime["ageCategory"], string>
> = Object.freeze({
	"under-60": "Under 60",
	"60-to-79": "Age 60 to 79",
	"80-or-older": "Age 80 or older",
});

const amount = (value: string): string => `₹ ${rupeeFormat(value)}`;

const incomeRows = (computation: ComputedOldRegime): readonly SummaryRow[] => [
	{
		label: "Salary income after standard deduction",
		value: amount(computation.summary.salaryIncome),
	},
	{
		label: "House-property income",
		value: amount(computation.summary.housePropertyIncome),
	},
	{
		label: "House-property loss set off",
		value: amount(computation.summary.housePropertyLoss),
		hint: "Subtracted when calculating gross total income",
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
		hint: "Included in total income and taxed under its separate rule",
	},
	{
		label: "Gross total income",
		value: amount(computation.summary.grossTotalIncome),
	},
	{
		label: "Agricultural income, reported as exempt",
		value: amount(computation.summary.agriculturalIncome),
		hint: "Excluded from taxable income under the pinned agricultural-income rule",
	},
];

const taxableIncomeRows = (
	computation: ComputedOldRegime,
): readonly SummaryRow[] => [
	{
		label: "Deductions claimed",
		value: amount(computation.summary.deductionsClaimed),
	},
	{
		label: "Deductions allowed",
		value: amount(computation.summary.deductionsAllowed),
		hint: "Limited to the eligible ordinary income",
	},
	{
		label: "Total income (taxable income, rounded)",
		value: amount(computation.summary.totalIncome),
		hint: "Gross total income less allowed deductions, then statutory rounding",
	},
	{
		label: "Normal-rate income",
		value: amount(computation.summary.normalRateIncome),
		hint: "Total income after removing the separately taxed section 112A gain",
	},
];

const liabilityRows = (
	computation: ComputedOldRegime,
): readonly SummaryRow[] => [
	{
		label: "Slab tax before rebate",
		value: amount(computation.summary.incomeTaxBeforeRebate),
	},
	{
		label: "Section 112A tax",
		value: amount(computation.summary.section112aTax),
	},
	{
		label: "Rebate applied",
		value: amount(computation.summary.rebateApplied),
		hint: "Subtracted from the eligible ordinary slab tax",
	},
	{
		label: "Surcharge",
		value: amount(computation.summary.surcharge),
	},
	{
		label: "Surcharge marginal relief",
		value: amount(computation.summary.surchargeMarginalRelief),
		hint: "Subtracted when the surcharge rule applies",
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

export const OldRegimeComputationView = ({
	computation,
}: Readonly<{ computation: OldRegimeComputation | undefined }>) => {
	if (computation === undefined) {
		return null;
	}

	return (
		<Card className="openitr-old-regime-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Old-regime tax computation
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
						<p>
							Resident age category: {ageCategoryLabels[computation.ageCategory]}.
						</p>
						<section aria-labelledby="old-regime-income-heading">
							<h3 id="old-regime-income-heading">Income reconciliation</h3>
							<p>
								Gross total income combines salary, house-property income less
								house-property loss, bank interest, other-source income, and
								section 112A gain.
							</p>
							<SummaryRows rows={incomeRows(computation)} />
						</section>
						<section aria-labelledby="old-regime-taxable-income-heading">
							<h3 id="old-regime-taxable-income-heading">
								Taxable-income reconciliation
							</h3>
							<SummaryRows rows={taxableIncomeRows(computation)} />
						</section>
						<section aria-labelledby="old-regime-liability-heading">
							<h3 id="old-regime-liability-heading">
								Tax-liability reconciliation
							</h3>
							<p>
								Final tax liability combines slab tax and section 112A tax, less
								rebate and marginal relief, plus surcharge and cess, then applies
								the statutory rounding rule.
							</p>
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
