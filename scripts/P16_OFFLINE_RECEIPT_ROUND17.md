# P16 Round 17 — offline receipt reconciliation

Base: `ALENZACODES/access-main` main commit
`69f5d2898aaf8b477ec6553fde30301752a20ad4`.

This additive chunk does not replace any merged test, route, or application
component. It adds one independent, read-only model for auditing receipts that
a caller already possesses. No data is fetched, guessed, persisted, ranked,
or elevated to a stronger tier.

## Included repository paths

- `scripts/p16-offline-receipt-round17.mjs` — pure data audit, offline-use
  eligibility, and safe issue summaries.
- `scripts/p16-offline-receipt-round17.node.mjs` — focused Node test cases.
- `scripts/P16_OFFLINE_RECEIPT_ROUND17.md` — this integration note.

The test file imports only Node's built-in assertion and test modules and the
source file listed above. The `.node.mjs` suffix deliberately keeps the Node
test runner separate from Vitest's automatic discovery. It needs no package
scripts, external dependencies, network connection, or scheduled job.

## Behaviour and boundaries

Every receipt has a language (`en` or `fr`), a stable record ID, title,
description, accessibility availability, an evidence tier, source name and
identity, source URL, attribution licence, collection date, and offline state.
Stored copies additionally supply a safe same-app path, save date, and source
collection date. Unknown availability must carry the unknown tier.

The collection audit detects duplicate language-ID pairs, missing language
counterparts when requested, conflicting cache ownership, and inconsistent
source attribution for a reused source ID. A missing French record does not
silently inherit English copy. Source metadata is never fabricated.

Offline eligibility returns a local cache key only for an internally sound
receipt with `stored` state. A stale, absent, or malformed copy stays
ineligible. This module does **not** check whether the file truly exists;
callers must separately confirm the cache asset itself is present before
showing offline content.

The source URL gate requires HTTPS without embedded credentials or fragments.
The local cache gate refuses traversal, encodings, query strings, fragments,
backslashes, empty path segments, and ASCII control characters. Control
characters are inspected by character code without control-code regex syntax.
No untrusted title, description, or URL appears in error summaries.

The caller must supply its observation date (`asOf`) when currentness matters.
The default fixed date is for deterministic fixtures, not a live-currentness
claim. The default maximum source age is 365 days and can be explicitly set.

## Focused local checks

From the repository root with Node 22 or later:

```sh
node --check scripts/p16-offline-receipt-round17.mjs
node --check scripts/p16-offline-receipt-round17.node.mjs
node --test scripts/p16-offline-receipt-round17.node.mjs
```

These checks are not a substitute for the repository's complete lint,
typecheck, build, browser tests, or manual screen-reader and switch sessions.
The existing keyboard and DOM-ID regression files remain on main unchanged.

This addition is intended to be unpacked into a fresh checkout of the base
mainline. It should not be applied by copying a stale worktree or replacing
other mainline files.
