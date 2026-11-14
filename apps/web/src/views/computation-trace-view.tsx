import type {
	ComputationNodeInput,
	ComputationTraceNode,
} from "@openitr/itr1-ay2026-27";
import type { ReactNode } from "react";
import { keyed } from "./keyed";
import { FactLabel, humanizeKey } from "./plain-language";

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

const inputLabel = (input: ComputationNodeInput): ReactNode => {
	switch (input.kind) {
		case "fact":
			return (
				<>
					<FactLabel factKey={input.factKey} />: ₹ {rupeeFormat(input.value)}
				</>
			);
		case "node":
			return `${humanizeKey(input.nodeId)}: ₹ ${rupeeFormat(input.value)}`;
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
	targetId,
}: Readonly<{ node: ComputationTraceNode; targetId?: string }>) => (
	<details className="openitr-trace-node" id={targetId}>
		<summary>
			<strong>{humanizeKey(node.nodeId)}</strong>
			<span className="openitr-trace-node-value">
				₹ {rupeeFormat(node.roundedValue)}
			</span>
		</summary>
		<dl className="openitr-trace-details">
			<div>
				<dt>Step</dt>
				<dd>{node.nodeId}</dd>
			</div>
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
			{keyed(node.inputs, (input) => input.kind).map(({ key, item: input }) => (
				<li key={key}>{inputLabel(input)}</li>
			))}
		</ul>
		{node.note ? <p className="openitr-trace-note">{node.note}</p> : null}
	</details>
);

export const ComputationTraceList = ({
	nodes,
	targetPrefix,
}: Readonly<{
	nodes: readonly ComputationTraceNode[];
	targetPrefix?: string;
}>) => {
	const occurrences = new Map<string, number>();
	return (
		<>
			<p className="openitr-trace-heading">
				How this was calculated. Open a step to see its rule, inputs, and
				rounding.
			</p>
			<div className="openitr-trace-list">
				{nodes.map((node) => {
					const nodeId = String(node.nodeId);
					const occurrence = (occurrences.get(nodeId) ?? 0) + 1;
					occurrences.set(nodeId, occurrence);
					const occurrenceSuffix = occurrence === 1 ? "" : `-${occurrence}`;
					return (
						<ComputationNodeCard
							key={`${nodeId}${occurrenceSuffix}`}
							node={node}
							{...(targetPrefix === undefined
								? {}
								: {
										targetId: `trace-${targetPrefix}-${nodeId}${occurrenceSuffix}`,
									})}
						/>
					);
				})}
			</div>
		</>
	);
};
