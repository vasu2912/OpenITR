import type {
	EligibilityAnswerValue,
	EligibilityQuestion,
	ScopeQuestion,
} from "@openitr/model";
import {
	ActionGroup,
	Alert,
	Button,
	Content,
	Flex,
	Form,
	FormGroup,
	FormHelperText,
	HelperText,
	HelperTextItem,
	Masthead,
	MastheadBrand,
	MastheadContent,
	MastheadMain,
	MastheadToggle,
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
	Page,
	PageContext,
	PageSection,
	PageSidebar,
	PageSidebarBody,
	PageToggleButton,
	ProgressStep,
	ProgressStepper,
	Radio,
	Tab,
	TabTitleText,
	Tabs,
	Title,
} from "@patternfly/react-core";
import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { FORM16_SALARY_FIELD_DEFINITIONS } from "@openitr/document-adapters";

import { loadRulePack } from "../session/load-rule-pack";
import { createSessionOrchestrator } from "../session/session-orchestrator";
import type {
	DocumentIntakeSnapshot,
	SessionOrchestrator,
} from "../session/session-orchestrator";
import { workerInspectionFacility } from "../session/worker-inspection-facility";
import { AgriculturalIncomeView } from "../views/agricultural-income";
import { AnalysisReadinessView } from "../views/analysis-readiness";
import { CompleteAnalyticsView } from "../views/complete-analytics";
import { DocumentsIntakeView } from "../views/documents-intake";
import { DonationDeductionsView } from "../views/donation-deductions";
import { EstimateView } from "../views/estimate-view";
import { FactConflictsView } from "../views/fact-conflicts";
import { FinalReviewView } from "../views/final-review";
import { HealthDisabilityDeductionsView } from "../views/health-disability-deductions";
import { HousePropertyComputationView } from "../views/house-property-computation";
import { LoanInterestDeductionsView } from "../views/loan-interest-deductions";
import { MissingFactQuestionsView } from "../views/missing-fact-questions";
import { NewRegimeComputationView } from "../views/new-regime-computation";
import { OldRegimeComputationView } from "../views/old-regime-computation";
import { OtherSourcesComputationView } from "../views/other-sources-computation";
import { RegimeComparisonView } from "../views/regime-comparison";
import { RemainingDeductionsView } from "../views/remaining-deductions";
import { SalaryComputationView } from "../views/salary-computation";
import { SalaryReviewView } from "../views/salary-review";
import { SavingsPensionDeductionsView } from "../views/savings-pension-deductions";
import { ScopeAnalysisView } from "../views/scope-analysis";
import { Section112aCapitalGainView } from "../views/section112a-capital-gain";
import {
	createFactLabeler,
	FactLabelProvider,
	type FactLabeler,
} from "../views/plain-language";
import { activeAnalysisRelease } from "./release-manifest";

type SessionLoadState =
	| Readonly<{ kind: "loading" }>
	| Readonly<{
			kind: "ready";
			session: SessionOrchestrator;
			labelFact: FactLabeler;
	  }>
	| Readonly<{
			kind: "failed";
			incidentCode: "ANALYSIS_RULE_PACK_LOAD_FAILED";
	  }>;

type WorkflowPage = Readonly<{
	id: string;
	title: string;
	tabLabel: string;
	description: string;
	// Pages after document intake show this notice until a document is selected.
	unavailableNotice?: string;
}>;

type WorkflowStage = Readonly<{
	id: string;
	label: string;
	pages: readonly WorkflowPage[];
}>;

