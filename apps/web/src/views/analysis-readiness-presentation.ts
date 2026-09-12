import type {
	AnalysisReadiness,
	AnalysisReadinessState,
} from "../session/analysis-readiness";

const presentations: Readonly<
	Record<
		AnalysisReadinessState,
		Readonly<{
			title: string;
			variant: "success" | "warning" | "danger";
			explanation: string;
		}>
	>
> = Object.freeze({
	"analysis-ready": Object.freeze({
		title: "Analysis-ready",
		variant: "success",
		explanation:
			"The requested educational computations and explanations are available with complete provenance for the reviewed fact revision.",
	}),
	"needs-review": Object.freeze({
		title: "Needs review",
		variant: "warning",
		explanation:
			"Results are available, but the items below require review before this analysis is complete.",
	}),
	blocked: Object.freeze({
		title: "Blocked",
		variant: "danger",
		explanation:
			"Missing or unsupported evidence prevents one or more requested analysis results.",
	}),
});

export const readinessPresentationOf = (
	readiness: Pick<AnalysisReadiness, "state">,
) => presentations[readiness.state];
