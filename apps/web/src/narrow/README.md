# narrow

Audit helpers for small screens and keyboard use, with EN and FR messages.
Findings are prompts to look, not a conformance statement. A check that cannot
measure reports UNKNOWN, never a pass.

## Checks

| Check | WCAG 2.2 | Notes |
| --- | --- | --- |
| reflow | 1.4.10 | sideways scroll or boxes past the 320px edge |
| target-size | 2.5.8 | the App's own rule is 44px, stricter than the 24px minimum |
| target-spacing | 2.5.8 | 24px circle rule for targets under 24px |
| contrast | 1.4.3 | text only; background images and unresolvable backdrops are UNKNOWN |
| name, label-in-name | 4.1.2, 2.5.3 | name is an approximation of the browser's own |
| language | 3.1.1 | lang attribute present and well formed |
| focus-obscured | 2.4.11 | focus is moved to each control, then restored |
| text-spacing | 1.4.12 | adds a temporary style, reports newly clipped content |
| i18n | none | EN/FR key parity, placeholders, French typography, text identical in both |
| offline | none | needs a service worker, reloads with the network off |
| keyboard | 2.1.1, 2.1.2 | presses real Tab: trap is a failure, unreached controls and odd order are UNKNOWN |
| focus-visible | 2.4.7 | compares outline, shadow, border, colours and pseudo-elements before and after focus |
| motion | none | with reduced motion on, running animations fail; endless ones are UNKNOWN |
| static-html | several | 36 markup rules (lang, title, viewport, headings, alt, names, ids, landmarks) on a file or the live page |
| copy | none | words the App does not use in user copy fail; claims needing a person to read them are UNKNOWN |
| link-cue | 1.4.1 | an in-text link with no underline, border or weight change needs 3:1 against the text around it |
| non-text-contrast | 1.4.11 | text fields, selects and text areas: a border or fill that is 3:1 against the page |
| dragging | 2.5.7 | draggable elements are always UNKNOWN: a person must confirm a single-pointer way |
| consistency | 3.2.3 | across routes: navigation order and help placement fail; missing help, repeated titles and a changed language are UNKNOWN |
| waiver | none | problems with a waivers file: expired or malformed fail, one that matches nothing is UNKNOWN |
| external | none | outside hosts in a page, script, style sheet or worker: a third-party tile server or plain http fails; trackers, font and code CDNs and other hosts are UNKNOWN |
| manifest | none | web app manifest: name, start_url, scope, icons (192 and 512, maskable), lang, locked orientation |
| service-worker | none | worker source: fetch handler and cache fail when missing; precache, offline fallback, cache version, cleanup and error handling are UNKNOWN |
| parity | 1.3.4 | a control present in the first view and gone in another (landscape, dark...) is UNKNOWN |
| weight | none | what the page downloads and its images: a limit you set with `--max-weight-kb` fails; large pages and files are UNKNOWN; an image with no width and height fails |
| budget | none | per-check limits for teams that cannot fix everything at once |
| provenance | none | data records need source name, https URL, licence and retrieved date |

### Profiles

`--profiles all` repeats the page checks in narrow (320x640, default), landscape
(640x320), dark, reduced-motion and forced-colors. Contrast is skipped under
forced colors, where the browser picks the colours. The keyboard walk runs once.

### CI outputs, baselines and waivers

```
npx tsx apps/web/src/narrow/bin.mjs --html dist/index.html --out reports/narrow \
  --format sarif,junit --baseline narrow-baseline.json --waivers narrow-waivers.json
```

- `--format sarif,junit` writes `narrow-audit.sarif` (SARIF 2.1.0, for code
  scanning) and `narrow-audit.junit.xml` next to the JSON and HTML reports. A
  failure is an error. An UNKNOWN is a note in SARIF and a skipped test in JUnit,
  never a pass.
- `--write-baseline FILE` saves the failing keys. With `--baseline FILE` the run
  exits 1 only for failures that are not in the file, and prints what is new and
  what was fixed. Keys are route, check, rule and element id, so an element id
  that moves with the markup shows up as one fixed and one new. UNKNOWN entries
  are not hidden: `--strict-unknown` still counts them.
- `--waivers FILE` takes `{"waivers":[{"check","rule?","route?","id?","reason","expires","owner?"}]}`.
  `route` and `id` accept `*`. A reason needs 10 characters and `expires` is the
  last valid day (YYYY-MM-DD, UTC). A waiver covers failures only; it never
  touches an UNKNOWN. Waived failures stay in the report under their own heading.
  An expired or malformed waiver is a failure, and one that matches nothing is an
  UNKNOWN, so stale exceptions do not pile up.
- The in-app panel (and `selfAudit`) also lists outside hosts the live page uses. It has buttons that copy the report as JSON or SARIF. Without a
  clipboard it says so.

### Offline, hosts, budgets and history

