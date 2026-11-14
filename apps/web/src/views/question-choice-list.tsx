import {
	Card,
	CardHeader,
	CardTitle,
	FormHelperText,
	Gallery,
	HelperText,
	HelperTextItem,
	InputGroup,
	InputGroupItem,
	InputGroupText,
	TextInput,
} from "@patternfly/react-core";

export type QuestionChoice = Readonly<{
	label: string;
	value: string;
}>;

export const yesNoQuestionChoices: readonly QuestionChoice[] = Object.freeze([
	{ label: "Yes", value: "yes" },
	{ label: "No", value: "no" },
]);

// Answers render as PatternFly single-select cards: the whole card is the
// click target and the selected card carries PatternFly's selected state.
export const QuestionChoiceList = ({
	describedBy,
	hasError,
	labelledBy,
	name,
	onValueChange,
	options,
	value,
}: Readonly<{
	describedBy: string;
	hasError: boolean;
	labelledBy: string;
	name: string;
	onValueChange: (value: string) => void;
	options: readonly QuestionChoice[];
	value: string;
}>) => (
	<div
		aria-describedby={describedBy}
		aria-invalid={hasError}
		aria-labelledby={labelledBy}
		className="openitr-measure"
		role="radiogroup"
	>
		<Gallery hasGutter minWidths={{ default: "10rem" }}>
			{options.map((option) => {
				const optionId = `${name}-${option.value}`;
				const isChecked = value === option.value;
				return (
					<Card
						id={`${optionId}-card`}
						isCompact
						isSelectable
						isSelected={isChecked}
						key={option.value}
					>
						<CardHeader
							selectableActions={{
								hasNoOffset: true,
								isChecked,
								name,
								onChange: () => onValueChange(option.value),
								selectableActionAriaLabelledby: `${optionId}-label`,
								selectableActionId: optionId,
								variant: "single",
							}}
						>
							<CardTitle id={`${optionId}-label`}>{option.label}</CardTitle>
						</CardHeader>
					</Card>
				);
			})}
		</Gallery>
	</div>
);

export const AmountInput = ({
	describedBy,
	error,
	errorId,
	id,
	inputMode = "decimal",
	labelledBy,
	onValueChange,
	placeholder,
	showRupee,
	type = "text",
	value,
}: Readonly<{
	describedBy: string;
	error: string | undefined;
	errorId: string;
	id: string;
	inputMode?: "decimal" | "numeric";
	labelledBy: string;
	onValueChange: (value: string) => void;
	placeholder?: string | undefined;
	showRupee: boolean;
	type?: "text" | "date";
	value: string;
}>) => (
	<div className="openitr-field">
		<InputGroup>
			{showRupee ? <InputGroupText>₹</InputGroupText> : null}
			<InputGroupItem isFill>
				<TextInput
					aria-describedby={describedBy}
					aria-labelledby={labelledBy}
					autoComplete="off"
					id={id}
					inputMode={type === "date" ? undefined : inputMode}
					onChange={(_event, next) => onValueChange(next)}
					{...(placeholder === undefined ? {} : { placeholder })}
					type={type}
					validated={error === undefined ? "default" : "error"}
					value={value}
				/>
			</InputGroupItem>
		</InputGroup>
		{error === undefined ? null : (
			<FormHelperText>
				<HelperText isLiveRegion>
					<HelperTextItem id={errorId} variant="error">
						{error}
					</HelperTextItem>
				</HelperText>
			</FormHelperText>
		)}
	</div>
);
