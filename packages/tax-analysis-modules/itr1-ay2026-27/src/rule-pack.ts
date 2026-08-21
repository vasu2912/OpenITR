import {
	parseAssessmentYear,
	parseFactKey,
	parseFinancialYear,
	parseIssueCode,
	parseQuestionId,
	parseRuleId,
	parseRulePackId,
	parseSha256Digest,
	parseSourceId,
	parseTaxFormId,
} from "@openitr/model";
import type {
	AnswerOption,
	CompletedScopeCheck,
	EligibilityAnswerValue,
	EligibilityQuestion,
	OfficialSource,
	RuleCitation,
	RulePackIdentity,
	RuleSourceReference,
	ScopeCheckResult,
	ScopeIssue,
	ScopeRulePack,
} from "@openitr/model";

const sourceReference = Object.freeze({
	sourceId: parseSourceId("cbdt-notification-45-2026"),
	location: "Form ITR-1 heading, Gazette page 16",
}) satisfies RuleSourceReference;

const officialSource = Object.freeze({
	id: sourceReference.sourceId,
	title: "Notification No. 45/2026, G.S.R. 226(E)",
	authority:
		"Central Board of Direct Taxes, Ministry of Finance, Government of India",
	url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-04/Notification%20No.45_2026.pdf",
	releaseDate: "2026-03-30",
	retrievedDate: "2026-08-22",
	contentSha256: parseSha256Digest(
		"b7ca15d6ca15c16ac8ad8c62cce86bc4b50b9208bcc07370298bff8515911964",
	),
	redistributionStatus: "not-redistributed",
	location: sourceReference.location,
}) satisfies OfficialSource;

const answerOptions: EligibilityQuestion["answers"] = Object.freeze([
	Object.freeze({ value: "yes", label: "Yes" }) satisfies AnswerOption,
	Object.freeze({ value: "no", label: "No" }) satisfies AnswerOption,
]);
const answerValues: EligibilityQuestion["answerSchema"]["values"] =
	Object.freeze([answerOptions[0].value, answerOptions[1].value]);

const issueCode = parseIssueCode("RULE_ITR1_RESIDENT_STATUS_UNSUPPORTED");
const residentialStatusFact = parseFactKey("taxpayer.residential-status");
const ruleId = parseRuleId("ITR1-ELIGIBILITY-RESIDENT");

const question = Object.freeze({
	id: parseQuestionId("itr1-resident-individual"),
	prompt:
		"For FY 2025-26, were you an individual with Resident status, excluding Resident but not ordinarily resident?",
	helpText:
		"Answer No if your status was Resident but not ordinarily resident or Non-resident.",
	answers: answerOptions,
	suppliesFact: residentialStatusFact,
	requiresRuleId: ruleId,
	answerSchema: Object.freeze({
		kind: "choice",
		values: answerValues,
	}),
	visibility: Object.freeze({ kind: "always" }),
	blockingEffect: Object.freeze({
		kind: "block-on-answer",
		answer: "no",
		issueCode,
	}),
	sourceReference,
}) satisfies EligibilityQuestion;

const rule = Object.freeze({
	id: ruleId,
	citation:
		"Notification No. 45/2026, Form ITR-1 heading, Gazette page 16",
	sourceUrl: officialSource.url,
}) satisfies RuleCitation;

const unsupportedIssue = Object.freeze({
	code: issueCode,
	severity: "blocking",
	affectedFacts: Object.freeze([residentialStatusFact]),
	sourceReferences: Object.freeze([sourceReference]),
	recoveryAction:
		"Stop this ITR-1 analysis and review another return-form scope or consult a qualified professional.",
}) satisfies ScopeIssue;

const identity = Object.freeze({
	id: parseRulePackId("itr1-ay2026-27.2026-08-22"),
	form: parseTaxFormId("ITR-1"),
	financialYear: parseFinancialYear("2025-26"),
	assessmentYear: parseAssessmentYear("2026-27"),
	revision: "2026-08-22",
	officialSourceRevisionIds: Object.freeze([officialSource.id]),
	sourceManifestSha256: parseSha256Digest(
		"f2958db3eaa6a1062c90937092f902abb0c9c3b52c6e5abd0c26df860281daf4",
	),
	compiledPackSha256: parseSha256Digest(
		"366b9b025afbb6f89a6532a75a74332edcf628047bc7eb104a360e6db3b50a92",
	),
	minimumEngineContractVersion: "1",
}) satisfies RulePackIdentity;

const resultFor = (answer: EligibilityAnswerValue): ScopeCheckResult => {
	if (answer === "yes") {
		return Object.freeze({
			kind: "supported",
			title: "Supported by this scope check",
			explanation:
				"You answered Yes. Rule ITR1-ELIGIBILITY-RESIDENT permits ITR-1 analysis for an individual who is resident other than not ordinarily resident.",
			rule,
		});
	}

	return Object.freeze({
		kind: "unsupported",
		title: "Not supported by this scope check",
		explanation:
			"You answered No. Rule ITR1-ELIGIBILITY-RESIDENT limits ITR-1 analysis to an individual who is resident other than not ordinarily resident.",
		rule,
		issue: unsupportedIssue,
	});
};

const answerLabel = (answer: EligibilityAnswerValue): string => {
	const option = answerOptions.find((candidate) => candidate.value === answer);
	if (option === undefined) {
		throw new Error(`Rule pack has no label for answer: ${answer}`);
	}
	return option.label;
};

const evaluate: ScopeRulePack["evaluate"] = ({ answer, answeredAt }) =>
	Object.freeze({
		question: Object.freeze({
			id: question.id,
			prompt: question.prompt,
		}),
		answer: Object.freeze({
			questionId: question.id,
			value: answer,
			label: answerLabel(answer),
			answeredAt,
			rulePackId: identity.id,
		}),
		result: resultFor(answer),
	}) satisfies CompletedScopeCheck;

export const itr1Ay202627RulePack: ScopeRulePack = Object.freeze({
	identity,
	officialSources: Object.freeze([officialSource]),
	question,
	evaluate,
});
