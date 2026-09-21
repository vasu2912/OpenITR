import type {
	AnalysisScopeEvaluation,
	ScopeFact,
	ScopeQuestion,
} from "@openitr/model";
import {
	Alert,
	Button,
	Card,
	CardBody,
	CardTitle,
	Title,
} from "@patternfly/react-core";
import { useState } from "react";
import type { FormEvent } from "react";

import type { SessionOrchestrator } from "../session/session-orchestrator";
import {
	QuestionChoiceList,
	type QuestionChoice,
	yesNoQuestionChoices,
} from "./question-choice-list";

const housePropertyCountChoices: readonly QuestionChoice[] = Object.freeze([
	{ label: "No properties", value: "0" },
	{ label: "One property", value: "1" },
	{ label: "Two properties", value: "2" },
	{ label: "Three or more properties", value: "3" },
]);

const choicesFor = (
	question: ScopeQuestion,
): readonly QuestionChoice[] | undefined => {
	if (question.answerSchema.kind === "boolean") return yesNoQuestionChoices;
	if (question.id === "scope-house-property-count") {
		return housePropertyCountChoices;
	}
	return undefined;
};

const inputValueOf = (fact: ScopeFact | undefined): string =>
	fact?.state !== "known"
		? ""
		: fact.value.kind === "boolean"
			? fact.value.value
				? "yes"
				: "no"
			: String(fact.value.value);

const ScopeQuestionForm = ({
	question,
	session,
	initialFact,
	onAnswerLater,
	progressLabel,
}: Readonly<{
	question: ScopeQuestion;
	session: SessionOrchestrator;
	initialFact?: ScopeFact;
	onAnswerLater?: () => void;
	progressLabel?: string;
}>) => {
	const [value, setValue] = useState(() => inputValueOf(initialFact));
	const [isEditing, setEditing] = useState(initialFact === undefined);
	const [error, setError] = useState<string>();
	const inputId = `${question.id}-answer`;
	const helpId = `${question.id}-help`;
	const errorId = `${question.id}-error`;
	const describedBy = error === undefined ? helpId : `${helpId} ${errorId}`;
	const choices = choicesFor(question);
	const submit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (value.trim() === "") {
			return;
		}
		setError(undefined);
		try {
			session.send({
				kind: "answer-analysis-scope-question",
				questionId: question.id,
				value: value.trim(),
				executionContext: { answerTime: new Date().toISOString() },
			});
			setEditing(false);
		} catch (caught: unknown) {
			const message = caught instanceof Error ? caught.message : "";
			setError(
				message.includes("Invalid exact money")
					? "Enter a valid non-negative amount."
					: message || "This answer could not be recorded.",
			);
		}
	};

	if (initialFact?.state === "known" && !isEditing) {
		const recorded = initialFact.origin.kind === "attested-answer";
		return (
			<li
				className="openitr-scope-analysis-question"
				data-scope-question={question.id}
				id={`scope-question-${String(question.id)}`}
			>
				<strong>Question:</strong> {question.prompt}
				<br />
				<strong>{recorded ? "Recorded answer" : "Known value"}:</strong>{" "}
				{displayFactValue(initialFact)}
				<small>
					Fact state: {initialFact.state} · Pinned revision{" "}
					{initialFact.origin.kind === "attested-answer"
						? initialFact.origin.questionRevision
						: initialFact.origin.kind === "derived"
							? initialFact.origin.rulePackId
							: "source-backed"}
					<br />
					Provenance: {factProvenance(initialFact)}
				</small>
				<Button
					onClick={() => {
						setValue(inputValueOf(initialFact));
						setEditing(true);
					}}
					type="button"
					variant="link"
				>
					Change answer
				</Button>
			</li>
		);
	}

	return (
		<li
			className="openitr-scope-analysis-question"
			data-scope-question={question.id}
			id={`scope-question-${String(question.id)}`}
		>
			{progressLabel === undefined ? null : (
				<p className="openitr-scope-question-progress">{progressLabel}</p>
			)}
			<form className="openitr-scope-question-form" onSubmit={submit}>
				{choices === undefined ? (
					<label htmlFor={inputId}>{question.prompt}</label>
				) : (
					<QuestionChoiceList
						describedBy={describedBy}
						hasError={error !== undefined}
						legend={question.prompt}
						name={inputId}
						onValueChange={setValue}
						options={choices}
						value={value}
					/>
				)}
				<p id={helpId}>{question.helpText}</p>
				{initialFact?.state === "blocked" ||
				initialFact?.state === "unsupported" ? (
					<p role="status">{factProvenance(initialFact)}</p>
				) : null}
				<div
					className={
						choices === undefined
							? "openitr-scope-question-answer"
							: "openitr-scope-question-actions"
					}
				>
					{choices === undefined ? (
						<input
							aria-describedby={describedBy}
							aria-invalid={error !== undefined}
							id={inputId}
							inputMode={
								question.answerSchema.kind === "exact-money"
									? "decimal"
									: "numeric"
							}
							onChange={(event) => setValue(event.target.value)}
							type="text"
							value={value}
						/>
					) : null}
					<Button
						isDisabled={value.trim() === ""}
						type="submit"
						variant="secondary"
					>
						Record scope answer
					</Button>
					{onAnswerLater === undefined ? null : (
						<Button onClick={onAnswerLater} type="button" variant="link">
							Answer later
						</Button>
					)}
				</div>
				{error === undefined ? null : (
					<p id={errorId} role="alert">
						{error}
					</p>
				)}
			</form>
		</li>
	);
};

