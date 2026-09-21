import type {
	EligibilityAnswerValue,
	EligibilityQuestion,
	ScopeQuestion,
} from "@openitr/model";
import {
	ActionGroup,
	Alert,
	Button,
	Card,
	CardBody,
	CardFooter,
	CardTitle,
	Divider,
	Form,
	Masthead,
	MastheadBrand,
	MastheadContent,
	MastheadMain,
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
	Page,
	PageSection,
	PageSidebar,
	PageSidebarBody,
	Radio,
	Stack,
	Toolbar,
	ToolbarContent,
	ToolbarItem,
	Title,
} from "@patternfly/react-core";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { loadRulePack } from "../session/load-rule-pack";
import { createSessionOrchestrator } from "../session/session-orchestrator";
import type { SessionOrchestrator } from "../session/session-orchestrator";
import { workerInspectionFacility } from "../session/worker-inspection-facility";
import { DocumentsIntakeView } from "../views/documents-intake";
import { CompleteAnalyticsView } from "../views/complete-analytics";
import { AnalysisReadinessView } from "../views/analysis-readiness";
import { DonationDeductionsView } from "../views/donation-deductions";
import { RemainingDeductionsView } from "../views/remaining-deductions";
import { AgriculturalIncomeView } from "../views/agricultural-income";
import { EstimateView } from "../views/estimate-view";
import { FactConflictsView } from "../views/fact-conflicts";
import { FinalReviewView } from "../views/final-review";
import { MissingFactQuestionsView } from "../views/missing-fact-questions";
import { HousePropertyComputationView } from "../views/house-property-computation";
import { HealthDisabilityDeductionsView } from "../views/health-disability-deductions";
import { LoanInterestDeductionsView } from "../views/loan-interest-deductions";
import { NewRegimeComputationView } from "../views/new-regime-computation";
import { OldRegimeComputationView } from "../views/old-regime-computation";
import { RegimeComparisonView } from "../views/regime-comparison";
import { OtherSourcesComputationView } from "../views/other-sources-computation";
import { SavingsPensionDeductionsView } from "../views/savings-pension-deductions";
import { Section112aCapitalGainView } from "../views/section112a-capital-gain";
import { ScopeAnalysisView } from "../views/scope-analysis";
import { SalaryComputationView } from "../views/salary-computation";
import { SalaryReviewView } from "../views/salary-review";
import { activeAnalysisRelease } from "./release-manifest";

type SessionLoadState =
	| Readonly<{ kind: "loading" }>
	| Readonly<{
			kind: "ready";
			session: SessionOrchestrator;
	  }>
	| Readonly<{
			kind: "failed";
			incidentCode: "ANALYSIS_RULE_PACK_LOAD_FAILED";
	  }>;

type WorkflowState = "in-progress" | "complete" | "blocked";

type WorkflowStageId =
	| "scope"
	| "documents"
	| "review"
	| "computations"
	| "analysis"
	| "final-review";

type WorkflowPageId =
	| "scope-questions"
	| "scope-decisions"
	| "scope-evidence"
	| "documents"
	| "review"
	| "income-computations"
	| "deductions"
	| "tax-comparison"
	| "analysis"
	| "final-review";

type WorkflowPage = Readonly<{
	id: WorkflowPageId;
	stage: WorkflowStageId;
	title: string;
	shortTitle: string;
	description: string;
}>;

