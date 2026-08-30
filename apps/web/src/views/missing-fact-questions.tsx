import type {
	ApplicableFactQuestion,
	AttestedAnswerFact,
	MissingFactQuestionnaire,
} from "@openitr/question-engine";
import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	parseExactMoney,
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

const wholeRupeeText = (value: number): string =>
	`₹ ${value.toLocaleString("en-IN")}`;

const validationMessage = (
	question: ApplicableFactQuestion,
	rawValue: string,
): string | undefined => {
	const value = rawValue.trim();
	if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
		return "Enter a non-negative amount using digits and an optional decimal point.";
	}
	let amount;
	try {
		amount = parseExactMoney(value);
	} catch {
		return "Enter an amount within the supported precision.";
	}
	const { minimumWholeRupees, maximumWholeRupees } = question.answerSchema;
	if (
		compareExactMoney(
			amount,
			exactMoneyFromWholeRupees(minimumWholeRupees),
		) < 0 ||
		(maximumWholeRupees !== null &&
			compareExactMoney(
				amount,
				exactMoneyFromWholeRupees(maximumWholeRupees),
			) > 0)
	) {
		return maximumWholeRupees === null
			? `Enter an amount of at least ${wholeRupeeText(minimumWholeRupees)}.`
			: `Enter an amount from ${wholeRupeeText(minimumWholeRupees)} to ${wholeRupeeText(maximumWholeRupees)}.`;
	}
	return undefined;
};

const MissingFactQuestionForm = ({
	question,
	session,
}: Readonly<{
	question: ApplicableFactQuestion;
	session: SessionOrchestrator;
}>) => {
	const [value, setValue] = useState("");
	const [error, setError] = useState<string>();
	const inputId = `${question.id}-answer`;
	const helpId = `${question.id}-help`;
	const rationaleId = `${question.id}-rationale`;
	const affectedId = `${question.id}-affected`;
	const errorId = `${question.id}-error`;

	const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const nextError = validationMessage(question, value);
		if (nextError !== undefined) {
			setError(nextError);
			return;
		}
		try {
			session.send({
				kind: "answer-missing-fact-question",
				questionId: question.id,
				value: value.trim(),
				executionContext: { answerTime: new Date().toISOString() },
			});
		} catch {
			setError(
				"This answer could not be recorded. Review the amount and try again.",
			);
		}
	};

	return (
		<li className="openitr-missing-fact-item">
			<form onSubmit={handleSubmit}>
				<label className="openitr-missing-fact-label" htmlFor={inputId}>
					{question.prompt}
				</label>
				<p className="openitr-missing-fact-help" id={helpId}>
					{question.helpText}
				</p>
				<dl className="openitr-question-context">
					<div id={rationaleId}>
						<dt>Why this is required</dt>
						<dd>{question.whyRequired}</dd>
					</div>
					<div id={affectedId}>
						<dt>Result this can affect</dt>
						<dd>{question.affectedResult.label}</dd>
					</div>
				</dl>
				<div className="openitr-missing-fact-answer-row">
					<span aria-hidden="true" className="openitr-rupee-prefix">
						₹
					</span>
					<input
						aria-describedby={`${helpId} ${rationaleId} ${affectedId}${error === undefined ? "" : ` ${errorId}`}`}
						aria-invalid={error !== undefined}
						className="openitr-missing-fact-input"
						id={inputId}
						inputMode="decimal"
						onChange={(event) => {
							setValue(event.target.value);
							setError(undefined);
						}}
						placeholder="0.00"
						type="text"
						value={value}
					/>
					<Button type="submit" variant="primary">
						Record answer
					</Button>
				</div>
				{error === undefined ? null : (
					<p className="openitr-missing-fact-error" id={errorId} role="alert">
						{error}
					</p>
				)}
			</form>
		</li>
	);
};

export const MissingFactQuestionsView = ({
	questionnaire,
	answers,
	session,
}: Readonly<{
	questionnaire: MissingFactQuestionnaire;
	answers: readonly AttestedAnswerFact[];
	session: SessionOrchestrator;
}>) => {
	if (questionnaire.questions.length === 0 && answers.length === 0) {
		return null;
	}

	return (
		<Card
			aria-live="polite"
			className="openitr-missing-facts-card"
			component="section"
		>
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Missing facts
				</Title>
			</CardTitle>
			<CardBody>
				{questionnaire.questions.length === 0 ? (
					<Alert
						isInline
						title="Every permitted missing fact has been supplied"
						variant="success"
					>
						Accepted evidence and your recorded answers now supply these facts.
					</Alert>
				) : (
					<Alert
						isInline
						title={`${questionnaire.questions.length} missing ${questionnaire.questions.length === 1 ? "fact" : "facts"} can be answered`}
						variant="warning"
					>
						These questions come from the pinned rule pack. Leave an amount
						blank until you can attest it; OpenITR will keep it unknown.
					</Alert>
				)}
				<ul className="openitr-missing-fact-list">
					{questionnaire.questions.map((question) => (
						<MissingFactQuestionForm
							key={question.id}
							question={question}
							session={session}
						/>
					))}
				</ul>
				{answers.length === 0 ? null : (
					<div className="openitr-recorded-answers">
						<h3>Recorded answers</h3>
						<ul>
							{answers.map((answer) => (
								<li key={answer.answerId}>
									<code>{String(answer.factKey)}</code>: ₹ {answer.value}
									<Button
										onClick={() =>
											session.send({
												kind: "remove-missing-fact-answer",
												answerId: answer.answerId,
											})
										}
										variant="link"
									>
										Change answer
									</Button>
									<small>
										Question revision {answer.questionRevision}; recorded {answer.answeredAt}
									</small>
								</li>
							))}
						</ul>
					</div>
				)}
			</CardBody>
		</Card>
	);
};
