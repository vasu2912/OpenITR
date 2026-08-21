import type {
	CompletedScopeCheck,
	EligibilityAnswerValue,
	ScopeCheckResult,
	ScopeRulePack,
} from "@openitr/model";

const officialSource = {
	id: "cbdt-notification-45-2026",
	title: "Notification No. 45/2026, G.S.R. 226(E)",
	authority:
		"Central Board of Direct Taxes, Ministry of Finance, Government of India",
	url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-04/Notification%20No.45_2026.pdf",
	releaseDate: "2026-03-30",
	retrievedDate: "2026-08-22",
	contentSha256:
		"b7ca15d6ca15c16ac8ad8c62cce86bc4b50b9208bcc07370298bff8515911964",
	redistributionStatus: "not-redistributed",
	location: "Form ITR-1 heading, Gazette page 16",
} as const;

const question = {
	id: "itr1-resident-individual",
	prompt:
		"For FY 2025-26, were you an individual with Resident status, excluding Resident but not ordinarily resident?",
	helpText:
		"Answer No if your status was Resident but not ordinarily resident or Non-resident.",
	answers: [
		{ value: "yes", label: "Yes" },
		{ value: "no", label: "No" },
	],
} as const;

const rule = {
	id: "ITR1-ELIGIBILITY-RESIDENT",
	citation:
		"Notification No. 45/2026, Form ITR-1 heading, Gazette page 16",
	sourceUrl: officialSource.url,
} as const;

const resultFor = (answer: EligibilityAnswerValue): ScopeCheckResult => {
	if (answer === "yes") {
		return {
			kind: "supported",
			title: "Supported by this scope check",
			explanation:
				"You answered Yes. Rule ITR1-ELIGIBILITY-RESIDENT permits ITR-1 analysis for an individual who is resident other than not ordinarily resident.",
			rule,
		};
	}

	return {
		kind: "unsupported",
		title: "Not supported by this scope check",
		explanation:
			"You answered No. Rule ITR1-ELIGIBILITY-RESIDENT limits ITR-1 analysis to an individual who is resident other than not ordinarily resident.",
		rule,
	};
};

const answerLabel = (answer: EligibilityAnswerValue): string => {
	switch (answer) {
		case "yes":
			return "Yes";
		case "no":
			return "No";
		default: {
			const _exhaustive: never = answer;
			return _exhaustive;
		}
	}
};

const evaluate = (answer: EligibilityAnswerValue): CompletedScopeCheck => {
	return {
		question: {
			id: question.id,
			prompt: question.prompt,
		},
		answer: {
			value: answer,
			label: answerLabel(answer),
		},
		result: resultFor(answer),
	};
};

export const itr1Ay202627RulePack = {
	identity: {
		id: "itr1-ay2026-27.2026-08-22",
		form: "ITR-1",
		financialYear: "2025-26",
		assessmentYear: "2026-27",
		revision: "2026-08-22",
		officialSourceRevisionIds: ["cbdt-notification-45-2026"],
		sourceManifestSha256:
			"f2958db3eaa6a1062c90937092f902abb0c9c3b52c6e5abd0c26df860281daf4",
		compiledPackSha256:
			"e48bdc4bb08f80a570e89935ad4d3799c33bdbfd8ac530719177acf5b4cc6f7e",
		minimumEngineContractVersion: "1",
	},
	officialSources: [officialSource],
	question,
	evaluate,
} satisfies ScopeRulePack;
