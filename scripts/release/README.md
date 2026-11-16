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

The root `npm run verify` can invoke `npm run verify --prefix scripts/release`
after the build. That requires an edit to the root `package.json`, which is
outside this lane's permitted `scripts/release/**` scope. The scoped npm
`verify` entry point and tests are functional without that edit; root-level
wiring must be completed by the integrator.

## P19C: artifact integrity audit

The scoped `npm run verify --prefix scripts/release` now also executes
`audit.mjs` after the original size and forbidden-text checker. No packages,
network requests, or build-time downloads are required. The module imported
by the command is `site-audit.mjs`, which is also exercised by Node tests.

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
and device checks. A valid open-licence identifier is also not a substitute
for checking attribution and database licence obligations before redistribution.

### Root integration boundary

This lane retains the `scripts/release/**` scope. The root `package.json`
remains untouched, so the repository's root-level `npm run verify` does not
become wired automatically. A repository integrator must call the scoped
`npm run verify --prefix scripts/release` from an existing CI job after
building `apps/web/dist`, or add it to the root verify script in a separate
appropriately scoped change.

## P19D: deeper offline, interaction, locale and evidence gates

The scoped release job now runs `deep-audit.mjs` after `check.mjs` and
`audit.mjs`. All four new audit libraries are imported by this executable;
`npm run verify --prefix scripts/release` therefore exercises the checks on
the built `apps/web/dist` tree, and `npm run test --prefix scripts/release`
runs their regression suites. No network calls, external packages, fixture
datasets or lockfiles are involved.

```sh
node scripts/release/deep-audit.mjs --dir apps/web/dist
node scripts/release/deep-audit.mjs --dir apps/web/dist --max-files 100000
npm run test --prefix scripts/release
```

### Packaged offline dependencies

The offline gate follows HTML script, stylesheet, image, source, audio,
video, icon and preload references. It also scans CSS `url()` and `@import`
assets, checks the local manifest name, short name, icons, start file and
shortcuts, and inspects explicitly declared service-worker precache arrays.
References leaving the release root, unshipped local assets and remote
blocking dependencies fail. Ordinary outbound links are allowed. JavaScript
runtime requests and dynamic precache expressions cannot be established
statically; they need device-level offline scenarios with network disabled.

### Interaction and target declarations

The interaction gate catches duplicate IDs, broken label and ARIA references,
inputs without explicit programmatic names, invalid ARIA state values,
positive `tabindex`, conflicting focus declarations, zoom-disabled viewports,
unsafe new-window links and duplicate main landmarks. The CSS gate catches
explicit interactive selectors that constrain **both** dimensions below
44 px, global focus-outline removal, body text-selection suppression and
unguarded smooth scrolling. A CSS icon's width is not assumed to be the
size of its actual hit area. The static checks do **not** measure computed
hit boxes, keyboard functionality or screen-reader behaviour; maintain
browser and device checks for WCAG 2.2 AA.

### EN/FR messages and release evidence

Translation pairs under `en`/`fr`, plus named `messages.json` or
`translations.json` catalogues, must have both nonempty languages. Named
catalogues also enforce equal message keys and placeholder sets. Explicit
French strings are checked for typographic apostrophes, nonbreaking spaces
before colons and narrow nonbreaking spaces before semicolons, exclamation
and question marks, and inside guillemets. Static HTML text is checked
without reading inline script/style content. Unsupported marketing claims
in explicit user strings fail the build.

Recognised location collections are checked for explicit YES/NO access
states. Such states need a named source, accepted open licence identifier
and actual ISO calendar date, either on the claim or an appropriate owner.
UNKNOWN remains UNKNOWN and may lack evidence. Numeric measurements, absent
fields and unrelated JSON values are not promoted to accessibility claims.
Open-licence identifiers do not remove the need to meet attribution and
share-alike obligations in the published materials.

### Known integration boundary

