# OpenITR

OpenITR prepares an Indian income tax return from local evidence and explicit taxpayer attestations. This glossary fixes the language used by the product, rules, issues, and project documents.

## Return preparation

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

**Resolution**:
The taxpayer's explicit choice between conflicting observations or permitted values, with the original evidence preserved.
_Avoid_: Edit, correction

**Tax fact**:
A canonical typed value accepted for return preparation, together with its provenance.
_Avoid_: Field, input value

**Derived value**:
A value computed from tax facts by a cited rule, with its inputs and rounding recorded.
_Avoid_: Calculated field, generated value

**Preparation report**:
The complete deterministic result of one preparation, including facts, provenance, computations, insights, issues, readiness, and candidate government JSON.
_Avoid_: Session result, return data

## Rules and releases

**Rule pack**:
An immutable assessment-year and form revision that contains cited eligibility, questions, computations, validations, and export metadata.
_Avoid_: Tax configuration, latest rules

**Analysis preview**:
A public release that can extract, explain, calculate, and validate locally but cannot offer a government JSON download.
_Avoid_: Upload-ready beta, filing release

**Government export-ready**:
A readiness state in which local checks pass and OpenITR has satisfied its producer identity and digest requirements.
_Avoid_: Portal accepted, guaranteed valid

**Upload-ready release**:
A release permitted to download government-shaped JSON for manual portal upload after every export and review gate passes.
_Avoid_: E-filing service, government-approved return

**Portal acceptance**:
The Income Tax Department portal's result after it runs checks that OpenITR cannot perform locally.
_Avoid_: Local validation, export readiness
