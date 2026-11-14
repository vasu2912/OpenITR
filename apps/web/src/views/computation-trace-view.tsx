import type {
	ComputationNodeInput,
	ComputationTraceNode,
} from "@openitr/itr1-ay2026-27";
import {
	Content,
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	ExpandableSection,
	Flex,
	List,
	ListItem,
} from "@patternfly/react-core";
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

// One expandable calculation step: label and amount in the toggle, rule
// details inside. Shared by every computation view.
export const TraceStep = ({
	children,
	id,
	label,
	value,
}: Readonly<{
	children: ReactNode;
	id?: string | undefined;
	label: ReactNode;
	value: ReactNode;
}>) => (
	<ExpandableSection
		className="openitr-trace-step"
		{...(id === undefined ? {} : { id })}
		toggleContent={
			<Flex
				justifyContent={{ default: "justifyContentSpaceBetween" }}
				spaceItems={{ default: "spaceItemsMd" }}
			>
				<strong>{label}</strong>
				<span>{value}</span>
			</Flex>
		}
	>
		<DescriptionList isCompact isHorizontal>
			{children}
		</DescriptionList>
	</ExpandableSection>
);

export const TraceDetail = ({
	children,
	term,
}: Readonly<{ children: ReactNode; term: string }>) => (
	<DescriptionListGroup>
		<DescriptionListTerm>{term}</DescriptionListTerm>
		<DescriptionListDescription>{children}</DescriptionListDescription>
	</DescriptionListGroup>
);

export const ComputationNodeCard = ({
	node,
	targetId,
}: Readonly<{ node: ComputationTraceNode; targetId?: string }>) => (
	<TraceStep
		id={targetId}
		label={humanizeKey(node.nodeId)}
		value={`₹ ${rupeeFormat(node.roundedValue)}`}
	>
		<TraceDetail term="Step">{node.nodeId}</TraceDetail>
		<TraceDetail term="Rule">{node.ruleId}</TraceDetail>
		<TraceDetail term="Rule-pack revision">{node.rulePackRevision}</TraceDetail>
		<TraceDetail term="Operation">{node.operation}</TraceDetail>
		<TraceDetail term="Unrounded">{node.unroundedValue}</TraceDetail>
		<TraceDetail term="Rounded">{node.roundedValue}</TraceDetail>
		{Object.hasOwn(node, "roundingMode") && node.roundingMode ? (
			<TraceDetail term="Rounding mode">{node.roundingMode}</TraceDetail>
		) : null}
		<TraceDetail term="Inputs">
			<List isPlain>
				{keyed(node.inputs, (input) => input.kind).map(
					({ key, item: input }) => (
						<ListItem key={key}>{inputLabel(input)}</ListItem>
					),
				)}
			</List>
		</TraceDetail>
		{node.note ? <TraceDetail term="Note">{node.note}</TraceDetail> : null}
	</TraceStep>
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
			<Content component="p">
				How this was calculated. Open a step to see its rule, inputs, and
				rounding.
			</Content>
			<div>
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