Only `scripts/release/**` is modified. The checks are **live in the scoped
release npm verify job**, not in a user-facing route. The repository's root
`npm run verify` or CI workflow must explicitly invoke this scoped command
after building; wiring the root entry point requires a separately authorised
change outside this lane. A missing release directory produces a nonzero
exit status, as do detected violations.

## P19 next round: route, privacy, semantics and record integrity

The existing scoped release command imports four additional checks through
`deep-audit.mjs`. These modules are active for every packaged HTML document,
JavaScript module, JSON file and optional `_headers` artifact. All checks
produce blocking findings rather than being an unused report. The test suite
covers both compliant and noncompliant fixtures and exercises the command's
exit status on a failing artifact.

The navigation gate checks explicit local HTML links, cross-document fragment
IDs, unsafe URL schemes, form targets and mutually linked English/French
alternate pages. Extensionless routes are not presumed missing: the router may
supply them at runtime. Pages with no alternates are not presumed to have a
missing translation, while pages that advertise alternatives must provide both
languages and reciprocal references.

The privacy gate checks remote scripts, embedded frames, outgoing forms,
connection hints, tracking endpoints, dynamic JavaScript execution, cookie
assignments and restrictive header declarations. The script observations API
also counts storage, navigation and generated markup operations without
mistaking their presence alone for a disclosure. It uses only standard Node
APIs; the command makes no network calls.

The semantics gate catches contradictory native and ARIA states, invalid
numeric control bounds, missing description references, unlabelled dialog
roles, impossible progress values, silenced status regions, invalid table
headers and focusable hidden graphics. These are structural checks, not a
substitute for keyboard, screen-reader, zoom, colour-contrast or computed
44 px target measurements on devices and browsers.

The content gate preserves `UNKNOWN` and rejects boolean or ambiguous access
claims. Explicit YES/NO claims require source, open licence and calendar date
information on the claim or owner. The gate also catches repeated place IDs,
contradictory UNKNOWN flags and invalid attributed credits. No source data is
fetched, transformed or silently promoted to an accessibility assertion.

Run the scoped checks after producing the site distribution:

```sh
npm test --prefix scripts/release
npm run verify --prefix scripts/release
```

The root npm command and external CI workflow remain outside this lane's
permitted directory. Those entry points must invoke this existing scoped job
through a separately authorised repository change; nothing in this patch
asserts that the root job already does so.

## P19: asset, export, media and map release gates

The existing scoped release npm command imports the following additional
artifact-level modules through `deep-audit.mjs`. Each is active when its file
kind appears in the built release. They are also covered by the Node test
runner and integration tests that assert a nonzero exit status on violations.
No outside service, package, lockfile, cron task or network request is used.

- `svg-audit.mjs`: checks informative SVG accessible names, decorative focus
  handling, event handlers, active SVG content, internal reference IDs,
  prohibited remote dependencies, and embedded SVG markup in HTML.
- `table-audit.mjs`: checks data-table captions, header associations, scope,
  cell spans, sorting state and focus order; presentation tables cannot
  silently hide interactive content.
- `download-audit.mjs`: checks locally shipped download destinations, filename
  and extension safety, and bilingual export inventories with source, open
  licence and valid calendar date. Released CSV files are inspected for
  structural integrity, duplicate headings and formula-like cell content.
- `geo-audit.mjs`: checks emitted GeoJSON coordinate bounds, geometries,
  polygon closure, feature identifiers and evidence attached to explicit
  access states. Geometry and numeric measurements never imply access.
- `media-audit.mjs`: checks native playback controls, no automatic playback,
  bundled media and caption dependencies, EN/FR video tracks, names for video
  players, and structural WebVTT captions.

Run the release tests independently of a built app:

```sh
npm test --prefix scripts/release
```

After building `apps/web/dist`, run the complete scoped release pipeline:

```sh
npm run verify --prefix scripts/release
```

The checks operate on emitted static bytes. They do not execute application
JavaScript, calculate browser hitboxes, assess the meaning of captions,
inspect PDF content, or establish device-level WCAG 2.2 AA compliance.
Continue keyboard, screen-reader, offline airplane-mode, zoom, 44 px target,
caption-quality and bilingual usability testing on representative devices.
A root npm or CI entry point must invoke this scoped command in a separately
permitted repository change; this patch touches only `scripts/release/**`.