const workflowPages: readonly WorkflowPage[] = Object.freeze([
	{
		id: "scope-questions",
		stage: "scope",
		title: "Scope questions",
		shortTitle: "Questions",
		description:
			"Answer one eligibility question at a time from the pinned rule pack.",
	},
	{
		id: "scope-decisions",
		stage: "scope",
		title: "Scope decision",
		shortTitle: "Decision",
		description:
			"Review how the known facts place this analysis inside or outside the supported scope.",
	},
	{
		id: "scope-evidence",
		stage: "scope",
		title: "Evidence needed",
		shortTitle: "Evidence",
		description:
			"Review the source documents and current calculation limits for this analysis.",
	},
	{
		id: "documents",
		stage: "documents",
		title: "Documents",
		shortTitle: "Documents",
		description:
			"Select source documents for local extraction and inspect their status.",
	},
	{
		id: "review",
		stage: "review",
		title: "Review facts",
		shortTitle: "Review facts",
		description:
			"Supply missing facts, resolve conflicts, and compare observations with their evidence.",
	},
	{
		id: "income-computations",
		stage: "computations",
		title: "Income computations",
		shortTitle: "Income",
		description:
			"Review the income categories that contribute to this analysis.",
	},
	{
		id: "deductions",
		stage: "computations",
		title: "Deductions",
		shortTitle: "Deductions",
		description:
			"Review each deduction category and the facts used to calculate it.",
	},
	{
		id: "tax-comparison",
		stage: "computations",
		title: "Tax and regime comparison",
		shortTitle: "Tax comparison",
		description:
			"Compare the regimes, inspect both calculations, and review the estimate.",
	},
	{
		id: "analysis",
		stage: "analysis",
		title: "Analysis",
		shortTitle: "Analysis",
		description:
			"Review the complete analysis, planning notes, and analysis readiness.",
	},
	{
		id: "final-review",
		stage: "final-review",
		title: "Final review",
		shortTitle: "Final review",
		description:
			"Confirm the accepted facts, evidence, warnings, and limitations together.",
	},
]);

const workflowStages: readonly Readonly<{
	id: WorkflowStageId;
	label: string;
}>[] = Object.freeze([
	{ id: "scope", label: "Scope check" },
	{ id: "documents", label: "Documents" },
	{ id: "review", label: "Review facts" },
	{ id: "computations", label: "Computations" },
	{ id: "analysis", label: "Analysis" },
	{ id: "final-review", label: "Final review" },
]);

const pageFor = (pageId: WorkflowPageId): WorkflowPage => {
	const page = workflowPages.find((candidate) => candidate.id === pageId);
	if (page === undefined) {
		throw new Error(`Unknown workflow page: ${pageId}`);
	}
	return page;
};

const pageForTarget = (targetId: string): WorkflowPageId | undefined => {
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
	if (targetId === "regime-comparison-heading" || targetId.startsWith("trace-")) {
		return "tax-comparison";
	}
	if (targetId === "final-review-heading") return "final-review";
	return undefined;
};

const workflowStatePresentation: Readonly<
	Record<WorkflowState, Readonly<{ label: string }>>
> = Object.freeze({
	"in-progress": Object.freeze({ label: "In progress" }),
	complete: Object.freeze({ label: "Complete" }),
	blocked: Object.freeze({ label: "Blocked" }),
});

const AppMasthead = ({
	sessionActions,
}: Readonly<{ sessionActions?: ReactNode }>) => (
	<Masthead className="openitr-masthead">
		<MastheadMain>
			<MastheadBrand>
				<span className="openitr-wordmark">OpenITR</span>
			</MastheadBrand>
		</MastheadMain>
		<MastheadContent>
			<Toolbar colorVariant="no-background" hasNoPadding isFullHeight>
				<ToolbarContent alignItems="center">
					<ToolbarItem>
						<span className="openitr-masthead-context">
							{activeAnalysisRelease.form} · AY{" "}
							{activeAnalysisRelease.assessmentYear} · In-browser session
						</span>
					</ToolbarItem>
					{sessionActions === undefined ? null : (
						<ToolbarItem align={{ default: "alignEnd" }}>
							{sessionActions}
						</ToolbarItem>
					)}
				</ToolbarContent>
			</Toolbar>
		</MastheadContent>
	</Masthead>
);