const workflowStages = [
	{
		id: "scope",
		label: "Scope check",
		pages: [
			{
				id: "scope-questions",
				title: "Scope questions",
				tabLabel: "Questions",
				description:
					"Answer one eligibility question at a time from the pinned rule pack.",
			},
			{
				id: "scope-decisions",
				title: "Scope decision",
				tabLabel: "Decision",
				description:
					"Review how the known facts place this analysis inside or outside the supported scope.",
			},
			{
				id: "scope-evidence",
				title: "Evidence needed",
				tabLabel: "Evidence",
				description:
					"Review the source documents and current calculation limits for this analysis.",
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
					"Select source documents for local extraction and inspect their status.",
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
					"Supply missing facts, resolve conflicts, and compare observations with their evidence.",
				unavailableNotice:
					"Select source documents before reviewing accepted facts and evidence.",
			},
		],
	},
	{
		id: "computations",
		label: "Computations",
		pages: [
			{
				id: "income-computations",
				title: "Income computations",
				tabLabel: "Income",
				description:
					"Review the income categories that contribute to this analysis.",
				unavailableNotice:
					"Add source documents and answer the required questions before reviewing income computations.",
			},
			{
				id: "deductions",
				title: "Deductions",
				tabLabel: "Deductions",
				description:
					"Review each deduction category and the facts used to calculate it.",
				unavailableNotice:
					"Add source documents and answer the required questions before reviewing deductions.",
			},
			{
				id: "tax-comparison",
				title: "Tax and regime comparison",
				tabLabel: "Tax comparison",
				description:
					"Compare the regimes, inspect both calculations, and review the estimate.",
				unavailableNotice:
					"Complete the fact review before comparing regimes and estimates.",
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
					"Review the complete analysis, planning notes, and analysis readiness.",
				unavailableNotice:
					"Complete the preceding work before reviewing the complete analysis.",
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
					"Confirm the accepted facts, evidence, warnings, and limitations together.",
				unavailableNotice:
					"Complete the preceding work before confirming the final review.",
			},
		],
	},
] as const satisfies readonly WorkflowStage[];

type WorkflowPageId =
	(typeof workflowStages)[number]["pages"][number]["id"];

const workflowPages: readonly (WorkflowPage & { stage: WorkflowStage })[] =
	workflowStages.flatMap((stage) =>
		stage.pages.map((page) => ({ ...page, stage })),
	);

const pageIndexOf = (pageId: WorkflowPageId): number =>
	workflowPages.findIndex((page) => page.id === pageId);

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

type ScopeStatus = "in-progress" | "complete" | "blocked";

const stageStatusLabel = ({
	activeStageIndex,
	scopeStatus,
	stageIndex,
	stageId,
}: Readonly<{
	activeStageIndex: number;
	scopeStatus: ScopeStatus;
	stageIndex: number;
	stageId: string;
}>): string => {
	if (stageId === "scope" && scopeStatus === "blocked") return "Blocked";
	if (stageIndex === activeStageIndex) return "Current";
	return stageIndex < activeStageIndex ? "Complete" : "Not started";
};

const stepVariant = (status: string) => {
	switch (status) {
		case "Complete":
			return "success";
		case "Current":
			return "info";
		case "Blocked":
			return "danger";
		default:
			return "pending";
	}
};

const WorkflowSteps = ({
	activeStageIndex,
	onSelectPage,
	scopeStatus,
}: Readonly<{
	activeStageIndex: number;
	onSelectPage: ((pageId: string) => void) | undefined;
	scopeStatus: ScopeStatus;
}>) => {
	const page = useContext(PageContext);
	return (
		<nav aria-label="Analysis workflow">
			<ProgressStepper aria-label="Analysis steps" isVertical>
				{workflowStages.map((stage, stageIndex) => {
					const status = stageStatusLabel({
						activeStageIndex,
						scopeStatus,
						stageIndex,
						stageId: stage.id,
					});
					return (
						<ProgressStep
							aria-current={stageIndex === activeStageIndex ? "step" : undefined}
							description={status}
							id={`workflow-step-${stage.id}`}
							isCurrent={stageIndex === activeStageIndex}
							key={stage.id}
							titleId={`workflow-step-${stage.id}-title`}
							variant={stepVariant(status)}
						>
							<Button
								isDisabled={onSelectPage === undefined}
								isInline
								onClick={() => {
									onSelectPage?.(stage.pages[0].id);
									if (page.isMobile) page.onSidebarToggle();
								}}
								variant="link"
							>
								{stageIndex + 1}. {stage.label}
							</Button>
						</ProgressStep>
					);
				})}
			</ProgressStepper>
		</nav>
	);
};

