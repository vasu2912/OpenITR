import type {
	ComputationNodeInput,
	ComputationTraceNode,
	NewRegimeSalaryComputation,
} from "@openitr/itr1-ay2026-27";
import {
	Alert,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";

// Display-only grouping of an exact decimal string. Arithmetic never passes
// through here.
const rupeeFormat = (value: string): string => {
	const [wholePart = "", fraction] = value.split(".");
	if (!/^\d+$/.test(wholePart)) {
		return value;
	}
	const grouped = new Intl.NumberFormat("en-IN").format(Number(wholePart));
	return fraction === undefined ? grouped : `${grouped}.${fraction}`;
};

const inputLabel = (input: ComputationNodeInput): string => {
	switch (input.kind) {
		case "fact":
			return `Fact ${input.factKey} = ₹ ${rupeeFormat(input.value)}`;
		case "node":
			return `From ${input.nodeId} = ₹ ${rupeeFormat(input.value)}`;
		case "rule-pack-constant":
			return `Rule-pack constant ${input.name} = ${input.wholeRupees}`;
		case "user-answer":
			return `Your answer to ${input.questionId}: ${input.value}`;
	}
};

const NodeCard = ({ node }: Readonly<{ node: ComputationTraceNode }>) => (
	<details className="openitr-trace-node">
		<summary>
			<strong>{node.nodeId}</strong>
			<span className="openitr-trace-node-value">
				₹ {rupeeFormat(node.roundedValue)}
			</span>
		</summary>
		<dl className="openitr-trace-details">
			<div>
				<dt>Rule</dt>
				<dd>{node.ruleId}</dd>
			</div>
			<div>
				<dt>Rule-pack revision</dt>
				<dd>{node.rulePackRevision}</dd>
			</div>
			<div>
				<dt>Operation</dt>
				<dd>{node.operation}</dd>
			</div>
			<div>
				<dt>Unrounded</dt>
				<dd>{node.unroundedValue}</dd>
			</div>
			<div>
				<dt>Rounded</dt>
				<dd>{node.roundedValue}</dd>
			</div>
			{Object.hasOwn(node, "roundingMode") && node.roundingMode ? (
				<div>
					<dt>Rounding mode</dt>
					<dd>{node.roundingMode}</dd>
				</div>
			) : null}
		</dl>
		<ul className="openitr-trace-inputs">
			{node.inputs.map((input, index) => (
				<li key={`${input.kind}-${index}`}>{inputLabel(input)}</li>
			))}
		</ul>
		{node.note ? (
			<p className="openitr-trace-note">{node.note}</p>
		) : null}
	</details>
);

type SummaryRow = Readonly<{ label: string; value: string; hint?: string }>;

const summaryRows = (
	computation: Extract<
		NewRegimeSalaryComputation,
		{ kind: "computed" }
	>,
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
						<p className="openitr-trace-heading">
							Computation trace — every node cites its rule, revision,
							unrounded result, and rounded result
						</p>
						<div className="openitr-trace-list">
							{computation.nodes.map((node) => (
								<NodeCard key={node.nodeId} node={node} />
							))}
						</div>
					</>
				)}
			</CardBody>
		</Card>
	);
};
