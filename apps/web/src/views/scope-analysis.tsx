import type {
	AnalysisScopeEvaluation,
	ScopeFact,
	ScopeQuestion,
} from "@openitr/model";
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
	EmptyState,
	EmptyStateBody,
	ExpandableSection,
	Flex,
	FlexItem,
	Form,
	Label,
	type LabelProps,
	Progress,
	Stack,
	Title,
} from "@patternfly/react-core";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import type { SessionOrchestrator } from "../session/session-orchestrator";
import { FactLabel } from "./plain-language";
import {
	AmountInput,
	type QuestionChoice,
	QuestionChoiceList,
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

type ScopeQuestionFieldsProps = Readonly<{
	question: ScopeQuestion;
	session: SessionOrchestrator;
	initialFact?: ScopeFact;
	isCurrent: boolean;
	onAnswerLater?: () => void;
	onCancel?: (() => void) | undefined;
	onSaved?: () => void;
}>;

const errorMessageOf = (caught: unknown): string => {
	const message = caught instanceof Error ? caught.message : "";
	if (message.includes("Invalid exact money")) {
		return "Enter a valid non-negative amount.";
	}
	return message || "This answer could not be recorded.";
};

const ScopeQuestionFields = ({
	question,
	session,
	initialFact,
	isCurrent,
	onAnswerLater,
	onCancel,
	onSaved,
}: ScopeQuestionFieldsProps) => {
	const [value, setValue] = useState(() => inputValueOf(initialFact));
	const [error, setError] = useState<string>();
	const inputId = `${question.id}-answer`;
	const promptId = `${question.id}-prompt`;
	const helpId = `${question.id}-help`;
	const errorId = `${question.id}-error`;
	const describedBy = error === undefined ? helpId : `${helpId} ${errorId}`;
	const choices = choicesFor(question);
	const submit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (value.trim() === "") return;
		setError(undefined);
		try {
			session.send({
				kind: "answer-analysis-scope-question",
				questionId: question.id,
				value: value.trim(),
				executionContext: { answerTime: new Date().toISOString() },
			});
			onSaved?.();
		} catch (caught: unknown) {
			setError(errorMessageOf(caught));
		}
	};

	return (
		<Form className="openitr-measure" onSubmit={submit}>
			<Stack>
				<Title headingLevel={isCurrent ? "h2" : "h3"} id={promptId} size="lg">
					{question.prompt}
				</Title>
				<Content component="p" id={helpId}>
					{question.helpText}
				</Content>
			</Stack>
			{initialFact === undefined ? null : (
				<ScopeFactStatus fact={initialFact} />
			)}
			{choices === undefined ? (
				<AmountInput
					describedBy={describedBy}
					error={error}
					errorId={errorId}
					id={inputId}
					inputMode={
						question.answerSchema.kind === "exact-money" ? "decimal" : "numeric"
					}
					labelledBy={promptId}
					onValueChange={setValue}
					placeholder="0"
					showRupee={question.answerSchema.kind === "exact-money"}
					value={value}
				/>
			) : (
				<QuestionChoiceList
					describedBy={describedBy}
					hasError={error !== undefined}
					labelledBy={promptId}
					name={inputId}
					onValueChange={setValue}
					options={choices}
					value={value}
				/>
			)}
			<ActionGroup>
				<Button
					isDisabled={value.trim() === ""}
					type="submit"
					variant={isCurrent ? "primary" : "secondary"}
				>
					{isCurrent ? "Save and continue" : "Save answer"}
				</Button>
				{onAnswerLater === undefined ? null : (
					<Button onClick={onAnswerLater} type="button" variant="link">
						Answer later
					</Button>
				)}
				{onCancel === undefined ? null : (
					<Button onClick={onCancel} type="button" variant="link">
						Cancel
					</Button>
				)}
			</ActionGroup>
		</Form>
	);
};

