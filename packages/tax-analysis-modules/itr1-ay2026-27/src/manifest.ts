import type { RulePackManifest } from "@openitr/model";

export const itr1Ay202627RulePackManifest = Object.freeze({
	rulePackId: "itr1-ay2026-27.2026-08-22",
	form: "ITR-1",
	financialYear: "2025-26",
	assessmentYear: "2026-27",
	packRevision: "2026-08-22",
	engineContractVersion: "1",
	officialSources: [
		Object.freeze({
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
		}),
	],
	supportedRules: [
		Object.freeze({
			id: "ITR1-ELIGIBILITY-RESIDENT",
			citation:
				"Notification No. 45/2026, Form ITR-1 heading, Gazette page 16",
			sourceId: "cbdt-notification-45-2026",
			sourceLocation: "Form ITR-1 heading, Gazette page 16",
		}),
	],
	scopeCheck: Object.freeze({
		questionId: "itr1-resident-individual",
		prompt:
			"For FY 2025-26, were you an individual with Resident status, excluding Resident but not ordinarily resident?",
		helpText:
			"Answer No if your status was Resident but not ordinarily resident or Non-resident.",
		requiresRuleId: "ITR1-ELIGIBILITY-RESIDENT",
		suppliesFactKey: "taxpayer.residential-status",
		blockingIssueCode: "RULE_ITR1_RESIDENT_STATUS_UNSUPPORTED",
		supportedResult: Object.freeze({
			title: "Supported by this scope check",
			explanation:
				"You answered Yes. Rule ITR1-ELIGIBILITY-RESIDENT permits ITR-1 analysis for an individual who is resident other than not ordinarily resident.",
		}),
		unsupportedResult: Object.freeze({
			title: "Not supported by this scope check",
			explanation:
				"You answered No. Rule ITR1-ELIGIBILITY-RESIDENT limits ITR-1 analysis to an individual who is resident other than not ordinarily resident.",
			recoveryAction:
				"Stop this ITR-1 analysis and review another return-form scope or consult a qualified professional.",
		}),
	}),
}) satisfies RulePackManifest;
