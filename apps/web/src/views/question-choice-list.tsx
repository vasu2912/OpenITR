export type QuestionChoice = Readonly<{
	label: string;
	value: string;
}>;

export const yesNoQuestionChoices: readonly QuestionChoice[] = Object.freeze([
	{ label: "Yes", value: "yes" },
	{ label: "No", value: "no" },
]);

export const QuestionChoiceList = ({
	describedBy,
	hasError,
	legend,
	name,
	onValueChange,
	options,
	value,
}: Readonly<{
	describedBy: string;
	hasError: boolean;
	legend: string;
	name: string;
	onValueChange: (value: string) => void;
	options: readonly QuestionChoice[];
	value: string;
}>) => (
	<fieldset
		aria-describedby={describedBy}
		aria-invalid={hasError}
		className="openitr-question-choice-fieldset"
	>
		<legend>{legend}</legend>
		<div className="openitr-question-choice-list">
			{options.map((option) => {
				const optionId = `${name}-${option.value}`;
				return (
					<label className="openitr-question-choice" htmlFor={optionId} key={option.value}>
						<input
							checked={value === option.value}
							id={optionId}
							name={name}
							onChange={() => onValueChange(option.value)}
							type="radio"
							value={option.value}
						/>
						<span>{option.label}</span>
					</label>
				);
			})}
		</div>
	</fieldset>
);
