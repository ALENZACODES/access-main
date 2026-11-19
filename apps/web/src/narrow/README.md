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
| static-html | several | 38 markup rules (lang, title, viewport, headings, alt, names, ids, landmarks) on a file or the live page. `change-context` (3.2.2, a select, radio or checkbox with an inline change script) and `key-handler` (2.1.4, an inline key script on the body) are UNKNOWN only |
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
| forms | 3.3.2 | a field with only a placeholder fails; an unmarked required field, an unlinked hint, a text field that wants an email or phone keyboard, and an error that is not announced are UNKNOWN |
| auth | 3.3.8 | a password field that blocks paste or turns autocomplete off fails; a missing user name field, a one-time code without autofill and any captcha are UNKNOWN |
| status | 4.1.3 | an alert or status silenced by aria-live off, and an unnamed progress bar, fail; toast-like boxes outside a live region, hidden live regions and many assertive regions are UNKNOWN |
| media | 1.4.2 | media that plays with sound by itself for more than three seconds fails; a moving video with no controls, a video with no captions track and any embedded player are UNKNOWN |
| fixed-space | none | fixed and sticky bars over half of the screen height fail, over a third are UNKNOWN (limits of this tool, not of WCAG) |
| clipping | 1.4.10 | text cut off by its own box fails; an ellipsis is UNKNOWN |
| lang-parts | 3.1.2 | a block of text that looks French on an English page (or the reverse) with no lang attribute is UNKNOWN, as is a page whose language looks wrong as a whole |
| timing | 2.2.2 | marquee and blinking text fail; a carousel with no pause control and text about a time limit are UNKNOWN (a timed meta refresh is a static-html rule) |
| purpose | 1.3.5 | an autocomplete token that contradicts the field's label fails; autocomplete off on a personal field is UNKNOWN (missing and invalid tokens are static-html rules) |
| tables | 1.3.1 | an empty header cell and header cells in a layout table fail; merged cells with no scope or id and nested tables are UNKNOWN |
| frames | 4.1.2 | a frame titled with a generic word or only its host, a canvas and an object with no name or text are UNKNOWN (a frame with no title is a static-html rule) |
| bypass | 2.4.1 | a skip link to an id that is not on the page fails; a skip link that is not the first control, ten or more links before main with no skip link, and several h1 are UNKNOWN |
| links | 2.4.4 | every finding is UNKNOWN: one name for different destinations, a new tab with no warning, a long web address as text, a file link that does not say so |
| images | 1.1.1 | an image that did not load and an alt text that is a file name fail; a generic alt, "image of", an alt that repeats its link and a very long alt are UNKNOWN |
| plain | 3.1.5 | every finding is UNKNOWN: a sentence over 30 words (35 in French), a block over 120 words, a reading level above grade 10 (English) or below 40 on the Kandel-Moles scale (French) for blocks of 40 words or more, four capital words in a row, an abbreviation that is not explained, a longer word where a plain one exists |
| locale | none | every finding is UNKNOWN: month-first or am and pm dates and times and comma-grouped numbers in French text, a currency symbol first in French, day-first dates, decimal commas and a currency symbol last in English text, and any date that reads two ways |
| sensory | 1.3.3 | every finding is UNKNOWN: an instruction that points at a colour, shape, place, size or sound ("the green button", "the menu on the left", "when you hear the beep"); a sentence that also quotes the label is left alone |
| headings | 2.4.6, 2.4.2 | every finding is UNKNOWN: a heading that is a placeholder or only numbers, one that repeats on the page, over 14 words, that ends in a full stop or is all capitals; a placeholder page title, and a title that shares no word with the main heading (an empty heading and a missing title are static-html rules) |
| handlers | 2.1.1, 2.5.2 | every finding is UNKNOWN, read from inline attributes only: a click handler on an element the keyboard cannot reach or with no key handler, a handler that acts when the pointer goes down, a hover handler with no focus handler, a double click, a title that holds words the text does not (handlers added by script are not seen) |
| typography | 1.4.8 | good practice, not conformance (the criterion is level AAA); every finding is UNKNOWN: text under 12px, justified text, lines over 80 characters, line spacing under 1.2, an italic passage of 40 words or more |
| order | 1.3.2, 2.4.3 | a flex container in row-reverse or column-reverse, or children moved with order, are UNKNOWN; the message counts the focusable controls inside |
| generated | 1.3.1 | words or an icon font glyph added with content on ::before or ::after are UNKNOWN |
| lookalike | 1.3.1 | every finding is UNKNOWN, read from the markup: a paragraph that holds only a short bold line (looks like a heading), three or more paragraphs or lines that start with bullets or numbers (look like a list), an empty paragraph used as space |
| regions | 1.3.1 | text blocks and controls with no landmark above them are UNKNOWN, and only when the page has at least one landmark (a page with none is the static-html rule) |
| text-zoom | 1.4.4 | a box that starts to cut text off when the base text size is doubled fails; text sized in px does not follow the base size, so a clean result is not a pass |
| aria | 4.1.2 | read from the markup: a role that does not exist, an abstract role, a misspelled aria attribute, a value outside the allowed list, a role with a required state missing, a role outside the container it needs and a hidden body fail; a role the element already has, a presentation role on something focusable and a name on a plain div or span are UNKNOWN (with aria-owns on the page, a missing container is UNKNOWN too) |
| references | 1.3.1 | read from the markup: a link to an id that is not on the page, a headers, list, form or usemap attribute that names nothing, an ARIA relation to a missing id and a label that points to something that cannot take one fail; aria-controls to a missing id and two labels for one field are UNKNOWN (skip links belong to bypass; aria-labelledby and aria-describedby are static-html rules) |
| hrefs | 2.4.4 | read from the markup: a tel or mailto link that is not well formed fails (the format is not a WCAG matter); a script in the href, an empty or lone-hash href, an anchor with words and no href, and an image link beside a text link to the same place are UNKNOWN |
| css | 2.4.7 | every finding is UNKNOWN, read from style elements and style attributes only (linked style sheets are not read, nothing is applied): a focus rule that removes the outline and draws nothing, an outline removed in every state, spacing properties marked important (1.4.12), a page hidden or turned inside an orientation query (1.3.4), motion with no reduced-motion block, overflow hidden on the whole page (1.4.10), and pinch zoom or text enlargement switched off (1.4.4) |
| obsolete | 1.3.1 | read from the markup: a server-side image map fails (2.1.1); font, center and other obsolete elements, frame sets, align, bgcolor, nowrap and fixed table widths, underlined text that is not a link, and del, s, ins and mark, which most screen readers do not announce, are UNKNOWN |
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
- `--only CHECK,...` runs only the named checks and `--skip CHECK,...` switches
  some off. The report lists what did not run, in the text, the page and the JSON,
  so a clean result is never read as clean for a check that was off. A budget
  written while a check is off keeps that check's old limit. The `waiver` and
  `budget` checks are about the run itself and cannot be named.
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
`apps/web/e2e/shell-routes.ts` (the live `appRoutes()` list) at 320px wide, in English and in French. Any
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
- Form, sign-in, status, media, fixed bar and clipping checks read the page as
  rendered at the moment of the audit. A message that appears later, after a
  click or a failed submit, is not seen. Autoplay is judged from what the browser
  really started, so a browser that blocked it reports nothing.
- Language of parts guesses from common words. Short text, names and quotations
  are skipped or can be misread, so every finding is UNKNOWN.
- The manifest check does not fetch icons, so it cannot tell if a file exists or
  has the size it claims.
- Only the first 3000 elements of a page are read.
