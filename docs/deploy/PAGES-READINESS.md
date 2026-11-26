# GitHub Pages readiness

John approved publishing to `https://alenzacodes.github.io/access-main/` on 2026-11-26.

The reviewed workflow is `deploy/pages.yml`; an identical copy runs from `.github/workflows/pages.yml` (a test keeps them the same). It is still manual-only (`workflow_dispatch`). The workflow now builds `pack/v1` in the pinned access-maps checkout with `npm run build:web-pack` and verifies it, because the pack is generated and not committed.

Boxes are ticked only when a run of the release gate against a real build proved the item. Last run: 2026-11-26, access-main `claude/publish-pages`, access-maps `ce63f18`: **117 of 117 checks passed**.

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
| [x] | Every route in the integration contract renders in English and French at 320 px and 1280 px | `routes.spec.ts` |
| [x] | No horizontal scrolling at 320 px | `routes.spec.ts` |
| [x] | axe-core with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` reports 0 violations on every route, both languages, both widths | `axe.spec.ts` |
| [x] | No page has `data-section-status="pending"` | `routes.spec.ts` |
| [x] | Places search for "Union" returns a real result in the fixture pack, and the result opens | `places-search.spec.ts` |
| [x] | `/`, `/help`, a downloaded region's place page and `/map` reload with the network off | `offline.spec.ts` |
| [x] | First-install precache is at most 5 MiB (5,242,880 bytes) and holds no pack or tile data | `budget.spec.ts`; `stage-pages.mjs --check-only`: 4,755,385 bytes |
| [x] | No request leaves the origin (no third-party map tile or style server) | `origin.spec.ts` |
| [x] | Every published file is under 100 MB and the site is under 1 GB | `scripts/stage-pages.test.mjs` proves the check; the real build must still pass it in the workflow |
| [x] | The workflow runs only when started by hand: `workflow_dispatch`, no push trigger, no schedule, and the enabled copy in `.github/workflows/pages.yml` is identical to the reviewed `deploy/pages.yml` | `scripts/stage-pages.test.mjs`; `wf.repo.audit.test.ts` |
| [x] | Held sources (`inWebPack: false`) cannot be copied into the published site | `scripts/stage-pages.test.mjs` (pack staging) |

Measured site: 2,022 files, 183,093,994 bytes (174.6 MiB); largest file 7.5 MiB.

**How Places reads the pack.** The data client fetches on demand (`fetchOnDemand`): online, a search reads one region's search list (Toronto by default; the person can pick another) and a place page reads only its own source's parts in its cell. Each part is checked for size, sha256 and record count, kept in memory for the session, and never written to the device; the Offline page's download is still the only thing that stores data. Where a search found a place is kept in memory, not put in the link.

Fixed on the way: browsers' `DecompressionStream` reads only the first member of a multi-member gzip part (some `osm-ontario` parts have two), so those parts failed their record count and the Toronto download could not finish; `vite preview` sent `Content-Encoding: gzip` for pack files, so checks failed in the release gate (Pages serves them as stored); and the offline spec's wait matched "Not downloaded".

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