const WorkflowSidebar = ({
	activePage,
	onSelectPage,
	workflowState,
}: Readonly<{
	activePage: WorkflowPage;
	onSelectPage: ((pageId: WorkflowPageId) => void) | undefined;
	workflowState: WorkflowState;
}>) => {
	const presentation = workflowStatePresentation[workflowState];
	const activeStageIndex = workflowStages.findIndex(
		(stage) => stage.id === activePage.stage,
	);
	return (
		<PageSidebar className="openitr-sidebar">
			<PageSidebarBody>
				<nav aria-label="Analysis workflow" className="openitr-workflow">
					<p className="openitr-workflow-heading">Analysis workflow</p>
					<ol className="openitr-workflow-list">
						{workflowStages.map((stage, index) => {
							const isCurrent = stage.id === activePage.stage;
							const isComplete = index < activeStageIndex;
							const stagePage = workflowPages.find(
								(candidate) => candidate.stage === stage.id,
							);
							return (
								<li
									aria-current={isCurrent ? "step" : undefined}
									className="openitr-workflow-step"
									data-status={
										stage.id === "scope" && workflowState === "blocked"
											? "blocked"
										: isCurrent
											? "in-progress"
											: isComplete
												? "complete"
												: "not-started"
									}
									key={stage.id}
								>
									<button
										data-workflow-stage={stage.id}
										disabled={onSelectPage === undefined || stagePage === undefined}
										onClick={() => {
											if (stagePage !== undefined) onSelectPage?.(stagePage.id);
										}}
										type="button"
									>
										<span aria-hidden="true" className="openitr-step-marker">
											{index + 1}
										</span>
										<span>
											<strong>{stage.label}</strong>
										<small>
											{stage.id === "scope" && workflowState === "blocked"
												? presentation.label
												: isCurrent
													? "Current"
													: isComplete
														? "Complete"
														: "Not started"}
											</small>
										</span>
									</button>
								</li>
							);
						})}
					</ol>
				</nav>
			</PageSidebarBody>
		</PageSidebar>
	);
};

const AppFrame = ({
	activePageId = "scope-questions",
	children,
	onSelectPage,
	sessionActions,
	showAnalysisNotice = false,
	workflowState,
}: Readonly<{
	activePageId?: WorkflowPageId;
	children: ReactNode;
	onSelectPage?: (pageId: WorkflowPageId) => void;
	sessionActions?: ReactNode;
	showAnalysisNotice?: boolean;
	workflowState: WorkflowState;
}>) => {
	const activePage = pageFor(activePageId);
	const activePageIndex = workflowPages.findIndex(
		(page) => page.id === activePageId,
	);
	const previousPage = workflowPages[activePageIndex - 1];
	const nextPage = workflowPages[activePageIndex + 1];
	const stagePages = workflowPages.filter(
		(page) => page.stage === activePage.stage,
	);
	const handleInternalLink = (event: ReactMouseEvent<HTMLElement>): void => {
		if (!(event.target instanceof Element)) return;
		const link = event.target.closest('a[href^="#"]');
		const href = link?.getAttribute("href");
		if (href === null || href === undefined) return;
		const targetId = decodeURIComponent(href.slice(1));
		const targetPage = pageForTarget(targetId);
		if (targetPage === undefined || onSelectPage === undefined) return;
		event.preventDefault();
		window.history.replaceState(null, "", href);
		onSelectPage(targetPage);
		window.requestAnimationFrame(() => {
			document.getElementById(targetId)?.scrollIntoView({ block: "center" });
		});
	};

	return <Page
		className="openitr-page"
		defaultManagedSidebarIsOpen
		isManagedSidebar
		mainContainerId="openitr-main"
		masthead={<AppMasthead sessionActions={sessionActions} />}
		onClick={handleInternalLink}
		sidebar={
			<WorkflowSidebar
				activePage={activePage}
				onSelectPage={onSelectPage}
				workflowState={workflowState}
			/>
		}
	>
		<PageSection className="openitr-page-heading" isFilled={false}>
			<p className="openitr-eyebrow">
				FY {activeAnalysisRelease.financialYear} · AY{" "}
				{activeAnalysisRelease.assessmentYear} · {activeAnalysisRelease.form}
			</p>
			<Title headingLevel="h1" size="2xl">
				{activePage.title}
			</Title>
			<p className="openitr-lede">{activePage.description}</p>
			{onSelectPage === undefined ? null : (
				<nav aria-label="Mobile analysis workflow" className="openitr-mobile-workflow">
					{workflowStages.map((stage, index) => {
						const stagePage = workflowPages.find(
							(page) => page.stage === stage.id,
						);
						return (
							<button
								aria-current={stage.id === activePage.stage ? "step" : undefined}
								data-workflow-stage={stage.id}
								disabled={stagePage === undefined}
								key={stage.id}
								onClick={() => {
									if (stagePage !== undefined) onSelectPage(stagePage.id);
								}}
								type="button"
							>
								<span>{index + 1}</span>
								{stage.label}
							</button>
						);
					})}
				</nav>
			)}
			{stagePages.length > 1 ? (
				<nav aria-label={`${activePage.title} sections`} className="openitr-local-nav">
					{stagePages.map((page) => (
						<button
							aria-current={page.id === activePageId ? "page" : undefined}
							disabled={onSelectPage === undefined}
							key={page.id}
							onClick={() => onSelectPage?.(page.id)}
							type="button"
						>
							{page.shortTitle}
						</button>
					))}
				</nav>
			) : null}
		</PageSection>
		<PageSection className="openitr-workspace" isFilled variant="secondary">
			<Stack hasGutter>
				{showAnalysisNotice ? (
					<p className="openitr-analysis-notice" role="note">
						<strong>For analysis only.</strong> OpenITR does not prepare or submit
						a tax return.
					</p>
				) : null}

				{children}

				<Divider />
				<footer>
					<strong>No account is required.</strong> Your answer stays in this
					tab's memory and disappears when you refresh, reset, or close the
					tab.
				</footer>
			</Stack>
		</PageSection>
		{onSelectPage === undefined ? null : (
			<div className="openitr-workflow-actions">
				<Button
					isDisabled={previousPage === undefined}
					onClick={() => {
						if (previousPage !== undefined) onSelectPage(previousPage.id);
					}}
					variant="secondary"
				>
					Back
				</Button>
				<span className="openitr-workflow-position">
					{activePageIndex + 1} of {workflowPages.length}
				</span>
				<Button
					isDisabled={nextPage === undefined}
					onClick={() => {
						if (nextPage !== undefined) onSelectPage(nextPage.id);
					}}
					variant="primary"
				>
					{nextPage === undefined ? "End of analysis" : `Next: ${nextPage.shortTitle}`}
				</Button>
			</div>
		)}
	</Page>
};

