import type { RulePackManifest } from "@openitr/model";

import { itr1Ay202627RulePackManifest20260915 } from "../2026-09-15/manifest";

type QuestionCopy = Readonly<{
	prompt: string;
	helpText: string;
}>;

const plainLanguageQuestions: Readonly<Record<string, QuestionCopy>> =
	Object.freeze({
		"scope-individual": {
			prompt: "Are you completing this analysis for yourself as an individual?",
			helpText:
				"ITR-1 can be used only by an individual, not by a company, firm, trust, or other organisation.",
		},
		"scope-resident-other-than-rnor": {
			prompt:
				"For FY 2025-26, was your tax status 'Resident and ordinarily resident' in India?",
			helpText:
				"Choose No if your status was Non-resident or Resident but not ordinarily resident (RNOR).",
		},
		"scope-total-income": {
			prompt: "What was your total income for FY 2025-26?",
			helpText:
				"Enter the total income that belongs in your return. Include eligible long-term gains from listed shares, equity funds, or business-trust units (section 112A). Do not use only the amount from one salary document.",
		},
		"scope-house-property-count": {
			prompt:
				"How many properties had income or a current-year loss that must be reported under 'Income from house property' for FY 2025-26?",
			helpText:
				"Count only properties that affected this year's income, not every property you own. Enter 0, 1, or 2. Three or more is outside this ITR-1 analysis.",
		},
		"scope-section112a-ltcg": {
			prompt:
				"How much long-term profit did you make from eligible listed shares, equity-oriented funds, or business-trust units in FY 2025-26?",
			helpText:
				"This is the long-term capital gain reported under section 112A. Enter 0 if you had none.",
		},
		"scope-other-capital-gains": {
			prompt:
				"Apart from those eligible long-term gains, did you make any other profit or loss from selling or transferring an investment, property, or other asset?",
			helpText:
				"Include short-term gains and losses. Choose No only if you had no other capital gain or loss.",
		},
		"scope-agriculture-present": {
			prompt: "Did you receive any agricultural income in FY 2025-26?",
			helpText:
				"Choose Yes if your records show any agricultural income. We will ask for the amount later if it is needed.",
		},
		"scope-salary-pension": {
			prompt: "Did you receive a salary or pension in FY 2025-26?",
			helpText:
				"Choose Yes if any employer paid you a salary or any source paid you a pension.",
		},
		"scope-bank-interest": {
			prompt: "Did a bank or post office pay you interest in FY 2025-26?",
			helpText:
				"Include interest from savings accounts, fixed deposits, and recurring deposits. Do not choose No only because a bank document is missing.",
		},
		"scope-other-sources": {
			prompt:
				"Did you receive dividends, family pension, or any other permitted income in FY 2025-26?",
			helpText:
				"Do not include salary, bank or post-office interest, or income taxed at a special rate here. Choose Yes if another permitted source paid you income.",
		},
		"scope-business-profession": {
			prompt:
				"Did you earn money or make a loss from a business or professional practice?",
			helpText:
				"Include freelance or professional work that you treated as business or professional income, even when the amount was small.",
		},
		"scope-lottery": {
			prompt: "Did you win money from a lottery in FY 2025-26?",
			helpText: "Choose Yes even if tax was already deducted from the winnings.",
		},
		"scope-racehorse": {
			prompt: "Did you earn income from owning or maintaining racehorses?",
			helpText: "Choose Yes if this applied at any time in FY 2025-26.",
		},
		"scope-115bbda": {
			prompt:
				"Do your tax records show any dividend income under section 115BBDA?",
			helpText:
				"This is an uncommon special-rate dividend category. Choose Yes only if your tax records identify section 115BBDA.",
		},
		"scope-115bbe": {
			prompt:
				"Did you have unexplained money, investments, or spending taxed under section 115BBE?",
			helpText:
				"Choose Yes only if your tax records classify income under section 115BBE.",
		},
		"scope-online-games": {
			prompt: "Did you earn taxable winnings from online games?",
			helpText:
				"This asks about online-game winnings that have their own special tax rate.",
		},
		"scope-vda": {
			prompt:
				"Did you earn income from cryptocurrency, NFTs, or another virtual digital asset?",
			helpText:
				"Choose Yes if you had taxable income from a virtual digital asset, which has its own special tax rules.",
		},
		"scope-other-special-rate": {
			prompt: "Did any other income have its own special tax rate?",
			helpText:
				"Do not count the eligible long-term share or equity-fund gains already asked about. Check your tax records before choosing No.",
		},
		"scope-company-director": {
			prompt: "Were you a director of any company during FY 2025-26?",
			helpText:
				"Choose Yes if you were a company director at any point during the year.",
		},
		"scope-unlisted-equity": {
			prompt:
				"Did you own shares in a company that was not listed on a recognised stock exchange?",
			helpText:
				"Choose Yes if you held any unlisted company shares at any time in FY 2025-26.",
		},
		"scope-foreign-assets": {
			prompt:
				"Did you own an asset outside India or have a financial interest in a foreign organisation?",
			helpText:
				"Include foreign bank accounts, investments, and financial interests even if they produced no income.",
		},
		"scope-foreign-signing": {
			prompt:
				"Could you sign or authorise transactions for any account outside India?",
			helpText:
				"Choose Yes if you had this authority at any point in FY 2025-26, even if the account was not yours.",
		},
		"scope-foreign-income": {
			prompt: "Did you have any income from a source outside India?",
			helpText:
				"Include income from a foreign retirement-benefit account covered by section 89A. This is separate from merely owning a foreign asset.",
		},
		"scope-194n": {
			prompt:
				"Did a bank or post office deduct TDS because you withdrew a large amount of cash?",
			helpText:
				"Your TDS record will identify this deduction as section 194N.",
		},
		"scope-deferred-esop": {
			prompt:
				"Did your employer postpone tax on ESOP shares from an eligible start-up?",
			helpText:
				"Check Form 16 and any ESOP statement from your employer for deferred ESOP tax.",
		},
		"scope-brought-forward-losses": {
			prompt:
				"Do you have a loss from an earlier tax year that was carried forward to FY 2025-26?",
			helpText:
				"Check earlier returns and loss schedules. Do not treat a blank schedule as 0 without reviewing your records.",
		},
		"scope-carry-forward-losses": {
			prompt:
				"Do you want to carry any loss from FY 2025-26 into a future tax year?",
			helpText:
				"This is different from using a loss brought forward from an earlier year.",
		},
		"scope-other-source-loss": {
			prompt:
				"Did any item reported as 'Income from other sources' result in a loss?",
			helpText:
				"A family-pension deduction by itself does not count as a loss for this question.",
		},
		"scope-section5a": {
			prompt:
				"Do the special income-sharing rules for spouses under Goa's community property law apply to you?",
			helpText:
				"These rules are in section 5A. Choose Yes if income must be divided between you and your spouse under that section.",
		},
		"scope-foreign-tax-relief": {
			prompt: "Are you claiming credit or relief for tax paid outside India?",
			helpText:
				"This includes foreign-tax relief under sections 90, 90A, or 91.",
		},
		"scope-other-source-deductions": {
			prompt:
				"For 'Income from other sources', are you claiming an expense deduction other than the family-pension deduction?",
			helpText:
				"These are deductions under section 57. Choose No if the family-pension deduction is the only one you claim.",
		},
		"scope-other-person-tds": {
			prompt:
				"Was tax deducted in someone else's name for income that must be included in your return?",
			helpText:
				"Choose Yes only when another person's TDS belongs to income assessed as yours. Do not choose Yes merely because permitted income was combined with yours.",
		},
	});

const priorScope = itr1Ay202627RulePackManifest20260915.analysisScope;
if (priorScope === undefined) {
	throw new Error("The prior rule pack has no analysis scope");
}

const questions = Object.freeze(
	priorScope.questions.map((question) => {
		const copy = plainLanguageQuestions[question.id];
		if (copy === undefined) {
			throw new Error(`No plain-language copy for ${question.id}`);
		}
		return Object.freeze({ ...question, ...copy });
	}),
);

export const itr1Ay202627RulePackManifest20260917 = Object.freeze({
	...itr1Ay202627RulePackManifest20260915,
	rulePackId: "itr1-ay2026-27.2026-09-17",
	packRevision: "2026-09-17",
	scopeCheck: Object.freeze({
		...itr1Ay202627RulePackManifest20260915.scopeCheck,
		prompt:
			"For FY 2025-26, were you an individual with the tax status 'Resident and ordinarily resident' in India?",
		helpText:
			"Choose No if you were not an individual, or if your status was Non-resident or Resident but not ordinarily resident (RNOR).",
	}),
	analysisScope: Object.freeze({
		...priorScope,
		questions,
	}),
}) satisfies RulePackManifest;
