import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	minExactMoney,
	multiplyByWholePercent,
	parseFactKey,
	parseIssueCode,
	parseRuleId,
	roundToNearestMultipleOf,
	subtractExactMoney,
} from "@openitr/model";
import type {
	AttestedAnswer,
	CompiledNewRegimeTaxConstants,
	CompiledTaxConstants,
	EligibilityAnswerValue,
	ExactMoney,
	FactKey,
	IssueCode,
	RuleId,
	RulePackIdentity,
	SalaryObservation,
	Sha256Digest,
} from "@openitr/model";

const ZERO = exactMoneyFromWholeRupees(0);

export const SALARY_FACT_KEYS = Object.freeze({
	section17_1: parseFactKey("salary.section-17-1"),
	exemptAllowancesSection10: parseFactKey(
		"salary.exempt-allowances-section-10",
	),
	taxableTotal: parseFactKey("salary.taxable-total"),
});

export const SALARY_COMPUTATION_ISSUE_CODES = Object.freeze({
	constantsMissing: parseIssueCode("RULE_NEW_REGIME_CONSTANTS_MISSING"),
	employerDocumentRequired: parseIssueCode(
		"FACT_SALARY_EMPLOYER_DOCUMENT_REQUIRED",
	),
	multipleEmployerDocuments: parseIssueCode(
		"FACT_SALARY_MULTIPLE_EMPLOYER_DOCUMENTS",
	),
	answerRulePackMismatch: parseIssueCode("QUESTION_RULE_PACK_MISMATCH"),
	salaryFieldMissing: parseIssueCode("FACT_SALARY_FIELD_MISSING"),
	salaryFieldDuplicated: parseIssueCode("FACT_SALARY_FIELD_DUPLICATED"),
	salaryTotalMismatch: parseIssueCode("FACT_SALARY_TOTAL_MISMATCH"),
});

const RECOVERY_ACTIONS = Object.freeze({
	constantsMissing:
		"Load a rule-pack revision that pins the new-regime computation constants before requesting this scenario.",
	employerDocumentRequired:
		"Select a supported Form 16 so its reviewed salary observations can feed the analysis.",
	multipleEmployerDocuments:
		"This scenario analyses one employer at a time. Keep one Form 16 selected, or review multi-source analysis when it becomes available.",
	answerRulePackMismatch:
		"Answer the eligibility question again so your answer is pinned to the current rule-pack revision.",
	salaryFieldMissing:
		"Select the official Form 16 download for the assessment year so every Part A salary field appears once.",
	salaryFieldDuplicated:
		"Select the official Form 16 download for the assessment year so each salary field appears exactly once.",
	salaryTotalMismatch:
		"The document's own Part A figures disagree. Re-check the selected pages against the official employer-issued Form 16.",
});

export type AcceptedSalaryDocumentFacts = Readonly<{
	documentId: Sha256Digest;
	observations: readonly SalaryObservation[];
}>;

export type SalaryComputationRulePackInput = Readonly<{
	identity: Pick<RulePackIdentity, "id" | "revision">;
	taxConstants: CompiledTaxConstants | undefined;
}>;

export type NewRegimeSalaryComputationInput = Readonly<{
	rulePack: SalaryComputationRulePackInput;
	residentAnswer: AttestedAnswer;
	salaryDocuments: readonly AcceptedSalaryDocumentFacts[];
}>;

export type SalaryComputationIssue = Readonly<{
	code: IssueCode;
	severity: "blocking";
	affectedFactKeys: readonly FactKey[];
	recoveryAction: string;
}>;

export type ComputationNodeInput =
	| Readonly<{
			kind: "fact";
			factKey: FactKey;
			value: ExactMoney;
	  }>
	| Readonly<{
			kind: "node";
			nodeId: FactKey;
			value: ExactMoney;
	  }>
	| Readonly<{
			kind: "rule-pack-constant";
			name: string;
			wholeRupees: number;
	  }>
	| Readonly<{
			kind: "user-answer";
			questionId: AttestedAnswer["questionId"];
			value: EligibilityAnswerValue;
	  }>;

export type ComputationTraceNode = Readonly<{
	nodeId: FactKey;
	rulePackRevision: string;
	ruleId: RuleId;
	operation: string;
	inputs: readonly ComputationNodeInput[];
	unroundedValue: ExactMoney;
	roundedValue: ExactMoney;
	roundingMode?: "nearest-multiple-up";
	note?: string;
}>;

