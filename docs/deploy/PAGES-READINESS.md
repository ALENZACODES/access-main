# GitHub Pages readiness

John approved publishing to `https://alenzacodes.github.io/access-main/` on 2026-11-26.

The reviewed workflow is `deploy/pages.yml`; an identical copy runs from `.github/workflows/pages.yml` (a test keeps them the same). It is still manual-only (`workflow_dispatch`). The workflow now builds `pack/v1` in the pinned access-maps checkout with `npm run build:web-pack` and verifies it, because the pack is generated and not committed.

Boxes are ticked only when a run of the release gate against a real build proved the item. Last run: 2026-11-26, access-main `main` after #347, access-maps `ce63f18`, 107 of 117 checks passed.

The integration plan's own readiness list was not part of this lane's input. The items below come from the I10 definition of done and the shared integration contract, and should be compared against the plan before the decision is taken.

## What the release gate proves

Run it from `apps/web` once the lanes are merged and an access-maps checkout with `data/`, `pack/` and `tiles/` is available:

```
ACCESS_MAPS_DIR=<path to access-maps> \
npm exec -w @access/web -- playwright test -c e2e/release/playwright.release.config.ts
```

It builds with `VITE_BASE=/access-main/`, stages the pack with `scripts/stage-pages.mjs`, serves the result with `vite preview`, and runs the specs in `apps/web/e2e/release/`. The unit tests for the staging script run with `npm test` (`scripts/stage-pages.test.mjs`) and already pass without a build.

| Done | Item | Proven by |
| --- | --- | --- |
| [~] | Every route in the integration contract renders in English and French at 320 px and 1280 px | `routes.spec.ts`: every fixed route passes; the place and other parameter routes fail because Places shows no records yet (see below) |
| [~] | No horizontal scrolling at 320 px | `routes.spec.ts`: proven on every fixed route |
| [~] | axe-core with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` reports 0 violations on every route, both languages, both widths | `axe.spec.ts`: 0 violations on every fixed route; parameter routes not reached |
| [~] | No page has `data-section-status="pending"` | `routes.spec.ts`: proven on every fixed route |
| [ ] | Places search for "Union" returns a real result in the fixture pack, and the result opens | `places-search.spec.ts`: the pack has Union; the Places page does not read the pack yet |
| [ ] | `/`, `/help`, a downloaded region's place page and `/map` reload with the network off | `offline.spec.ts`: blocked by the place page |
| [x] | First-install precache is at most 5 MiB (5,242,880 bytes) and holds no pack or tile data | `budget.spec.ts`; `stage-pages.mjs --check-only`: 4,755,385 bytes |
| [x] | No request leaves the origin (no third-party map tile or style server) | `origin.spec.ts` |
| [x] | Every published file is under 100 MB and the site is under 1 GB | `scripts/stage-pages.test.mjs` proves the check; the real build must still pass it in the workflow |
| [x] | The workflow cannot run today: it lives outside `.github/workflows/`, has no push trigger, no schedule and no cron | `scripts/stage-pages.test.mjs` (`deploy/pages.yml`) |
| [x] | Held sources (`inWebPack: false`) cannot be copied into the published site | `scripts/stage-pages.test.mjs` (pack staging) |

`[~]` means proven on every fixed route but not on parameter routes. Measured site: 2,022 files, 183,093,994 bytes (174.6 MiB); largest file 7.5 MiB.

**Open: Places does not read the pack.** The published pack holds 1,711,884 records in 406 cells, and the release gate confirms a place named Union is in it, but the Places page still shows "No records are shown" and search returns 0 results. Place pages, the parameter routes and the offline place-page check stay unproven until Places reads `${BASE_URL}data/pack/v1/`.

## Decisions that are John's

- Enabled 2026-11-26 (manual `workflow_dispatch`). Settings > Pages > Source must be "GitHub Actions". The commented `push` block stays off unless publishing on every merge to `main` is wanted.
- Sources held for a licence decision (`inWebPack: false`, for example GO Transit, UP Express, MiWay, LTC) stay out of the published pack. The staging script refuses to ship any file from a held source and lists none of them in counts.
- The workflow uses GitHub Actions minutes. The account's minutes are reported as exhausted, so a run may be refused until that changes.

## Assumptions to confirm

- `lanes.lock.json` pins access-maps to a full 40-character commit. `deploy/lock-commit.mjs` accepts the common lock shapes and fails on a branch name; confirm it against the file lane I1 writes.
- The access-maps checkout holds the manifest at `pack/v1/manifest.json` (under the repository root or under `data/`), parts and tiles at the manifest's relative paths under `data/` or the root, and the served pack root is `${BASE_URL}data/`. The staging script copies only the files the manifest lists, after checking size and sha256, so unreferenced files never ship.
- The G10 budgets package (access-main #28) is used if `@access-main/budgets` resolves and exports `precacheBytes`. Both names are assumptions; the 5 MiB ceiling applies either way, so the package can only tighten it.
- Deep links on Pages first hit `404.html`, which redirects to the base with the path in a `spa-path` query parameter. `stage-pages.mjs` adds a short script to the built `index.html` that restores the path before the app starts. This edit happens after the build, so the precache revision for `index.html` is stale by one build; the file is fetched fresh on install and the next deploy corrects it.
- The release specs reach the Offline page's download button by its accessible name ("Download" with the region name), and recognise completion by the text "downloaded", "available offline" or "ready offline". The French build is selected with the browser locale `fr-CA`. Adjust `support.ts` and `offline.spec.ts` if lanes I3 and I12 choose different wording.
- B4: there is no third-party map tile or style server. Our data is shown on a plain background. Any off-origin request fails `origin.spec.ts`.
