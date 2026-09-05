import {
	addExactMoney,
	compareExactMoney,
	exactMoneyFromWholeRupees,
	minExactMoney,
	parseFactKey,
	parseIssueCode,
	subtractExactMoney,
} from "@openitr/model";
import type { ExactMoney, FactKey, IssueCode, RuleId, ScopeRulePack } from "@openitr/model";

const FACT_KEYS = Object.freeze({
	healthPresent: parseFactKey("deductions.80d-present"),
	selfFamilyClaimed: parseFactKey("deductions.80d-self-family-claimed"),
	selfFamilySenior: parseFactKey("deductions.80d-self-family-senior"),
	selfFamilyPremium: parseFactKey("deductions.80d-self-family-premium"),
	selfFamilyPreventive: parseFactKey("deductions.80d-self-family-preventive"),
	selfFamilyMedical: parseFactKey("deductions.80d-self-family-medical"),
	selfFamilyPremiumNoncash: parseFactKey("deductions.80d-self-family-premium-noncash"),
	selfFamilyPolicyDetails: parseFactKey("deductions.80d-self-family-policy-details"),
	parentsClaimed: parseFactKey("deductions.80d-parents-claimed"),
	parentsSenior: parseFactKey("deductions.80d-parents-senior"),
	parentsPremium: parseFactKey("deductions.80d-parents-premium"),
	parentsPreventive: parseFactKey("deductions.80d-parents-preventive"),
	parentsMedical: parseFactKey("deductions.80d-parents-medical"),
	parentsPremiumNoncash: parseFactKey("deductions.80d-parents-premium-noncash"),
	parentsPolicyDetails: parseFactKey("deductions.80d-parents-policy-details"),
	dependentDisabilityPresent: parseFactKey("deductions.80dd-present"),
	dependentEligible: parseFactKey("deductions.80dd-eligible-dependent"),
	dependentQualifyingPayment: parseFactKey("deductions.80dd-qualifying-payment"),
	dependentSevere: parseFactKey("deductions.80dd-severe"),
	dependentCertificate: parseFactKey("deductions.80dd-certificate"),
	specifiedDiseasePresent: parseFactKey("deductions.80ddb-present"),
	specifiedDiseaseEligiblePerson: parseFactKey("deductions.80ddb-eligible-person"),
	specifiedDiseaseConfirmed: parseFactKey("deductions.80ddb-specified-disease"),
	specifiedDiseaseSenior: parseFactKey("deductions.80ddb-senior"),
	specifiedDiseaseExpenditure: parseFactKey("deductions.80ddb-expenditure"),
	specifiedDiseaseReimbursement: parseFactKey("deductions.80ddb-reimbursement"),
	specifiedDiseasePrescription: parseFactKey("deductions.80ddb-prescription"),
	taxpayerDisabilityPresent: parseFactKey("deductions.80u-present"),
	taxpayerSevere: parseFactKey("deductions.80u-severe"),
	taxpayerCertificate: parseFactKey("deductions.80u-certificate"),
});

export const HEALTH_DISABILITY_DEDUCTION_FACT_KEYS = FACT_KEYS;

export type HealthDisabilityDeductionOrigin =
	| Readonly<{ kind: "attested-answer"; answerId: string }>
	| Readonly<{ kind: "accepted-evidence"; sourceDocumentIds: readonly string[] }>;

export type HealthDisabilityDeductionFact = Readonly<{
	factKey: FactKey;
	value: ExactMoney | boolean;
	origin: HealthDisabilityDeductionOrigin;
}>;

export type HealthDisabilityDeductionCategory = "80D" | "80DD" | "80DDB" | "80U";

export type HealthDisabilityDeductionCategoryResult = Readonly<{
	category: HealthDisabilityDeductionCategory;
	claimedAmount: ExactMoney;
	oldRegimeAllowed: ExactMoney;
	newRegimeAllowed: ExactMoney;
	applicablePerson:
		| "self-spouse-dependent-children-and-or-parents"
		| "eligible-dependent"
		| "taxpayer-or-eligible-dependent"
		| "resident-taxpayer";
}>;

export type HealthDisabilityDeductionIssue = Readonly<{
	code: IssueCode;
	category: HealthDisabilityDeductionCategory | "selection";
	severity: "blocking" | "warning";
	affectedFacts: readonly FactKey[];
	recoveryAction: string;
}>;

export type HealthDisabilityDeductionTraceNode = Readonly<{
	label: string;
	ruleId: RuleId;
	inputs: readonly FactKey[];
	operation: string;
	result: ExactMoney;
}>;

