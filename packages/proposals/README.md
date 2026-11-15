# Unverified drafts

Device-only proposal review queue for the App.

**Never auto-publish. Tier 0 is invisible on place pages.**

The package does not create or modify packs, make network requests, register
accounts, submit issues, or upload contributions.

## Data lifecycle

1. A photo reference, written note, or explicitly requested structured-evidence
   suggestion can become an unverified draft.
2. Every new draft is tier 0 and has `pending` status.
3. The review queue displays pending drafts separately from place facts.
4. A person examines the evidence and supplies a written verification note.
5. Acceptance changes the stored draft to `accepted` and returns a separate
   tier 1 community contribution.
6. Rejection changes the stored draft to `rejected`; rejected drafts cannot
   become contributions.
7. Only accepted contributions are eligible for JSON file export.
8. The person decides what to do with the exported file.

Acceptance is **not publication**. Tier 1 means an unreviewed community
contribution, not evidence-backed verification at tier 2 or 3.

## Using the store

```ts
import {
  createBrowserProposalStore,
  suggestFromEvidence,
} from "@access-main/proposals";

const store = createBrowserProposalStore();

const suggestion = suggestFromEvidence({
  field: "step_free_entry",
  observation: true,
  confidence: 0.6,
});

const draft = store.create({
  target: { kind: "existing", id: "example-place" },
  field: "step_free_entry",
  suggestedValue: suggestion?.value ?? "UNKNOWN",
  evidence: [{ kind: "note", text: "Example observation." }],
  source: {
    source_id: "local-observation",
    licence: "CC0",
    retrieved_at: new Date().toISOString(),
  },
});

// Explicit action by a person, after checking the evidence:
const contribution = store.accept(
  draft.id,
  "I checked the original observation.",
);

// The separate export workflow may use this data:
const json = store.exportJSON();
```

`suggestFromEvidence` is optional and pure. It is not called on place-page
render. Its confidence is not an accessibility score. A low-confidence
observation remains `UNKNOWN`; a high-confidence suggestion is still tier 0
until a person verifies it.

The queue is displayed with:

```tsx
import { ReviewQueue } from "@access-main/proposals";

<ReviewQueue store={store} locale="en" />
```

Use `locale="fr"` for French. The queue is a separate review surface,
not a component of the place facts list.

## Provenance and separation

Draft source metadata contains a source ID, an approved open licence and a
retrieval date. Acceptance requires that metadata. The exported accessibility
field has the required `value`, `source_id`, `licence`, `retrieved_at`, and
`tier` shape, with optional `source_key`.

ODbL-derived contributions retain their ODbL licence and must remain in a
separate downstream data silo from OGL/CC contributions. ODbL share-alike
requirements apply. The package does not merge those data sets.

The package holds only local data. Photo evidence is a local handle, not
an uploaded image. It does not copy photographs into an export or process
image metadata.

## Integration and tests

The package uses existing workspace dependencies (React, TypeScript, Ajv,
Ajv formats, Vitest, Playwright and axe-core). It introduces no new dependency
or lockfile change.

Unit tests exercise tier transitions, rejection, UNKNOWN handling, provenance,
export filtering and the separation of unverified drafts from place facts.

The Playwright accessibility checks target an integrating PWA route at
`/proposals` when `PROPOSALS_TEST_URL` is set. They check English and French
at 320 and 1280 pixels. Until the shell mounts that route, they are skipped
rather than reported as passing.