const RecordedScopeAnswer = ({
	fact,
	question,
	session,
}: Readonly<{
	fact: ScopeFact;
	question: ScopeQuestion;
	session: SessionOrchestrator;
}>) => {
	const [isEditing, setEditing] = useState(fact.state !== "known");
	const itemId = `scope-question-${String(question.id)}`;
	if (isEditing || fact.state !== "known") {
		return (
			<DataListItem
				aria-labelledby={`${question.id}-prompt`}
				data-scope-question={question.id}
				id={itemId}
			>
				<DataListItemRow>
					<DataListItemCells
						dataListCells={[
							<DataListCell key="form">
								<ScopeQuestionFields
									initialFact={fact}
									isCurrent={false}
									onCancel={
										fact.state === "known" ? () => setEditing(false) : undefined
									}
									onSaved={() => setEditing(false)}
									question={question}
									session={session}
								/>
							</DataListCell>,
						]}
					/>
				</DataListItemRow>
			</DataListItem>
		);
	}
	return (
		<DataListItem
			aria-labelledby={`${itemId}-question`}
			data-scope-question={question.id}
			id={itemId}
		>
			<DataListItemRow>
				<DataListItemCells
					dataListCells={[
						<DataListCell key="question" width={3}>
							<span id={`${itemId}-question`}>{question.prompt}</span>
							<ExpandableSection toggleText="Technical details">
								<Content component="small">
									Fact state: {fact.state} · Pinned revision{" "}
									{fact.origin.kind === "attested-answer"
										? fact.origin.questionRevision
										: fact.origin.kind === "derived"
											? fact.origin.rulePackId
											: "source-backed"}
									. Provenance: {factProvenance(fact)}
								</Content>
							</ExpandableSection>
						</DataListCell>,
						<DataListCell key="answer">
							<Content component="small">
								{fact.origin.kind === "attested-answer"
									? "Recorded answer"
									: "From your documents"}
							</Content>
							<strong>{displayFactValue(fact)}</strong>
						</DataListCell>,
					]}
				/>
				<DataListAction
					aria-label="Actions"
					aria-labelledby={`${itemId}-question`}
					id={`${itemId}-actions`}
				>
					<Button onClick={() => setEditing(true)} variant="link">
						Change answer
					</Button>
				</DataListAction>
			</DataListItemRow>
		</DataListItem>
	);
};

const ScopeFactStatus = ({ fact }: Readonly<{ fact: ScopeFact }>) => {
	if (fact.state !== "blocked" && fact.state !== "unsupported") return null;
	return (
		<Alert isInline isPlain title={fact.reason} variant="warning">
			{fact.state === "blocked" && fact.conflictingFacts !== undefined ? (
				<ExpandableSection toggleText="Technical details">
					{factProvenance(fact)}
				</ExpandableSection>
			) : null}
		</Alert>
	);
};