export type NewRegimeSalarySummary = Readonly<{
	salaryTotal: ExactMoney;
	taxableIncome: ExactMoney;
	incomeTaxBeforeAdjustments: ExactMoney;
	rebateApplied: ExactMoney;
	marginalReliefApplied: ExactMoney;
	surcharge: ExactMoney;
	cess: ExactMoney;
	finalTaxLiability: ExactMoney;
}>;

export type NewRegimeSalaryComputation =
	| Readonly<{
			kind: "computed";
			scenario: "one-employer-new-regime-salary-fy-2025-26";
			rulePackRevision: string;
			nodes: readonly ComputationTraceNode[];
			summary: NewRegimeSalarySummary;
	  }>
	| Readonly<{
			kind: "blocked";
			issues: readonly SalaryComputationIssue[];
	  }>;

const blockingIssue = (
	code: IssueCode,
	recoveryAction: string,
	affectedFactKeys: readonly FactKey[],
): SalaryComputationIssue =>
	Object.freeze({
		code,
		severity: "blocking",
		affectedFactKeys,
		recoveryAction,
	});

const factInput = (
	factKey: FactKey,
	value: ExactMoney,
): ComputationNodeInput => Object.freeze({ kind: "fact", factKey, value });

const nodeInput = (
	nodeId: FactKey,
	value: ExactMoney,
): ComputationNodeInput => Object.freeze({ kind: "node", nodeId, value });

const constantInput = (
	name: string,
	wholeRupees: number,
): ComputationNodeInput => Object.freeze({ kind: "rule-pack-constant", name, wholeRupees });

const wholeRupeeConstant = (
	constants: CompiledNewRegimeTaxConstants,
	pick: (record: CompiledNewRegimeTaxConstants) => number,
	name: string,
): { input: ComputationNodeInput; amount: ExactMoney } => {
	const wholeRupees = pick(constants);
	return {
		input: constantInput(name, wholeRupees),
		amount: exactMoneyFromWholeRupees(wholeRupees),
	};
};

// Progressive tax over the pinned schedule without emitting trace nodes; the
// surcharge marginal-relief comparison needs this for threshold incomes.
const progressiveSlabTaxOn = (
	totalIncome: ExactMoney,
	bands: CompiledNewRegimeTaxConstants["slabBands"],
): ExactMoney => {
	let tax = ZERO;
	let lowerBound = ZERO;
	for (const band of bands) {
		if (compareExactMoney(totalIncome, lowerBound) <= 0) {
			break;
		}
		const upperBound =
			band.upperBoundWholeRupees === null
				? undefined
				: exactMoneyFromWholeRupees(band.upperBoundWholeRupees);
		const bandWidth =
			upperBound === undefined || compareExactMoney(totalIncome, upperBound) < 0
				? subtractExactMoney(totalIncome, lowerBound)
				: subtractExactMoney(upperBound, lowerBound);
		tax = addExactMoney(
			tax,
			multiplyByWholePercent(bandWidth, band.ratePercent),
		);
		if (upperBound === undefined) {
			break;
		}
		lowerBound = upperBound;
	}
	return tax;
};

