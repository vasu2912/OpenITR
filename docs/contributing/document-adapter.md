# Add a document-adapter revision

A document-adapter revision teaches OpenITR to identify one document family or one template revision exactly. This how-to adds an adapter to `packages/document-adapters` and registers it so the inspection registry discovers it. Read the [contribution rules](README.md) first: synthetic fixtures only, official or statutory sources only.

## 1. Create the adapter module

Create a directory under `packages/document-adapters/src/` named after the family, such as `form26as-excel/`. Implement the adapter factory against the interface in `src/registry.ts`:

```ts
import type {
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";

export const createForm26AsExcelAdapter = (): SourceDocumentAdapter => ({
	manifest: {
		adapterId: "form26as-excel",
		adapterVersion: "1",
		documentKind: "form26as",
		templateRevision: "<exact revision your fixtures establish>",
	} satisfies DocumentAdapterManifest,
	async inspect(input) {
		return { verdict: "no-match" };
	},
});
```

The contract leaves no room for guesses:

- `inspect` returns `exact-match` only when the bytes match the reviewed layout completely. Return `{ verdict: "no-match" }` for everything else. Never return the closest layout.
- Return `{ verdict: "rejected", rejection: "encrypted" | "damaged" | "image-only" }` when the file matches the family but cannot be read safely.
- Add `extract` only after detection works. It returns observations with evidence locators, raw representations, and transformation records, or typed rejection outcomes. An adapter never calculates tax, answers questions, or produces analysis results.
- Parser libraries stay behind the adapter boundary. Their types never appear in `SourceDocumentAdapter`.

## 2. Prove the layout with fixtures

A support claim without fixtures does not ship. Build each fixture class before wiring extraction:

- Positive: the exact current layout, asserting every observation and its evidence locator.
- Changed-template: a plausible next revision that must not exact-match.
- Ambiguous: bytes that satisfy more than one adapter's markers.
- Damaged, encrypted, image-only: rejection classes with stable issue codes.

Reuse the builders in `src/testing.ts`: `utf8Bytes`, `buildSyntheticPdf`, `corruptSyntheticPdf`, and the per-family fixture creators. Every value in a fixture is invented. Sentinel amounts such as `12,00,000` exist so privacy tests can detect leakage.

Cover both sides of each marker decision. If your detector accepts a workbook when sheet `TDS` and header cell `A1` match, add a fixture missing each one.

## 3. Register the adapter

Add your factory to `defaultAdapters()` in `packages/document-adapters/src/registry.ts`. The registry is the single discovery point; no other conditional statement changes anywhere in the repository.

Order matters only for readability. Matching runs across all adapters, so two adapters claiming the same bytes produce an `ambiguous` rejection, and your test suite must contain that case.

If your family needs a private-institution guard instead of support, add a `PrivateTemplateDetector` rather than an adapter; private templates stay rejected in v1.

## 4. Test at the registry seam

Write the suite beside your adapter and drive the real registry:

```ts
const registry = createDocumentInspectionRegistry();
const outcome = await registry.inspect({
	identity: await identityOf(bytes),
	displayName: "synthetic-form26as.xlsx",
	suppliedMediaType: "application/vnd.ms-excel",
	bytes,
});
```

Assert the identified kind, template revision, and adapter id for positives, and the exact issue code for every rejection class. Follow the existing patterns in `src/registry.test.ts`, `src/registry-rejections.test.ts`, and `src/registry-extraction.test.ts`.

## 5. Run the gates

The same commands CI runs apply here:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

An adapter adds no rule-pack content, but it ships inside the static release, so the release-guard scan and the licence audit still run over your change. If you introduced a dependency for parsing, it must carry a licence from the allowlist in [the contribution rules](README.md), or the audit fails the build.

Reviewers verify that the fixtures establish the exact layout, that unknown and ambiguous inputs fail closed, and that no parser type leaked into the model.
