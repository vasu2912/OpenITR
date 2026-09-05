import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	minExactMoney,
	multiplyByWholePercent,
	parseFactKey,
	parseIssueCode,
} from "@openitr/model";
import type {
	ExactMoney,
	FactKey,
	IssueCode,
	RuleId,
	ScopeRulePack,
} from "@openitr/model";

const FACT_KEYS = Object.freeze({
	present: parseFactKey("deductions.savings-pension-present"),
	section80c: parseFactKey("deductions.80c"),
	section80ccc: parseFactKey("deductions.80ccc"),
	section80ccd1: parseFactKey("deductions.80ccd1"),
	section80ccd1Employed: parseFactKey("deductions.80ccd1-employed"),
	section80ccd1SalaryBase: parseFactKey("deductions.80ccd1-salary-base"),
	section80ccd1GtiBase: parseFactKey("deductions.80ccd1-gti-base"),
	section80ccd1b: parseFactKey("deductions.80ccd1b"),
	section80ccd2Government: parseFactKey("deductions.80ccd2-government"),
	section80ccd2GovernmentSalaryBase: parseFactKey(
		"deductions.80ccd2-government-salary-base",
	),
	section80ccd2Other: parseFactKey("deductions.80ccd2-other"),
	section80ccd2OtherSalaryBase: parseFactKey(
		"deductions.80ccd2-other-salary-base",
	),
	proofAvailable: parseFactKey("deductions.savings-pension-proof-available"),
});

export const SAVINGS_PENSION_DEDUCTION_FACT_KEYS = FACT_KEYS;

export type SavingsPensionDeductionOrigin =
	| Readonly<{ kind: "attested-answer"; answerId: string }>
	| Readonly<{
			kind: "accepted-evidence";
			sourceDocumentIds: readonly string[];
	  }>;

export type SavingsPensionDeductionFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney | boolean;
	origin: SavingsPensionDeductionOrigin;
}>;

export type SavingsPensionDeductionCategory =
	| "80C"
	| "80CCC"
	| "80CCD(1)"
	| "80CCD(1B)"
	| "80CCD(2)-GOVERNMENT-EMPLOYER"
	| "80CCD(2)-OTHER-EMPLOYER";

export type SavingsPensionDeductionClaim = Readonly<{
	category: SavingsPensionDeductionCategory;
	claimedAmount: ExactMoney;
	applicablePerson:
		| "taxpayer"
		| "taxpayer-or-eligible-family"
		| "government-employer-for-taxpayer"
		| "other-employer-for-taxpayer";
	origin: SavingsPensionDeductionOrigin;
}>;

export type SavingsPensionDeductionIssue = Readonly<{
	code: IssueCode;
	severity: "blocking" | "warning";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type SavingsPensionDeductionTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	result: ExactMoney;
}>;

export type SavingsPensionRegimeResult = Readonly<{
	sharedClaimed: ExactMoney;
	sharedAllowed: ExactMoney;
	section80ccd1bAllowed: ExactMoney;
	governmentEmployerAllowed: ExactMoney;
	otherEmployerAllowed: ExactMoney;
	totalAllowed: ExactMoney;
}>;

export type SavingsPensionDeductionComputation =
	| Readonly<{
			kind: "blocked" | "unsupported";
			issue: SavingsPensionDeductionIssue;
	  }>
	| Readonly<{
			kind: "computed";
			claims: readonly SavingsPensionDeductionClaim[];
			oldRegime: SavingsPensionRegimeResult;
			newRegime: SavingsPensionRegimeResult;
			issues: readonly SavingsPensionDeductionIssue[];
			trace: readonly SavingsPensionDeductionTraceNode[];
	  }>;

const issue = (
	code: string,
	severity: SavingsPensionDeductionIssue["severity"],
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): SavingsPensionDeductionIssue => ({
	code: parseIssueCode(code),
	severity,
	affectedFacts,
	recoveryAction,
});

const sum = (values: readonly ExactMoney[]): ExactMoney =>
	values.reduce(addExactMoney, exactMoneyFromWholeRupees(0));

const emptyRegime = (): SavingsPensionRegimeResult => {
	const zero = exactMoneyFromWholeRupees(0);
	return {
		sharedClaimed: zero,
		sharedAllowed: zero,
		section80ccd1bAllowed: zero,
		governmentEmployerAllowed: zero,
		otherEmployerAllowed: zero,
		totalAllowed: zero,
	};
};

const requiredMoney = (
	facts: ReadonlyMap<FactKey, SavingsPensionDeductionFact>,
	factKey: FactKey,
): ExactMoney | undefined => {
	const value = facts.get(factKey)?.value;
	return typeof value === "string" ? value : undefined;
};