export const computeNewRegimeSalaryScenario = ({
	rulePack,
	residentAnswer,
	salaryDocuments,
}: NewRegimeSalaryComputationInput): NewRegimeSalaryComputation => {
	const issues: SalaryComputationIssue[] = [];

	const constants = rulePack.taxConstants?.newRegime;
	if (constants === undefined) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.constantsMissing,
				RECOVERY_ACTIONS.constantsMissing,
				[...Object.values(SALARY_FACT_KEYS)],
			),
		);
	}
	if (salaryDocuments.length === 0) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.employerDocumentRequired,
				RECOVERY_ACTIONS.employerDocumentRequired,
				[...Object.values(SALARY_FACT_KEYS)],
			),
		);
	}
	if (salaryDocuments.length > 1) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.multipleEmployerDocuments,
				RECOVERY_ACTIONS.multipleEmployerDocuments,
				[...Object.values(SALARY_FACT_KEYS)],
			),
		);
	}
	if (residentAnswer.rulePackId !== rulePack.identity.id) {
		issues.push(
			blockingIssue(
				SALARY_COMPUTATION_ISSUE_CODES.answerRulePackMismatch,
				RECOVERY_ACTIONS.answerRulePackMismatch,
				[parseFactKey("taxpayer.residential-status")],
			),
		);
	}

	let documentObservations: readonly SalaryObservation[] = [];
	if (salaryDocuments.length === 1) {
		const [document] = salaryDocuments;
		documentObservations = document?.observations ?? [];
		for (const requiredKey of [
			SALARY_FACT_KEYS.section17_1,
			SALARY_FACT_KEYS.exemptAllowancesSection10,
			SALARY_FACT_KEYS.taxableTotal,
		]) {
			const matching = documentObservations.filter(
				(candidate) => candidate.factKey === requiredKey,
			);
			if (matching.length === 0) {
				issues.push(
					blockingIssue(
						SALARY_COMPUTATION_ISSUE_CODES.salaryFieldMissing,
						RECOVERY_ACTIONS.salaryFieldMissing,
						[requiredKey],
					),
				);
			}
			if (matching.length > 1) {
				issues.push(
					blockingIssue(
						SALARY_COMPUTATION_ISSUE_CODES.salaryFieldDuplicated,
						RECOVERY_ACTIONS.salaryFieldDuplicated,
						[requiredKey],
					),
				);
			}
		}
	}

	if (issues.length > 0 || constants === undefined) {
		return Object.freeze({ kind: "blocked", issues: Object.freeze(issues) });
	}

	const revision = rulePack.identity.revision;

	const observationFor = (factKey: FactKey): SalaryObservation => {
		const found = documentObservations.find(
			(candidate) => candidate.factKey === factKey,
		);
		if (found === undefined) {
			throw new Error(`Accepted observation disappeared for ${factKey}`);
		}
		return found;
	};

	const section17_1 = observationFor(SALARY_FACT_KEYS.section17_1);
	const exemptAllowances = observationFor(
		SALARY_FACT_KEYS.exemptAllowancesSection10,
	);
	const printedTaxableTotal = observationFor(SALARY_FACT_KEYS.taxableTotal);

	const section17_1Value = exactMoneyFromWholeRupees(
		section17_1.normalizedValue,
	);
	const exemptAllowancesValue = exactMoneyFromWholeRupees(
		exemptAllowances.normalizedValue,
	);
	const printedTaxableTotalValue = exactMoneyFromWholeRupees(
		printedTaxableTotal.normalizedValue,
	);

	const expectedTaxableTotal = subtractExactMoney(
		section17_1Value,
		exemptAllowancesValue,
	);
	if (
		compareExactMoney(expectedTaxableTotal, printedTaxableTotalValue) !== 0
	) {
		return Object.freeze({
			kind: "blocked",
			issues: Object.freeze([
				blockingIssue(
					SALARY_COMPUTATION_ISSUE_CODES.salaryTotalMismatch,
					RECOVERY_ACTIONS.salaryTotalMismatch,
					[
						SALARY_FACT_KEYS.section17_1,
						SALARY_FACT_KEYS.exemptAllowancesSection10,
						SALARY_FACT_KEYS.taxableTotal,
					],
				),
			]),
		});
	}

	const standardDeduction = wholeRupeeConstant(
		constants,
		(record) => record.standardDeductionWholeRupees,
		"standard-deduction-section-16ia",
	);
	const roundingBase = wholeRupeeConstant(
		constants,
		(record) => record.totalIncomeRoundingBaseWholeRupees,
		"total-income-rounding-base",
	);
	const taxRoundingBase = wholeRupeeConstant(
		constants,
		(record) => record.taxRoundingBaseWholeRupees,
		"tax-rounding-base",
	);
	const rebateLimitIncome = wholeRupeeConstant(
		constants,
		(record) => record.rebateMaxTotalIncomeWholeRupees,
		"rebate-max-total-income",
	);
	const rebateLimitAmount = wholeRupeeConstant(
		constants,
		(record) => record.rebateMaxAmountWholeRupees,
		"rebate-max-amount",
	);

	type NodeDraft = Omit<ComputationTraceNode, "rulePackRevision">;
	const draftNode = (draft: NodeDraft): NodeDraft => draft;
	const finalizeNodes = (drafts: readonly NodeDraft[]): ComputationTraceNode[] =>
		drafts.map((draft) =>
			Object.freeze({ ...draft, rulePackRevision: revision }),
		);

	const nodes: NodeDraft[] = [];

	const salaryTotalNode = draftNode({
		nodeId: parseFactKey("derived.salary-total"),
		ruleId: parseRuleId("ITR1-SALARY-INCOME-SECTION-15"),
		operation: "sum-of-accepted-observations",
		inputs: [factInput(SALARY_FACT_KEYS.section17_1, section17_1Value)],
		unroundedValue: section17_1Value,
		roundedValue: section17_1Value,
	});
	nodes.push(salaryTotalNode);

	const afterExemptionsValue = subtractExactMoney(
		section17_1Value,
		exemptAllowancesValue,
	);
	const afterExemptionsNode = draftNode({
		nodeId: parseFactKey("derived.salary-after-section-10-exemptions"),
		ruleId: parseRuleId("ITR1-SALARY-EXEMPT-ALLOWANCES-SECTION-10"),
		operation: "subtract-exempt-allowances",
		inputs: [
			nodeInput(salaryTotalNode.nodeId, section17_1Value),
			factInput(
				SALARY_FACT_KEYS.exemptAllowancesSection10,
				exemptAllowancesValue,
			),
		],
		unroundedValue: afterExemptionsValue,
		roundedValue: afterExemptionsValue,
	});
	nodes.push(afterExemptionsNode);

	const deductionApplied = minExactMoney(
		standardDeduction.amount,
		afterExemptionsValue,
	);
	const afterStandardDeductionValue = subtractExactMoney(
		afterExemptionsValue,
		deductionApplied,
	);
	const afterDeductionNode = draftNode({
		nodeId: parseFactKey("derived.salary-standard-deduction-adjusted"),
		ruleId: constants.standardDeductionRuleId,
		operation: "subtract-limited-to-zero",
		inputs: [
			nodeInput(afterExemptionsNode.nodeId, afterExemptionsValue),
			standardDeduction.input,
		],
		unroundedValue: afterStandardDeductionValue,
		roundedValue: afterStandardDeductionValue,
	});
	nodes.push(afterDeductionNode);

	const roundedIncomeValue = roundToNearestMultipleOf(
		afterStandardDeductionValue,
		roundingBase.amount,
	);
	const roundedIncomeNode = draftNode({
		nodeId: parseFactKey("derived.total-income-rounded-section-288a"),
		ruleId: constants.totalIncomeRoundingRuleId,
		operation: "round-to-nearest-multiple",
		roundingMode: "nearest-multiple-up",
		inputs: [
			nodeInput(afterDeductionNode.nodeId, afterStandardDeductionValue),
			roundingBase.input,
		],
		unroundedValue: afterStandardDeductionValue,
		roundedValue: roundedIncomeValue,
	});
	nodes.push(roundedIncomeNode);

	let lowerBound = ZERO;
	let bandIndex = 1;
	const bandValues: { nodeId: FactKey; value: ExactMoney }[] = [];
	for (const band of constants.slabBands) {
		if (compareExactMoney(roundedIncomeValue, lowerBound) <= 0) {
			break;
		}
		const upperBoundWholeRupees = band.upperBoundWholeRupees;
		const upperBound =
			upperBoundWholeRupees === null
				? undefined
				: exactMoneyFromWholeRupees(upperBoundWholeRupees);
		const bandWidth =
			upperBound === undefined ||
			compareExactMoney(roundedIncomeValue, upperBound) < 0
				? subtractExactMoney(roundedIncomeValue, lowerBound)
				: subtractExactMoney(upperBound, lowerBound);
		const bandTax = multiplyByWholePercent(bandWidth, band.ratePercent);
		const bandNodeId = parseFactKey(`derived.slab-band-tax-${bandIndex}`);
		nodes.push(
			draftNode({
				nodeId: bandNodeId,
				ruleId: constants.slabRuleId,
				operation: "progressive-band-tax",
				inputs: [
					nodeInput(roundedIncomeNode.nodeId, roundedIncomeValue),
					...(upperBoundWholeRupees === null
						? []
						: [
								constantInput(
									"band-upper-bound",
									upperBoundWholeRupees,
								),
							]),
					constantInput("band-rate-percent", band.ratePercent),
				],
				unroundedValue: bandTax,
				roundedValue: bandTax,
			}),
		);
		bandValues.push({ nodeId: bandNodeId, value: bandTax });
		if (upperBound === undefined) {
			break;
		}
		lowerBound = upperBound;
		bandIndex += 1;
	}

	const slabTaxValue = bandValues.reduce<ExactMoney>(
		(total, band) => addExactMoney(total, band.value),
		ZERO,
	);
	const slabTaxNode = draftNode({
		nodeId: parseFactKey("derived.income-tax-before-adjustments"),
		ruleId: constants.slabRuleId,
		operation: "sum-of-bands",
		inputs:
			bandValues.length === 0
				? [nodeInput(roundedIncomeNode.nodeId, roundedIncomeValue)]
				: bandValues.map((band) => nodeInput(band.nodeId, band.value)),
		unroundedValue: slabTaxValue,
		roundedValue: slabTaxValue,
	});
	nodes.push(slabTaxNode);

	const isResident = residentAnswer.value === "yes";
	const residencyInput: ComputationNodeInput = Object.freeze({
		kind: "user-answer",
		questionId: residentAnswer.questionId,
		value: residentAnswer.value,
	});
	const incomeWithinRebateLimit =
		compareExactMoney(roundedIncomeValue, rebateLimitIncome.amount) <= 0;

	const rebateValue =
		isResident && incomeWithinRebateLimit
			? minExactMoney(slabTaxValue, rebateLimitAmount.amount)
			: ZERO;
	const rebateNote = !isResident
		? "Not applied: section 87A restricts this rebate to resident individuals, and the recorded eligibility answer says otherwise."
		: incomeWithinRebateLimit
			? undefined
			: "Not applied: total income exceeds the rebate limit pinned by the rule pack.";
	const rebateNode = draftNode({
		nodeId: parseFactKey("derived.rebate-section-87a"),
		ruleId: constants.rebateRuleId,
		operation: "rebate-minimum",
		inputs: [
			nodeInput(slabTaxNode.nodeId, slabTaxValue),
			rebateLimitIncome.input,
			rebateLimitAmount.input,
			residencyInput,
		],
		unroundedValue: rebateValue,
		roundedValue: rebateValue,
		...(rebateNote === undefined ? {} : { note: rebateNote }),
	});
	nodes.push(rebateNode);

	const exceedsRebateLimit = compareExactMoney(
		roundedIncomeValue,
		rebateLimitIncome.amount,
	) > 0;
	const excessOverRebateLimit = exceedsRebateLimit
		? subtractExactMoney(roundedIncomeValue, rebateLimitIncome.amount)
		: ZERO;
	const reliefCandidate =
		compareExactMoney(slabTaxValue, excessOverRebateLimit) > 0
			? subtractExactMoney(slabTaxValue, excessOverRebateLimit)
			: ZERO;
	const marginalReliefValue =
		isResident && exceedsRebateLimit ? reliefCandidate : ZERO;
	const reliefNote = !isResident
		? "Not applied: the rebate's marginal relief inherits section 87A's residence requirement."
		: exceedsRebateLimit
			? undefined
			: "Not applied: total income is within the rebate limit, so no marginal comparison arises.";
	const marginalReliefNode = draftNode({
		nodeId: parseFactKey("derived.marginal-relief-section-87a"),
		ruleId: constants.rebateMarginalReliefRuleId,
		operation: "marginal-relief-cap",
		inputs: [
			nodeInput(slabTaxNode.nodeId, slabTaxValue),
			nodeInput(rebateNode.nodeId, rebateValue),
			nodeInput(roundedIncomeNode.nodeId, roundedIncomeValue),
			rebateLimitIncome.input,
			residencyInput,
		],
		unroundedValue: marginalReliefValue,
		roundedValue: marginalReliefValue,
		...(reliefNote === undefined ? {} : { note: reliefNote }),
	});
	nodes.push(marginalReliefNode);

	const taxAfterAdjustmentsValue = subtractExactMoney(
		subtractExactMoney(slabTaxValue, rebateValue),
		marginalReliefValue,
	);

	const activeTierIndex = constants.surchargeTiers.reduce<number>(
		(active, tier, index) =>
			compareExactMoney(
				roundedIncomeValue,
				exactMoneyFromWholeRupees(tier.exceedsTotalIncomeWholeRupees),
			) > 0
				? index
				: active,
		-1,
	);
	const activeTier =
		activeTierIndex === -1 ? undefined : constants.surchargeTiers[activeTierIndex];
	let surchargeValue = ZERO;
	let surchargeNote: string | undefined =
		"Total income does not exceed the lowest surcharge threshold pinned by the rule pack.";
	if (activeTier !== undefined) {
		const previousThreshold =
			activeTierIndex === 0
				? undefined
				: constants.surchargeTiers[activeTierIndex - 1];
		const thresholdAmount = exactMoneyFromWholeRupees(
			activeTier.exceedsTotalIncomeWholeRupees,
		);
		const taxAtThreshold = progressiveSlabTaxOn(
			thresholdAmount,
			constants.slabBands,
		);
		const surchargeAtPreviousTier =
			previousThreshold === undefined
				? ZERO
				: multiplyByWholePercent(
						taxAtThreshold,
						previousThreshold.ratePercent,
					);
		const rawSurcharge = multiplyByWholePercent(
			taxAfterAdjustmentsValue,
			activeTier.ratePercent,
		);
		const liabilityLimit = addExactMoney(
			addExactMoney(
				subtractExactMoney(roundedIncomeValue, thresholdAmount),
				taxAtThreshold,
			),
			surchargeAtPreviousTier,
		);
		const liabilityWithRaw = addExactMoney(
			taxAfterAdjustmentsValue,
			rawSurcharge,
		);
		surchargeValue =
			compareExactMoney(liabilityWithRaw, liabilityLimit) > 0
				? subtractExactMoney(liabilityLimit, taxAfterAdjustmentsValue)
				: rawSurcharge;
		surchargeNote = undefined;
	}
	const surchargeNode = draftNode({
		nodeId: parseFactKey("derived.surcharge"),
		ruleId: constants.surchargeRuleId,
		operation: activeTier === undefined ? "not-applicable" : "percent-with-threshold-relief",
		inputs: [
			nodeInput(roundedIncomeNode.nodeId, roundedIncomeValue),
			nodeInput(slabTaxNode.nodeId, slabTaxValue),
			nodeInput(rebateNode.nodeId, rebateValue),
			nodeInput(marginalReliefNode.nodeId, marginalReliefValue),
			...(activeTier === undefined
				? []
				: [
						constantInput(
							"surcharge-tier-threshold",
							activeTier.exceedsTotalIncomeWholeRupees,
						),
						constantInput("surcharge-tier-rate-percent", activeTier.ratePercent),
					]),
		],
		unroundedValue: surchargeValue,
		roundedValue: surchargeValue,
		...(surchargeNote === undefined ? {} : { note: surchargeNote }),
	});
	nodes.push(surchargeNode);

	const cessBase = addExactMoney(taxAfterAdjustmentsValue, surchargeValue);
	const cessValue = multiplyByWholePercent(
		cessBase,
		constants.cessRatePercent,
	);
	const cessNode = draftNode({
		nodeId: parseFactKey("derived.health-and-education-cess"),
		ruleId: constants.cessRuleId,
		operation: "percent-of",
		inputs: [
			nodeInput(slabTaxNode.nodeId, slabTaxValue),
			nodeInput(rebateNode.nodeId, rebateValue),
			nodeInput(marginalReliefNode.nodeId, marginalReliefValue),
			nodeInput(surchargeNode.nodeId, surchargeValue),
			constantInput("cess-rate-percent", constants.cessRatePercent),
		],
		unroundedValue: cessValue,
		roundedValue: cessValue,
	});
	nodes.push(cessNode);

	const liabilityBeforeRounding = addExactMoney(cessBase, cessValue);
	const finalLiabilityValue = roundToNearestMultipleOf(
		liabilityBeforeRounding,
		taxRoundingBase.amount,
	);
	const liabilityNode = draftNode({
		nodeId: parseFactKey("derived.total-tax-liability-rounded-section-288b"),
		ruleId: constants.taxRoundingRuleId,
		operation: "round-to-nearest-multiple",
		roundingMode: "nearest-multiple-up",
		inputs: [
			nodeInput(cessNode.nodeId, cessValue),
			taxRoundingBase.input,
		],
		unroundedValue: liabilityBeforeRounding,
		roundedValue: finalLiabilityValue,
	});
	nodes.push(liabilityNode);

	return Object.freeze({
		kind: "computed",
		scenario: "one-employer-new-regime-salary-fy-2025-26",
		rulePackRevision: revision,
		nodes: finalizeNodes(nodes),
		summary: Object.freeze({
			salaryTotal: section17_1Value,
			taxableIncome: roundedIncomeValue,
			incomeTaxBeforeAdjustments: slabTaxValue,
			rebateApplied: rebateValue,
			marginalReliefApplied: marginalReliefValue,
			surcharge: surchargeValue,
			cess: cessValue,
			finalTaxLiability: finalLiabilityValue,
		}),
	});
};
