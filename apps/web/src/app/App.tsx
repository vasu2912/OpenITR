import { itr1Ay202627RulePack } from "@openitr/itr1-ay2026-27";
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
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { createSessionOrchestrator } from "../session/session-orchestrator";

const rulePack = itr1Ay202627RulePack;

const AppMasthead = () => (
	<Masthead className="openitr-masthead">
		<MastheadMain>
			<MastheadBrand>
				<span className="openitr-wordmark">OpenITR</span>
			</MastheadBrand>
		</MastheadMain>
		<MastheadContent>
			<span className="openitr-masthead-context">
				{rulePack.identity.form} · AY {rulePack.identity.assessmentYear} ·
				 In-browser session
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
					<li aria-current="step" className="openitr-workflow-step">
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

export const App = () => {
	const [session] = useState(() =>
		createSessionOrchestrator({ rulePackId: rulePack.identity.id }),
	);
	const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
	const [answer, setAnswer] = useState<EligibilityAnswerValue>();

	useEffect(() => () => session.stop(), [session]);

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
		setSnapshot(session.getSnapshot());
	};

	const isComplete = snapshot.kind === "scope-check-complete";

	return (
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
						FY {rulePack.identity.financialYear} · AY{" "}
						{rulePack.identity.assessmentYear} · {rulePack.identity.form}
					</p>
					<Title headingLevel="h1" size="2xl">
						Check whether this analysis applies
					</Title>
					<p className="openitr-lede">
						Answer one eligibility question from the pinned AY 2026-27
						 rule pack. This check covers one condition, not the complete
						 ITR-1 analysis envelope.
					</p>

					<Alert
						className="openitr-scope-alert"
						isInline
						title="Educational analysis only"
						variant="info"
					>
						OpenITR does not prepare or submit a tax return. It does not
						 provide tax, legal, or professional advice and does not guarantee
						 correctness or filing eligibility.
					</Alert>

					{snapshot.kind === "awaiting-scope-answer" ? (
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
								Rule pack revision {rulePack.identity.revision}
							</CardFooter>
						</Card>
					) : (
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
										snapshot.result.kind === "supported"
											? "success"
											: "warning"
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
								<p className="openitr-result-limit">
									This result covers only this question. It is not a filing-eligibility
									 decision.
								</p>
							</CardBody>
						</Card>
					)}

					<footer className="openitr-session-note">
						<strong>No account is required.</strong> Your answer stays in this
						 tab's memory and disappears when you refresh or close the tab.
					</footer>
				</div>
			</PageSection>
		</Page>
	);
};
