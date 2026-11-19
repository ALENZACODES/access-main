# P16 — Offline discrepancy casebook, Round 30

This change adds a read-only workflow for reviewing conflicting or incomplete accessibility observations. It does not make an accessibility determination, contact publishers, change cache contents, or take action on a record. The contract separates `SUPPORTED`, `UNSUPPORTED` and `UNKNOWN`; a missing source or uncertain cache never silently becomes `SUPPORTED`.

## Modules

- `model.mjs`: bilingual EN/FR copy, source attribution, licence, collection date, source tier, cache ownership and casebook contracts. It uses the existing Round 27 evidence helpers already merged into `access-main`.
- `decisions.mjs`: explicitly dated readiness policy, conservative decisions, work queues and action suggestions. `READY` describes the publication review workflow, not the real-world usability of any location.
- `events.mjs`: event sequence, state transitions, replay and review history. The functions return proposed state transitions and do not modify records.
- `diff.mjs`: compare prior and candidate casebooks, detect evidence changes, date regression, source lineage changes and cache-resource effects.
- `export.mjs`: deterministic CSV, JSON, JSONL and review handoff outputs. CSV neutralises formula-like cells, and diagnostic summaries exclude untrusted description and URL text.
- `fixtures.node.mjs`: synthetic observations used only by tests. Other tests live alongside the modules and run with the Node test runner.

## Language and uncertainty policy

User-facing French strings must use typographic `’`, `\u00A0` before a colon, `\u202F` before semicolons, exclamation and question marks, and `\u202F` inside French quotation marks. Source files use escape sequences for no-break spacing to avoid ESLint irregular-whitespace problems. `UNKNOWN` is an explicit, stable state. An unknown case is not automatically moved to a resolved state.

## Local commands

```sh
node --test scripts/p16-casebook-round30/*.node.mjs
npm run lint
npm run typecheck
npm test
```

The complete updated root `package.json` preserves the existing `test:scripts` command and appends the five new `.node.mjs` files. No lockfiles, scheduled workflows or app configuration changes are required. The existing Round 27 helper files are already in current mainline and are intentionally not copied into this patch.

## Limits

The tool checks structural metadata and deterministic source evidence. Browser keyboard input and screen-reader speech are covered by other tests and require separate manual assessment. Source authenticity, licence applicability and real accessibility conditions require human review. Casebook exports contain pseudonymous identifiers and metadata; do not treat them as safe to publish without application-specific privacy review.
