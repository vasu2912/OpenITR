import { parseFactKey } from "@openitr/model";
import type { FactKey } from "@openitr/model";
import { parseRuleId } from "@openitr/model";
import type { RuleId } from "@openitr/model";

export type Form16SalaryFieldDefinition = Readonly<{
	factKey: FactKey;
	label: string;
	ruleId: RuleId;
	description: string;
}>;

// The narrow reviewed set for this revision: literal Part A rows only.
// No computation, no other document kind, no further fields.
export const FORM16_SALARY_FIELD_DEFINITIONS: readonly Form16SalaryFieldDefinition[] =
	Object.freeze([
		Object.freeze({
			factKey: parseFactKey("salary.section-17-1"),
			label: "Salary as per provisions contained in section 17(1)",
			ruleId: parseRuleId("FORM16-PARTA-SALARY-SECTION-17-1"),
			description:
				"Form 16 Part A salary detail row for gross salary under section 17(1), Income-tax Act 1961.",
		}),
		Object.freeze({
			factKey: parseFactKey("salary.exempt-allowances-section-10"),
			label: "Less: Allowance to the extent exempt u/s 10",
			ruleId: parseRuleId("FORM16-PARTA-EXEMPT-ALLOWANCES-SECTION-10"),
			description:
				"Form 16 Part A row for allowances exempt under section 10, Income-tax Act 1961.",
		}),
		Object.freeze({
			factKey: parseFactKey("salary.taxable-total"),
			label: "Taxable salary",
			ruleId: parseRuleId("FORM16-PARTA-TAXABLE-SALARY"),
			description: "Form 16 Part A taxable salary total row.",
		}),
	]);
