import { FORM16_SALARY_FIELD_DEFINITIONS } from "@openitr/document-adapters";
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
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	EmptyState,
	EmptyStateActions,
	EmptyStateBody,
	EmptyStateFooter,
	Form,
	Spinner,
	Stack,
	Title,
} from "@patternfly/react-core";
import ArrowRightIcon from "@patternfly/react-icons/dist/esm/icons/arrow-right-icon";
import LockIcon from "@patternfly/react-icons/dist/esm/icons/lock-icon";
import UndoIcon from "@patternfly/react-icons/dist/esm/icons/undo-icon";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { loadRulePack } from "../session/load-rule-pack";
import type {
	DocumentIntakeSnapshot,
	SessionOrchestrator,
} from "../session/session-orchestrator";
import { createSessionOrchestrator } from "../session/session-orchestrator";
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
import {
	createFactLabeler,
	type FactLabeler,
	FactLabelProvider,
} from "../views/plain-language";
import { QuestionChoiceList } from "../views/question-choice-list";
import { RegimeComparisonView } from "../views/regime-comparison";
import { RemainingDeductionsView } from "../views/remaining-deductions";
import { SalaryComputationView } from "../views/salary-computation";
import { SalaryReviewView } from "../views/salary-review";
import { SavingsPensionDeductionsView } from "../views/savings-pension-deductions";
import { ScopeAnalysisView } from "../views/scope-analysis";
import { Section112aCapitalGainView } from "../views/section112a-capital-gain";
import { AppFrame } from "./app-frame";
import { activeAnalysisRelease } from "./release-manifest";
import { useSessionExitGuard } from "./session-exit-guard";
import {
	pageForTarget,
	pageIndexOf,
	type WorkflowPageId,
	workflowPages,
} from "./workflow";

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

const ScopeQuestionCard = ({
	question,
	onSubmitAnswer,
}: Readonly<{
	question: EligibilityQuestion;
	onSubmitAnswer: (answer: EligibilityAnswerValue) => void;
}>) => {
	const [answer, setAnswer] = useState<EligibilityAnswerValue>();
	const promptId = `${question.id}-prompt`;
	const helpTextId = `${question.id}-help`;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (answer !== undefined) onSubmitAnswer(answer);
	};

	return (
		<Form className="openitr-measure" onSubmit={handleSubmit}>
			<Stack>
				<Content component="small">Residential status</Content>
				<Title headingLevel="h2" id={promptId} size="lg">
					{question.prompt}
				</Title>
				<Content component="p" id={helpTextId}>
					{question.helpText}
				</Content>
			</Stack>
			<QuestionChoiceList
				describedBy={helpTextId}
				hasError={false}
				labelledBy={promptId}
				name={question.id}
				onValueChange={(value) =>
					setAnswer(
						question.answers.find((option) => option.value === value)?.value,
					)
				}
				options={question.answers}
				value={answer ?? ""}
			/>
			<ActionGroup>
				<Button
					icon={<ArrowRightIcon />}
					iconPosition="end"
					isDisabled={answer === undefined}
					type="submit"
					variant="primary"
				>
					Continue
				</Button>
			</ActionGroup>
		</Form>
	);
};