```
npx tsx apps/web/src/narrow/bin.mjs --manifest dist/manifest.webmanifest --sw dist/sw.js \
  --scan dist/assets/app.js --scan dist/assets/app.css --html dist/index.html \
  --budget narrow-budget.json --write-budget narrow-budget.json --history reports/narrow-history.json
```

- Files-only runs need no browser. `--scan FILE` reads any text file for outside
  addresses. `--allow-host 'api.example.org'` (with `*`) skips hosts the team
  accepted; a team may allow even a known tile host on purpose, so review that list.
- In a browser run, `external` reads what the page really requested (the browser's
  resource timing list plus link, script, image and frame addresses).
- `--budget FILE` fails the run for any check over its limit, including more
  unknowns than agreed. `--write-budget FILE` writes the lower of each old limit
  and today's count, so a limit is never raised. Use the same path to ratchet.
- `--max-weight-kb N` fails a page that loads more than N kilobytes. Without it the weight check only asks for a look. Files from other hosts that hide their size count as UNKNOWN, so the total can be higher.
- `--history FILE` appends a counts-only summary and prints the change since the
  last run (`--history-max N`, default 100). A missing file starts a new one.
- With `--profiles`, `parity` compares each route's named controls in every view
  with the first. Names are compared in lower case.

### Data records (assumed shape)

The provenance check assumes `{ id, source: { name, url, licence, retrieved },
facts: { key: "yes" | "no" | "unknown" | { value, evidence } } }`. This shape is
an assumption, not read from the repo. Licences outside the built-in open list
are UNKNOWN, and `--allow-licence` adds to it. `--require-fact` fails records
that lack a key. A fact with a value but no evidence fails.

Thresholds come from WCAG 2.2 (W3C Recommendation, 2023-10-05,
https://www.w3.org/TR/WCAG22/). The report records this source and date.

## Where it is used

- `index.ts` exports everything.
- `cli.ts` runs every check over a list of routes; `bin.mjs` launches it.
- `panel.ts` exports `narrowRoute` (`/dev/narrow`), a plain-DOM panel that audits
  the current document at its current width. The shell registers this route.
- `htmllint.ts`, `copylint.ts`, `provenance.ts`: pure checks on strings and
  records. The CLI runs them on files with no browser (`--html`, `--data`), and
  `selfAudit` runs them on the live page.
- `gate.test.ts` and `e2e.test.ts` fail the test run on any finding in this
  folder's own pages. `e2e.test.ts` needs `NARROW_E2E=1` and a Chromium.
- `report.ts` writes text, JSON and an HTML report (320px safe, 44px buttons).

## CI gate


`apps/web/e2e/narrow-audit.spec.ts` visits every `ROUTES` entry from
`apps/web/e2e/shell-routes.ts` at 320px wide, in English and in French. Any
reflow or sub-44px target finding fails CI unless it is listed in
`NARROW_ALLOWLIST` in `allowlist.ts`, with a route, kind, id fragment, and
reason. Prefer fixing the layout. An empty allowlist means every finding fails.

## Run

```
npx tsx apps/web/src/narrow/bin.mjs --base-url http://localhost:5173 \
  --route / --route /map --offline --lang fr --out reports/narrow \
  --en src/i18n/en.json --fr src/i18n/fr.json
```

Files alone need no browser:

```
npx tsx apps/web/src/narrow/bin.mjs --html dist/index.html --data data/places.json \
  --allow-licence ODbL-1.0 --require-fact stepFree
```

Exit code 0 when no check failed, 1 when one failed, 2 on a usage or run error.
`--strict-unknown` also fails on UNKNOWN. Needs `playwright-core` or
`@playwright/test` and a Chromium.

## Limits

- Contrast is UNKNOWN where no ancestor has an opaque background. Set a
  background on the root element to get a verdict.
- A box in its own scroll container (a wide table) is still reported by reflow.
- Elements that are hidden or have no size are counted as "not measured".
- Focus is moved to up to 60 controls per route; focus and scroll are restored.
- Offline needs a service worker; browsers without one give UNKNOWN.
- The keyboard walk uses at most 80 Tab presses (`--keyboard-max`). Reading order
  is a heuristic and only ever UNKNOWN.
- The focus-visible check sees a change, not whether the change is easy to see.
- The copy check cannot judge meaning. A clean result is not a content review.
- Nothing here is registered in the app shell or a CI workflow. Those live
  outside this folder and need a line each: mount `narrowRoute`, and run the CLI.
- Cross-page checks need two or more routes in one run. They compare the first
  profile of each route. Help is found by words (help, aide, support, contact),
  so a help link with other wording is not seen.
- The link check reads colours and a few cues, not hover or focus styles.
- The field check looks at text fields, selects and text areas. Checkboxes,
  radio buttons and icon buttons are not measured.
- Service worker and host scans read text. A worker built by a library may look
  incomplete, and an address put together at run time is not seen. A tile server
  that is not on the built-in list is only an UNKNOWN `other` host.
- The manifest check does not fetch icons, so it cannot tell if a file exists or
  has the size it claims.
- Only the first 3000 elements of a page are read.
