import { Alert, Content, ExpandableSection } from "@patternfly/react-core";
import { createContext, useContext } from "react";

import { type FactLabeler, humanizeKey } from "./fact-labels";

export {
	createFactLabeler,
	type FactLabeler,
	humanizeKey,
} from "./fact-labels";

const FactLabelContext = createContext<FactLabeler>(humanizeKey);

export const FactLabelProvider = FactLabelContext.Provider;

export const useFactLabel = (): FactLabeler => useContext(FactLabelContext);

type DisplayIssue = Readonly<{
	code: unknown;
	recoveryAction: string;
	affectedFacts?: readonly unknown[];
	affectedFactKeys?: readonly unknown[];
	factKeys?: readonly unknown[];
	category?: unknown;
}>;

export const IssueAlert = ({
	issue,
	variant = "warning",
}: Readonly<{
	issue: DisplayIssue;
	variant?: "warning" | "danger" | "info";
}>) => {
	const labelOf = useFactLabel();
	const factKeys = [
		...(issue.affectedFacts ?? issue.affectedFactKeys ?? issue.factKeys ?? []),
	].map(String);
	return (
		<Alert isInline title={issue.recoveryAction} variant={variant}>
			{factKeys.length === 0 ? null : (
				<Content component="ul">
					{factKeys.map((factKey) => (
						<Content component="li" key={factKey}>
							{labelOf(factKey)}
						</Content>
					))}
				</Content>
			)}
			<ExpandableSection isIndented toggleText="Technical details">
				<Content component="small">
					Code {String(issue.code)}
					{issue.category === undefined ? "" : ` · ${String(issue.category)}`}
					{factKeys.length === 0 ? "" : ` · Facts ${factKeys.join(", ")}`}
				</Content>
			</ExpandableSection>
		</Alert>
	);
};

export const FactLabel = ({ factKey }: Readonly<{ factKey: unknown }>) => {
	const labelOf = useFactLabel();
	return <>{labelOf(factKey)}</>;
};