const LockedStep = ({
	actionLabel,
	body,
	onAction,
	title,
}: Readonly<{
	actionLabel: string;
	body: string;
	onAction: () => void;
	title: string;
}>) => (
	<EmptyState headingLevel="h2" icon={LockIcon} titleText={title} variant="sm">
		<EmptyStateBody>{body}</EmptyStateBody>
		<EmptyStateFooter>
			<EmptyStateActions>
				<Button onClick={onAction} variant="primary">
					{actionLabel}
				</Button>
			</EmptyStateActions>
		</EmptyStateFooter>
	</EmptyState>
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
					<SalaryReviewView
						documents={intake.documents}
						extractions={intake.extractions}
					/>
				</>
			);
		case "income-computations":
			return (
				<>
					<SalaryComputationView
						computation={intake.salaryComputation}
						documents={intake.documents}
					/>
					<HousePropertyComputationView
						computation={intake.housePropertyComputation}
					/>
					<OtherSourcesComputationView
						computation={intake.otherSourcesComputation}
					/>
					<Section112aCapitalGainView
						computation={intake.section112aCapitalGainComputation}
					/>
					<AgriculturalIncomeView
						computation={intake.agriculturalIncomeComputation}
					/>
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
					<LoanInterestDeductionsView
						computation={intake.loanInterestDeductionComputation}
					/>
					<DonationDeductionsView
						computation={intake.donationDeductionComputation}
					/>
					<RemainingDeductionsView
						computation={intake.remainingDeductionComputation}
					/>
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

	const resetSession = (): void => {
		setActivePageId("scope-questions");
		setDeferredScopeQuestionIds([]);
		session.send({ kind: "reset" });
	};
	const { dialog: exitDialog, requestExit } = useSessionExitGuard({
		hasWorkToLose: snapshot.kind !== "awaiting-scope-answer",
		onReset: resetSession,
	});
	const navigateAway = (href: string): void =>
		requestExit({ kind: "navigate", href });

	if (snapshot.kind === "awaiting-scope-answer") {
		return (
			<AppFrame onNavigateAway={navigateAway} scopeStatus="in-progress">
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
							variant={
								completion.result.kind === "supported" ? "success" : "warning"
							}
						>
							{completion.result.explanation}
						</Alert>
						<DescriptionList isHorizontal>
							<DescriptionListGroup>
								<DescriptionListTerm>Question</DescriptionListTerm>
								<DescriptionListDescription>
									{completion.question.prompt}
								</DescriptionListDescription>
							</DescriptionListGroup>
							<DescriptionListGroup>
								<DescriptionListTerm>Your answer</DescriptionListTerm>
								<DescriptionListDescription>
									{completion.answer.label}
								</DescriptionListDescription>
							</DescriptionListGroup>
							<DescriptionListGroup>
								<DescriptionListTerm>Official source</DescriptionListTerm>
								<DescriptionListDescription>
									<a
										href={completion.result.rule.sourceUrl}
										rel="noreferrer"
										target="_blank"
									>
										{completion.result.rule.citation}
									</a>{" "}
									<Content component="small">
										Rule {completion.result.rule.id}
									</Content>
								</DescriptionListDescription>
							</DescriptionListGroup>
						</DescriptionList>
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
						section={
							activePageId === "scope-decisions" ? "decisions" : "evidence"
						}
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
					<LockedStep
						actionLabel="Go to scope questions"
						body="Answer the remaining scope questions, or resolve any answer marked outside scope or blocked. Documents open once the scope check passes."
						onAction={() => setActivePageId("scope-questions")}
						title="Finish the scope questions first"
					/>
				);
			default: {
				const page = workflowPages[pageIndexOf(activePageId)];
				return intake === undefined ? (
					page === undefined ? null : (
						<LockedStep
							actionLabel="Go to Documents"
							body={page.unavailableNotice ?? ""}
							onAction={() => setActivePageId("documents")}
							title={`${page.title} needs your documents`}
						/>
					)
				) : (
					<IntakePage intake={intake} pageId={activePageId} session={session} />
				);
			}
		}
	};

	return (
		<AppFrame
			activePageId={activePageId}
			onNavigateAway={navigateAway}
			onSelectPage={setActivePageId}
			scopeStatus={
				completion.result.kind === "unsupported"
					? "blocked"
					: canEnterDocuments
						? "complete"
						: "in-progress"
			}
			sessionActions={
				<Button
					icon={<UndoIcon />}
					onClick={() => requestExit({ kind: "reset" })}
					variant="tertiary"
				>
					Reset session
				</Button>
			}
		>
			{pageContent()}
			{intake?.pendingRecomputation.kind === "pending" ? (
				<Alert
					aria-live="polite"
					isInline
					title="Recomputing affected results"
					variant="info"
				>
					The previous estimate is hidden while the changed decision is applied.
					The regime calculations and comparison are hidden too.
				</Alert>
			) : null}
			{exitDialog}
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
					<EmptyState
						headingLevel="h2"
						icon={Spinner}
						titleText="Loading the AY 2026-27 rules"
						variant="sm"
					/>
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
					<Alert
						isInline
						title="The rule pack could not be loaded"
						variant="danger"
					>
						Check your connection and try again. Incident code:{" "}
						{loadState.incidentCode}.
					</Alert>
					<ActionGroup>
						<Button onClick={() => window.location.reload()} variant="primary">
							Try again
						</Button>
					</ActionGroup>
				</AppFrame>
			);
		default: {
			const _exhaustive: never = loadState;
			return _exhaustive;
		}
	}
};
