# Data status: HTTP routes, offline support and checks (round 5)

All code is in this folder. Nothing here is mounted on the App's router: the App's router and shell were not available, so the entry points below must be called from them.

## Entry points

- `handleDataStatus(req, ctx)`: framework-neutral handler. Returns `null` for paths that are not its own. Routes (base `/data-status`): the base path (302 to `/en/` or `/fr/`), `/{en|fr}/data-status` (HTML), `/sources.csv`, `/credits.txt`, `/summary.json`. GET and HEAD only; 405, 414 and 503 pages are localized. ETag and 304 supported.
- `renderDataStatusPanel` with `staticView` renders links and a GET filter form that work without scripts.
- `installServiceWorker(scope, config)` and `standalone/sw.ts`: offline copy of pages and downloads. `registerOfflineSupport` registers it. `standalone/sw.ts` needs a bundler entry that emits `sw.js` next to `index.html`; the repo build was not changed.

## Offline strategy

Pages: network first, saved copy when the network fails or is slow, a localized offline page when nothing is saved. Downloads: saved copy first, refreshed in the background. Assets: cache first. Only complete, public 200 responses without cookies or `no-store` are saved.

## Checks

`auditHtml` fails on missing language, title, viewport, main, skip link, heading order, duplicate ids, unlabelled controls, tables without caption or scoped headers, inoperable scroll regions, bad `<time>`, small targets, positive tabindex, removed outlines, vague link text, images without alt, unsafe `_blank` links, inline handlers, `javascript:` URLs and empty buttons. It is a text-based check, not a browser or screen-reader test.

## Other additions

Plural-aware counts (`tCount`), relative ages next to real dates (`ageLabel`), per-type staleness settings in the URL (`stale_<kind>=N`), a local history of daily counts (`history.ts`, counts only), and a language-neutral JSON summary where unknown values stay `null`.
