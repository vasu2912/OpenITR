# OpenITR architecture

Status: accepted baseline

Last updated: 2026-08-21

## Purpose

OpenITR prepares an Indian income tax return inside the user's browser. The user selects local documents, answers questions that the documents cannot resolve, reviews the resulting facts and computations, and downloads an ITR JSON file.

This document explains the system structure and the reasons behind it. It defines the domain model, module interfaces, data flow, extension model, security model, deployment model, and repository structure.

This document does not define implementation phases, milestones, tickets, estimates, or delivery order. A separate implementation plan will own those decisions.

## Accepted product scope

The first supported return has this scope:

- Financial Year 2025-26.
- Assessment Year 2026-27.
- ITR-1 for an eligible resident individual.
- Unlocked and unencrypted local files.
- Explicit questionnaire answers for facts that documents cannot establish.
- Local extraction, reconciliation, tax computation, analytics, and validation.
- A downloaded JSON file as the final artifact after the government export gate opens.

The first release has no user account, login, saved draft, database, server-side tax engine, government portal connection, or return submission.

The public analysis preview includes extraction, evidence review, computation, and analytics. It does not expose a government-shaped JSON download. That download appears only after OpenITR has confirmed its producer identity and digest requirements.

The official AY 2026-27 download page describes the current ITR-1 eligibility envelope. It includes salary income, up to two house properties, other sources, limited long-term capital gains under section 112A, and limited agricultural income. The return module, rather than this summary, owns the complete executable eligibility rules. See the [Income Tax Department downloads for AY 2026-27](https://www.incometax.gov.in/iec/foportal/downloads/income-tax-returns).

## Architectural drivers

### Taxpayer facts have explicit origins

OpenITR never invents a taxpayer fact. Each accepted fact comes from one of these origins:

- An observation extracted from a selected document.
- An answer entered by the user.
- A resolution entered by the user when sources conflict.
- A value derived from accepted facts by a cited rule.

Software version, JSON creation date, producer identity, and similar export metadata are not taxpayer facts. OpenITR records them as execution context or producer metadata.

### Determinism is observable

Given the same file bytes, answers, resolutions, return module, rule pack, application build, and execution context, OpenITR produces the same preparation report.

The contract is:

```text
PreparationReport = prepare(
	fileBytes,
	answers,
	resolutions,
	returnModuleId,
	rulePackId,
	applicationBuildId,
	executionContext
)
```

The report records every input identity. A user or test can replay the preparation with the same identities and compare the result.

JSON creation time is an explicit input because the government schema requires creation metadata. The engine does not read the clock from inside a tax calculation.

### Unsupported input fails closed

A deterministic parser can still produce a deterministic mistake. OpenITR therefore accepts only document families and template revisions that have reviewed adapters and fixtures.

An adapter returns an exact match, an ambiguous match, an unsupported result, or an invalid result. It does not return a probability. OpenITR never maps an unknown layout to the closest known layout.

### Official rules change independently from the application

The Income Tax Department releases separate forms, JSON schemas, change documents, validation documents, and utilities for each assessment year and form. The department can revise an artifact after its first release. The architecture treats a rule pack as immutable and identifies it by a version and a content hash.

### The browser is the privacy boundary

Selected files stay inside the browser process. OpenITR sends no document bytes, extracted values, file names, passwords, PAN values, or answers to a server.

The static host can still receive ordinary page-request information, including an IP address and a user agent. The host does not receive the selected files.

### Upload-ready is a stronger claim than locally valid

OpenITR can validate a return against a pinned government schema and the published validation rules. The government portal also performs checks against records that a local application cannot access, including PAN, Aadhaar, prior-return, and payment data.

The UI uses the phrase `locally validated` for local success. It does not claim government acceptance.

The AY 2026-27 ITR-1 schema requires software identity and digest fields. OpenITR can develop the exporter before those values are available, but a public build cannot claim upload readiness until the producer identity and digest procedure are confirmed. See the [AY 2026-27 ITR-1 JSON schema](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-06/ITR-1_2026_Main_V1.1.json).

## System context

OpenITR has one runtime application and one release-time rule process.

```text
                         Release time

 Income Tax Department ──────> rule-pack compiler
                                       |
                                       v
                              reviewed static assets
                                       |
                                       v
                              static OpenITR release


                          Browser runtime

 User ──> local files ──> OpenITR web application ──> local JSON download
   |                             |
   └────> answers and reviews ───┘

 No taxpayer data crosses the browser runtime boundary.
```

The release-time process may access official government sources. The browser runtime does not validate taxpayer data against a live government endpoint.

## Runtime data flow

```text
Local files
    |
    v
File intake and fingerprinting
    |
    v
Document inspection
    |
    v
Document extraction ───────────────┐
    |                              |
    v                              |
Observations                       |
    |                              |
    +────> fact assembly <──── answers and resolutions
                 |
                 v
              tax facts
                 |
                 v
        return preparation engine
          |          |          |
          v          v          v
    computation   insights   local issues
          |
          v
     ITR-1 projection
          |
          v
 schema and rule validation
          |
          v
 preparation report and JSON download
```

Each arrow crosses an explicit interface. Raw PDF objects, worksheet objects, React state, and government JSON objects do not leak into the tax domain model.

## Domain model

OpenITR uses one name for each domain concept.

### Source document

A `SourceDocument` is a file that the user selected for the current session. It has a SHA-256 content hash, media type, byte length, display name, and intake result.

The display name helps the user identify the file. The content hash is the stable identity. Two files with different names and identical bytes have the same content identity.

### Document kind

A `DocumentKind` names a supported semantic document family, such as Form 16 or an AIS export. A `DocumentKind` is not a file extension. One document kind can have several template revisions and file representations.

### Observation

An `Observation` is a literal value read from a source document. It contains:

- A stable observation ID.
- A fact key that states what the value may represent.
- The typed value.
- The source document hash.
- An evidence locator.
- The document adapter ID and version.
- The extraction transformation, if a transformation was required.

An observation does not become a tax fact merely because an adapter extracted it.

### Evidence locator

An `EvidenceLocator` points back to the selected document. A PDF locator identifies a page and bounding box. A spreadsheet locator identifies a sheet and cell or range. A JSON locator identifies a JSON Pointer. A CSV locator identifies a record and column.

The UI uses the locator to show the source beside the extracted value.

### Answer

An `Answer` is a value that the user entered in response to a cited question. It contains the question ID, typed value, answer time from the execution context, and the rule-pack identity.

An answer can state a fact that no supported document contains. An answer does not silently overwrite a conflicting observation.

### Resolution

A `Resolution` records how the user resolved a conflict. The resolution refers to all conflicting observations, the selected value, and the user's reason when the rule requires one.

### Tax fact

A `TaxFact` is a canonical, typed value accepted for return preparation. A tax fact contains its provenance. Its provenance refers to observations, an answer, a resolution, or a derivation.

The government JSON shape does not define the tax fact model. This separation prevents an annual schema change from spreading through document adapters and tax calculations.

### Derived value

A `DerivedValue` is the output of a rule. It records the rule ID, the exact input fact IDs, the arithmetic operation, the rounding operation, and the output.

### Issue

An `Issue` explains why preparation can continue, cannot continue, or needs review. Each issue has a stable code, severity, affected facts, source references, and recovery action.

The severity values are:

- `blocking`: OpenITR cannot produce a valid downstream result.
- `review`: OpenITR has a result, but the user must confirm it.
- `warning`: OpenITR can continue, but the condition may affect portal acceptance or taxpayer interpretation.
- `information`: OpenITR explains a result without asking for action.

### Rule

A `Rule` is a cited, executable statement that derives a value, determines applicability, asks a question, or validates a result. Each rule has a stable ID and an official source reference.

### Rule pack

A `RulePack` is an immutable collection of official source identities, constants, questions, rules, validations, and output metadata for one form, assessment year, and revision.

### Return module

A `ReturnModule` prepares one return form for one assessment year. The module owns applicability, the question graph, computation, insights, validation, and government JSON projection.

### Preparation report

A `PreparationReport` is the complete result of one deterministic preparation. It contains accepted facts, provenance, computation traces, insights, issues, validation results, export readiness, and the candidate JSON.

## Fact states and reconciliation

Fact assembly keeps uncertainty visible.

| State | Meaning | Downstream behavior |
| --- | --- | --- |
| `missing` | No observation or answer supplies the fact | Ask a relevant question or block the dependent result |
| `observed` | One or more compatible observations supply the value | Accept the fact with all evidence links |
| `answered` | The user supplies the value | Accept the fact with the question reference |
| `resolved` | The user resolves conflicting sources | Accept the resolution and retain every source |
| `derived` | A rule computes the value | Accept the result with a computation trace |
| `conflicting` | Sources disagree and no resolution exists | Block dependent results |
| `unsupported` | The available source cannot be interpreted safely | Block dependent results and identify the unsupported source |

Two observations agree only after a cited normalization. For example, an adapter may normalize a date representation or remove formatting from a PAN. The observation keeps the original value and the normalization record.

The engine has no global source-precedence list. A rule pack may define an authority rule for a specific fact when an official source supports that choice. Otherwise, a conflict remains visible.

## Questionnaire architecture

The questionnaire is progressive. It asks a question when the answer becomes necessary and remains unresolved.

### Eligibility questions appear first

The first screen asks only questions that can establish that ITR-1 is outside the user's filing situation. The AY 2026-27 return module owns these questions.

The official portal also uses qualifying conditions and wizard questions to determine the form and schedules. See the [Identification and Generation of Applicable ITR manual](https://www.incometax.gov.in/iec/foportal/help/identification-and-generation-of-applicable-itr-individual).

### Document questions appear after extraction

After extraction, the question engine asks only for missing facts that affect an applicable rule. A document-derived answer appears as evidence, not as a preselected user response.

### Choice questions appear after comparison

OpenITR computes every legally relevant comparison that does not require a prior choice. The regime question appears after the user can inspect the comparison. The user must select the filing regime explicitly.

### Confirmation questions appear before export

The final review asks the user to confirm facts and declarations that require personal attestation. A confirmation records an answer. It does not mutate an earlier observation.

### The question graph is data

Each question declares:

- A stable question ID.
- The fact that the answer supplies.
- The rule that requires the fact.
- Its typed answer schema.
- Its visibility predicate.
- Its blocking effect.
- Its official source reference.

The rule-pack compiler rejects a cyclic question graph and a reference to an unknown fact or rule.

## Runtime workflow

XState models the session workflow. The state machine permits only valid transitions and exposes the reason when a transition is blocked.

The main states are:

1. `eligibility` collects the initial eligibility facts.
2. `documents` accepts local files and reports intake results.
3. `extracting` runs document adapters in workers.
4. `reviewing-facts` displays observations, missing facts, and conflicts.
5. `answering` collects contextual answers and resolutions.
6. `comparing` shows available regime and tax comparisons.
7. `computing` prepares the selected return.
8. `validating` runs internal, schema, and published validations.
9. `ready` permits the appropriate download.
10. `failed` reports an unexpected application failure without exposing taxpayer data.

The session can move back to an earlier state. A changed answer invalidates only the derived values that depend on that answer. The engine then recomputes the affected graph.

## Module architecture

### Web application shell

The web application shell owns browser integration. It loads static assets, creates the session actor, accepts `File` objects, starts workers, and triggers local downloads.

The shell contains no tax rules. It translates browser events into domain commands and renders domain results.

### Session orchestrator

The session orchestrator owns the XState machine and ephemeral session context. It calls the preparation engine and document adapters through injected interfaces.

The orchestrator does not inspect PDF text, calculate tax, or construct government JSON.

### Preparation engine

The preparation engine is the main deep module. Its external interface is small:

```ts
interface PreparationEngine {
	prepare(input: PreparationInput): PreparationReport;
}
```

The `PreparationInput` contains typed facts, answers, resolutions, the selected return module, and execution context. The result contains values rather than side effects.

The preparation engine hides fact assembly, dependency evaluation, exact arithmetic, trace construction, issue aggregation, and export-readiness evaluation.

### Document adapter

A document adapter satisfies this interface:

```ts
interface DocumentAdapter {
	readonly manifest: DocumentAdapterManifest;
	inspect(file: AcceptedLocalFile): InspectionResult;
	extract(file: InspectedLocalFile): ExtractionResult;
}
```

`inspect` identifies the document kind and template revision. `extract` returns observations and extraction issues.

An adapter cannot calculate tax, select a regime, answer a question, or produce government JSON.

### Return module

A return module satisfies this interface:

```ts
interface ReturnModule {
	readonly manifest: ReturnManifest;
	prepare(input: ReturnInput): PreparationReport;
}
```

The first implementation is `itr1-ay2026-27`. Future forms and assessment years satisfy the same interface.

### Insight module

An insight module reads accepted facts and completed computations:

```ts
interface InsightModule {
	readonly manifest: InsightManifest;
	evaluate(input: InsightInput): readonly Insight[];
}
```

An insight cannot modify a tax fact, a computation, a validation result, or government JSON.

Filing insights explain the current return. Planning insights concern a future financial year. The UI keeps these categories separate because a completed financial year can no longer accept many tax-saving actions.

## Dependency direction

Dependencies point toward the domain model and the preparation engine.

```text
apps/web
  |
  +--> packages/engine
  +--> packages/document-adapters
  +--> packages/return-modules
  +--> packages/ui

packages/document-adapters --> packages/model
packages/return-modules    --> packages/model
packages/engine            --> packages/model
packages/ui                --> packages/model

tools/rulepack-compiler --> packages/model
```

`packages/model` contains shared domain types and invariants. It imports no browser, React, PDF, spreadsheet, or government-schema library.

`packages/engine` imports no React or PatternFly code. A test can call the engine without a browser.

Document adapters depend on parser libraries behind internal seams. Parser library types do not appear in the adapter interface.

Return modules own government schema projection because the projection changes with the form and assessment year. A generic pass-through government package would add no depth.

## Extension model

OpenITR supports extensions at known seams. It does not load arbitrary remote JavaScript at runtime.

### Return-module extensions

A return-module extension adds a form and assessment-year implementation. The module includes a manifest, a full rule pack, computations, validations, insights, government projection, and fixtures.

Adding AY 2027-28 creates a new immutable module. The module may start as a generated copy of AY 2026-27, but the published module contains a complete materialized rule set. Runtime inheritance is prohibited because it can carry an old threshold into a new year without an obvious diff.

### Document-adapter extensions

A document-adapter extension adds support for a document kind or template revision. Each revision has detection fixtures, extraction fixtures, and rejection fixtures.

A generated static registry discovers manifests during the build. A contributor adds a module directory rather than editing a central conditional statement.

### Insight extensions

An insight extension adds read-only analysis. The build checks that the module imports only model and insight interfaces. Tax computation does not depend on insight output.

### Data changes and code changes

Declarative rules can ship as reviewed static rule-pack assets when the existing rule language can express the change. A new calculation shape, parser, schedule, or form requires a normal application release.

This distinction keeps simple annual updates small without forcing complex tax law into an unsafe universal expression language.

## Rule-pack architecture

### Identity

A rule-pack identity contains:

- The form.
- The financial year.
- The assessment year.
- The pack revision.
- The government schema version.
- The source-manifest hash.
- The compiled-pack hash.
- The minimum engine contract version.

The session pins one identity before it accepts taxpayer facts. A later static deployment does not change a running session.

### Contents

A rule pack contains:

- Applicability rules.
- Fact definitions.
- Question definitions and dependencies.
- Tax constants, slabs, limits, and dates.
- Pure computation rules.
- Published validation rules.
- Internal provenance and completeness rules.
- Government JSON mapping metadata.
- Filing and planning insight definitions.
- Official source references.

### Official source manifest

Each source record contains the official URL, title, issuing authority, release date, retrieval date, SHA-256 hash, and the local redistribution status.

If redistribution is permitted, the repository may retain the artifact. Otherwise, the repository retains the identity, hash, and extraction notes without copying the artifact.

Every executable rule cites a source record and a location in that source. The location can be a page, table, section, schema pointer, or validation rule number.

### Official source precedence

When official sources disagree, the rule-pack build uses this order:

1. Acts, Rules, notifications, and corrigenda, evaluated by effective date.
2. The notified assessment-year form.
3. The assessment-year JSON schema and schema change document for payload structure.
4. The published assessment-year validation rules.
5. Official utility behavior as a parity oracle.
6. FAQs and help pages for explanation only.

An unresolved conflict blocks the rule-pack build. A newer web-page timestamp cannot override a higher-authority source.

### Rule representations

OpenITR uses the simplest representation that preserves reviewability.

| Rule kind | Representation |
| --- | --- |
| Constants, slabs, dates, and limits | Typed data |
| Question visibility and applicability | Typed decision tables or pure predicates |
| Tax computations | Pure TypeScript functions |
| Cross-field validations | Structured rules or pure predicates |
| JSON mapping | Form-specific projection code |
| Explanations | Metadata linked to a rule ID |

The runtime uses no `eval`, dynamic function construction, or downloaded executable rule code.

Tax constants exist only in the rule pack. A computation function can encode control flow, but it cannot contain an uncited threshold, percentage, date, or taxpayer value. UI components, document adapters, and the generic engine contain no tax literals.

### Rule-pack compiler

The compiler verifies the pack before publication. It checks:

- Unique fact, question, rule, issue, and insight IDs.
- Valid official source references.
- Acyclic question and computation graphs.
- Known fact references.
- Explicit arithmetic and rounding operations.
- Complete required-field mapping.
- Fixture coverage for each changed rule.
- A compatible engine contract version.
- A reproducible compiled hash.

The compiler produces a static manifest and a machine-readable change report. A source change never becomes executable without review.

### Government schema defaults

The AY 2026-27 ITR-1 schema uses JSON Schema draft 04 and contains `default` keywords. Some defaults concern filing choices and taxpayer values.

The schema validator ignores `default` as a mutation instruction. A default may document the government utility, but it never creates a tax fact.

### Rule-pack updates

An update creates a new immutable revision. The release process retains the previous revision for replay and audit tests.

The [ITR-1 schema change document for AY 2026-27](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-07/ITR%201_Schema%20change%20document_AY2026-27_V1.1.pdf) demonstrates why a form and assessment year can have several source revisions.

## Document ingestion

### File intake

File intake treats every selected file as untrusted input. It validates the byte signature, declared media type, extension, byte length, encryption state, and parser limits before it creates an `AcceptedLocalFile`.

The initial adapter matrix covers current fixtures for prefilled JSON, AIS JSON and CSV, Form 26AS text and Excel, Form 16 and Form 16A PDFs, and e-Pay Tax receipt PDFs. A fixture must establish the exact current layout before its adapter ships.

The initial build rejects private bank, lender, payroll, and broker templates during intake. The issue identifies the unsupported document family and points to a permitted official source or attested answer when one exists. Later releases can add named, versioned private-document adapters without changing the intake contract.

Encrypted files return a blocking issue. The first release contains no password prompt or decryption path.

### Fingerprinting

OpenITR calculates a SHA-256 hash from the file bytes. The browser display name does not participate in the content identity.

Document inspection combines file structure, stable labels, metadata, and expected field relationships. An adapter rejects the file when the fingerprint matches more than one supported revision.

### PDF extraction

PDF.js parses PDF bytes in a Web Worker. The adapter uses text content, positions, font information when required, page dimensions, and document metadata.

The parser uses strict error behavior. It does not repair a damaged document and then treat the repair as exact input.

The first release has no OCR. An image-only or partially scanned document returns an unsupported issue unless a reviewed adapter can extract every required fact from a valid text layer.

PDF actions, embedded scripts, remote links, attachments, and forms cannot initiate a network request or execute code.

### Spreadsheet extraction

SheetJS Community Edition parses workbook bytes in a Web Worker. The adapter reads cell values, cell types, formulas, cached values, date systems, sheet visibility, and named ranges when required.

OpenITR does not execute macros. It does not evaluate a formula unless a reviewed adapter explicitly supports the formula and tests its semantics. A cached formula result cannot become a tax fact without a rule that permits it.

An adapter records the original cell representation and the normalized typed value. Locale-sensitive dates and numbers require an explicit template rule.

### Structured extraction

JSON input is validated against a known schema before extraction. CSV input requires a known delimiter, encoding, header set, and record shape.

A generic JSON or CSV importer cannot create tax facts. A document adapter must identify the document kind and map fields to observations.

### Resource limits

File size, page count, worksheet count, expanded archive size, cell count, and parser time limits belong to intake configuration. The UI reports the specific exceeded limit.

The architecture does not assign numeric limits. The implementation plan sets them from performance tests and supported-device targets.

## Tax computation

### Canonical facts enter the engine

The engine accepts only typed tax facts. It never accepts a worksheet object, a PDF text item, an unvalidated form value, or a government JSON node.

Validation and type narrowing occur when raw data crosses into a typed module. Internal calculations trust the domain types.

### Computations are pure

A computation reads facts and rule-pack data, then returns derived values and issues. It performs no network request, file read, browser storage write, UI update, or clock read.

### Arithmetic is exact

OpenITR does not use JavaScript binary floating-point arithmetic for tax amounts. The engine uses `decimal.js` for exact decimal operations and branded integer types for values that the government schema expresses as whole rupees.

Each statutory rounding step is a named operation in the computation graph. The engine does not postpone all rounding until the final value unless the cited rule requires that behavior.

### Computations form a dependency graph

Each derived value declares its fact and rule dependencies. A changed answer invalidates the dependent nodes. Independent nodes remain valid.

The graph produces a trace that the UI can explain. A trace shows the inputs, rule, operation, rounding, and result without exposing internal library objects.

### Regime comparison stays separate from filing choice

When the available facts permit both computations, OpenITR calculates the old-regime and new-regime results before the user selects the filing regime. The final ITR projection uses the explicit selection.

The comparison cannot silently change an accepted fact or select a regime.

## Analytics

Analytics consumes accepted facts and completed computation traces. It produces read-only insights.

The first categories are:

- Income composition.
- Taxable income and total tax liability.
- Taxes paid, refund, or amount payable.
- Old-regime and new-regime comparison.
- Source mismatches and missing evidence.
- Deductions included in the current return.
- Planning observations for a future financial year.

An insight states whether it concerns the current filing or future planning. A planning insight cannot present a completed financial-year action as still available.

Every numeric insight links to the same derived value used by the preparation report. The UI does not recalculate a total for display.

## Government JSON export

### Projection occurs last

The return module projects canonical facts and derived values into the AY 2026-27 ITR-1 shape after computation. Document adapters never populate government JSON directly.

This order isolates annual schema churn inside the return module.

### Validation has distinct layers

OpenITR runs these validation layers:

1. Domain completeness checks confirm that required facts have provenance.
2. Computation invariants confirm internal totals and dependencies.
3. The official JSON Schema validates structure and field constraints.
4. Published validation rules check cross-field and filing conditions.
5. Export-readiness checks confirm producer metadata and digest requirements.

Ajv with `ajv-draft-04` validates the official schema. The validator does not coerce types, remove properties, or apply defaults.

The [AY 2026-27 ITR-1 validation document](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-05/CBDT_e-Filing_ITR%201_Validation%20Rules_AY%202026-27.pdf) is an official source for the published validation layer.

### Export readiness is explicit

The preparation report records one of these states:

- `analysis-ready`: computation and analytics are available.
- `locally-valid`: the candidate JSON passes all available local checks.
- `government-export-ready`: local checks pass and producer metadata requirements are satisfied.
- `blocked`: at least one blocking issue prevents the requested artifact.

`locally-valid` does not imply portal acceptance.

An ineligible ITR-1 situation can remain `analysis-ready`, but it cannot become `government-export-ready`. An unsupported document blocks export only when its unresolved facts remain necessary.

### Download stays local

Only a `government-export-ready` report enables the public JSON download. The browser serializes the candidate JSON to a `Blob`, creates an object URL, triggers the user download, and revokes the URL.

Development and parity tests can inspect candidate JSON before that gate opens. The public analysis preview cannot download or describe the candidate as a portal artifact.

OpenITR records no copy in browser storage. The downloaded file belongs to the user and remains on the user's device.

## Session and storage

### Session state lives in memory

The XState actor owns the current session. React views subscribe to actor snapshots.

OpenITR stores no taxpayer session in `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, or a service worker. A refresh destroys the application state and releases its references to selected files.

The browser or operating system may retain memory pages or downloaded files outside OpenITR's control. The privacy statement describes this limit plainly.

### Rule assets may use normal HTTP caching

Hashed application assets, fonts, parser workers, and immutable rule packs contain no taxpayer data. The static host can cache them with immutable cache headers.

The HTML entry point and release manifest use revalidation so a new visit can discover a new application build.

### Sessions do not cross tabs

OpenITR creates one isolated session per tab. It uses no broadcast channel or shared worker to move taxpayer data between tabs.

## Security architecture

### Network isolation

The production build self-hosts scripts, styles, fonts, icons, workers, and rule assets. It loads no analytics pixel, advertising script, remote font, tag manager, or error-reporting client.

The Content Security Policy permits only required same-origin assets. It blocks forms, framing, object embedding, and unexpected network connections.

Automated browser tests record every request after page load. The tests fail when a selected file, file hash, PAN-like value, or known fixture value appears in a request.

### Untrusted document isolation

Parser work runs in dedicated workers. Intake limits memory and expansion before extraction. The application terminates a worker after completion, cancellation, timeout, or failure.

The application never executes spreadsheet macros, PDF scripts, embedded JavaScript, document actions, or formulas by default.

The UI renders extracted text as text. It does not inject document text as HTML.

### Sensitive logs are absent

Production code does not log document text, file names, PAN values, answers, observations, facts, or JSON payloads. Unexpected failures use stable error codes.

The application has no remote log destination. Development fixtures use synthetic identities.

### Supply-chain controls

The repository pins dependency versions and lockfile integrity values. CI checks licenses, known vulnerabilities, provenance when available, and unexpected dependency changes.

Each release generates a software bill of materials and `THIRD_PARTY_NOTICES`. A dependency with an unknown or unapproved license blocks the release.

## Performance architecture

### Main-thread work stays small

PDF parsing, workbook parsing, hashing, and tax preparation run outside the React render path. Parser and preparation workers send typed messages with progress and cancellation support. The release-time process compiles rule packs before deployment.

### Code loads by need

The initial bundle contains the application shell and first-screen UI. Vite creates lazy chunks for PDF parsing, spreadsheet parsing, the selected return module, and large rule assets.

The browser loads only the parser required by the selected files.

### Memory has an owner

The session owns `File` references. A worker receives bytes only when processing starts. The system avoids simultaneous full copies where browser interfaces permit transfer or streaming.

After extraction, the adapter retains observations and evidence locators rather than a second parsed document model. The evidence viewer reparses or renders a page on demand when retaining the model would exceed the memory policy.

### Work can stop

Every long operation supports cancellation. Navigating back, removing a document, refreshing the page, or ending the session terminates the related worker and revokes object URLs.

## UI architecture

### Design system

The UI uses PatternFly 6 React modules. It self-hosts Red Hat Display, Red Hat Text, and Red Hat Mono under the SIL Open Font License 1.1.

OpenITR uses its own name, logo, and brand assets. The visual direction follows OpenShift console patterns without copying Red Hat or OpenShift branding.

### Application frame

The desktop frame contains:

- A dark masthead with the OpenITR identity and session actions.
- A dark left workflow rail with step status.
- A page title and task-specific content area.
- Square cards, inputs, alerts, drawers, and dialogs.
- A right evidence drawer for document provenance.

PatternFly tokens provide color, spacing, typography, and focus behavior. A small OpenITR theme layer sets the approved square-corner treatment and product colors.

### Workflow status

Each workflow step reports `not-started`, `in-progress`, `complete`, `blocked`, or `needs-review`. Color never carries the status alone.

A blocked step states the issue and the next available action. The workflow rail always shows the current step and completed steps.

### Evidence review

Selecting a fact opens its evidence. The evidence view highlights the source page region, spreadsheet cell, JSON pointer, or CSV record.

The view also shows the adapter version, transformation, related observations, answer, resolution, and derived values.

### View state and domain state stay separate

React owns temporary view state such as an open drawer or selected tab. The session actor owns workflow and taxpayer state. The preparation report owns tax results.

A React component does not calculate a tax amount or decide whether a fact is valid.

### Accessibility

OpenITR uses WCAG 2.2 AA as its engineering reference without making a formal conformance claim in v1. Keyboard navigation, visible focus, semantic headings, form labels, error association, contrast, accessible status messages, automated checks, and one screen-reader smoke test of the critical filing path are release requirements.

Square styling cannot remove focus indicators or reduce target sizes.

## Technology choices

| Concern | Choice | Architectural role |
| --- | --- | --- |
| Language | TypeScript in strict mode | Shared types and pure domain code |
| UI runtime | React 19 | Browser views |
| Design system | PatternFly 6 | Accessible enterprise UI patterns |
| Workflow | XState 5 | Explicit session states and transitions |
| Build | Vite | Static bundles, lazy chunks, and workers |
| Workspace | pnpm workspaces | Package isolation and one lockfile |
| PDF parser | PDF.js | Local PDF parsing and rendering |
| Spreadsheet parser | SheetJS Community Edition | Local XLS and XLSX parsing |
| Government schema validator | Ajv with `ajv-draft-04` | Draft 04 validation without mutation |
| Exact arithmetic | `decimal.js` | Exact decimal operations and explicit rounding |
| Hashing | Web Crypto SHA-256 | File and rule-asset identities |
| Unit and property tests | Vitest and fast-check | Pure rule and invariant verification |
| Browser tests | Playwright | Cross-browser workflow, privacy, and download tests |

Exact package versions belong to the lockfile and dependency policy. The architecture names package families, not permanent versions.

## License policy

OpenITR may use dependencies under these permissive licenses:

- MIT.
- Apache-2.0.
- BSD-2-Clause.
- BSD-3-Clause.
- ISC.
- SIL-OFL-1.1 for fonts.

Any license outside this allowlist blocks the release until the project changes the policy. The release rejects GPL, AGPL, SSPL, BUSL, Commons Clause, unlicensed packages, and packages with an unknown license.

OpenITR can publish its own code under the MIT License. Dependencies retain their licenses and required notices.

PDF.js and SheetJS Community Edition use Apache-2.0. Red Hat fonts use SIL-OFL-1.1. These licenses fall inside the accepted allowlist.

## Proposed repository structure

The target repository structure is:

```text
openitr/
├── AGENTS.md
├── ARCHITECTURE.md
├── CONTEXT.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   └── web/
│       ├── public/
│       │   └── fonts/
│       └── src/
│           ├── app/
│           ├── session/
│           ├── views/
│           ├── workers/
│           └── main.tsx
├── packages/
│   ├── model/
│   │   └── src/
│   │       ├── documents/
│   │       ├── facts/
│   │       ├── issues/
│   │       ├── money/
│   │       ├── provenance/
│   │       ├── rules/
│   │       └── reports/
│   ├── engine/
│   │   └── src/
│   │       ├── assembly/
│   │       ├── computation/
│   │       ├── reconciliation/
│   │       └── prepare-return.ts
│   ├── document-adapters/
│   │   ├── prefilled-json/
│   │   ├── form16/
│   │   ├── form16a/
│   │   ├── ais/
│   │   ├── form26as/
│   │   ├── epay-tax/
│   │   └── registry.generated.ts
│   ├── return-modules/
│   │   ├── itr1/
│   │   │   └── ay2026-27/
│   │   │       ├── manifest.ts
│   │   │       ├── official-sources.json
│   │   │       ├── applicability.ts
│   │   │       ├── questions.ts
│   │   │       ├── facts.ts
│   │   │       ├── rules/
│   │   │       ├── computations/
│   │   │       ├── validations/
│   │   │       ├── insights/
│   │   │       ├── government-json/
│   │   │       └── fixtures/
│   │   └── registry.generated.ts
│   └── ui/
│       └── src/
│           ├── evidence/
│           ├── layout/
│           ├── review/
│           ├── theme/
│           └── workflow/
├── tools/
│   ├── rulepack-compiler/
│   ├── source-audit/
│   └── license-audit/
├── tests/
│   ├── browser/
│   ├── determinism/
│   ├── integration/
│   ├── parity/
│   └── privacy/
└── docs/
    └── adr/
```

This tree is a target architecture, not the current filesystem. Create a directory only when its module has an implementation or an accepted document to contain.

The target `CONTEXT.md` contains the domain glossary without implementation details. The target `docs/adr` directory contains only decisions that are hard to reverse, surprising without context, and based on a real trade-off.

## Verification architecture

### Document-adapter fixtures

Each adapter has positive, negative, ambiguous, damaged, encrypted, and changed-template fixtures. Positive fixtures assert observations and evidence locators. Negative fixtures assert stable issue codes.

Fixtures use synthetic or legally redistributable data. The repository contains no real taxpayer files or identifiers.

### Rule tests

Each rule has examples at its thresholds and on both sides of each threshold. Property tests cover invariants such as nonnegative totals, reconciliation identities, and rounding behavior.

A changed rule requires changed fixtures or a new fixture. A source-only change that produces no executable difference requires an explicit review record.

### Determinism tests

A replay test runs the same preparation twice with identical identities. It compares the preparation reports after excluding no fields because execution context is an explicit input.

The test also changes one input at a time and checks that the provenance graph identifies the affected results.

### Government parity tests

Parity tests compare supported synthetic cases with the current official utility when the utility permits a reliable comparison. A parity mismatch blocks release until the project explains and resolves the difference.

Local parity cannot prove that a government portal database check will pass.

### Privacy tests

Browser tests select sentinel documents and monitor network activity. A test fails if a request contains a sentinel byte sequence, file name, extracted value, answer, or identifier.

Static analysis rejects browser-storage calls outside an approved asset-cache module. The first release has no such module for taxpayer state.

### Schema tests

The official schema fixtures confirm that Ajv uses draft 04 behavior and does not apply defaults, coerce values, or remove fields.

### Independent review

The analysis preview can ship after the automated preview gates pass. A stable upload-ready release also requires a qualified second human to review the tax rules, published validations, representative calculations, and government JSON export.

## Error handling

Expected taxpayer and document problems become typed issues. Unexpected programming failures remain distinct.

The main issue families are:

- `FILE_*` for intake and encryption failures.
- `DOCUMENT_*` for detection and extraction failures.
- `FACT_*` for missing and conflicting facts.
- `QUESTION_*` for incomplete or invalid answers.
- `RULE_*` for computation and applicability failures.
- `SCHEMA_*` for official schema failures.
- `VALIDATION_*` for published rule failures.
- `EXPORT_*` for producer metadata and serialization failures.
- `EXTERNAL_*` for checks that only the government portal can perform.

An expected issue includes a recovery action. An unexpected failure ends the affected operation and shows a stable incident code. The production build sends no automatic error report.

## Static deployment

Vite produces a static `dist` directory. A CDN or static host serves that directory without an application server.

The deployment uses:

- TLS only.
- Immutable caching for content-hashed scripts, workers, fonts, and rule packs.
- Revalidation for the HTML entry point and release manifest.
- A strict Content Security Policy.
- `X-Content-Type-Options: nosniff`.
- A restrictive referrer policy.
- Frame protection through Content Security Policy.
- No service worker in the first release.

The application loads a release manifest, pins a return-module hash for the session, and then starts the workflow. A deployment cannot replace the pinned module inside an active tab.

## Architectural decisions

| Decision | Reason | Consequence |
| --- | --- | --- |
| Static browser application | Taxpayer files can remain local | Live portal checks and server-side recovery are unavailable |
| Progressive questionnaire | Documents can answer many questions | The question graph must react to extracted facts |
| Canonical tax facts | Government schemas change every year | A form-specific projection is required |
| Fail-closed document adapters | Silent extraction errors are unacceptable | Unsupported templates require new adapters |
| Immutable rule packs | Official artifacts can change after release | Sessions pin a pack and releases retain old packs |
| Pure tax engine | Determinism and testing matter more than framework convenience | Browser and UI code stay outside calculations |
| Web Workers | PDF and workbook parsing can be expensive | Worker messages require typed contracts and cancellation |
| Memory-only taxpayer state | Refresh must discard the session | Users cannot resume a lost or refreshed session |
| Build-time extension registry | Runtime code loading weakens review and security | New code extensions require a static release |
| Read-only insights | Analytics must not change a return | Filing logic stays authoritative |
| Permissive license allowlist | The chosen parsers and fonts are not all MIT | Releases must preserve third-party notices |

## Rejected alternatives

### Server-side document processing

A backend could simplify parser resource limits and portal integration. It would also receive the user's most sensitive financial documents. The first release chooses local processing and accepts browser constraints.

### Generic document extraction

A generic table detector or language model could support more layouts with less adapter work. It cannot meet the requirement to avoid guesses. OpenITR chooses reviewed document adapters and explicit unsupported results.

### Government-schema-shaped domain objects

Using the ITR-1 JSON object as the internal model would reduce the first exporter mapping. It would couple every parser and computation to one annual schema. OpenITR chooses canonical facts and a final projection.

### Mutable latest rules

A single mutable rule set would reduce retained assets. It would make an old preparation difficult to replay after a government revision. OpenITR chooses immutable, identified rule packs.

### Runtime plugin installation

Runtime plugins could add rules without a deployment. They would execute code outside the reviewed release and weaken determinism, licensing checks, and supply-chain control. OpenITR chooses build-time code extensions and data-only static rule assets.

### Up-front complete questionnaire

A complete questionnaire would simplify navigation logic. It would ask for facts that supported documents can supply and would increase duplicate entry. OpenITR chooses eligibility questions first and contextual questions after extraction.

### Persistent browser drafts

IndexedDB could support resume after refresh. It would retain taxpayer data beyond the active session and complicate the privacy claim. The first release chooses memory-only state.

## Known limits and compliance gates

- The first release supports only reviewed ITR-1 situations for FY 2025-26 and AY 2026-27.
- The initial build extracts only the accepted government and statutory document matrix. It rejects private institution templates.
- The first release rejects encrypted, damaged, image-only, and unknown-template documents.
- Local validation cannot reproduce portal database checks.
- Refreshing or closing the tab destroys the session.
- The user's downloaded JSON remains on the user's device after the session ends.
- Government export readiness depends on confirmed producer identity and digest behavior.
- The Type 3 ERI classification may apply even when OpenITR only prepares a file for manual upload. Confirm this point before a public upload-ready claim. See the [Income Tax Department ERI registration manual](https://www.incometax.gov.in/iec/foportal/help/eri/registration?mobile-app=1).

These limits are product facts. The UI and project documentation must state them without hiding them in legal text.

## Primary sources

### Income Tax Department

- [Downloads for income tax returns](https://www.incometax.gov.in/iec/foportal/downloads/income-tax-returns)
- [AY 2026-27 ITR-1 JSON schema](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-06/ITR-1_2026_Main_V1.1.json)
- [AY 2026-27 ITR-1 schema change document](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-07/ITR%201_Schema%20change%20document_AY2026-27_V1.1.pdf)
- [AY 2026-27 ITR-1 validation rules](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-05/CBDT_e-Filing_ITR%201_Validation%20Rules_AY%202026-27.pdf)
- [Identification and Generation of Applicable ITR manual](https://www.incometax.gov.in/iec/foportal/help/identification-and-generation-of-applicable-itr-individual)
- [Offline Utility for ITRs FAQ](https://www.incometax.gov.in/iec/foportal/help/offline-utility-faq)
- [ERI registration manual](https://www.incometax.gov.in/iec/foportal/help/eri/registration?mobile-app=1)
- [Annual Information Statement FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/ais%20-%20annual%20information%20statement-faqs)

### Technical foundations

- [PatternFly development documentation](https://www.patternfly.org/get-started/develop/)
- [Red Hat font source and license](https://github.com/RedHatOfficial/RedHatFont)
- [Vite production build documentation](https://vite.dev/guide/build)
- [Vite Web Worker documentation](https://vite.dev/guide/features.html#web-workers)
- [XState documentation](https://stately.ai/docs)
- [PDF.js documentation](https://mozilla.github.io/pdf.js/getting_started/)
- [SheetJS local-file documentation](https://docs.sheetjs.com/docs/demos/local/file/)
- [Ajv draft 04 adapter](https://github.com/ajv-validator/ajv-draft-04)
- [`decimal.js` source and documentation](https://github.com/MikeMcl/decimal.js/)
