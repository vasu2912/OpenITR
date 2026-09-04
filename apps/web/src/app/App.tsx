import type {
	EligibilityAnswerValue,
	EligibilityQuestion,
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
import type { FormEvent, ReactNode } from "react";

import { loadRulePack } from "../session/load-rule-pack";
import { createSessionOrchestrator } from "../session/session-orchestrator";
import type { SessionOrchestrator } from "../session/session-orchestrator";
import { workerInspectionFacility } from "../session/worker-inspection-facility";
import { DocumentsIntakeView } from "../views/documents-intake";
import { EstimateView } from "../views/estimate-view";
import { FactConflictsView } from "../views/fact-conflicts";
import { MissingFactQuestionsView } from "../views/missing-fact-questions";
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
	workflowState,
}: Readonly<{ workflowState: WorkflowState }>) => {
	const presentation = workflowStatePresentation[workflowState];
	return (
		<PageSidebar className="openitr-sidebar">
			<PageSidebarBody>
				<nav aria-label="Analysis workflow" className="openitr-workflow">
					<p className="openitr-workflow-heading">Analysis workflow</p>
					<ol className="openitr-workflow-list">
						<li
							aria-current={
								workflowState === "in-progress" ? "step" : undefined
							}
							className="openitr-workflow-step"
							data-status={workflowState}
						>
							<span aria-hidden="true" className="openitr-step-marker">
								1
							</span>
							<span>
								<strong>Scope check</strong>
								<small>{presentation.label}</small>
							</span>
						</li>
					</ol>
				</nav>
			</PageSidebarBody>
		</PageSidebar>
	);
};

const AppFrame = ({
	children,
	sessionActions,
	workflowState,
}: Readonly<{
	children: ReactNode;
	sessionActions?: ReactNode;
	workflowState: WorkflowState;
}>) => (
	<Page
		className="openitr-page"
		defaultManagedSidebarIsOpen
		isManagedSidebar
		mainContainerId="openitr-main"
		masthead={<AppMasthead sessionActions={sessionActions} />}
		sidebar={<WorkflowSidebar workflowState={workflowState} />}
	>
		<PageSection isFilled={false}>
			<p className="openitr-eyebrow">
				FY {activeAnalysisRelease.financialYear} · AY{" "}
				{activeAnalysisRelease.assessmentYear} · {activeAnalysisRelease.form}
			</p>
			<Title headingLevel="h1" size="2xl">
				Check whether this analysis applies
			</Title>
			<p className="openitr-lede">
				Answer the eligibility question from the pinned AY 2026-27 rule pack,
				then review the complete ITR-1 analysis scope and its evidence checklist.
			</p>
		</PageSection>
		<PageSection isFilled variant="secondary">
			<Stack hasGutter>
				<Alert isInline title="Educational analysis only" variant="info">
					OpenITR does not prepare or submit a tax return. It does not provide
					tax, legal, or professional advice and does not guarantee
					correctness or filing eligibility.
				</Alert>

				{children}

				<Divider />
				<footer>
					<strong>No account is required.</strong> Your answer stays in this
					tab's memory and disappears when you refresh, reset, or close the
					tab.
				</footer>
			</Stack>
		</PageSection>
	</Page>
);

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
							Check scope
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

	if (snapshot.kind === "awaiting-scope-answer") {
		return (
			<AppFrame workflowState="in-progress">
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
	const documents =
		snapshot.kind === "document-intake" ? snapshot.documents : [];
	const extractions =
		snapshot.kind === "document-intake" ? snapshot.extractions : [];
	const factConflicts =
		snapshot.kind === "document-intake" ? snapshot.factConflicts : [];
	const factResolutions =
		snapshot.kind === "document-intake" ? snapshot.factResolutions : [];
	const salaryComputation =
		snapshot.kind === "document-intake"
			? snapshot.salaryComputation
			: undefined;
	const estimateComputation =
		snapshot.kind === "document-intake"
			? snapshot.estimateComputation
			: undefined;
	const pendingRecomputation =
		snapshot.kind === "document-intake"
			? snapshot.pendingRecomputation
			: { kind: "idle" as const };
	const analysisScope = snapshot.analysisScope;
	const canEnterDocuments =
		analysisScope === undefined || analysisScope.kind === "supported";

	return (
		<AppFrame
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
			{analysisScope === undefined ? (
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
			{analysisScope === undefined ? null : (
				<ScopeAnalysisView evaluation={analysisScope} session={session} />
			)}
			{canEnterDocuments ? (
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
			{canEnterDocuments && snapshot.kind === "document-intake" ? (
				<MissingFactQuestionsView
					answers={snapshot.factAnswers}
					questionnaire={snapshot.questionnaire}
					session={session}
				/>
			) : null}
			{canEnterDocuments ? (
				<>
					<FactConflictsView
						conflicts={factConflicts}
						documents={documents}
						resolutions={factResolutions}
						session={session}
					/>
					<SalaryReviewView extractions={extractions} />
					<SalaryComputationView computation={salaryComputation} />
					{pendingRecomputation.kind === "pending" ? (
						<Alert
							aria-live="polite"
							className="openitr-recomputation-status"
							isInline
							title="Recomputing estimate"
							variant="info"
						>
							The previous estimate is hidden while the changed decision is
							applied.
						</Alert>
					) : null}
					<EstimateView estimate={estimateComputation} />
				</>
			) : null}
			<ResetSessionDialog
				isOpen={isResetConfirmationOpen}
				onCancel={() => setResetConfirmationOpen(false)}
				onConfirmReset={() => {
					setResetConfirmationOpen(false);
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
