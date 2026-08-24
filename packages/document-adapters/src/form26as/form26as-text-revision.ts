import { parseAssessmentYear } from "@openitr/model";
import type { AssessmentYear } from "@openitr/model";

export const FORM26AS_SUPPORTED_ASSESSMENT_YEAR = "2026-27";

const FORM26AS_TITLE_LINE = "FORM 26AS";
const FORM26AS_SUBTITLE_LINE =
	"Annual Tax Statement under Section 203AA of the Income Tax Act, 1961";
const FORM26AS_PAN_LABEL_PATTERN =
	/^Permanent Account Number \(PAN\)[ \t]+(\S+)$/;
const FORM26AS_ASSESSMENT_YEAR_PATTERN = /^Assessment Year[ \t]+(\S+)$/;

export type Form26AsTextDocument = Readonly<{
	lines: readonly string[];
	permanentAccountNumber: string;
	assessmentYear: AssessmentYear;
}>;

export type Form26AsTextRevisionParseOutcome =
	| Readonly<{ kind: "supported"; document: Form26AsTextDocument }>
	| Readonly<{ kind: "unsupported" }>;

// A single reusable decoder; decode() is stateless for non-streaming input.
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export const decodeUtf8Strict = (bytes: Uint8Array): string =>
	utf8Decoder.decode(bytes);

const splitLogicalLines = (text: string): readonly string[] =>
	text.split(/\r\n|\r|\n/);

// The supported revision is the reviewed plain-text layout whose header
// block carries the exact title lines plus exactly one PAN line and one
// assessment-year line for the one supported assessment year. Everything
// else is an unsupported revision and fails closed.
export const parseForm26AsTextRevision = (
	text: string,
): Form26AsTextRevisionParseOutcome => {
	const lines = splitLogicalLines(text);
	if (
		(lines[0]?.trim() !== FORM26AS_TITLE_LINE) ||
		(lines[1]?.trim() !== FORM26AS_SUBTITLE_LINE)
	) {
		return { kind: "unsupported" };
	}

	const panMatches: string[] = [];
	const assessmentYearMatches: string[] = [];
	for (const line of lines) {
		const panMatch = FORM26AS_PAN_LABEL_PATTERN.exec(line.trim());
		if (panMatch !== null && panMatch[1] !== undefined) {
			panMatches.push(panMatch[1]);
			continue;
		}
		const yearMatch = FORM26AS_ASSESSMENT_YEAR_PATTERN.exec(line.trim());
		if (yearMatch !== null && yearMatch[1] !== undefined) {
			assessmentYearMatches.push(yearMatch[1]);
		}
	}

	const permanentAccountNumber = panMatches.at(0);
	const assessmentYear = assessmentYearMatches.at(0);
	if (
		panMatches.length !== 1 ||
		assessmentYearMatches.length !== 1 ||
		permanentAccountNumber === undefined ||
		assessmentYear === undefined ||
		assessmentYear !== FORM26AS_SUPPORTED_ASSESSMENT_YEAR
	) {
		return { kind: "unsupported" };
	}

	return {
		kind: "supported",
		document: {
			lines,
			permanentAccountNumber,
			assessmentYear: parseAssessmentYear(assessmentYear),
		},
	};
};
