import type {
	EstimatedBalance,
	ExactAmountDifference,
	FactSetRevision,
	Regime,
	RegimeComparison,
} from "@openitr/itr1-ay2026-27";
import {
	Content,
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	FormGroup,
	FormHelperText,
	HelperText,
	HelperTextItem,
	Radio,
	Title,
} from "@patternfly/react-core";
import {
	Caption,
	Table,
	Tbody,
	Td,
	Th,
	Thead,
	Tr,
} from "@patternfly/react-table";

import type { SessionOrchestrator } from "../session/session-orchestrator";
import { rupeeFormat } from "./computation-trace-view";

const differenceText = (difference: ExactAmountDifference): string => {
	switch (difference.kind) {
		case "equal":
			return "Same exact amount";
		case "old-higher":
			return `Old regime is ₹ ${rupeeFormat(difference.amount)} higher`;
		case "new-higher":
			return `New regime is ₹ ${rupeeFormat(difference.amount)} higher`;
		default: {
			const _exhaustive: never = difference;
			return _exhaustive;
		}
	}
};

const balanceText = (balance: EstimatedBalance): string => {
	switch (balance.kind) {
		case "refund":
			return `Estimated refund ₹ ${rupeeFormat(balance.amount)}`;
		case "amount-payable":
			return `Estimated amount payable ₹ ${rupeeFormat(balance.amount)}`;
		case "settled":
			return "No estimated refund or amount payable";
		default: {
			const _exhaustive: never = balance;
			return _exhaustive;
		}
	}
};

const RegimeSummary = ({
	name,
	factSetRevision,
	rulePackRevision,
	balance,
}: Readonly<{
	name: string;
	factSetRevision: FactSetRevision;
	rulePackRevision: string;
	balance: EstimatedBalance;
}>) => (
	<section className="openitr-regime-summary">
		<h3>{name}</h3>
		<DescriptionList isCompact isHorizontal>
			<DescriptionListGroup>
				<DescriptionListTerm>Fact-set revision</DescriptionListTerm>
				<DescriptionListDescription>
					{factSetRevision}
				</DescriptionListDescription>
			</DescriptionListGroup>
			<DescriptionListGroup>
				<DescriptionListTerm>Rule-pack revision</DescriptionListTerm>
				<DescriptionListDescription>
					{rulePackRevision}
				</DescriptionListDescription>
			</DescriptionListGroup>
			<DescriptionListGroup>
				<DescriptionListTerm>Estimated balance</DescriptionListTerm>
				<DescriptionListDescription>
					{balanceText(balance)}
				</DescriptionListDescription>
			</DescriptionListGroup>
		</DescriptionList>
	</section>
);

export const RegimeComparisonView = ({
	comparison,
	primaryRegime,
	session,
}: Readonly<{
	comparison: RegimeComparison | undefined;
	primaryRegime:
		| Readonly<{ regime: Regime; factSetRevision: FactSetRevision }>
		| undefined;
	session: SessionOrchestrator;
}>) => {
	if (comparison?.kind !== "computed") return null;
	const selectedRegime =
		primaryRegime?.factSetRevision === comparison.factSetRevision
			? primaryRegime.regime
			: undefined;
	const choose = (regime: Regime): void => {
		session.send({ kind: "select-primary-regime", regime });
	};

	return (
		<section
			className="openitr-regime-comparison"
			id="regime-comparison-heading"
		>
			<Title headingLevel="h2" size="lg">
				Compare old and new regimes
			</Title>
			<p>
				Both calculations use the same accepted facts. OpenITR does not choose a
				regime or describe either one as universally better.
			</p>
			<p className="openitr-regime-revision">
				Fact-set revision {comparison.factSetRevision}
			</p>
			<div className="openitr-regime-summaries">
				<RegimeSummary
					balance={comparison.oldRegime.estimatedBalance}
					factSetRevision={comparison.oldRegime.factSetRevision}
					name="Old regime"
					rulePackRevision={comparison.oldRegime.rulePackRevision}
				/>
				<RegimeSummary
					balance={comparison.newRegime.estimatedBalance}
					factSetRevision={comparison.newRegime.factSetRevision}
					name="New regime"
					rulePackRevision={comparison.newRegime.rulePackRevision}
				/>
			</div>
			<Table
				aria-label="Exact comparison of calculated amounts"
				variant="compact"
			>
				<Caption>Exact comparison of calculated amounts</Caption>
				<Thead>
					<Tr>
						<Th>Result</Th>
						<Th>Old regime</Th>
						<Th>New regime</Th>
						<Th>Exact difference</Th>
					</Tr>
				</Thead>
				<Tbody>
					{comparison.rows.map((row) => (
						<Tr data-comparison-row={row.id} key={row.id}>
							<Th dataLabel="Result" scope="row">
								{row.label}
							</Th>
							<Td dataLabel="Old regime">
								₹ {rupeeFormat(row.oldRegimeAmount)}
							</Td>
							<Td dataLabel="New regime">
								₹ {rupeeFormat(row.newRegimeAmount)}
							</Td>
							<Td dataLabel="Exact difference">
								{differenceText(row.difference)}
							</Td>
						</Tr>
					))}
				</Tbody>
			</Table>
			<p className="openitr-regime-balance-note">
				{comparison.balanceDifference.kind === "equal"
					? "Both estimated balances are equal."
					: `The estimated balances differ by ₹ ${rupeeFormat(comparison.balanceDifference.amount)}.`}{" "}
				Both use taxes paid of ₹ {rupeeFormat(comparison.taxesPaid)}.
			</p>
			<FormGroup
				fieldId="primary-regime"
				isStack
				label="Choose the primary analysis scenario"
				role="radiogroup"
			>
				<Content component="p" id="primary-regime-help">
					Choose explicitly after reviewing the exact differences. You can
					change the choice while these facts remain current.
				</Content>
				<Radio
					aria-describedby="primary-regime-help"
					id="primary-regime-old"
					isChecked={selectedRegime === "old"}
					label="Old regime"
					name="primary-regime"
					onChange={() => choose("old")}
				/>
				<Radio
					aria-describedby="primary-regime-help"
					id="primary-regime-new"
					isChecked={selectedRegime === "new"}
					label="New regime"
					name="primary-regime"
					onChange={() => choose("new")}
				/>
				<FormHelperText>
					<HelperText isLiveRegion>
						<HelperTextItem>
							{selectedRegime === undefined
								? "No primary scenario selected."
								: `${selectedRegime === "old" ? "Old" : "New"} regime is the primary analysis scenario for ${comparison.factSetRevision}.`}
						</HelperTextItem>
					</HelperText>
				</FormHelperText>
			</FormGroup>
		</section>
	);
};
