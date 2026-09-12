export type AnalysisReadinessState =
	| "analysis-ready"
	| "needs-review"
	| "blocked";

export type AnalysisReadinessIssueKind =
	| "scope-blocker"
	| "document-issue"
	| "missing-fact"
	| "source-conflict"
	| "computation-issue"
	| "attested-fact"
	| "resolved-conflict"
	| "calculation-limitation"
	| "analysis-not-started"
	| "primary-regime-required"
	| "final-review-required"
	| "recomputation-pending";

export type AnalysisReadinessIssue = Readonly<{
	id: string;
	kind: AnalysisReadinessIssueKind;
	severity: "blocking" | "review";
	factKeys: readonly string[];
	affectedResults: readonly string[];
	explanation: string;
	recoveryAction: string;
	targetId: string | undefined;
}>;

export type AvailableAnalysisResult = Readonly<{
	id: string;
	label: string;
	limitation: string;
}>;

export type ReadinessComputationIssue = Readonly<{
	code: string;
	severity: "blocking" | "review" | "warning" | "information";
	affectedFacts?: readonly string[];
	affectedFactKeys?: readonly string[];
	recoveryAction: string;
}>;

export type ReadinessResultInput = Readonly<{
	id: string;
	label: string;
	limitation: string;
	computation:
		| Readonly<{
				kind: string;
				issue?: ReadinessComputationIssue;
				issues?: readonly ReadinessComputationIssue[];
		  }>
		| undefined;
}>;

export type BuildAnalysisReadinessInput = Readonly<{
	analysisFactSetRevision: string | undefined;
	primaryRegimeFactSetRevision: string | undefined;
	confirmedFactSetRevision: string | undefined;
	pendingRecomputation: boolean;
	results: readonly ReadinessResultInput[];
	scopeIssues: readonly AnalysisReadinessIssue[];
	documentIssues: readonly AnalysisReadinessIssue[];
	missingFacts: readonly AnalysisReadinessIssue[];
	conflicts: readonly AnalysisReadinessIssue[];
	reviewFacts: readonly AnalysisReadinessIssue[];
}>;

export type AnalysisReadiness = Readonly<{
	state: AnalysisReadinessState;
	issues: readonly AnalysisReadinessIssue[];
	availableResults: readonly AvailableAnalysisResult[];
	educationalLimitations: readonly string[];
}>;

export const EDUCATIONAL_LIMITATIONS = Object.freeze([
	"OpenITR provides educational analysis only. It does not prepare, validate, or file a tax return.",
	"OpenITR does not provide tax, legal, accounting, investment, or other professional advice.",
	"OpenITR does not guarantee correctness, completeness, filing eligibility, portal acceptance, a refund, an amount payable, or any tax outcome.",
	"Review the evidence and calculations, perform your own due diligence, and consult a qualified professional when your situation is complex or uncertain.",
]);

const factsOf = (issue: ReadinessComputationIssue): readonly string[] =>
	Object.freeze(
		[...(issue.affectedFacts ?? issue.affectedFactKeys ?? [])].map(String),
	);

const computationIssuesOf = (
	result: ReadinessResultInput,
): readonly AnalysisReadinessIssue[] => {
	const computation = result.computation;
	if (computation === undefined) return [];
	const issues = computation.issues ??
		(computation.issue === undefined ? [] : [computation.issue]);
	return Object.freeze(
		issues.map((issue) =>
			Object.freeze({
				id: `${result.id}-${issue.code}`,
				kind: "computation-issue" as const,
				severity:
					issue.severity === "blocking" ? ("blocking" as const) : ("review" as const),
				factKeys: factsOf(issue),
				affectedResults: Object.freeze([result.label]),
				explanation: `${issue.code} prevents or limits ${result.label}.`,
				recoveryAction: issue.recoveryAction,
				targetId: undefined,
			}),
		),
	);
};

const availableResultsOf = (
	results: readonly ReadinessResultInput[],
): readonly AvailableAnalysisResult[] =>
	Object.freeze(
		results.flatMap((result) => {
			const kind = result.computation?.kind;
			return kind !== "computed" && kind !== "not-applicable"
				? []
				: [
						Object.freeze({
							id: result.id,
							label: result.label,
							limitation: result.limitation,
						}),
					];
		}),
	);

const uniqueIssues = (
	issues: readonly AnalysisReadinessIssue[],
): readonly AnalysisReadinessIssue[] => {
	const byId = new Map<string, AnalysisReadinessIssue>();
	for (const issue of issues) byId.set(issue.id, issue);
	return Object.freeze([...byId.values()]);
};

export const buildAnalysisReadiness = (
	input: BuildAnalysisReadinessInput,
): AnalysisReadiness => {
	const computationIssues = input.results.flatMap(computationIssuesOf);
	const domainIssues = uniqueIssues([
		...input.scopeIssues,
		...input.documentIssues,
		...input.missingFacts,
		...input.conflicts,
		...input.reviewFacts,
		...computationIssues,
	]);
	const blockingIssues = domainIssues.filter(
		(issue) => issue.severity === "blocking",
	);
	const currentRevisionIsSelected =
		input.analysisFactSetRevision !== undefined &&
		input.primaryRegimeFactSetRevision === input.analysisFactSetRevision;
	const revisionIsConfirmed =
		currentRevisionIsSelected &&
		input.confirmedFactSetRevision === input.analysisFactSetRevision;
	const readinessIssues: AnalysisReadinessIssue[] = [...domainIssues];

	if (input.pendingRecomputation) {
		readinessIssues.push(
			Object.freeze({
				id: "recomputation-pending",
				kind: "recomputation-pending",
				severity: "review",
				factKeys: Object.freeze([]),
				affectedResults: Object.freeze(["Dependent analysis results"]),
				explanation: "A changed fact or decision is being recomputed.",
				recoveryAction: "Wait for the dependent results to finish recomputing.",
				targetId: undefined,
			}),
		);
	}

	if (
		blockingIssues.length === 0 &&
		input.analysisFactSetRevision === undefined &&
		input.results.some((result) => result.id === "regime-comparison" && result.computation?.kind === "computed")
	) {
		readinessIssues.push(
			Object.freeze({
				id: "primary-regime-required",
				kind: "primary-regime-required",
				severity: "review",
				factKeys: Object.freeze([]),
				affectedResults: Object.freeze(["Complete analysis"]),
				explanation: "Both regime scenarios are available, but no primary scenario is selected.",
				recoveryAction: "Select the primary regime scenario you want the complete analysis to explain.",
				targetId: "regime-comparison-heading",
			}),
		);
	}

	if (
		blockingIssues.length === 0 &&
		currentRevisionIsSelected &&
		!revisionIsConfirmed
	) {
		readinessIssues.push(
			Object.freeze({
				id: "final-review-required",
				kind: "final-review-required",
				severity: "review",
				factKeys: Object.freeze([]),
				affectedResults: Object.freeze(["Complete analysis"]),
				explanation: "The current fact-set revision has not completed final evidence review.",
				recoveryAction: "Review the facts, evidence, warnings, and limitations, then confirm this revision.",
				targetId: "final-review-heading",
			}),
		);
	}

	const state: AnalysisReadinessState =
		blockingIssues.length > 0
			? "blocked"
			: revisionIsConfirmed && !input.pendingRecomputation
				? "analysis-ready"
				: "needs-review";

	return Object.freeze({
		state,
		issues:
			state === "analysis-ready"
				? Object.freeze([])
				: uniqueIssues(readinessIssues),
		availableResults: availableResultsOf(input.results),
		educationalLimitations: EDUCATIONAL_LIMITATIONS,
	});
};