const requiredBoolean = (
	facts: ReadonlyMap<FactKey, SavingsPensionDeductionFact>,
	factKey: FactKey,
): boolean | undefined => {
	const value = facts.get(factKey)?.value;
	return typeof value === "boolean" ? value : undefined;
};

export const computeSavingsPensionDeductions = ({
	rulePack,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	facts: readonly SavingsPensionDeductionFact[];
}>): SavingsPensionDeductionComputation => {
	const permitted = new Set<FactKey>(Object.values(FACT_KEYS));
	const unsupported = facts.find((fact) => !permitted.has(fact.factKey));
	if (unsupported !== undefined) {
		return {
			kind: "unsupported",
			issue: issue(
				"RULE_SAVINGS_PENSION_DEDUCTION_FACT_UNSUPPORTED",
				"blocking",
				[unsupported.factKey],
				"Remove the unsupported deduction fact or use a deduction analysis that covers it.",
			),
		};
	}

	for (const factKey of new Set(facts.map((fact) => fact.factKey))) {
		const values = new Set(
			facts
				.filter((fact) => fact.factKey === factKey)
				.map((fact) => String(fact.value)),
		);
		if (values.size > 1) {
			return {
				kind: "blocked",
				issue: issue(
					"FACT_SAVINGS_PENSION_DEDUCTION_CONFLICT",
					"blocking",
					[factKey],
					"Resolve the contradictory deduction facts before continuing.",
				),
			};
		}
	}

	const constants = rulePack.taxConstants?.savingsPensionDeductions;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issue: issue(
				"RULE_SAVINGS_PENSION_DEDUCTION_CONSTANTS_MISSING",
				"blocking",
				[FACT_KEYS.present],
				"Load a rule-pack revision that pins the savings and pension-contribution rules.",
			),
		};
	}

	const byKey = new Map<FactKey, SavingsPensionDeductionFact>();
	for (const fact of facts) byKey.set(fact.factKey, fact);
	const present = requiredBoolean(byKey, FACT_KEYS.present);
	if (present === undefined) {
		return {
			kind: "blocked",
			issue: issue(
				"FACT_SAVINGS_PENSION_DEDUCTION_PRESENCE_MISSING",
				"blocking",
				[FACT_KEYS.present],
				"Confirm whether savings or pension contributions need analysis. A blank answer is not No.",
			),
		};
	}
	if (!present) {
		return {
			kind: "computed",
			claims: [],
			oldRegime: emptyRegime(),
			newRegime: emptyRegime(),
			issues: [],
			trace: [],
		};
	}

	const amountKeys = [
		FACT_KEYS.section80c,
		FACT_KEYS.section80ccc,
		FACT_KEYS.section80ccd1,
		FACT_KEYS.section80ccd1b,
		FACT_KEYS.section80ccd2Government,
		FACT_KEYS.section80ccd2Other,
	] as const;
	const missing = amountKeys.filter((factKey) => requiredMoney(byKey, factKey) === undefined);
	if (requiredBoolean(byKey, FACT_KEYS.proofAvailable) === undefined) {
		missing.push(FACT_KEYS.proofAvailable);
	}
	if (missing.length > 0) {
		return {
			kind: "blocked",
			issue: issue(
				"FACT_SAVINGS_PENSION_DEDUCTION_MISSING",
				"blocking",
				missing,
				"Supply every requested category amount and the supporting-detail answer. A blank or unknown value is not zero.",
			),
		};
	}

	const section80c = requiredMoney(byKey, FACT_KEYS.section80c)!;
	const section80ccc = requiredMoney(byKey, FACT_KEYS.section80ccc)!;
	const section80ccd1 = requiredMoney(byKey, FACT_KEYS.section80ccd1)!;
	const section80ccd1b = requiredMoney(byKey, FACT_KEYS.section80ccd1b)!;
	const governmentEmployer = requiredMoney(
		byKey,
		FACT_KEYS.section80ccd2Government,
	)!;
	const otherEmployer = requiredMoney(byKey, FACT_KEYS.section80ccd2Other)!;
	const zero = exactMoneyFromWholeRupees(0);

	let section80ccd1Allowed = zero;
	let section80ccd1RuleId = constants.section80ccd1EmployeeLimitRuleId;
	let section80ccd1BaseKey = FACT_KEYS.section80ccd1SalaryBase;
	let section80ccd1Operation = "No section 80CCD(1) contribution was claimed";
	if (compareExactMoney(section80ccd1, zero) > 0) {
		const employed = requiredBoolean(byKey, FACT_KEYS.section80ccd1Employed);
		if (employed === undefined) {
			return {
				kind: "blocked",
				issue: issue(
					"FACT_80CCD1_EMPLOYMENT_STATUS_MISSING",
					"blocking",
					[FACT_KEYS.section80ccd1Employed],
					"Confirm whether the section 80CCD(1) contribution uses the employee salary base or the non-employee gross-total-income base.",
				),
			};
		}
		section80ccd1BaseKey = employed
			? FACT_KEYS.section80ccd1SalaryBase
			: FACT_KEYS.section80ccd1GtiBase;
		const base = requiredMoney(byKey, section80ccd1BaseKey);
		if (base === undefined) {
			return {
				kind: "blocked",
				issue: issue(
					"FACT_80CCD1_INCOME_BASE_MISSING",
					"blocking",
					[section80ccd1BaseKey],
					"Supply the applicable section 80CCD(1) percentage base. A blank value is not zero.",
				),
			};
		}
		const percent = employed
			? constants.section80ccd1EmployeeSalaryPercent
			: constants.section80ccd1OtherGrossTotalIncomePercent;
		section80ccd1RuleId = employed
			? constants.section80ccd1EmployeeLimitRuleId
			: constants.section80ccd1OtherLimitRuleId;
		section80ccd1Allowed = minExactMoney(
			section80ccd1,
			multiplyByWholePercent(base, percent),
		);
		section80ccd1Operation = `Apply the ${percent}% ${employed ? "salary" : "gross-total-income"} limit to the claimed contribution`;
	}

	const employerAllowance = (
		claimed: ExactMoney,
		baseKey: FactKey,
		percent: number,
	): ExactMoney | undefined => {
		if (compareExactMoney(claimed, zero) === 0) return zero;
		const base = requiredMoney(byKey, baseKey);
		return base === undefined
			? undefined
			: minExactMoney(claimed, multiplyByWholePercent(base, percent));
	};
	const oldGovernmentEmployerAllowed = employerAllowance(
		governmentEmployer,
		FACT_KEYS.section80ccd2GovernmentSalaryBase,
		constants.oldRegimeGovernmentEmployerSalaryPercent,
	);
	const oldOtherEmployerAllowed = employerAllowance(
		otherEmployer,
		FACT_KEYS.section80ccd2OtherSalaryBase,
		constants.oldRegimeOtherEmployerSalaryPercent,
	);
	const newGovernmentEmployerAllowed = employerAllowance(
		governmentEmployer,
		FACT_KEYS.section80ccd2GovernmentSalaryBase,
		constants.newRegimeEmployerSalaryPercent,
	);
	const newOtherEmployerAllowed = employerAllowance(
		otherEmployer,
		FACT_KEYS.section80ccd2OtherSalaryBase,
		constants.newRegimeEmployerSalaryPercent,
	);
	const missingEmployerBases = [
		...(oldGovernmentEmployerAllowed === undefined
			? [FACT_KEYS.section80ccd2GovernmentSalaryBase]
			: []),
		...(oldOtherEmployerAllowed === undefined
			? [FACT_KEYS.section80ccd2OtherSalaryBase]
			: []),
	];
	if (missingEmployerBases.length > 0) {
		return {
			kind: "blocked",
			issue: issue(
				"FACT_80CCD2_SALARY_BASE_MISSING",
				"blocking",
				missingEmployerBases,
				"Supply each salary base for a positive employer pension contribution. A blank value is not zero.",
			),
		};
	}

	const sharedClaimed = sum([section80c, section80ccc, section80ccd1Allowed]);
	const sharedAllowed = minExactMoney(
		sharedClaimed,
		exactMoneyFromWholeRupees(constants.sharedLimitWholeRupees),
	);
	const section80ccd1bAllowed = minExactMoney(
		section80ccd1b,
		exactMoneyFromWholeRupees(constants.section80ccd1bLimitWholeRupees),
	);
	const oldRegime: SavingsPensionRegimeResult = {
		sharedClaimed,
		sharedAllowed,
		section80ccd1bAllowed,
		governmentEmployerAllowed: oldGovernmentEmployerAllowed!,
		otherEmployerAllowed: oldOtherEmployerAllowed!,
		totalAllowed: sum([
			sharedAllowed,
			section80ccd1bAllowed,
			oldGovernmentEmployerAllowed!,
			oldOtherEmployerAllowed!,
		]),
	};
	const newRegime: SavingsPensionRegimeResult = {
		sharedClaimed,
		sharedAllowed: zero,
		section80ccd1bAllowed: zero,
		governmentEmployerAllowed: newGovernmentEmployerAllowed!,
		otherEmployerAllowed: newOtherEmployerAllowed!,
		totalAllowed: sum([
			newGovernmentEmployerAllowed!,
			newOtherEmployerAllowed!,
		]),
	};

	const claim = (
		category: SavingsPensionDeductionCategory,
		factKey: FactKey,
		applicablePerson: SavingsPensionDeductionClaim["applicablePerson"],
	): SavingsPensionDeductionClaim => ({
		category,
		claimedAmount: requiredMoney(byKey, factKey)!,
		applicablePerson,
		origin: byKey.get(factKey)!.origin,
	});
	const claims = Object.freeze([
		claim("80C", FACT_KEYS.section80c, "taxpayer-or-eligible-family"),
		claim("80CCC", FACT_KEYS.section80ccc, "taxpayer"),
		claim("80CCD(1)", FACT_KEYS.section80ccd1, "taxpayer"),
		claim("80CCD(1B)", FACT_KEYS.section80ccd1b, "taxpayer"),
		claim(
			"80CCD(2)-GOVERNMENT-EMPLOYER",
			FACT_KEYS.section80ccd2Government,
			"government-employer-for-taxpayer",
		),
		claim(
			"80CCD(2)-OTHER-EMPLOYER",
			FACT_KEYS.section80ccd2Other,
			"other-employer-for-taxpayer",
		),
	]);
	const anyPositive = claims.some(
		(candidate) => compareExactMoney(candidate.claimedAmount, zero) > 0,
	);
	const proofAvailable = requiredBoolean(byKey, FACT_KEYS.proofAvailable)!;
	const issues =
		anyPositive && !proofAvailable
			? [
					issue(
						"ANALYSIS_SAVINGS_PENSION_PROOF_NOT_AVAILABLE",
						"warning",
						amountKeys,
						"Review the supporting document identifiers, PRAN details, contribution records, and employer evidence before relying on these attested amounts.",
					),
				]
			: [];

	return {
		kind: "computed",
		claims,
		oldRegime,
		newRegime,
		issues,
		trace: Object.freeze([
			{
				label: "Section 80CCD(1) category limit",
				ruleId: section80ccd1RuleId,
				inputs: [FACT_KEYS.section80ccd1, section80ccd1BaseKey],
				operation: section80ccd1Operation,
				result: section80ccd1Allowed,
			},
			{
				label: "Sections 80C, 80CCC, and 80CCD(1) shared limit",
				ruleId: constants.sharedLimitRuleId,
				inputs: [
					FACT_KEYS.section80c,
					FACT_KEYS.section80ccc,
					FACT_KEYS.section80ccd1,
				],
				operation: `Cap the eligible aggregate at ₹${constants.sharedLimitWholeRupees}`,
				result: sharedAllowed,
			},
			{
				label: "Additional section 80CCD(1B) limit",
				ruleId: constants.section80ccd1bLimitRuleId,
				inputs: [FACT_KEYS.section80ccd1b],
				operation: `Cap the separately allocated contribution at ₹${constants.section80ccd1bLimitWholeRupees}`,
				result: section80ccd1bAllowed,
			},
			{
				label: "Old-regime government-employer contribution",
				ruleId: constants.oldRegimeGovernmentEmployerLimitRuleId,
				inputs: [
					FACT_KEYS.section80ccd2Government,
					FACT_KEYS.section80ccd2GovernmentSalaryBase,
				],
				operation: `Apply ${constants.oldRegimeGovernmentEmployerSalaryPercent}% of the government-employer salary base`,
				result: oldGovernmentEmployerAllowed!,
			},
			{
				label: "Old-regime other-employer contribution",
				ruleId: constants.oldRegimeOtherEmployerLimitRuleId,
				inputs: [
					FACT_KEYS.section80ccd2Other,
					FACT_KEYS.section80ccd2OtherSalaryBase,
				],
				operation: `Apply ${constants.oldRegimeOtherEmployerSalaryPercent}% of the other-employer salary base`,
				result: oldOtherEmployerAllowed!,
			},
			{
				label: "New-regime savings and personal-pension exclusions",
				ruleId: constants.newRegimeExclusionRuleId,
				inputs: [
					FACT_KEYS.section80c,
					FACT_KEYS.section80ccc,
					FACT_KEYS.section80ccd1,
					FACT_KEYS.section80ccd1b,
				],
				operation:
					"Exclude sections 80C, 80CCC, 80CCD(1), and 80CCD(1B) from the new-regime deduction total",
				result: zero,
			},
			{
				label: "New-regime government-employer contribution",
				ruleId: constants.newRegimeEmployerLimitRuleId,
				inputs: [
					FACT_KEYS.section80ccd2Government,
					FACT_KEYS.section80ccd2GovernmentSalaryBase,
				],
				operation: `Apply ${constants.newRegimeEmployerSalaryPercent}% of the government-employer salary base`,
				result: newGovernmentEmployerAllowed!,
			},
			{
				label: "New-regime other-employer contribution",
				ruleId: constants.newRegimeEmployerLimitRuleId,
				inputs: [
					FACT_KEYS.section80ccd2Other,
					FACT_KEYS.section80ccd2OtherSalaryBase,
				],
				operation: `Apply ${constants.newRegimeEmployerSalaryPercent}% of the other-employer salary base`,
				result: newOtherEmployerAllowed!,
			},
		]),
	};
};
