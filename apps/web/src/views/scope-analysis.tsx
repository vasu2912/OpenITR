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
}: Readonly<{
	question: ScopeQuestion;
	session: SessionOrchestrator;
	initialFact?: ScopeFact;
}>) => {
	const [value, setValue] = useState(() => inputValueOf(initialFact));
	const [isEditing, setEditing] = useState(initialFact === undefined);
	const [error, setError] = useState<string>();
	const inputId = `${question.id}-answer`;
	const helpId = `${question.id}-help`;
	const errorId = `${question.id}-error`;
	const describedBy = error === undefined ? helpId : `${helpId} ${errorId}`;
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
		>
			<form onSubmit={submit}>
				<label htmlFor={inputId}>{question.prompt}</label>
				<p id={helpId}>{question.helpText}</p>
				{initialFact?.state === "blocked" ||
				initialFact?.state === "unsupported" ? (
					<p role="status">{factProvenance(initialFact)}</p>
				) : null}
				{question.answerSchema.kind === "boolean" ? (
					<select
						aria-describedby={describedBy}
						aria-invalid={error !== undefined}
						id={inputId}
						onChange={(event) => setValue(event.target.value)}
						value={value}
					>
						<option value="">Select an answer</option>
						<option value="yes">Yes</option>
						<option value="no">No</option>
					</select>
				) : (
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
				)}
				<Button
					isDisabled={value.trim() === ""}
					type="submit"
					variant="secondary"
				>
					Record scope answer
				</Button>
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

export const ScopeAnalysisView = ({
	evaluation,
	session,
}: Readonly<{
	evaluation: AnalysisScopeEvaluation;
	session: SessionOrchestrator;
}>) => (
	<Card className="openitr-scope-analysis-card" component="section">
		<CardTitle>
			<Title headingLevel="h2" size="lg">
				Complete ITR-1 analysis scope
			</Title>
		</CardTitle>
		<CardBody>
			<Alert
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
			</Alert>

			<section aria-labelledby="scope-questions-heading">
				<h3 id="scope-questions-heading">Unresolved scope questions</h3>
				{evaluation.questions.length === 0 ? (
					<p>No unresolved scope questions</p>
				) : (
					<ul className="openitr-scope-analysis-question-list">
						{evaluation.questions.map((question) => {
							const unresolvedFact = evaluation.unresolvedFacts.find(
								(fact) => fact.factKey === question.factKey,
							);
							return (
								<ScopeQuestionForm
									{...(unresolvedFact === undefined
										? {}
										: { initialFact: unresolvedFact })}
									key={question.id}
									question={question}
									session={session}
								/>
							);
						})}
					</ul>
				)}
				{evaluation.answeredQuestions.length === 0 ? null : (
					<>
						<h4>Recorded scope answers</h4>
						<ul className="openitr-scope-analysis-question-list">
							{evaluation.answeredQuestions.map(({ question, fact }) => (
								<ScopeQuestionForm
									key={question.id}
									question={question}
									session={session}
									initialFact={fact}
								/>
							))}
						</ul>
					</>
				)}
			</section>

			<section aria-labelledby="scope-decisions-heading">
				<h3 id="scope-decisions-heading">Scope decisions</h3>
				<ul className="openitr-scope-analysis-decision-list">
					{evaluation.decisions.map((decision) => (
						<li key={decision.id}>
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
			</section>

			<section aria-labelledby="scope-checklist-heading">
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
			</section>

			{evaluation.calculationLimitations.length === 0 ? null : (
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

			<p className="openitr-result-limit">
				{evaluation.educationalLimitations.join(" ")}
			</p>
		</CardBody>
	</Card>
);
