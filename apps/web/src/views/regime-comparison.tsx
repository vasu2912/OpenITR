import type {
	EstimatedBalance,
	ExactAmountDifference,
	FactSetRevision,
	Regime,
	RegimeComparison,
} from "@openitr/itr1-ay2026-27";
import {
	Card,
	CardBody,
	CardTitle,
	Radio,
	Title,
} from "@patternfly/react-core";

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
		<dl>
			<div>
				<dt>Fact-set revision</dt>
				<dd>{factSetRevision}</dd>
			</div>
			<div>
				<dt>Rule-pack revision</dt>
				<dd>{rulePackRevision}</dd>
			</div>
			<div>
				<dt>Estimated balance</dt>
				<dd>{balanceText(balance)}</dd>
			</div>
		</dl>
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
		<Card className="openitr-regime-comparison" component="section" id="regime-comparison-heading">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Compare old and new regimes
				</Title>
			</CardTitle>
			<CardBody>
				<p>
					Both calculations use the same accepted facts. OpenITR does not choose
					a regime or describe either one as universally better.
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
				<div className="openitr-regime-table-wrap">
					<table>
						<caption>Exact comparison of calculated amounts</caption>
						<thead>
							<tr>
								<th scope="col">Result</th>
								<th scope="col">Old regime</th>
								<th scope="col">New regime</th>
								<th scope="col">Exact difference</th>
							</tr>
						</thead>
						<tbody>
							{comparison.rows.map((row) => (
								<tr data-comparison-row={row.id} key={row.id}>
									<th scope="row">{row.label}</th>
									<td data-label="Old regime">
										₹ {rupeeFormat(row.oldRegimeAmount)}
									</td>
									<td data-label="New regime">
										₹ {rupeeFormat(row.newRegimeAmount)}
									</td>
									<td data-label="Exact difference">
										{differenceText(row.difference)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="openitr-regime-balance-note">
					{comparison.balanceDifference.kind === "equal"
						? "Both estimated balances are equal."
						: `The estimated balances differ by ₹ ${rupeeFormat(comparison.balanceDifference.amount)}.`} Both use taxes paid of ₹ {rupeeFormat(comparison.taxesPaid)}.
				</p>
				<fieldset className="openitr-primary-regime">
					<legend>Choose the primary analysis scenario</legend>
					<p id="primary-regime-help">
						Choose explicitly after reviewing the exact differences. You can change
						the choice while these facts remain current.
					</p>
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
					<p aria-live="polite" className="openitr-primary-regime-status">
						{selectedRegime === undefined
							? "No primary scenario selected."
							: `${selectedRegime === "old" ? "Old" : "New"} regime is the primary analysis scenario for ${comparison.factSetRevision}.`}
					</p>
				</fieldset>
			</CardBody>
		</Card>
	);
};
