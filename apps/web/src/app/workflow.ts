export type WorkflowPage = Readonly<{
	id: string;
	title: string;
	tabLabel: string;
	description: string;
	// Pages after document intake show this notice until a document is selected.
	unavailableNotice?: string;
}>;

export type WorkflowStage = Readonly<{
	id: string;
	label: string;
	pages: readonly WorkflowPage[];
}>;

export const workflowStages = [
	{
		id: "scope",
		label: "Scope check",
		pages: [
			{
				id: "scope-questions",
				title: "Scope questions",
				tabLabel: "Questions",
				description:
					"Answer one question at a time so OpenITR can tell whether ITR-1 analysis covers your situation.",
			},
			{
				id: "scope-decisions",
				title: "Scope decision",
				tabLabel: "Decision",
				description:
					"See how your answers place this analysis inside or outside the supported scope.",
			},
			{
				id: "scope-evidence",
				title: "Evidence needed",
				tabLabel: "Evidence",
				description:
					"See which source documents this analysis needs and where its calculations stop.",
			},
		],
	},
	{
		id: "documents",
		label: "Documents",
		pages: [
			{
				id: "documents",
				title: "Documents",
				tabLabel: "Documents",
				description:
					"Add your tax documents. OpenITR reads them in this tab and lists what it found in each one.",
			},
		],
	},
	{
		id: "review",
		label: "Review facts",
		pages: [
			{
				id: "review",
				title: "Review facts",
				tabLabel: "Review facts",
				description:
					"Fill in missing facts, settle conflicts between documents, and check each value against its source.",
				unavailableNotice:
					"Add source documents first. This page lists the facts they contain.",
			},
		],
	},
	{
		id: "computations",
		label: "Computations",
		pages: [
			{
				id: "income-computations",
				title: "Income",
				tabLabel: "Income",
				description:
					"Each income category that feeds this analysis, with the facts behind it.",
				unavailableNotice:
					"Add source documents and answer the required questions to see income computations.",
			},
			{
				id: "deductions",
				title: "Deductions",
				tabLabel: "Deductions",
				description:
					"Each deduction category and the facts used to calculate it.",
				unavailableNotice:
					"Add source documents and answer the required questions to see deductions.",
			},
			{
				id: "tax-comparison",
				title: "Tax and regime comparison",
				tabLabel: "Tax comparison",
				description:
					"Compare the old and new regimes, inspect both calculations, and see the estimate.",
				unavailableNotice: "Finish reviewing facts to compare the regimes.",
			},
		],
	},
	{
		id: "analysis",
		label: "Analysis",
		pages: [
			{
				id: "analysis",
				title: "Analysis",
				tabLabel: "Analysis",
				description:
					"The complete analysis, planning notes, and what still blocks a full result.",
				unavailableNotice:
					"Finish the earlier steps to see the complete analysis.",
			},
		],
	},
	{
		id: "final-review",
		label: "Final review",
		pages: [
			{
				id: "final-review",
				title: "Final review",
				tabLabel: "Final review",
				description:
					"Confirm the accepted facts, evidence, warnings, and limits in one place.",
				unavailableNotice:
					"Finish the earlier steps to confirm the final review.",
			},
		],
	},
] as const satisfies readonly WorkflowStage[];

export type WorkflowPageId =
	(typeof workflowStages)[number]["pages"][number]["id"];

export const workflowPages: readonly (WorkflowPage & {
	id: WorkflowPageId;
	stage: WorkflowStage;
})[] = workflowStages.flatMap((stage) =>
	stage.pages.map((page) => ({ ...page, stage })),
);

export const pageIndexOf = (pageId: WorkflowPageId): number =>
	workflowPages.findIndex((page) => page.id === pageId);

export const pageForTarget = (targetId: string): WorkflowPageId | undefined => {
	if (targetId.startsWith("scope-question-")) return "scope-questions";
	if (targetId.startsWith("scope-decision-")) return "scope-decisions";
	if (targetId === "scope-calculation-limits-heading") return "scope-evidence";
	if (targetId.startsWith("document-")) return "documents";
	if (
		targetId.startsWith("observation-") ||
		targetId.startsWith("answer-") ||
		targetId.startsWith("resolution-") ||
		targetId.startsWith("question-") ||
		targetId.startsWith("conflict-")
	) {
		return "review";
	}
	if (
		targetId === "regime-comparison-heading" ||
		targetId.startsWith("trace-")
	) {
		return "tax-comparison";
	}
	if (targetId === "final-review-heading") return "final-review";
	return undefined;
};

export type ScopeStatus = "in-progress" | "complete" | "blocked";