const ScopeProgress = ({
	answered,
	remaining,
}: Readonly<{ answered: number; remaining: number }>) => {
	const total = answered + remaining;
	return (
		<Flex
			alignItems={{ default: "alignItemsCenter" }}
			className="openitr-measure"
			flexWrap={{ default: "nowrap" }}
		>
			<FlexItem flex={{ default: "flex_1" }}>
				<Progress
					aria-label="Scope questions answered"
					max={Math.max(total, 1)}
					measureLocation="none"
					size="sm"
					value={answered}
					valueText={`${answered} of ${total} answered`}
				/>
			</FlexItem>
			<Content component="small">
				{answered} answered · {remaining} left
			</Content>
		</Flex>
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

const decisionLabelStatus: Readonly<
	Record<
		AnalysisScopeEvaluation["decisions"][number]["kind"],
		NonNullable<LabelProps["status"]>
	>
> = {
	blocked: "danger",
	supported: "success",
	unknown: "warning",
	unsupported: "danger",
};

const ScopeDecisionRow = ({
	decision,
}: Readonly<{ decision: AnalysisScopeEvaluation["decisions"][number] }>) => {
	const itemId = `scope-decision-${decision.id}`;
	return (
		<DataListItem
			aria-labelledby={`${itemId}-fact`}
			data-kind={decision.kind}
			id={itemId}
		>
			<DataListItemRow>
				<DataListItemCells
					dataListCells={[
						<DataListCell isFilled={false} key="status">
							<Label isCompact status={decisionLabelStatus[decision.kind]}>
								{decisionLabel(decision.kind)}
							</Label>
						</DataListCell>,
						<DataListCell key="detail">
							<Stack hasGutter>
								<strong id={`${itemId}-fact`}>
									<FactLabel factKey={decision.factKey} />
								</strong>
								<span>{decision.explanation}</span>
								{decision.recoveryAction === undefined ? null : (
									<span>
										<strong>Next action:</strong> {decision.recoveryAction}
									</span>
								)}
								<a
									href={decision.rule.sourceUrl}
									rel="noreferrer"
									target="_blank"
								>
									{decision.rule.citation}
								</a>
								<ExpandableSection toggleText="Technical details">
									<Content component="small">
										State <code>{decision.fact.state}</code> · Value{" "}
										<code>{displayFactValue(decision.fact)}</code> · Rule{" "}
										<code>{String(decision.rule.id)}</code> · Pinned revision{" "}
										<code>{decision.rulePackIdentity.revision}</code>.
										Provenance: {factProvenance(decision.fact)} · Location:{" "}
										{decision.rule.sourceLocation}
									</Content>
								</ExpandableSection>
							</Stack>
						</DataListCell>,
					]}
				/>
			</DataListItemRow>
		</DataListItem>
	);
};

const EvidenceChecklistRow = ({
	item,
}: Readonly<{ item: AnalysisScopeEvaluation["checklist"][number] }>) => (
	<DataListItem
		aria-labelledby={`evidence-${item.id}-label`}
		data-status={item.status}
	>
		<DataListItemRow>
			<DataListItemCells
				dataListCells={[
					<DataListCell isFilled={false} key="status">
						<Label
							isCompact
							status={item.status === "satisfied" ? "success" : "warning"}
						>
							{item.status === "satisfied" ? "Supplied" : "Needed"}
						</Label>
					</DataListCell>,
					<DataListCell key="detail">
						<Stack>
							<strong id={`evidence-${item.id}-label`}>{item.label}</strong>
							<span>{item.detail}</span>
						</Stack>
					</DataListCell>,
				]}
			/>
		</DataListItemRow>
	</DataListItem>
);

type ScopeAnalysisSection = "questions" | "decisions" | "evidence";

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
	switch (section) {
		case "questions":
			return (
				<ScopeQuestionsSection
					deferredQuestionIds={deferredQuestionIds}
					evaluation={evaluation}
					onDeferQuestion={onDeferQuestion}
					session={session}
				/>
			);
		case "decisions":
			return <ScopeDecisionsSection evaluation={evaluation} />;
		case "evidence":
			return <ScopeEvidenceSection evaluation={evaluation} />;
		default: {
			const _exhaustive: never = section;
			return _exhaustive;
		}
	}
};

const ScopeQuestionsSection = ({
	deferredQuestionIds,
	evaluation,
	onDeferQuestion,
	session,
}: Readonly<{
	deferredQuestionIds: readonly ScopeQuestion["id"][];
	evaluation: AnalysisScopeEvaluation;
	onDeferQuestion: ((questionId: ScopeQuestion["id"]) => void) | undefined;
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
	const answeredCount = evaluation.answeredQuestions.length;
	const currentQuestionId = currentQuestion?.id;

	// Each new question starts at the top of the page, not where the last
	// "Save and continue" click left the scroll position.
	useEffect(() => {
		if (currentQuestionId === undefined) return;
		document.getElementById("openitr-main")?.scrollTo({ top: 0 });
	}, [currentQuestionId]);

	return (
		<section aria-label="Current scope question">
			<Stack hasGutter>
				{currentQuestion === undefined ? (
					<EmptyState
						headingLevel="h2"
						titleText="Every scope question is answered"
						variant="sm"
					>
						<EmptyStateBody>
							Open the Decision tab to see how your answers place this analysis.
						</EmptyStateBody>
					</EmptyState>
				) : (
					<div
						data-current-scope-question={currentQuestion.id}
						data-scope-question={currentQuestion.id}
						id={`scope-question-${String(currentQuestion.id)}`}
					>
						<Stack hasGutter>
							<ScopeProgress
								answered={answeredCount}
								remaining={evaluation.questions.length}
							/>
							<ScopeQuestionFields
								{...(currentUnresolvedFact === undefined
									? {}
									: { initialFact: currentUnresolvedFact })}
								isCurrent
								key={currentQuestion.id}
								{...(evaluation.questions.length > 1 &&
								onDeferQuestion !== undefined
									? {
											onAnswerLater: () => onDeferQuestion(currentQuestion.id),
										}
									: {})}
								question={currentQuestion}
								session={session}
							/>
						</Stack>
					</div>
				)}
				{answeredCount === 0 ? null : (
					<ExpandableSection
						toggleText={`Your answers so far (${answeredCount})`}
					>
						<DataList aria-label="Recorded scope answers" isCompact>
							{evaluation.answeredQuestions.map(({ question, fact }) => (
								<RecordedScopeAnswer
									fact={fact}
									key={question.id}
									question={question}
									session={session}
								/>
							))}
						</DataList>
					</ExpandableSection>
				)}
			</Stack>
		</section>
	);
};

const scopeSummaryTitle = (kind: AnalysisScopeEvaluation["kind"]): string => {
	switch (kind) {
		case "supported":
			return "The approved scope facts are supported";
		case "unknown":
			return "More scope facts are needed";
		case "blocked":
			return "The scope check is blocked";
		default:
			return "At least one scope fact is outside this analysis";
	}
};

const ScopeDecisionsSection = ({
	evaluation,
}: Readonly<{ evaluation: AnalysisScopeEvaluation }>) => (
	<section aria-labelledby="scope-decisions-heading">
		<Stack hasGutter>
			<Alert
				aria-live="polite"
				isInline
				title={scopeSummaryTitle(evaluation.kind)}
				variant={evaluation.kind === "supported" ? "success" : "warning"}
			>
				Scope support does not mean that calculations, evidence review, filing
				eligibility, or portal acceptance is complete.
			</Alert>
			<Title headingLevel="h2" id="scope-decisions-heading" size="lg">
				Scope decisions
			</Title>
			<DataList aria-label="Scope decisions">
				{evaluation.decisions.map((decision) => (
					<ScopeDecisionRow decision={decision} key={decision.id} />
				))}
			</DataList>
		</Stack>
	</section>
);

const ScopeEvidenceSection = ({
	evaluation,
}: Readonly<{ evaluation: AnalysisScopeEvaluation }>) => {
	const neededItems = evaluation.checklist.filter(
		(item) => item.status !== "not-needed",
	);
	return (
		<Stack hasGutter>
			<section aria-labelledby="scope-checklist-heading">
				<Stack hasGutter>
					<Title headingLevel="h2" id="scope-checklist-heading" size="lg">
						Evidence checklist
					</Title>
					{neededItems.length === 0 ? (
						<Content component="p">
							No additional evidence is requested by the currently known
							composition.
						</Content>
					) : (
						<DataList aria-label="Evidence checklist">
							{neededItems.map((item) => (
								<EvidenceChecklistRow item={item} key={item.id} />
							))}
						</DataList>
					)}
				</Stack>
			</section>
			{evaluation.calculationLimitations.length === 0 ? null : (
				<section aria-labelledby="scope-calculation-limits-heading">
					<Title
						headingLevel="h2"
						id="scope-calculation-limits-heading"
						size="lg"
					>
						Current calculation limits
					</Title>
					<Content component="ul">
						{evaluation.calculationLimitations.map((limitation) => (
							<Content component="li" key={limitation.factKey}>
								{limitation.explanation}
							</Content>
						))}
					</Content>
				</section>
			)}
			<Alert
				isInline
				isPlain
				title={evaluation.educationalLimitations.join(" ")}
				variant="info"
			/>
		</Stack>
	);
};
