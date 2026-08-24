import { parseFactKey } from "@openitr/model";
import type { FactKey } from "@openitr/model";
import { parseRuleId } from "@openitr/model";
import type { RuleId } from "@openitr/model";

export type PrefilledItr1SalaryFieldDefinition = Readonly<{
	propertyName: string;
	factKey: FactKey;
	ruleId: RuleId;
	description: string;
}>;

// The narrow reviewed set for this revision: one prefilled property per
// agreed salary fact, read by property name so object property order can
// never influence the result.
export const PREFILLED_ITR1_SALARY_FIELD_DEFINITIONS: readonly PrefilledItr1SalaryFieldDefinition[] =
	Object.freeze([
		Object.freeze({
			propertyName: "section17_1Salary",
			factKey: parseFactKey("salary.section-17-1"),
			ruleId: parseRuleId("ITR1-PREFILLED-SALARY-SECTION-17-1"),
			description:
				"Prefilled ITR-1 salary fact for gross salary under section 17(1), Income-tax Act 1961.",
		}),
		Object.freeze({
			propertyName: "exemptAllowancesSection10",
			factKey: parseFactKey("salary.exempt-allowances-section-10"),
			ruleId: parseRuleId("ITR1-PREFILLED-SALARY-EXEMPT-ALLOWANCES"),
			description:
				"Prefilled ITR-1 salary fact for allowances exempt under section 10, Income-tax Act 1961.",
		}),
		Object.freeze({
			propertyName: "taxableSalaryTotal",
			factKey: parseFactKey("salary.taxable-total"),
			ruleId: parseRuleId("ITR1-PREFILLED-SALARY-TAXABLE-TOTAL"),
			description:
				"Prefilled ITR-1 salary fact for the total income charged under the head salaries.",
		}),
	]);
