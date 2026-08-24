# Add a cited rule-pack revision

This tutorial adds one cited rule to the ITR-1 AY 2026-27 module and ships it as a new immutable rule-pack revision. It follows the change that added revision `2026-08-24` with the rule `ITR1-NR-SURCHARGE-MARGINAL-RELIEF`. Every path and symbol below exists in this repository, so you can read the finished example beside each step.

You will touch one module directory, the release manifest, and nothing else.

## Before you start

Confirm the change belongs in a rule pack at all:

- The rule derives a value, decides applicability, asks a question, or validates a result.
- An official artifact states the rule. A blog post, forum answer, or utility behavior does not qualify as the citation.
- No new calculation shape is needed. If the rule needs a new parser, schedule, or form, stop and discuss a normal application release instead; declarative rule packs cannot carry executable code.

## 1. Create the revision directory

Create `packages/tax-analysis-modules/itr1-ay2026-27/src/revisions/<revision-date>/` where `<revision-date>` is today's date in `YYYY-MM-DD` form. Revisions are immutable once registered, so each one lives in its own dated directory.

## 2. Write the manifest

Copy `packages/tax-analysis-modules/itr1-ay2026-27/src/manifest.ts`, the previous revision's manifest, into your new directory as `manifest.ts`. Then make exactly these changes:

1. Set `rulePackId` to `<module-id>.<revision-date>`, for example `itr1-ay2026-27.2026-08-24`.
2. Set `packRevision` to the same revision date.
3. Add the rule record under `supportedRules`:

```ts
Object.freeze({
	id: "ITR1-NR-SURCHARGE-MARGINAL-RELIEF",
	citation:
		"Income-tax Act, 1961, marginal relief limiting the surcharge where total income marginally exceeds a surcharge threshold",
	sourceId: "income-tax-act-1961",
	sourceLocation: "Annual rate schedule read with section 115BAC(1B)",
}),
```

The `id` matches `parseRuleId`: uppercase letters, digits, and hyphens, starting with a letter. Write the `citation` as a sentence a reviewer can check against the source. Point `sourceLocation` at the page, section, table, or clause inside that source.

4. Leave every other record alone. Do not reorder fields, reword old citations, or refresh unrelated checksums. Any byte you change moves `compiledPackSha256` and makes review harder.

If your rule cites an official artifact that no earlier manifest declares, add a record to `officialSources` too:

```ts
Object.freeze({
	id: "cbdt-notification-99-2099",
	title: "Notification No. 99/2099, G.S.R. 999(E)",
	authority: "Central Board of Direct Taxes, Ministry of Finance, Government of India",
	url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2099-01/Notification%20No.99_2099.pdf",
	releaseDate: "2098-12-31",
	retrievedDate: "2099-01-01",
	contentSha256: "<64 lowercase hex characters>",
	redistributionStatus: "not-redistributed",
}),
```

Capture `contentSha256` yourself: download the official file, run `shasum -a 256 <file>`, and paste the digest. Keep every field; the compiler rejects records with an http URL, a non-ISO date, or a malformed checksum. Record the retrieval date of your own download, not anyone else's.

## 3. Compile the pack

Create `rule-pack.ts` next to the manifest:

```ts
import { compileRulePack } from "@openitr/rulepack-compiler";
import type { ScopeRulePack } from "@openitr/model";

import { createScopeRulePack } from "../../scope-rule-pack";
import { itr1Ay202627RulePackManifest20260824 } from "./manifest";

const compiled = await compileRulePack({
	manifest: itr1Ay202627RulePackManifest20260824,
});

export const itr1Ay202627CompiledRulePack20260824 = compiled;

export const itr1Ay202627RulePack20260824: ScopeRulePack =
	createScopeRulePack({ compiled });
```

Name your exports after your own revision date. The compiler runs here, at import time, so an invalid manifest fails every test and build that touches it.

## 4. Register the revision

Open `packages/tax-analysis-modules/itr1-ay2026-27/src/tax-analysis-module.ts` and append one entry to the `revisions` array:

```ts
Object.freeze({
	identity: itr1Ay202627RulePack20260824.identity,
	load: async () => itr1Ay202627RulePack20260824,
}),
```

Keep every earlier entry. Sessions that pinned an older revision must keep loading it, and replay tests depend on it. Export your new symbols from `src/index.ts` so tests outside the package can reach them.

## 5. Pin the release

Open `apps/web/src/app/release-manifest.ts` and point `activeAnalysisRelease.rulePack` at your revision: set `id` to your `rulePackId`, set `rulePackRevision` to your date, and set `sourceManifestSha256` and `compiledPackSha256` to the digests your pack compiles to. You did not touch the source records if you followed step 2, so `sourceManifestSha256` keeps its previous value; only `compiledPackSha256` moves.

To learn the new digest, run the release gate test with any placeholder value:

```sh
pnpm test -- apps/web/src/app/release-contribution-gate.test.ts
```

The gate fails with a `checksum-mismatch` finding that prints the freshly compiled digest next to the placeholder. Paste the fresh value into the release manifest and rerun until the test passes. Determinism guarantees the value is stable.

## 6. Add fixtures

Create `fixtures.test.ts` inside your revision directory. Assert what a reviewer would otherwise take on faith. The `2026-08-24` fixture suite checks five things:

1. Membership: the contributed rule id appears in `supportedRuleIds` of the compiled pack.
2. Citation: the rule's citation resolves against the declared official source, including its exact checksum literal.
3. Reproducibility: compiling the manifest twice yields identical identities, and both match the registered identity.
4. Retention: the registry still selects every older revision, and each revision keeps its own distinct hash.
5. Unchanged behavior: the scope-check evaluation returns the same result class, issue code, and cited rule as before the bump.

Use synthetic values only. Fixed timestamps like `2099-01-01T00:00:00.000Z` are fine; real names, PANs, and employer identities are not.

For a computation-backed rule, also assert worked examples at and on both sides of each threshold, following the style of `src/computations/new-regime-salary.test.ts`.

## 7. Run the gates

Run the same commands CI runs:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

`pnpm build` scans the produced assets with the release guard and fails on any runtime-plugin or downloaded-executable-rule vector. `pnpm test` includes the contribution gate over the shipped manifests, the licence audit over the production dependency closure, and the load-time rejection of unregistered modules and packs. All four commands must pass before you open a pull request.

## What reviewers check

A pull request that adds a rule-pack revision shows diffs in exactly three places: the new revision directory, the registration entry in `tax-analysis-module.ts`, and the pin in `release-manifest.ts`. Reviewers verify the citation against the official source, the checksum capture, the fixture coverage, and the absence of unrelated edits. Anything else in the diff needs its own justification.