const ScopeQuestionCard = ({
	question,
	onSubmitAnswer,
}: Readonly<{
	question: EligibilityQuestion;
	onSubmitAnswer: (answer: EligibilityAnswerValue) => void;
}>) => {
	const [answer, setAnswer] = useState<EligibilityAnswerValue>();
	const helpTextId = `${question.id}-help`;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (answer === undefined) {
			return;
		}
		onSubmitAnswer(answer);
	};

	return (
		<Card className="openitr-question-card" component="section">
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Residential status
				</Title>
			</CardTitle>
			<CardBody>
				<Form onSubmit={handleSubmit}>
					<fieldset className="openitr-question-fieldset">
						<legend>{question.prompt}</legend>
						<p id={helpTextId}>{question.helpText}</p>
						<div className="openitr-answer-options">
							{question.answers.map((option) => (
								<Radio
									aria-describedby={helpTextId}
									id={`${question.id}-${option.value}`}
									isChecked={answer === option.value}
									key={option.value}
									label={option.label}
									name={question.id}
									onChange={() => setAnswer(option.value)}
								/>
							))}
						</div>
					</fieldset>
					<ActionGroup>
						<Button
							isDisabled={answer === undefined}
							type="submit"
							variant="primary"
						>
							Continue
						</Button>
					</ActionGroup>
				</Form>
			</CardBody>
			<CardFooter>
				Rule pack revision {activeAnalysisRelease.rulePackRevision}
			</CardFooter>
		</Card>
	);
};

const ResetSessionDialog = ({
	isOpen,
	onCancel,
	onConfirmReset,
}: Readonly<{
	isOpen: boolean;
	onCancel: () => void;
	onConfirmReset: () => void;
}>) => (
	<Modal
		aria-label="Reset this session?"
		isOpen={isOpen}
		onClose={onCancel}
		variant="small"
	>
		<ModalHeader title="Reset this session?" titleIconVariant="warning" />
		<ModalBody>
			<p>
				Resetting discards your answer and the scope-check result from this
				tab's memory. OpenITR keeps session data nowhere else, so you cannot
				undo a reset.
			</p>
		</ModalBody>
		<ModalFooter>
			<Button key="cancel" onClick={onCancel} variant="link">
				Cancel
			</Button>
			<Button key="confirm-reset" onClick={onConfirmReset} variant="danger">
				Reset session
			</Button>
		</ModalFooter>
	</Modal>
);

