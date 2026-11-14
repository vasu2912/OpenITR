import {
	compareExactMoney,
	exactMoneyFromWholeRupees,
	isIsoDate,
	parseExactMoney,
} from "@openitr/model";
import type {
	ApplicableFactQuestion,
	AttestedAnswerFact,
	MissingFactQuestionnaire,
} from "@openitr/question-engine";
import {
	ActionGroup,
	Alert,
	Button,
	Content,
	DataList,
	DataListAction,
	DataListCell,
	DataListItem,
	DataListItemCells,
	DataListItemRow,
	DescriptionList,
	DescriptionListDescription,
	DescriptionListGroup,
	DescriptionListTerm,
	ExpandableSection,
	Form,
	FormHelperText,
	HelperText,
	HelperTextItem,
	Stack,
	StackItem,
	Title,
} from "@patternfly/react-core";
import type { FormEvent } from "react";
import { useState } from "react";

import type { SessionOrchestrator } from "../session/session-orchestrator";
import { FactLabel } from "./plain-language";
import {
	AmountInput,
	QuestionChoiceList,
	yesNoQuestionChoices,
} from "./question-choice-list";

const wholeRupeeText = (value: number): string =>
	`₹ ${value.toLocaleString("en-IN")}`;

const validationMessage = (
	question: ApplicableFactQuestion,
	rawValue: string,
): string | undefined => {
	if (question.answerSchema.kind === "boolean") {
		return rawValue === "yes" || rawValue === "no"
			? undefined
			: "Select Yes or No.";
	}
	if (question.answerSchema.kind === "iso-date") {
		return isIsoDate(rawValue) ? undefined : "Enter a valid date.";
	}
	const value = rawValue.trim();
	if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
		return "Enter a non-negative amount using digits and an optional decimal point.";
	}
	let amount: ReturnType<typeof parseExactMoney>;
	try {
		amount = parseExactMoney(value);
	} catch {
		return "Enter an amount within the supported precision.";
	}
	const { minimumWholeRupees, maximumWholeRupees } = question.answerSchema;
	if (
		compareExactMoney(amount, exactMoneyFromWholeRupees(minimumWholeRupees)) <
			0 ||
		(maximumWholeRupees !== null &&
			compareExactMoney(amount, exactMoneyFromWholeRupees(maximumWholeRupees)) >
				0)
	) {
		return maximumWholeRupees === null
			? `Enter an amount of at least ${wholeRupeeText(minimumWholeRupees)}.`
			: `Enter an amount from ${wholeRupeeText(minimumWholeRupees)} to ${wholeRupeeText(maximumWholeRupees)}.`;
	}
	return undefined;
};

const MissingFactQuestionForm = ({
	position,
	question,
	session,
}: Readonly<{
	position: Readonly<{ index: number; total: number }>;
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
	const describedBy = `${helpId} ${rationaleId} ${affectedId}${error === undefined ? "" : ` ${errorId}`}`;

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
			setError("This answer could not be recorded. Review it and try again.");
		}
	};

	const clearError = (nextValue: string): void => {
		setValue(nextValue);
		setError(undefined);
	};

	const promptId = `${question.id}-prompt`;
	return (
		<StackItem id={`question-${question.id}`}>
			<Form className="openitr-measure" onSubmit={handleSubmit}>
				<Stack>
					<Content component="small">
						Question {position.index + 1} of {position.total} ·{" "}
						{question.affectedResult.label}
					</Content>
					<Title headingLevel="h3" id={promptId} size="lg">
						{question.prompt}
					</Title>
					<Content component="p" id={helpId}>
						{question.helpText}
					</Content>
				</Stack>
				{question.answerSchema.kind === "boolean" ? (
					<QuestionChoiceList
						describedBy={describedBy}
						hasError={error !== undefined}
						labelledBy={promptId}
						name={inputId}
						onValueChange={clearError}
						options={yesNoQuestionChoices}
						value={value}
					/>
				) : (
					<AmountInput
						describedBy={describedBy}
						error={error}
						errorId={errorId}
						id={inputId}
						labelledBy={promptId}
						onValueChange={clearError}
						placeholder={
							question.answerSchema.kind === "exact-money" ? "0.00" : undefined
						}
						showRupee={question.answerSchema.kind === "exact-money"}
						type={question.answerSchema.kind === "iso-date" ? "date" : "text"}
						value={value}
					/>
				)}
				{question.answerSchema.kind === "boolean" && error !== undefined ? (
					<FormHelperText>
						<HelperText isLiveRegion>
							<HelperTextItem id={errorId} variant="error">
								{error}
							</HelperTextItem>
						</HelperText>
					</FormHelperText>
				) : null}
				<ActionGroup>
					<Button type="submit" variant="secondary">
						Save answer
					</Button>
				</ActionGroup>
				<ExpandableSection toggleText="Why OpenITR asks this">
					<DescriptionList isCompact>
						<DescriptionListGroup id={rationaleId}>
							<DescriptionListTerm>Why this is required</DescriptionListTerm>
							<DescriptionListDescription>
								{question.whyRequired}
							</DescriptionListDescription>
						</DescriptionListGroup>
						<DescriptionListGroup id={affectedId}>
							<DescriptionListTerm>Result this can affect</DescriptionListTerm>
							<DescriptionListDescription>
								{question.affectedResult.label}
							</DescriptionListDescription>
						</DescriptionListGroup>
					</DescriptionList>
				</ExpandableSection>
			</Form>
		</StackItem>
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
		<section aria-live="polite" className="openitr-missing-facts-card">
			<Title headingLevel="h2" size="lg">
				Missing facts
			</Title>
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
					Your documents did not contain these facts. Answer the ones you can
					confirm. Anything left blank stays unknown, and the results it affects
					stay blocked.
				</Alert>
			)}
			<Stack className="openitr-question-stack" hasGutter>
				{questionnaire.questions.map((question, index) => (
					<MissingFactQuestionForm
						key={question.id}
						position={{ index, total: questionnaire.questions.length }}
						question={question}
						session={session}
					/>
				))}
			</Stack>
			{answers.length === 0 ? null : (
				<Stack hasGutter>
					<Title headingLevel="h3" id="recorded-answers-heading" size="md">
						Recorded answers
					</Title>
					<DataList aria-label="Recorded answers" isCompact>
						{answers.map((answer) => (
							<DataListItem
								aria-labelledby={`answer-${answer.answerId}-label`}
								id={`answer-${answer.answerId}`}
								key={answer.answerId}
							>
								<DataListItemRow>
									<DataListItemCells
										dataListCells={[
											<DataListCell key="fact" width={3}>
												<span id={`answer-${answer.answerId}-label`}>
													<FactLabel factKey={answer.factKey} />
												</span>
												<ExpandableSection toggleText="Technical details">
													<Content component="small">
														Question revision {answer.questionRevision},
														recorded {answer.answeredAt}
													</Content>
												</ExpandableSection>
											</DataListCell>,
											<DataListCell key="value">
												<strong>
													{typeof answer.value === "boolean"
														? answer.value
															? "Yes"
															: "No"
														: isIsoDate(answer.value)
															? answer.value
															: `₹ ${answer.value}`}
												</strong>
											</DataListCell>,
										]}
									/>
									<DataListAction
										aria-label="Actions"
										aria-labelledby={`answer-${answer.answerId}-label`}
										id={`answer-${answer.answerId}-actions`}
									>
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
									</DataListAction>
								</DataListItemRow>
							</DataListItem>
						))}
					</DataList>
				</Stack>
			)}
		</section>
	);
};
