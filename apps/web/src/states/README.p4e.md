# states: pages, map list, compare, sources, suggestions, settings (round 5)

`handleRequest(request, deps)` in `app.ts` is the single entry point. It resolves a URL with the pure router, loads data through `deps.loadPlaces`, builds the route view, renders it and wraps it in the page shell. Every response is a complete HTML document.

| URL (EN / FR) | View |
| --- | --- |
| `/en/search` / `/fr/recherche` | filtered search with UNKNOWN kept separate |
| `/en/place/{id}` / `/fr/lieu/{id}` | place details with sources |
| `/en/saved` / `/fr/enregistres` | saved places (works offline) |
| `/en/map` / `/fr/carte` | list stand-in for a map; no tiles, `geo:` links to the person's own maps app |
| `/en/compare?ids=a,b` / `/fr/comparer` | up to three places side by side |
| `/en/sources` / `/fr/sources` | every source, open licence, detail count and latest retrieval |
| `/en/report/{id}` / `/fr/signaler/{id}` | suggest a correction (POST) |
| `/en/settings` / `/fr/parametres` | language, theme, text size up to 200%, reduced motion (POST) |

- **UNKNOWN stays UNKNOWN.** A location needs valid coordinates and provenance (`placeRecord.ts`). A comparison cell is UNKNOWN until reported with provenance. Search never counts UNKNOWN as a match.
- **Suggestions** are queued on the device (`submissionQueue.ts`), validated on every read, retried with backoff (30 s doubling, one hour cap) and never change displayed details. An email is stored only with consent.
- **Page audit.** `auditPage` and `auditHtml` fail on missing skip link, `<main>`, single `<h1>`, `lang`, title, labelled `nav`, zoom lock, missing `:focus-visible`, small targets (inputs, links, buttons, summaries), unlabelled fields, `aria-invalid` without an error reference, tables without caption and scoped headers, low contrast, prohibited wording and French typography. `app.test.ts` runs every route through it in EN/FR, light/dark, online/offline and for every load outcome.
- `testHelpers.ts` is test-only and holds no real data.

The caller supplies storage (`KeyValueStore`), the data loader and an id generator, so the same code runs in a server, a service worker or a static build.