const WorkspaceNotice = ({
	description,
	title,
}: Readonly<{ description: string; title: string }>) => (
	<Card className="openitr-empty-workspace" component="section">
		<CardTitle>
			<Title headingLevel="h2" size="lg">
				{title}
			</Title>
		</CardTitle>
		<CardBody>
			<Alert isInline title={description} variant="info" />
		</CardBody>
	</Card>
);

const ScopeInteraction = ({
	session,
}: Readonly<{ session: SessionOrchestrator }>) => {
	const snapshot = useSyncExternalStore(
		session.subscribe,
		session.getSnapshot,
		session.getSnapshot,
	);
	const [isResetConfirmationOpen, setResetConfirmationOpen] =
		useState(false);
	const [activePageId, setActivePageId] =
		useState<WorkflowPageId>("scope-questions");
	const [deferredScopeQuestionIds, setDeferredScopeQuestionIds] = useState<
		readonly ScopeQuestion["id"][]
	>([]);

	useEffect(() => {
		const openHashTarget = (): void => {
			const targetId = decodeURIComponent(window.location.hash.slice(1));
			const targetPage = pageForTarget(targetId);
			if (targetPage !== undefined) setActivePageId(targetPage);
		};
		window.addEventListener("hashchange", openHashTarget);
		return () => window.removeEventListener("hashchange", openHashTarget);
	}, []);

	useEffect(() => {
		const targetId = decodeURIComponent(window.location.hash.slice(1));
		if (targetId === "") return;
		window.requestAnimationFrame(() => {
			document.getElementById(targetId)?.scrollIntoView({ block: "center" });
		});
	}, [activePageId, snapshot]);

	if (snapshot.kind === "awaiting-scope-answer") {
		return (
			<AppFrame
				activePageId="scope-questions"
				showAnalysisNotice
				workflowState="in-progress"
			>
				<ScopeQuestionCard
					onSubmitAnswer={(answer) =>
						session.send({
							kind: "answer-eligibility-question",
							questionId: snapshot.question.id,
							answer,
							executionContext: { answerTime: new Date().toISOString() },
						})
					}
					question={snapshot.question}
				/>
			</AppFrame>
		);
	}

	const completion =
		snapshot.kind === "scope-check-complete"
			? snapshot
			: snapshot.completedScopeCheck;
	const intake = snapshot.kind === "document-intake" ? snapshot : undefined;
	const documents = intake?.documents ?? [];
	const extractions = intake?.extractions ?? [];
	const analysisScope = snapshot.analysisScope;
	const canEnterDocuments =
		analysisScope === undefined || analysisScope.kind === "supported";
	const deferScopeQuestion = (questionId: ScopeQuestion["id"]): void => {
		const unresolvedQuestionIds =
			analysisScope?.questions.map((question) => question.id) ?? [];
		setDeferredScopeQuestionIds((questionIds) => {
			const retainedQuestionIds = questionIds.filter(
				(id) => unresolvedQuestionIds.includes(id) && id !== questionId,
			);
			const nextQuestionIds = [...retainedQuestionIds, questionId];
			return nextQuestionIds.length >= unresolvedQuestionIds.length
				? []
				: nextQuestionIds;
		});
	};

	return (
		<AppFrame
			activePageId={activePageId}
			onSelectPage={setActivePageId}
			sessionActions={
				<Button
					className="openitr-session-action"
					onClick={() => setResetConfirmationOpen(true)}
					variant="plain"
				>
					Reset session
				</Button>
			}
			workflowState={
				completion.result.kind === "unsupported"
					? "blocked"
					: canEnterDocuments
						? "complete"
						: "in-progress"
			}
		>
			{activePageId === "scope-questions" && analysisScope === undefined ? (
				<Card
					aria-live="polite"
					className="openitr-result-card"
					component="section"
				>
					<CardTitle>
						<Title headingLevel="h2" size="lg">
							Scope-check result
						</Title>
					</CardTitle>
					<CardBody>
						<Alert
							isInline
							title={completion.result.title}
							variant={
								completion.result.kind === "supported"
									? "success"
									: "warning"
							}
						>
							{completion.result.explanation}
						</Alert>
						<dl className="openitr-result-details">
							<div>
								<dt>Question</dt>
								<dd>{completion.question.prompt}</dd>
							</div>
							<div>
								<dt>Your answer</dt>
								<dd>{completion.answer.label}</dd>
							</div>
							<div>
								<dt>Rule</dt>
								<dd>{completion.result.rule.id}</dd>
							</div>
							<div>
								<dt>Official source</dt>
								<dd>
									<a
										href={completion.result.rule.sourceUrl}
										rel="noreferrer"
										target="_blank"
									>
										{completion.result.rule.citation}
									</a>
								</dd>
							</div>
						</dl>
						{completion.result.kind === "unsupported" ? (
							<p className="openitr-recovery-action">
								<strong>Next action:</strong>{" "}
								{completion.result.issue.recoveryAction}
							</p>
						) : null}
						<p className="openitr-result-limit">
							This result covers only this question. It is not a
							filing-eligibility decision.
						</p>
					</CardBody>
				</Card>
			) : null}
			{analysisScope === undefined ? null : activePageId === "scope-questions" ? (
				<ScopeAnalysisView
					deferredQuestionIds={deferredScopeQuestionIds}
					evaluation={analysisScope}
					onDeferQuestion={deferScopeQuestion}
					section="questions"
					session={session}
				/>
			) : activePageId === "scope-decisions" ? (
				<ScopeAnalysisView
					evaluation={analysisScope}
					section="decisions"
					session={session}
				/>
			) : activePageId === "scope-evidence" ? (
				<ScopeAnalysisView
					evaluation={analysisScope}
					section="evidence"
					session={session}
				/>
			) : null}
			{activePageId !== "documents" ? null : canEnterDocuments ? (
				<DocumentsIntakeView
					documents={documents}
					extractions={extractions}
					session={session}
				/>
			) : (
				<Card className="openitr-documents-card" component="section">
					<CardTitle>
						<Title headingLevel="h2" size="lg">
							Source documents are locked
						</Title>
					</CardTitle>
					<CardBody>
						<Alert
							isInline
							title="Complete the mandatory scope questions before selecting source documents"
							variant="info"
						>
							Resolve every unknown, blocked, or outside-scope decision in the
							complete ITR-1 analysis scope first. This does not make OpenITR a
							filing-eligibility or portal-acceptance service.
						</Alert>
					</CardBody>
				</Card>
			)}
			{activePageId === "review" && intake !== undefined ? (
				<MissingFactQuestionsView
					answers={intake.factAnswers}
					questionnaire={intake.questionnaire}
					session={session}
				/>
			) : null}
			{activePageId === "review" && intake === undefined ? (
				<WorkspaceNotice
					description="Select source documents before reviewing accepted facts and evidence."
					title="No facts to review yet"
				/>
			) : null}
			{activePageId === "review" && intake !== undefined ? (
				<>
					<FactConflictsView
						conflicts={intake?.factConflicts ?? []}
						documents={documents}
						resolutions={intake?.factResolutions ?? []}
						session={session}
					/>
					<SalaryReviewView documents={documents} extractions={extractions} />
				</>
			) : null}
			{activePageId === "income-computations" && intake === undefined ? (
				<WorkspaceNotice
					description="Add source documents and answer the required questions before reviewing income computations."
					title="Income computations are not available yet"
				/>
			) : null}
			{activePageId === "income-computations" && intake !== undefined ? (
				<>
					<SalaryComputationView
						computation={intake?.salaryComputation}
						documents={documents}
					/>
					<HousePropertyComputationView computation={intake?.housePropertyComputation} />
					<OtherSourcesComputationView computation={intake?.otherSourcesComputation} />
					<Section112aCapitalGainView
						computation={intake?.section112aCapitalGainComputation}
					/>
					<AgriculturalIncomeView
						computation={intake?.agriculturalIncomeComputation}
					/>
				</>
			) : null}
			{activePageId === "deductions" && intake === undefined ? (
				<WorkspaceNotice
					description="Add source documents and answer the required questions before reviewing deductions."
					title="Deductions are not available yet"
				/>
			) : null}
			{activePageId === "deductions" && intake !== undefined ? (
				<>
					<SavingsPensionDeductionsView
						computation={intake?.savingsPensionDeductionComputation}
					/>
					<HealthDisabilityDeductionsView
						computation={intake?.healthDisabilityDeductionComputation}
					/>
					<LoanInterestDeductionsView
						computation={intake?.loanInterestDeductionComputation}
					/>
					<DonationDeductionsView
						computation={intake?.donationDeductionComputation}
					/>
					<RemainingDeductionsView
						computation={intake?.remainingDeductionComputation}
					/>
				</>
			) : null}
			{activePageId === "tax-comparison" && intake === undefined ? (
				<WorkspaceNotice
					description="Complete the fact review before comparing regimes and estimates."
					title="Tax comparison is not available yet"
				/>
			) : null}
			{activePageId === "tax-comparison" && intake !== undefined ? (
				<>
					<RegimeComparisonView
						comparison={intake?.regimeComparison}
						primaryRegime={intake?.primaryRegime}
						session={session}
					/>
					<NewRegimeComputationView
						computation={intake?.newRegimeComputation}
					/>
					<OldRegimeComputationView
						computation={intake?.oldRegimeComputation}
					/>
					<EstimateView estimate={intake?.estimateComputation} />
				</>
			) : null}
			{activePageId === "analysis" && intake === undefined ? (
				<WorkspaceNotice
					description="Complete the preceding work before reviewing the complete analysis."
					title="Analysis is not available yet"
				/>
			) : null}
			{activePageId === "analysis" && intake !== undefined ? (
				<>
					<CompleteAnalyticsView report={intake.analysisReport} />
					<AnalysisReadinessView readiness={intake.analysisReadiness} />
				</>
			) : null}
			{activePageId === "final-review" && intake === undefined ? (
				<WorkspaceNotice
					description="Complete the preceding work before confirming the final review."
					title="Final review is not available yet"
				/>
			) : null}
			{activePageId === "final-review" && intake !== undefined ? (
				<FinalReviewView intake={intake} session={session} />
			) : null}
			{intake?.pendingRecomputation.kind === "pending" ? (
				<Alert
					aria-live="polite"
					className="openitr-recomputation-status"
					isInline
					title="Recomputing affected results"
					variant="info"
				>
					The previous estimate is hidden while the changed decision is
					applied. The regime calculations and comparison are hidden too.
				</Alert>
			) : null}
			<ResetSessionDialog
				isOpen={isResetConfirmationOpen}
				onCancel={() => setResetConfirmationOpen(false)}
					onConfirmReset={() => {
					setResetConfirmationOpen(false);
					setActivePageId("scope-questions");
					setDeferredScopeQuestionIds([]);
					session.send({ kind: "reset" });
				}}
			/>
		</AppFrame>
	);
};