const displayFactValue = (fact: ScopeFact | undefined): string => {
	if (fact === undefined || fact.state !== "known") {
		return "";
	}
	switch (fact.value.kind) {
		case "boolean":
			return fact.value.value ? "Yes" : "No";
		case "exact-money": {
			const [whole = "", fraction] = fact.value.value.split(".");
			const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			return `₹ ${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
		}
		case "whole-number":
			return String(fact.value.value);
		case "choice":
			return fact.value.value;
		default: {
			const _exhaustive: never = fact.value;
			return _exhaustive;
		}
	}
};

const factProvenance = (fact: ScopeFact): string => {
	if (fact.state !== "known") {
		const conflict =
			fact.state === "blocked" && fact.conflictingFacts !== undefined
				? ` Conflicting candidates: ${fact.conflictingFacts
						.map(
							(candidate) =>
								`${displayFactValue(candidate)} (${factProvenance(candidate)})`,
						)
						.join("; ")}.`
				: "";
		return `${fact.reason}${conflict}`;
	}
	switch (fact.origin.kind) {
		case "observation":
			return `${String(fact.origin.sourceId)} · ${String(fact.origin.sourceDocumentId)} · ${fact.origin.location}`;
		case "attested-answer":
			return `attested answer ${String(fact.origin.questionId)} at ${fact.origin.answeredAt} · pack ${String(fact.origin.rulePackId)}`;
		case "resolution":
			return `resolution ${fact.origin.resolutionId} · ${fact.origin.location}`;
		case "derived":
			return `derived by ${String(fact.origin.ruleId)} from ${fact.origin.inputFactKeys.map(String).join(", ")} · pack ${String(fact.origin.rulePackId)}`;
		default: {
			const _exhaustive: never = fact.origin;
			return _exhaustive;
		}
	}
};

const decisionLabel = (
	kind: AnalysisScopeEvaluation["decisions"][number]["kind"],
): string =>
	kind === "supported"
		? "Supported"
		: kind === "unsupported"
			? "Outside scope"
			: kind === "blocked"
				? "Blocked"
				: "Unknown";

type ScopeAnalysisSection = "questions" | "decisions" | "evidence";

const sectionTitle: Readonly<Record<Exclude<ScopeAnalysisSection, "questions">, string>> = {
	decisions: "Scope decision",
	evidence: "Evidence needed",
};

export const ScopeAnalysisView = ({
	deferredQuestionIds = [],
	evaluation,
	onDeferQuestion,
	section,
	session,
}: Readonly<{
	deferredQuestionIds?: readonly ScopeQuestion["id"][];
	evaluation: AnalysisScopeEvaluation;
	onDeferQuestion?: (questionId: ScopeQuestion["id"]) => void;
	section: ScopeAnalysisSection;
	session: SessionOrchestrator;
}>) => {
	const currentQuestion =
		evaluation.questions.find(
			(question) => !deferredQuestionIds.includes(question.id),
		) ?? evaluation.questions[0];
	const currentUnresolvedFact =
		currentQuestion === undefined
			? undefined
			: evaluation.unresolvedFacts.find(
					(fact) => fact.factKey === currentQuestion.factKey,
				);
	const remainingQuestionLabel = `${evaluation.questions.length} scope ${evaluation.questions.length === 1 ? "question" : "questions"} remaining`;

	if (section === "questions") {
		return (
			<section aria-label="Current scope question" className="openitr-scope-question-workspace">
				{currentQuestion === undefined ? (
					<p>No unresolved scope questions</p>
				) : (
					<div
						className="openitr-current-scope-question"
						data-current-scope-question={currentQuestion.id}
					>
						<ul className="openitr-scope-analysis-question-list">
							<ScopeQuestionForm
								{...(currentUnresolvedFact === undefined
									? {}
									: { initialFact: currentUnresolvedFact })}
								key={currentQuestion.id}
								{...(evaluation.questions.length > 1 &&
								onDeferQuestion !== undefined
									? {
											onAnswerLater: () =>
												onDeferQuestion(currentQuestion.id),
										}
									: {})}
								progressLabel={remainingQuestionLabel}
								question={currentQuestion}
								session={session}
							/>
						</ul>
					</div>
				)}
				{evaluation.answeredQuestions.length === 0 ? null : (
					<details className="openitr-recorded-scope-answers">
						<summary>
							Review {evaluation.answeredQuestions.length} recorded{" "}
							{evaluation.answeredQuestions.length === 1 ? "answer" : "answers"}
						</summary>
						<ul className="openitr-scope-analysis-question-list">
							{evaluation.answeredQuestions.map(({ question, fact }) => (
								<ScopeQuestionForm
									initialFact={fact}
									key={question.id}
									question={question}
									session={session}
								/>
							))}
						</ul>
					</details>
				)}
			</section>
		);
	}

	return (
	<Card className="openitr-scope-analysis-card" component="section">
		<CardTitle>
			<Title headingLevel="h2" size="lg">
				{sectionTitle[section]}
			</Title>
		</CardTitle>
		<CardBody>
			{section === "decisions" ? <Alert
				aria-live="polite"
				isInline
				title={
					evaluation.kind === "supported"
						? "The approved scope facts are supported"
						: evaluation.kind === "unknown"
							? "More scope facts are needed"
							: evaluation.kind === "blocked"
								? "The scope check is blocked"
								: "At least one scope fact is outside this analysis"
				}
				variant={evaluation.kind === "supported" ? "success" : "warning"}
			>
				Scope support does not mean that calculations, evidence review, filing
				eligibility, or portal acceptance is complete.
			</Alert> : null}

			{section === "decisions" ? <section aria-labelledby="scope-decisions-heading">
				<h3 id="scope-decisions-heading">Scope decisions</h3>
				<ul className="openitr-scope-analysis-decision-list">
					{evaluation.decisions.map((decision) => (
						<li id={`scope-decision-${decision.id}`} key={decision.id}>
							<strong>{decisionLabel(decision.kind)}</strong>:{" "}
							{decision.explanation}
							<small>
								Fact <code>{String(decision.factKey)}</code> · State{" "}
								<code>{decision.fact.state}</code> · Value{" "}
								<code>{displayFactValue(decision.fact)}</code> · Rule{" "}
								<code>{String(decision.rule.id)}</code> · Pinned revision{" "}
								<code>{decision.rulePackIdentity.revision}</code>
								<br />
								Provenance: {factProvenance(decision.fact)} · Location:{" "}
								{decision.rule.sourceLocation}
								<br />
								<a
									href={decision.rule.sourceUrl}
									rel="noreferrer"
									target="_blank"
								>
									{decision.rule.citation}
								</a>
							</small>
							{decision.recoveryAction === undefined ? null : (
								<p>
									<strong>Next action:</strong> {decision.recoveryAction}
								</p>
							)}
						</li>
					))}
				</ul>
			</section> : null}

			{section === "evidence" ? <section aria-labelledby="scope-checklist-heading">
				<h3 id="scope-checklist-heading">Evidence checklist</h3>
				{evaluation.checklist.length === 0 ? (
					<p>
						No additional evidence is requested by the currently known
						composition.
					</p>
				) : (
					<ul className="openitr-scope-analysis-checklist">
						{evaluation.checklist.map((item) =>
							item.status === "not-needed" ? null : (
								<li key={item.id} data-status={item.status}>
									<strong>
										{item.status === "satisfied"
											? "Evidence supplied"
											: "Needed"}
										:
									</strong>{" "}
									{item.label}. {item.detail}
								</li>
							),
						)}
					</ul>
				)}
			</section> : null}

			{section !== "evidence" || evaluation.calculationLimitations.length === 0 ? null : (
				<section aria-labelledby="scope-calculation-limits-heading">
					<h3 id="scope-calculation-limits-heading">
						Current calculation limits
					</h3>
					<ul>
						{evaluation.calculationLimitations.map((limitation) => (
							<li key={limitation.factKey}>{limitation.explanation}</li>
						))}
					</ul>
				</section>
			)}

			{section === "evidence" ? (
				<p className="openitr-result-limit">
					{evaluation.educationalLimitations.join(" ")}
				</p>
			) : null}
		</CardBody>
	</Card>
	);
};