export type HealthDisabilityDeductionComputation =
	| Readonly<{
			kind: "blocked" | "unsupported";
			issues: readonly HealthDisabilityDeductionIssue[];
	  }>
	| Readonly<{
			kind: "computed";
			facts: readonly HealthDisabilityDeductionFact[];
			categories: readonly HealthDisabilityDeductionCategoryResult[];
			oldRegimeTotal: ExactMoney;
			newRegimeTotal: ExactMoney;
			issues: readonly HealthDisabilityDeductionIssue[];
			trace: readonly HealthDisabilityDeductionTraceNode[];
	  }>;

const issue = (
	code: string,
	category: HealthDisabilityDeductionIssue["category"],
	severity: HealthDisabilityDeductionIssue["severity"],
	affectedFacts: readonly FactKey[],
	recoveryAction: string,
): HealthDisabilityDeductionIssue => ({
	code: parseIssueCode(code),
	category,
	severity,
	affectedFacts,
	recoveryAction,
});

const sum = (values: readonly ExactMoney[]): ExactMoney =>
	values.reduce(addExactMoney, exactMoneyFromWholeRupees(0));

export const computeHealthDisabilityDeductions = ({
	rulePack,
	facts,
}: Readonly<{
	rulePack: Pick<ScopeRulePack, "taxConstants">;
	facts: readonly HealthDisabilityDeductionFact[];
}>): HealthDisabilityDeductionComputation => {
	const permitted = new Set<FactKey>(Object.values(FACT_KEYS));
	const unsupported = facts.find((fact) => !permitted.has(fact.factKey));
	if (unsupported !== undefined) {
		return {
			kind: "unsupported",
			issues: [
				issue(
					"RULE_HEALTH_DISABILITY_DEDUCTION_FACT_UNSUPPORTED",
					"selection",
					"blocking",
					[unsupported.factKey],
					"Remove the unsupported fact or use a deduction analysis that covers it.",
				),
			],
		};
	}

	for (const factKey of new Set(facts.map((fact) => fact.factKey))) {
		const values = new Set(
			facts.filter((fact) => fact.factKey === factKey).map((fact) => String(fact.value)),
		);
		if (values.size > 1) {
			return {
				kind: "blocked",
				issues: [
					issue(
						"FACT_HEALTH_DISABILITY_DEDUCTION_CONFLICT",
						"selection",
						"blocking",
						[factKey],
						"Resolve the contradictory deduction facts before continuing.",
					),
				],
			};
		}
	}

	const constants = rulePack.taxConstants?.healthDisabilityDeductions;
	if (constants === undefined) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"RULE_HEALTH_DISABILITY_DEDUCTION_CONSTANTS_MISSING",
					"selection",
					"blocking",
					[FACT_KEYS.healthPresent],
					"Load a rule-pack revision that pins the health and disability deduction rules.",
				),
			],
		};
	}

	const byKey = new Map<FactKey, HealthDisabilityDeductionFact>();
	for (const fact of facts) byKey.set(fact.factKey, fact);
	const money = (factKey: FactKey): ExactMoney | undefined => {
		const value = byKey.get(factKey)?.value;
		return typeof value === "string" ? value : undefined;
	};
	const bool = (factKey: FactKey): boolean | undefined => {
		const value = byKey.get(factKey)?.value;
		return typeof value === "boolean" ? value : undefined;
	};
	const zero = exactMoneyFromWholeRupees(0);
	const blockers: HealthDisabilityDeductionIssue[] = [];
	const warnings: HealthDisabilityDeductionIssue[] = [];
	const categories: HealthDisabilityDeductionCategoryResult[] = [];
	const trace: HealthDisabilityDeductionTraceNode[] = [];

	const selectionKeys = [
		FACT_KEYS.healthPresent,
		FACT_KEYS.dependentDisabilityPresent,
		FACT_KEYS.specifiedDiseasePresent,
		FACT_KEYS.taxpayerDisabilityPresent,
	] as const;
	const missingSelections = selectionKeys.filter((factKey) => bool(factKey) === undefined);
	if (missingSelections.length > 0) {
		return {
			kind: "blocked",
			issues: [
				issue(
					"FACT_HEALTH_DISABILITY_CATEGORY_SELECTION_MISSING",
					"selection",
					"blocking",
					missingSelections,
					"Confirm each supported category that needs analysis. A blank selection is not No.",
				),
			],
		};
	}

	const requireFacts = (
		category: HealthDisabilityDeductionCategory,
		factKeys: readonly FactKey[],
	): boolean => {
		const missing = factKeys.filter((factKey) => !byKey.has(factKey));
		if (missing.length === 0) return true;
		blockers.push(
			issue(
				`FACT_${category}_DETAILS_MISSING`,
				category,
				"blocking",
				missing,
				`Supply every requested section ${category} fact. A blank value is not zero or No.`,
			),
		);
		return false;
	};

	if (bool(FACT_KEYS.healthPresent)) {
		const groupSelections = [FACT_KEYS.selfFamilyClaimed, FACT_KEYS.parentsClaimed];
		if (requireFacts("80D", groupSelections)) {
			type Group = Readonly<{
				label: string;
				claimed: FactKey;
				senior: FactKey;
				premium: FactKey;
				preventive: FactKey;
				medical: FactKey;
				noncash: FactKey;
				policy: FactKey;
			}>;
			const groups: readonly Group[] = [
				{ label: "Self and family", claimed: FACT_KEYS.selfFamilyClaimed, senior: FACT_KEYS.selfFamilySenior, premium: FACT_KEYS.selfFamilyPremium, preventive: FACT_KEYS.selfFamilyPreventive, medical: FACT_KEYS.selfFamilyMedical, noncash: FACT_KEYS.selfFamilyPremiumNoncash, policy: FACT_KEYS.selfFamilyPolicyDetails },
				{ label: "Parents", claimed: FACT_KEYS.parentsClaimed, senior: FACT_KEYS.parentsSenior, premium: FACT_KEYS.parentsPremium, preventive: FACT_KEYS.parentsPreventive, medical: FACT_KEYS.parentsMedical, noncash: FACT_KEYS.parentsPremiumNoncash, policy: FACT_KEYS.parentsPolicyDetails },
			];
			const groupValues: Array<Readonly<{ group: Group; premium: ExactMoney; preventive: ExactMoney; medical: ExactMoney; limit: ExactMoney }>> = [];
			for (const group of groups) {
				if (!bool(group.claimed)) continue;
				const baseKeys = [group.senior, group.premium, group.preventive];
				if (!requireFacts("80D", baseKeys)) continue;
				const senior = bool(group.senior)!;
				if (senior && !requireFacts("80D", [group.medical])) continue;
				const premium = money(group.premium)!;
				const preventive = money(group.preventive)!;
				const medical = senior ? money(group.medical)! : zero;
				if (compareExactMoney(premium, zero) > 0) {
					if (!requireFacts("80D", [group.noncash, group.policy])) continue;
					if (!bool(group.noncash)) {
						blockers.push(issue("FACT_80D_PREMIUM_PAYMENT_MODE_INELIGIBLE", "80D", "blocking", [group.premium, group.noncash], "Exclude the ineligible cash premium or confirm the eligible non-cash payment mode."));
					}
					if (!bool(group.policy)) {
						warnings.push(issue("ANALYSIS_80D_POLICY_DETAILS_NOT_AVAILABLE", "80D", "warning", [group.premium, group.policy], "Review the insurer name, policy number, and premium details before relying on this amount."));
					}
				}
				if (compareExactMoney(premium, zero) > 0 && compareExactMoney(medical, zero) > 0) {
					blockers.push(issue("FACT_80D_MEDICAL_WITH_INSURANCE_PREMIUM", "80D", "blocking", [group.premium, group.medical], `Remove ${group.label.toLowerCase()} medical expenditure or correct the premium because this medical expenditure applies only when no health-insurance premium was paid for that group.`));
				}
				groupValues.push({
					group,
					premium,
					preventive,
					medical,
					limit: exactMoneyFromWholeRupees(senior ? constants.healthSeniorGroupLimitWholeRupees : constants.healthRegularGroupLimitWholeRupees),
				});
			}
			if (!blockers.some((candidate) => candidate.category === "80D")) {
				const claimed = sum(groupValues.flatMap(({ premium, preventive, medical }) => [premium, preventive, medical]));
				const nonPreventiveAllowed = groupValues.map(({ premium, medical, limit }) => minExactMoney(sum([premium, medical]), limit));
				const preventiveWithinGroupCapacity = sum(
					groupValues.map(({ preventive, limit }, index) =>
						minExactMoney(
							preventive,
							subtractExactMoney(limit, nonPreventiveAllowed[index]!),
						),
					),
				);
				const preventiveAllowed = minExactMoney(
					preventiveWithinGroupCapacity,
					exactMoneyFromWholeRupees(
						constants.healthPreventiveSharedLimitWholeRupees,
					),
				);
				const allowed = minExactMoney(sum([...nonPreventiveAllowed, preventiveAllowed]), exactMoneyFromWholeRupees(constants.healthOverallLimitWholeRupees));
				categories.push({ category: "80D", claimedAmount: claimed, oldRegimeAllowed: allowed, newRegimeAllowed: zero, applicablePerson: "self-spouse-dependent-children-and-or-parents" });
				trace.push(
					{ label: "Section 80D group limits", ruleId: constants.healthGroupLimitsRuleId, inputs: groupValues.flatMap(({ group }) => [group.premium, group.medical]), operation: "Apply the pinned self-and-family and parent group limits according to senior-citizen status", result: sum(nonPreventiveAllowed) },
					{ label: "Section 80D shared preventive-checkup limit", ruleId: constants.healthPreventiveLimitRuleId, inputs: groupValues.map(({ group }) => group.preventive), operation: `Cap all preventive-checkup payments together at ₹${constants.healthPreventiveSharedLimitWholeRupees} and the remaining group capacity`, result: preventiveAllowed },
					{ label: "New-regime section 80D exclusion", ruleId: constants.healthNewRegimeExclusionRuleId, inputs: groupValues.flatMap(({ group }) => [group.premium, group.preventive, group.medical]), operation: "Exclude section 80D from the new-regime deduction total", result: zero },
				);
			}
		}
	}

	if (bool(FACT_KEYS.dependentDisabilityPresent)) {
		const required = [FACT_KEYS.dependentEligible, FACT_KEYS.dependentQualifyingPayment, FACT_KEYS.dependentSevere, FACT_KEYS.dependentCertificate];
		if (requireFacts("80DD", required)) {
			if (!bool(FACT_KEYS.dependentEligible)) blockers.push(issue("FACT_80DD_DEPENDENT_INELIGIBLE", "80DD", "blocking", [FACT_KEYS.dependentEligible], "Confirm an eligible dependent relationship and dependency conditions, or remove the section 80DD category."));
			if (!bool(FACT_KEYS.dependentQualifyingPayment)) blockers.push(issue("FACT_80DD_QUALIFYING_PAYMENT_REQUIRED", "80DD", "blocking", [FACT_KEYS.dependentQualifyingPayment], "Confirm a qualifying maintenance, treatment, training, rehabilitation, or approved-scheme payment, or remove the section 80DD category."));
			if (!bool(FACT_KEYS.dependentCertificate)) blockers.push(issue("FACT_80DD_CERTIFICATE_REQUIRED", "80DD", "blocking", [FACT_KEYS.dependentCertificate], "Provide the disability-certificate and applicable Form 10-IA details before relying on section 80DD."));
			if (!blockers.some((candidate) => candidate.category === "80DD")) {
				const severe = bool(FACT_KEYS.dependentSevere)!;
				const allowed = exactMoneyFromWholeRupees(severe ? constants.dependentSevereDisabilityAmountWholeRupees : constants.dependentDisabilityAmountWholeRupees);
				categories.push({ category: "80DD", claimedAmount: allowed, oldRegimeAllowed: allowed, newRegimeAllowed: zero, applicablePerson: "eligible-dependent" });
				trace.push(
					{ label: "Section 80DD fixed deduction", ruleId: constants.dependentDisabilityRuleId, inputs: required, operation: severe ? "Apply the pinned severe-disability fixed amount" : "Apply the pinned disability fixed amount", result: allowed },
					{ label: "New-regime section 80DD exclusion", ruleId: constants.dependentDisabilityNewRegimeExclusionRuleId, inputs: required, operation: "Exclude section 80DD from the new-regime deduction total", result: zero },
				);
			}
		}
	}

	if (bool(FACT_KEYS.specifiedDiseasePresent)) {
		const required = [FACT_KEYS.specifiedDiseaseEligiblePerson, FACT_KEYS.specifiedDiseaseConfirmed, FACT_KEYS.specifiedDiseaseSenior, FACT_KEYS.specifiedDiseaseExpenditure, FACT_KEYS.specifiedDiseaseReimbursement, FACT_KEYS.specifiedDiseasePrescription];
		if (requireFacts("80DDB", required)) {
			if (!bool(FACT_KEYS.specifiedDiseaseEligiblePerson)) blockers.push(issue("FACT_80DDB_PERSON_INELIGIBLE", "80DDB", "blocking", [FACT_KEYS.specifiedDiseaseEligiblePerson], "Confirm that treatment was for the taxpayer or an eligible dependent, or remove the section 80DDB category."));
			if (!bool(FACT_KEYS.specifiedDiseaseConfirmed)) blockers.push(issue("FACT_80DDB_DISEASE_UNSUPPORTED", "80DDB", "blocking", [FACT_KEYS.specifiedDiseaseConfirmed], "Confirm an eligible specified disease before applying section 80DDB."));
			if (!bool(FACT_KEYS.specifiedDiseasePrescription)) blockers.push(issue("FACT_80DDB_PRESCRIPTION_REQUIRED", "80DDB", "blocking", [FACT_KEYS.specifiedDiseasePrescription], "Provide the specialist prescription and specified-disease details before relying on section 80DDB."));
			const expenditure = money(FACT_KEYS.specifiedDiseaseExpenditure)!;
			const reimbursement = money(FACT_KEYS.specifiedDiseaseReimbursement)!;
			if (compareExactMoney(reimbursement, expenditure) > 0) blockers.push(issue("FACT_80DDB_REIMBURSEMENT_EXCEEDS_EXPENDITURE", "80DDB", "blocking", [FACT_KEYS.specifiedDiseaseExpenditure, FACT_KEYS.specifiedDiseaseReimbursement], "Correct the expenditure or reimbursement so reimbursement does not exceed qualifying expenditure."));
			if (!blockers.some((candidate) => candidate.category === "80DDB")) {
				const net = subtractExactMoney(expenditure, reimbursement);
				const senior = bool(FACT_KEYS.specifiedDiseaseSenior)!;
				const allowed = minExactMoney(net, exactMoneyFromWholeRupees(senior ? constants.specifiedDiseaseSeniorLimitWholeRupees : constants.specifiedDiseaseLimitWholeRupees));
				categories.push({ category: "80DDB", claimedAmount: net, oldRegimeAllowed: allowed, newRegimeAllowed: zero, applicablePerson: "taxpayer-or-eligible-dependent" });
				trace.push(
					{ label: "Section 80DDB reimbursed medical expenditure", ruleId: constants.specifiedDiseaseRuleId, inputs: [FACT_KEYS.specifiedDiseaseExpenditure, FACT_KEYS.specifiedDiseaseReimbursement, FACT_KEYS.specifiedDiseaseSenior], operation: `Subtract reimbursement and apply the pinned ${senior ? "senior-citizen" : "standard"} limit`, result: allowed },
					{ label: "New-regime section 80DDB exclusion", ruleId: constants.specifiedDiseaseNewRegimeExclusionRuleId, inputs: required, operation: "Exclude section 80DDB from the new-regime deduction total", result: zero },
				);
			}
		}
	}

	if (bool(FACT_KEYS.taxpayerDisabilityPresent)) {
		const required = [FACT_KEYS.taxpayerSevere, FACT_KEYS.taxpayerCertificate];
		if (requireFacts("80U", required)) {
			if (!bool(FACT_KEYS.taxpayerCertificate)) blockers.push(issue("FACT_80U_CERTIFICATE_REQUIRED", "80U", "blocking", [FACT_KEYS.taxpayerCertificate], "Provide the disability-certificate and applicable Form 10-IA details before relying on section 80U."));
			if (!blockers.some((candidate) => candidate.category === "80U")) {
				const severe = bool(FACT_KEYS.taxpayerSevere)!;
				const allowed = exactMoneyFromWholeRupees(severe ? constants.taxpayerSevereDisabilityAmountWholeRupees : constants.taxpayerDisabilityAmountWholeRupees);
				categories.push({ category: "80U", claimedAmount: allowed, oldRegimeAllowed: allowed, newRegimeAllowed: zero, applicablePerson: "resident-taxpayer" });
				trace.push(
					{ label: "Section 80U fixed deduction", ruleId: constants.taxpayerDisabilityRuleId, inputs: required, operation: severe ? "Apply the pinned severe-disability fixed amount" : "Apply the pinned disability fixed amount", result: allowed },
					{ label: "New-regime section 80U exclusion", ruleId: constants.taxpayerDisabilityNewRegimeExclusionRuleId, inputs: required, operation: "Exclude section 80U from the new-regime deduction total", result: zero },
				);
			}
		}
	}

	if (blockers.length > 0) return { kind: "blocked", issues: blockers };
	return {
		kind: "computed",
		facts: Object.freeze([...facts]),
		categories: Object.freeze(categories),
		oldRegimeTotal: sum(categories.map((category) => category.oldRegimeAllowed)),
		newRegimeTotal: zero,
		issues: Object.freeze(warnings),
		trace: Object.freeze(trace),
	};
};
