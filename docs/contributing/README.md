# Contributing cited revisions

OpenITR accepts two kinds of content changes, and each ships through one reviewed path:

- [Add a cited rule-pack revision](cited-rule-revision.md). A new immutable rule pack for a form and assessment year, where every executable rule cites a checksummed official source.
- [Add a document-adapter revision](document-adapter.md). Support for one more document family or template revision, with fixtures for every rejection class.

Both paths share the same rules:

1. Fixtures contain synthetic data only. The repository never stores a real taxpayer file, name, PAN-like identifier, or employer identity.
2. Official sources are recorded as metadata: URL, title, authority, release date, retrieval date, SHA-256 checksum, and redistribution status. Redistributing the artifact itself is not permitted today, so the repository keeps the metadata and never the file.
3. Every change goes through the same checks that CI runs. There is no fast path.

## The checks

| Check | What enforces it | Where it runs |
| --- | --- | --- |
| Registry membership | `auditTaxAnalysisModuleContribution` in `tools/contribution-gate`, plus the duplicate and unknown-revision rejections of `createRulePackRevisionRegistry` | `pnpm test` |
| Stable identifiers | `parseRulePackId`, `parseRuleId`, `parseSourceId`, and the other parsers in `packages/model/src/primitives.ts`; the compiler rejects anything they reject | `pnpm test` |
| Citations | The compiler refuses an empty citation, an unknown source reference, and a declared source that no rule cites | `pnpm test` |
| Checksums | Source-record SHA-256 format checks in the compiler; the gate recomputes `sourceManifestSha256` and `compiledPackSha256` from every shipped manifest and compares them with the registered identities and the release pin | `pnpm test` |
| Deterministic output | The gate compiles every manifest twice and demands identical identities; replay tests recompile the production packs and compare hashes | `pnpm test` |
| Permissive licence policy | `auditWorkspaceLicenses` walks the production dependency closure of every workspace package and fails on any licence outside MIT, 0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, and SIL-OFL for fonts | `pnpm test` |
| No unregistered runtime plugins | `loadRulePack` resolves modules through a closed static map and rejects any other id; the release pin must match the registered module hash | `pnpm test` |
| No downloaded executable rules | `tools/release-guard/scan-release.mjs` scans every built script and HTML asset for `eval(`, `new Function(`, `importScripts(`, `document.write(`, dynamic imports or workers pointing at remote URLs, and remote asset references in the entry HTML; `apps/web` runs it as part of `pnpm build` | `pnpm build` |

The example contribution in this repository is rule-pack revision `itr1-ay2026-27.2026-08-24`, which adds the cited rule `ITR1-NR-SURCHARGE-MARGINAL-RELIEF`. Its fixtures live beside it at `packages/tax-analysis-modules/itr1-ay2026-27/src/revisions/2026-08-24/fixtures.test.ts`, and the release-level proof that it passes the gates is `apps/web/src/app/release-contribution-gate.test.ts`.
