# Release checks / Contrôles avant publication

Run `npm run verify --prefix scripts/release` after building the web app.
This runs the built-in Node tests and scans `apps/web/dist` recursively.
The checker fails closed on a missing or empty build, invalid UTF-8,
replacement characters, prohibited wording, symlinks, or a total build size
over **4,141,875 bytes**. All files count toward the budget, including binary
assets. Only known textual extensions are decoded and inspected for strings.

For a different build location or byte limit, run:

```sh
node scripts/release/check.mjs --dir path/to/dist --budget 4141875
```

## Root npm integration

The root `npm run verify` runs these checks after `npm run build`. CI calls
`npm run verify` on pull requests and on pushes to `main`.

## User-facing verification wording

The checker fails when user-facing text contains *verified*, *verify*,
*vérifié*, *vérifiée*, or *vérifier* in any ordinary form, including
"not verified", "unverified", and "verified source". Reword the App's copy
rather than weakening the check.

Source maps (`.map`) are not scanned for wording; they are still counted in
the byte budget.

The only allowlisted token is the exact machine label `PROTOTYPE-UNVERIFIED`.
Reword user copy (including About, banners, and phrases such as
"unverified records") rather than adding tokens to the allowlist.

## P19C: artifact integrity audit

The scoped `npm run verify --prefix scripts/release` now also executes
`audit.mjs` after the original size and forbidden-text checker. The root
`npm run verify` (already run by CI after the web build) uses the same
scoped verify script, so the new audit runs in CI.

```sh
node scripts/release/audit.mjs --dir apps/web/dist
node scripts/release/audit.mjs --dir apps/web/dist --max-files 100000
npm run test --prefix scripts/release
```

The audit inspects the built site, not source assumptions:

- Requires an `index.html` entry point and checks every emitted HTML document
  for an EN/FR `lang`, a title and a viewport declaration.
- Flags `<img>` elements without an `alt` attribute, image inputs without
  alternative text, unnamed iframes, hidden document roots and timed refresh.
- Confirms relative asset references in emitted HTML resolve to files in the
  release tree; query strings do not make a missing asset pass.
- Refuses symbolic links and limits file counts to avoid walking unexpected
  directory trees.
- Rejects malformed UTF-8, replacement characters and malformed JSON among
  recognised deployed text types.
- Detects explicit references to well-known remote map tile hosts in built
  text, so map tiles can be bundled locally instead.
- Requires evidence (source, a recognised open licence, ISO calendar date)
  for explicit `YES` or `NO` accessibility states in recognised JSON fields.
  An `UNKNOWN` state remains `UNKNOWN`; numerical measurements do not imply
  accessible or inaccessible conditions.

This is a conservative static pre-release check and **not** a browser-based
WCAG 2.2 AA audit. Keyboard and switch flows, screen-reader announcements,
focus management, 44 px targets, actual offline operation after installation,
and translations rendered by application JavaScript require separate runtime
and device checks.
