# Data status page (round 4)

## Run the standalone page

`standalone/index.html` + `standalone/main.ts` are a self-contained page (assumes a Vite-style dev server that serves `.ts` modules; the app's router is not involved). Put a `registry.json` next to it, or pass a URL to `bootstrap()`.

Registry shape (a list, or `{ "datasets": [...] }`); every source should carry its own source, licence and retrieved date:

```json
[{ "id": "…", "name": "…", "kind": "places", "sources": [
  { "id": "…", "name": "…", "source": "…", "licence": "OGL-Ontario", "retrievedAt": "YYYY-MM-DD", "url": "https://…" } ] }]
```

`kind` is one of `places`, `routes`, `transit`, `boundaries`, `reference`. Anything unreadable is reported with its path and treated as missing, so it shows as Unknown.

The page picks its language from the path (`/fr/…`), then `?lang=`, then the browser. Filters live in the query string (`?state=stale&kind=transit&q=…&issues=1`) so a view can be linked.

## Use it from the app

- Server or build step: `renderDataStatusPage({ records, locale, now, pathname })` returns a full HTML document (skip link, one h1, landmarks, language switch).
- Client: `mountDataStatusPanel(host, options)` (see `README.data-qa.md`). New options: `initialFilters`, `onFiltersChange(search)`, `getNotices(locale)`.

Neither is mounted on an app route by this folder; that needs the router, which lives outside it.

## What is new

- `licences.ts`: reference table for the eight open licences, with EN/FR names, reference links, and whether credit or share-alike applies. Alias recognition is exact: unrecognised text (for example "CC BY" with no version, or NC/ND licences) stays unrecognised and is flagged, never guessed. Links are references only; the publisher's current terms apply.
- `attribution.ts`: credits table and plain-text credits. A licence not in the table never gets an assumed credit rule.
- `registryLoader.ts`: strict loader with path-based EN/FR messages.
- `registryDiff.ts`: changes since the saved copy. Dates moving backwards and details disappearing are listed first.
- `filters.ts`: status, type, search and only-items-to-review, with URL round-tripping. Typing updates only the results region so the search box keeps focus. CSV export follows the active filters.
- `locale.ts`: language resolution, locale paths, long dates.
- `copyLint.ts`: wording guard (see below).

## Guards that fail the test run

- Wording: no "verified"/"vérifié" language, real-time claims, conformance claims, AI mentions, partnership claims, medical or eligibility advice, or guarantees, in the whole EN/FR catalog and in rendered pages. The rules are heuristics, so they catch obvious wording, not every possible claim.
- French typography: ’, U+00A0 before `:`, U+202F before `; ! ?` and inside « » across the FR catalog and rendered FR text.
- Accessibility structure of rendered output: 44px targets, captions, scoped headers, labelled controls, unique ids, focusable named scroll regions, valid `<time>` values; badge and focus colours meet WCAG contrast thresholds.
- `licences.ts` must list exactly the licences the audit accepts, and `standalone/index.html` must embed the shared CSS.

Run: `npx vitest run apps/web/src/data-status`