## Standalone current-main integration

Copy the complete files from this package into the same repository paths.
The root `verify` command calls this scoped suite after building.
The release scan deliberately fails when a shipped file contains prohibited
French confirmation wording; no copy is rewritten silently.
Path safety checks use character code inspection instead of control-character
regular-expression classes, remaining compatible with `no-control-regex`.

## JavaScript shipped-copy check

`bundle-copy.mjs` inspects JavaScript string tokens rather than confusing
runtime field identifiers, comments or regular-expression source with
visible interface text. English and French strings are both examined;
unsupported wording in an actual label or message fails the release job.
Legacy technical status tokens are kept as schema compatibility values,
not as statements about any location. Raw HTML, JSON and other text files
retain the whole-file check. UTF-8 and U+FFFD checks remain unconditional.
`bundle-copy.test.mjs` includes positive and negative regression cases and
runs from the scoped release test command.

## P19H complete-file deployment on current main

The root npm command invokes the release Node test suite and four
artifact checks after a normal web build. CI invokes the root command
after building. The policy gate rejects scheduled workflow declarations,
missing checks, and fail-open command wiring. These modules require
no third-party runtime package. The app bundle remains subject to the
wording and UTF-8 gates; they are not bypassed for a failing build.

## Pinned module display text before the web build

The root `build`, `pretest`, and `pretypecheck` scripts invoke
`node scripts/release/prepare-copy.mjs --root .` immediately after copying
pinned modules. Only TS/TSX/JS/JSX/MJS source literals under `.lanes/` are
updated, and only when they contain known EN/FR display wording. The source
checker leaves technical data identifiers, status values, JSON schemas,
comments, test files and the original upstream repositories untouched.
The transform is deterministic and a second run makes no changes.
Symlinks, oversized source files and invalid text are refused. If no pinned
sources have been fetched, the preparation step is a no-op; the existing
Vite aliases and fallbacks remain responsible for missing modules.
The final built artifacts are still scanned independently by `check.mjs`.
Passing this preparatory step alone is not evidence that shipped strings pass
or that the application builds successfully.

## Static JSX copy and imported paths

The source preparation step also handles plain text in paired TSX/JSX tags
for headings, paragraphs, table cells, labels, buttons, and native form text.
It does not edit JSX expressions, attributes as markup, comments, unpaired
nodes, or computed strings. Quoted attributes are handled by the existing
string pass. This deliberately limited transformation does not replace the
built-artifact gate. Module specifiers, absolute and relative paths, URLs,
selectors, and schema/status identifiers are kept intact; tests exercise
those exemptions so text changes cannot silently break imports.

## Shared organisation-name policy

The release checker imports `forbiddenOrgNeedles()` from
`packages/shared/test/forbiddenOrg.ts`. That shared helper is the only
source of the organisation-name needles; release code and tests do not
reconstruct them. The root and scoped npm scripts use Node 22's
`--experimental-strip-types` option so the check can import the existing
TypeScript helper without adding a parallel implementation. All returned
needles are exercised by fail-closed regression tests against emitted text.

The root `npm run verify` runs the release test suite and invokes the
checker after a production build. This is a static artifact gate, not a
substitute for browser accessibility and offline tests.

## Copied-source gate

The root `build` and `prebuild` scripts run `prepare-copy.mjs` after local
module synchronisation. It changes only display literals in local pinned
source copies, not upstream repositories, protocol values, or generated files.
`copy-source-audit.mjs` then rejects unresolved human-readable claims with
repository-relative locations. Missing `.lanes` copies are permitted where
the shell intentionally uses fallbacks; present copies are always scanned.
This gate does not substitute for the built-asset text and byte-budget check.
The organisation-name denylist comes exclusively from the existing shared
`forbiddenOrgNeedles()` helper, without duplicate definitions.
