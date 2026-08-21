import type { EligibilityAnswerValue } from "@openitr/model";
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

const AppMasthead = () => (
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
		</MastheadContent>
	</Masthead>
);

const WorkflowSidebar = ({
	isComplete,
}: Readonly<{ isComplete: boolean }>) => (
	<PageSidebar className="openitr-sidebar" isManagedSidebar>
		<PageSidebarBody>
			<nav aria-label="Analysis workflow" className="openitr-workflow">
				<p className="openitr-workflow-heading">Analysis workflow</p>
				<ol className="openitr-workflow-list">
					<li
						aria-current={isComplete ? undefined : "step"}
						className="openitr-workflow-step"
					>
						<span aria-hidden="true" className="openitr-step-marker">
							{isComplete ? "✓" : "1"}
						</span>
						<span>
							<strong>Scope check</strong>
							<small>{isComplete ? "Complete" : "In progress"}</small>
						</span>
					</li>
				</ol>
			</nav>
		</PageSidebarBody>
	</PageSidebar>
);

const AppFrame = ({
	children,
	isComplete,
}: Readonly<{ children: ReactNode; isComplete: boolean }>) => (
	<Page
		className="openitr-page"
		defaultManagedSidebarIsOpen
		isManagedSidebar
		mainContainerId="openitr-main"
		masthead={<AppMasthead />}
		sidebar={<WorkflowSidebar isComplete={isComplete} />}
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
					tab's memory and disappears when you refresh or close the tab.
				</footer>
			</div>
		</PageSection>
	</Page>
);

const ScopeInteraction = ({
	session,
}: Readonly<{ session: SessionOrchestrator }>) => {
	const snapshot = useSyncExternalStore(
		session.subscribe,
		session.getSnapshot,
		session.getSnapshot,
	);
	const [answer, setAnswer] = useState<EligibilityAnswerValue>();

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (snapshot.kind !== "awaiting-scope-answer" || answer === undefined) {
			return;
		}

		session.send({
			kind: "answer-eligibility-question",
			questionId: snapshot.question.id,
			answer,
		});
	};

	if (snapshot.kind === "awaiting-scope-answer") {
		return (
			<AppFrame isComplete={false}>
				<Card className="openitr-question-card" component="section">
					<CardTitle>
						<Title headingLevel="h2" size="lg">
							Residential status
						</Title>
					</CardTitle>
					<CardBody>
						<Form onSubmit={handleSubmit}>
							<fieldset className="openitr-question-fieldset">
								<legend>{snapshot.question.prompt}</legend>
								<p id="residential-status-help">
									{snapshot.question.helpText}
								</p>
								<div className="openitr-answer-options">
									{snapshot.question.answers.map((option) => (
										<Radio
											aria-describedby="residential-status-help"
											id={`residential-status-${option.value}`}
											isChecked={answer === option.value}
											key={option.value}
											label={option.label}
											name="residential-status"
											onChange={() => setAnswer(option.value)}
										/>
									))}
								</div>
							</fieldset>
							<Button
								isDisabled={answer === undefined}
								type="submit"
								variant="primary"
							>
								Check scope
							</Button>
						</Form>
					</CardBody>
					<CardFooter>
						Rule pack revision {activeAnalysisRelease.rulePackRevision}
					</CardFooter>
				</Card>
			</AppFrame>
		);
	}

	return (
		<AppFrame isComplete>
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

		void loadRulePack(activeAnalysisRelease.rulePackId)
			.then((rulePack) => {
				if (isDisposed) {
					return;
				}
				sessionToStop = createSessionOrchestrator({
					rulePack,
					executionContext: { answerTime: new Date().toISOString() },
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
				<AppFrame isComplete={false}>
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
				<AppFrame isComplete={false}>
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
