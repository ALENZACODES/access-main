# GitHub Pages readiness

Decision needed from John: publish the App to `https://alenzacodes.github.io/access-main/`.

Nothing here is enabled. The workflow is staged at `deploy/pages.yml`, outside `.github/workflows/`, so it cannot run. Boxes are ticked only when a test in this repository proves the item. The release gate was written before lanes I1 to I13 landed, so every box below is unticked until that gate passes against a real build.

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
| [ ] | Every route in the integration contract renders in English and French at 320 px and 1280 px | `routes.spec.ts` |
| [ ] | No horizontal scrolling at 320 px | `routes.spec.ts` |
| [ ] | axe-core with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` reports 0 violations on every route, both languages, both widths | `axe.spec.ts` |
| [ ] | No page has `data-section-status="pending"` | `routes.spec.ts` |
| [ ] | Places search for "Union" returns a real result in the fixture pack, and the result opens | `places-search.spec.ts` |
| [ ] | `/`, `/help`, a downloaded region's place page and `/map` reload with the network off | `offline.spec.ts` |
| [ ] | First-install precache is at most 4.5 MiB (4,718,592 bytes) and holds no pack or tile data | `budget.spec.ts`; also `stage-pages.mjs --check-only` |
| [ ] | No request leaves the origin (no third-party map tile or style server) | `origin.spec.ts` |
| [x] | Every published file is under 100 MB and the site is under 1 GB | `scripts/stage-pages.test.mjs` proves the check; the real build must still pass it in the workflow |
| [x] | The workflow cannot run today: it lives outside `.github/workflows/`, has no push trigger, no schedule and no cron | `scripts/stage-pages.test.mjs` (`deploy/pages.yml`) |
| [x] | Held sources (`inWebPack: false`) cannot be copied into the published site | `scripts/stage-pages.test.mjs` (pack staging) |

Two boxes are ticked because the unit tests prove the checking code, not because a real build has been measured. Until the release gate runs against a real build, no precache or site size figure exists.

## Decisions that are John's

- Enable the workflow: copy `deploy/pages.yml` to `.github/workflows/pages.yml` in a reviewed pull request, then set Settings > Pages > Source to "GitHub Actions". Triggering is manual (`workflow_dispatch`). The commented `push` block stays off unless publishing on every merge to `main` is wanted.
- Sources held for a licence decision (`inWebPack: false`, for example GO Transit, UP Express, MiWay, LTC) stay out of the published pack. The staging script refuses to ship any file from a held source and lists none of them in counts.
- The workflow uses GitHub Actions minutes. The account's minutes are reported as exhausted, so a run may be refused until that changes.

## Assumptions to confirm

- `lanes.lock.json` pins access-maps to a full 40-character commit. `deploy/lock-commit.mjs` accepts the common lock shapes and fails on a branch name; confirm it against the file lane I1 writes.
- The access-maps checkout holds the manifest at `pack/v1/manifest.json` (under the repository root or under `data/`), parts and tiles at the manifest's relative paths under `data/` or the root, and the served pack root is `${BASE_URL}data/`. The staging script copies only the files the manifest lists, after checking size and sha256, so unreferenced files never ship.
- The G10 budgets package (access-main #28) is used if `@access-main/budgets` resolves and exports `precacheBytes`. Both names are assumptions; the 4.5 MiB ceiling applies either way, so the package can only tighten it.
- Deep links on Pages first hit `404.html`, which redirects to the base with the path in a `spa-path` query parameter. `stage-pages.mjs` adds a short script to the built `index.html` that restores the path before the app starts. This edit happens after the build, so the precache revision for `index.html` is stale by one build; the file is fetched fresh on install and the next deploy corrects it.
- The release specs reach the Offline page's download button by its accessible name ("Download" with the region name), and recognise completion by the text "downloaded", "available offline" or "ready offline". The French build is selected with the browser locale `fr-CA`. Adjust `support.ts` and `offline.spec.ts` if lanes I3 and I12 choose different wording.
- B4: there is no third-party map tile or style server. Our data is shown on a plain background. Any off-origin request fails `origin.spec.ts`.
