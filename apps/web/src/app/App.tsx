import type {
	EligibilityAnswerValue,
	EligibilityQuestion,
} from "@openitr/model";
import {
	Alert,
	Button,
	Card,
	CardBody,
	CardFooter,
	CardTitle,
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
	Title,
} from "@patternfly/react-core";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";

import { loadRulePack } from "../session/load-rule-pack";
import { createSessionOrchestrator } from "../session/session-orchestrator";
import type { SessionOrchestrator } from "../session/session-orchestrator";
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
	Record<WorkflowState, Readonly<{ marker: string; label: string }>>
> = Object.freeze({
	"in-progress": Object.freeze({ marker: "1", label: "In progress" }),
	complete: Object.freeze({ marker: "✓", label: "Complete" }),
	blocked: Object.freeze({ marker: "!", label: "Blocked" }),
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
			<span className="openitr-masthead-context">
				{activeAnalysisRelease.form} · AY{" "}
				{activeAnalysisRelease.assessmentYear} · In-browser session
			</span>
			{sessionActions}
		</MastheadContent>
	</Masthead>
);

const WorkflowSidebar = ({
	workflowState,
}: Readonly<{ workflowState: WorkflowState }>) => {
	const presentation = workflowStatePresentation[workflowState];
	return (
		<PageSidebar className="openitr-sidebar" isManagedSidebar>
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
								{presentation.marker}
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
		<PageSection className="openitr-content" isFilled>
			<div className="openitr-content-inner">
				<p className="openitr-eyebrow">
					FY {activeAnalysisRelease.financialYear} · AY{" "}
					{activeAnalysisRelease.assessmentYear} ·{" "}
					{activeAnalysisRelease.form}
				</p>
				<Title headingLevel="h1" size="2xl">
					Check whether this analysis applies
				</Title>
				<p className="openitr-lede">
					Answer one eligibility question from the pinned AY 2026-27 rule
					pack. This check covers one condition, not the complete ITR-1
					analysis envelope.
				</p>

				<Alert
					className="openitr-scope-alert"
					isInline
					title="Educational analysis only"
					variant="info"
				>
					OpenITR does not prepare or submit a tax return. It does not provide
					tax, legal, or professional advice and does not guarantee
					correctness or filing eligibility.
				</Alert>

				{children}

				<footer className="openitr-session-note">
					<strong>No account is required.</strong> Your answer stays in this
					tab's memory and disappears when you refresh, reset, or close the
					tab.
				</footer>
			</div>
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
					<Button isDisabled={answer === undefined} type="submit" variant="primary">
						Check scope
					</Button>
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

	return (
		<AppFrame
			sessionActions={
				<Button
					onClick={() => setResetConfirmationOpen(true)}
					variant="secondary"
				>
					Reset session
				</Button>
			}
			workflowState="complete"
		>
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
						title={snapshot.result.title}
						variant={
							snapshot.result.kind === "supported" ? "success" : "warning"
						}
					>
						{snapshot.result.explanation}
					</Alert>
					<dl className="openitr-result-details">
						<div>
							<dt>Question</dt>
							<dd>{snapshot.question.prompt}</dd>
						</div>
						<div>
							<dt>Your answer</dt>
							<dd>{snapshot.answer.label}</dd>
						</div>
						<div>
							<dt>Rule</dt>
							<dd>{snapshot.result.rule.id}</dd>
						</div>
						<div>
							<dt>Official source</dt>
							<dd>
								<a
									href={snapshot.result.rule.sourceUrl}
									rel="noreferrer"
									target="_blank"
								>
									{snapshot.result.rule.citation}
								</a>
							</dd>
						</div>
					</dl>
					{snapshot.result.kind === "unsupported" ? (
						<p className="openitr-recovery-action">
							<strong>Next action:</strong> {snapshot.result.issue.recoveryAction}
						</p>
					) : null}
					<p className="openitr-result-limit">
						This result covers only this question. It is not a filing-eligibility
						decision.
					</p>
				</CardBody>
			</Card>
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