const AppFrame = ({
	activePageId = "scope-questions",
	children,
	onSelectPage,
	scopeStatus,
	sessionActions,
}: Readonly<{
	activePageId?: WorkflowPageId;
	children: ReactNode;
	onSelectPage?: (pageId: WorkflowPageId) => void;
	scopeStatus: ScopeStatus;
	sessionActions?: ReactNode;
}>) => {
	const activeIndex = pageIndexOf(activePageId);
	const activePage = workflowPages[activeIndex];
	if (activePage === undefined) {
		throw new Error(`Unknown workflow page: ${activePageId}`);
	}
	const activeStageIndex = workflowStages.findIndex(
		(stage) => stage.id === activePage.stage.id,
	);
	const previousPage = workflowPages[activeIndex - 1];
	const nextPage = workflowPages[activeIndex + 1];

	const selectPage = (pageId: string): void => {
		onSelectPage?.(pageId as WorkflowPageId);
		document.getElementById("openitr-main")?.scrollTo({ top: 0 });
	};

	const handleInternalLink = (event: ReactMouseEvent<HTMLElement>): void => {
		if (!(event.target instanceof Element)) return;
		const href = event.target.closest('a[href^="#"]')?.getAttribute("href");
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

	const masthead = (
		<Masthead>
			<MastheadMain>
				<MastheadToggle>
					<PageToggleButton aria-label="Analysis workflow navigation" isHamburgerButton />
				</MastheadToggle>
				<MastheadBrand>
					<span className="openitr-wordmark">OpenITR</span>
				</MastheadBrand>
			</MastheadMain>
			<MastheadContent>
				<Flex
					alignItems={{ default: "alignItemsCenter" }}
					justifyContent={{ default: "justifyContentSpaceBetween" }}
					style={{ width: "100%" }}
				>
					<Content component="small">
						{activeAnalysisRelease.form} · FY {activeAnalysisRelease.financialYear} · AY{" "}
						{activeAnalysisRelease.assessmentYear} · Educational analysis, not a filing
					</Content>
					{sessionActions}
				</Flex>
			</MastheadContent>
		</Masthead>
	);

	const sidebar = (
		<PageSidebar>
			<PageSidebarBody isFilled>
				<WorkflowSteps
					activeStageIndex={activeStageIndex}
					onSelectPage={onSelectPage === undefined ? undefined : selectPage}
					scopeStatus={scopeStatus}
				/>
			</PageSidebarBody>
			<PageSidebarBody>
				<Content component="small">
					No account. Your answers stay in this tab and disappear when you
					refresh, reset, or close it.
				</Content>
			</PageSidebarBody>
		</PageSidebar>
	);

	return (
		<Page
			defaultManagedSidebarIsOpen
			isManagedSidebar
			mainContainerId="openitr-main"
			masthead={masthead}
			onClick={handleInternalLink}
			sidebar={sidebar}
		>
			<PageSection className="openitr-page-header" isWidthLimited>
				<Content component="small">
					Step {activeStageIndex + 1} of {workflowStages.length} ·{" "}
					{activePage.stage.label}
				</Content>
				<Title headingLevel="h1" size="3xl">
					{activePage.title}
				</Title>
				<Content component="p">{activePage.description}</Content>
				{activePage.stage.pages.length > 1 && onSelectPage !== undefined ? (
					<Tabs
						activeKey={activePageId}
						aria-label={`${activePage.stage.label} sections`}
						onSelect={(_event, key) => selectPage(String(key))}
					>
						{activePage.stage.pages.map((page) => (
							<Tab
								eventKey={page.id}
								key={page.id}
								title={<TabTitleText>{page.tabLabel}</TabTitleText>}
							/>
						))}
					</Tabs>
				) : null}
			</PageSection>
			<PageSection className="openitr-content" isFilled isWidthLimited>
				{children}
			</PageSection>
			{onSelectPage === undefined ? null : (
				<PageSection
					className="openitr-pager"
					isFilled={false}
					isWidthLimited
					stickyOnBreakpoint={{ default: "bottom" }}
				>
					<Flex justifyContent={{ default: "justifyContentSpaceBetween" }}>
						<Button
							isDisabled={previousPage === undefined}
							onClick={() => {
								if (previousPage !== undefined) selectPage(previousPage.id);
							}}
							variant="secondary"
						>
							Back
						</Button>
						<Button
							isDisabled={nextPage === undefined}
							onClick={() => {
								if (nextPage !== undefined) selectPage(nextPage.id);
							}}
							variant="primary"
						>
							{nextPage === undefined
								? "End of analysis"
								: `Next: ${nextPage.tabLabel}`}
						</Button>
					</Flex>
				</PageSection>
			)}
		</Page>
	);
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
		if (answer !== undefined) onSubmitAnswer(answer);
	};

	return (
		<section>
				<Title headingLevel="h2" size="lg">
					Residential status
				</Title>
				<Form onSubmit={handleSubmit}>
					<FormGroup
						fieldId={question.id}
						isRequired
						isStack
						label={question.prompt}
						role="radiogroup"
					>
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
						<FormHelperText>
							<HelperText id={helpTextId}>
								<HelperTextItem>{question.helpText}</HelperTextItem>
							</HelperText>
						</FormHelperText>
					</FormGroup>
					<ActionGroup>
						<Button isDisabled={answer === undefined} type="submit" variant="primary">
							Continue
						</Button>
					</ActionGroup>
				</Form>
			<footer>
				Rule pack revision {activeAnalysisRelease.rulePackRevision}
			</footer>
		</section>
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
	<Modal aria-label="Reset this session?" isOpen={isOpen} onClose={onCancel} variant="small">
		<ModalHeader title="Reset this session?" titleIconVariant="warning" />
		<ModalBody>
			Resetting discards your answers and documents from this tab's memory.
			OpenITR keeps session data nowhere else, so you cannot undo a reset.
		</ModalBody>
		<ModalFooter>
			<Button onClick={onConfirmReset} variant="danger">
				Reset session
			</Button>
			<Button onClick={onCancel} variant="link">
				Cancel
			</Button>
		</ModalFooter>
	</Modal>
);

const UnavailableNotice = ({ page }: Readonly<{ page: WorkflowPage }>) => (
	<Alert isInline title={`${page.title} is not available yet`} variant="info">
		{page.unavailableNotice}
	</Alert>
);

const IntakePage = ({
	intake,
	pageId,
	session,
}: Readonly<{
	intake: DocumentIntakeSnapshot;
	pageId: Exclude<
		WorkflowPageId,
		"scope-questions" | "scope-decisions" | "scope-evidence" | "documents"
	>;
	session: SessionOrchestrator;
}>) => {
	switch (pageId) {
		case "review":
			return (
				<>
					<MissingFactQuestionsView
						answers={intake.factAnswers}
						questionnaire={intake.questionnaire}
						session={session}
					/>
					<FactConflictsView
						conflicts={intake.factConflicts}
						documents={intake.documents}
						resolutions={intake.factResolutions}
						session={session}
					/>
					<SalaryReviewView documents={intake.documents} extractions={intake.extractions} />
				</>
			);
		case "income-computations":
			return (
				<>
					<SalaryComputationView
						computation={intake.salaryComputation}
						documents={intake.documents}
					/>
					<HousePropertyComputationView computation={intake.housePropertyComputation} />
					<OtherSourcesComputationView computation={intake.otherSourcesComputation} />
					<Section112aCapitalGainView
						computation={intake.section112aCapitalGainComputation}
					/>
					<AgriculturalIncomeView computation={intake.agriculturalIncomeComputation} />
				</>
			);
		case "deductions":
			return (
				<>
					<SavingsPensionDeductionsView
						computation={intake.savingsPensionDeductionComputation}
					/>
					<HealthDisabilityDeductionsView
						computation={intake.healthDisabilityDeductionComputation}
					/>
					<LoanInterestDeductionsView computation={intake.loanInterestDeductionComputation} />
					<DonationDeductionsView computation={intake.donationDeductionComputation} />
					<RemainingDeductionsView computation={intake.remainingDeductionComputation} />
				</>
			);
		case "tax-comparison":
			return (
				<>
					<RegimeComparisonView
						comparison={intake.regimeComparison}
						primaryRegime={intake.primaryRegime}
						session={session}
					/>
					<NewRegimeComputationView computation={intake.newRegimeComputation} />
					<OldRegimeComputationView computation={intake.oldRegimeComputation} />
					<EstimateView estimate={intake.estimateComputation} />
				</>
			);
		case "analysis":
			return (
				<>
					<CompleteAnalyticsView report={intake.analysisReport} />
					<AnalysisReadinessView readiness={intake.analysisReadiness} />
				</>
			);
		case "final-review":
			return <FinalReviewView intake={intake} session={session} />;
		default: {
			const _exhaustive: never = pageId;
			return _exhaustive;
		}
	}
};

const ScopeInteraction = ({
	session,
}: Readonly<{ session: SessionOrchestrator }>) => {
	const snapshot = useSyncExternalStore(
		session.subscribe,
		session.getSnapshot,
		session.getSnapshot,
	);
	const [isResetConfirmationOpen, setResetConfirmationOpen] = useState(false);
	const [activePageId, setActivePageId] =
		useState<WorkflowPageId>("scope-questions");
	const [deferredScopeQuestionIds, setDeferredScopeQuestionIds] = useState<
		readonly ScopeQuestion["id"][]
	>([]);

	useEffect(() => {
		const openHashTarget = (): void => {
			const targetPage = pageForTarget(
				decodeURIComponent(window.location.hash.slice(1)),
			);
			if (targetPage !== undefined) setActivePageId(targetPage);
		};
		window.addEventListener("hashchange", openHashTarget);
		return () => window.removeEventListener("hashchange", openHashTarget);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the hash target again whenever the page or session content changes.
	useEffect(() => {
		const targetId = decodeURIComponent(window.location.hash.slice(1));
		if (targetId === "") return;
		window.requestAnimationFrame(() => {
			document.getElementById(targetId)?.scrollIntoView({ block: "center" });
		});
	}, [activePageId, snapshot]);

	if (snapshot.kind === "awaiting-scope-answer") {
		return (
			<AppFrame scopeStatus="in-progress">
				<Alert
					isInline
					isPlain
					role="note"
					title="For analysis only. OpenITR does not prepare or submit a tax return."
					variant="info"
				/>
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

	const pageContent = (): ReactNode => {
		switch (activePageId) {
			case "scope-questions":
				return analysisScope === undefined ? (
					<section aria-live="polite">
							<Title headingLevel="h2" size="lg">
								Scope-check result
							</Title>
							<Alert
								isInline
								title={completion.result.title}
								variant={completion.result.kind === "supported" ? "success" : "warning"}
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
										<a href={completion.result.rule.sourceUrl} rel="noreferrer" target="_blank">
											{completion.result.rule.citation}
										</a>
									</dd>
								</div>
							</dl>
							{completion.result.kind === "unsupported" ? (
								<p>
									<strong>Next action:</strong>{" "}
									{completion.result.issue.recoveryAction}
								</p>
							) : null}
							<p>
								This result covers only this question. It is not a
								filing-eligibility decision.
							</p>
					</section>
				) : (
					<ScopeAnalysisView
						deferredQuestionIds={deferredScopeQuestionIds}
						evaluation={analysisScope}
						onDeferQuestion={deferScopeQuestion}
						section="questions"
						session={session}
					/>
				);
			case "scope-decisions":
			case "scope-evidence":
				return analysisScope === undefined ? null : (
					<ScopeAnalysisView
						evaluation={analysisScope}
						section={activePageId === "scope-decisions" ? "decisions" : "evidence"}
						session={session}
					/>
				);
			case "documents":
				return canEnterDocuments ? (
					<DocumentsIntakeView
						documents={intake?.documents ?? []}
						extractions={intake?.extractions ?? []}
						session={session}
					/>
				) : (
					<Alert
						isInline
						title="Complete the mandatory scope questions before selecting source documents"
						variant="info"
					>
						Resolve every unknown, blocked, or outside-scope decision in the
						complete ITR-1 analysis scope first. This does not make OpenITR a
						filing-eligibility or portal-acceptance service.
					</Alert>
				);
			default: {
				const page = workflowPages[pageIndexOf(activePageId)];
				return intake === undefined ? (
					page === undefined ? null : <UnavailableNotice page={page} />
				) : (
					<IntakePage intake={intake} pageId={activePageId} session={session} />
				);
			}
		}
	};

	return (
		<AppFrame
			activePageId={activePageId}
			onSelectPage={setActivePageId}
			scopeStatus={
				completion.result.kind === "unsupported"
					? "blocked"
					: canEnterDocuments
						? "complete"
						: "in-progress"
			}
			sessionActions={
				<Button onClick={() => setResetConfirmationOpen(true)} variant="secondary">
					Reset session
				</Button>
			}
		>
			{pageContent()}
			{intake?.pendingRecomputation.kind === "pending" ? (
				<Alert aria-live="polite" isInline title="Recomputing affected results" variant="info">
					The previous estimate is hidden while the changed decision is applied.
					The regime calculations and comparison are hidden too.
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
				if (isDisposed) return;
				sessionToStop = createSessionOrchestrator({
					rulePack,
					documents: workerInspectionFacility(),
				});
				setLoadState({
					kind: "ready",
					session: sessionToStop,
					labelFact: createFactLabeler(
						rulePack,
						FORM16_SALARY_FIELD_DEFINITIONS,
					),
				});
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
				<AppFrame scopeStatus="in-progress">
					<Alert isInline title="Loading the pinned rule pack" variant="info">
						OpenITR is preparing the AY 2026-27 scope question.
					</Alert>
				</AppFrame>
			);
		case "ready":
			return (
				<FactLabelProvider value={loadState.labelFact}>
					<ScopeInteraction session={loadState.session} />
				</FactLabelProvider>
			);
		case "failed":
			return (
				<AppFrame scopeStatus="blocked">
					<Alert isInline title="The rule pack could not be loaded" variant="danger">
						Refresh the page to try again. Incident code: {loadState.incidentCode}.
					</Alert>
				</AppFrame>
			);
		default: {
			const _exhaustive: never = loadState;
			return _exhaustive;
		}
	}
};
