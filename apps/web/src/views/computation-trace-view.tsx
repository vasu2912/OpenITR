import type { ComputationNodeInput, ComputationTraceNode } from "@openitr/itr1-ay2026-27";

// Display-only grouping of an exact decimal string. Arithmetic never passes
// through here.
export const rupeeFormat = (value: string): string => {
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
		default: {
			const _exhaustive: never = input;
			return _exhaustive;
		}
	}
};

export const ComputationNodeCard = ({
	node,
}: Readonly<{ node: ComputationTraceNode }>) => (
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

export const ComputationTraceList = ({
	nodes,
}: Readonly<{ nodes: readonly ComputationTraceNode[] }>) => (
	<>
		<p className="openitr-trace-heading">
			Computation trace — every node cites its rule, revision, unrounded
			result, and rounded result
		</p>
		<div className="openitr-trace-list">
			{nodes.map((node) => (
				<ComputationNodeCard key={node.nodeId} node={node} />
			))}
		</div>
	</>
);
