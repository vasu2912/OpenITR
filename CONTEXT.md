# OpenITR

OpenITR provides educational Indian income-tax analysis from local evidence and explicit user attestations. It does not prepare or submit a filing artifact. This glossary fixes the language used by the product, rules, issues, and project documents.

## Tax analysis

**Source document**:
A local file that the taxpayer selects for the current session.
_Avoid_: Upload, attachment

**Supported document**:
A source document whose family and exact template revision have a reviewed adapter and fixtures.
_Avoid_: Recognized file, compatible upload

**Observation**:
A literal typed value extracted from a source document, with a locator back to its evidence.
_Avoid_: Parsed fact, detected value

**Attested answer**:
A value that the taxpayer explicitly supplies when the rule pack permits an answer as its origin.
_Avoid_: Manual override, assumed value

**Conflict**:
Incompatible canonical observations of one tax fact from different sources, named together with every affected result until the taxpayer records a resolution. Equivalent observations never become a conflict.
_Avoid_: Mismatch, discrepancy, duplicate

**Resolution**:
The taxpayer's explicit choice between conflicting observations or permitted values, with the original evidence preserved.
_Avoid_: Edit, correction

**Tax fact**:
A canonical typed value accepted for tax analysis, together with its provenance.
_Avoid_: Field, input value

**Derived value**:
A value computed from tax facts by a cited rule, with its inputs and rounding recorded.
_Avoid_: Calculated field, generated value

**Preparation report**:
The complete deterministic result of one analysis, including facts, provenance, computations, insights, issues, limitations, and analysis readiness.
_Avoid_: Tax return, filing result, candidate return

## Rules and releases

**Rule pack**:
An immutable assessment-year and form revision that contains cited eligibility, questions, computations, validations, insights, and explanations.
_Avoid_: Tax configuration, latest rules

**Analysis release**:
A public educational release that can extract, reconcile, explain, calculate, and validate locally without producing a filing artifact.
_Avoid_: Filing release, tax-filing software, return generator

**Analysis-ready**:
A state in which the requested educational computations and explanations are available with complete provenance.
_Avoid_: Filing-ready, locally accepted, guaranteed correct

**Educational limitation**:
A visible statement that OpenITR is not tax, legal, or professional advice; gives no correctness, outcome, or filing guarantee; and requires the user to review the evidence and perform their own due diligence.
_Avoid_: Fine print, liability waiver

**Filing artifact**:
A government-shaped return file or other artifact intended for portal upload or return submission. Filing artifacts are outside OpenITR's product scope.
_Avoid_: Download, report, analysis result
