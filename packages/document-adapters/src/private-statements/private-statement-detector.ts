import type { PrivateTemplateDetector } from "../registry";

export const PRIVATE_STATEMENT_SENTINEL_HEADER =
	"Date,Narration,Chq/Ref No,Value Date,Withdrawal Amt.,Deposit Amt.,Closing Balance,Synthetic Commercial Bank Account Statement";

const KNOWN_PRIVATE_STATEMENT_HEADERS = [
	PRIVATE_STATEMENT_SENTINEL_HEADER,
] as const;

const decodeTextLossy = (bytes: Uint8Array): string =>
	new TextDecoder("utf-8", { fatal: false }).decode(bytes);

export const createPrivateStatementDetector = (): PrivateTemplateDetector => ({
	detectorId: "private-statement-header",
	match: (input): boolean => {
		const text = decodeTextLossy(input.bytes);
		return KNOWN_PRIVATE_STATEMENT_HEADERS.some((header) =>
			text.includes(header),
		);
	},
});