export const App = () => {
	const [loadState, setLoadState] = useState<SessionLoadState>({
		kind: "loading",
	});

	useEffect(() => {
		let isDisposed = false;
		let sessionToStop: SessionOrchestrator | undefined;

		void loadRulePack(activeAnalysisRelease)
			.then((rulePack) => {
				if (isDisposed) {
					return;
				}
				sessionToStop = createSessionOrchestrator({
					rulePack,
					documents: workerInspectionFacility(),
				});
				setLoadState({ kind: "ready", session: sessionToStop });
			})
			.catch(() => {
				if (!isDisposed) {
					setLoadState({
						kind: "failed",
						incidentCode: "ANALYSIS_RULE_PACK_LOAD_FAILED",
					});
				}
			});

		return () => {
			isDisposed = true;
			sessionToStop?.stop();
		};
	}, []);

	switch (loadState.kind) {
		case "loading":
			return (
				<AppFrame workflowState="in-progress">
					<Alert
						className="openitr-question-card"
						isInline
						title="Loading the pinned rule pack"
						variant="info"
					>
						OpenITR is preparing the AY 2026-27 scope question.
					</Alert>
				</AppFrame>
			);
		case "ready":
			return <ScopeInteraction session={loadState.session} />;
		case "failed":
			return (
				<AppFrame workflowState="blocked">
					<Alert
						className="openitr-question-card"
						isInline
						title="The rule pack could not be loaded"
						variant="danger"
					>
						Refresh the page to try again. Incident code:{" "}
						{loadState.incidentCode}.
					</Alert>
				</AppFrame>
			);
		default: {
			const _exhaustive: never = loadState;
			return _exhaustive;
		}
	}
};
