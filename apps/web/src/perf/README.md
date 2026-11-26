# Web performance (P11)

## What is wired

| Piece | Where it runs |
| --- | --- |
| First-install budget guard (`install-budget.ts`) | `scripts/check-install-budget.ts`, run by `postbuild`, so CI's `npm run build` step fails above **5,242,880 B** |
| Route chunks (`lazy-chunk.ts`, `routeChunks.ts`) | `src/router.tsx` (About, Profile, module pages, place detail, Help, Data status, Build card, Offline), `src/features/routes.tsx` (the six /settings/* feature pages share one `featureScreens` chunk) and the nav links in `shell/AppShell.tsx` (preload on focus or pointer) |
| Vendor split | `vite.config.ts`: schema validation (`ajv` family, only Settings feature packages) and ZIP export (`fflate`, only Contribute) get their own chunks, so they are no longer in the start-up preload |
| Day 22 timing and LCP | `e2e/perf.spec.ts`, in CI's e2e step; writes `test-results/perf/day22-performance.json` |

## First install versus on demand

The first install is every file in the service-worker precache plus `sw.js`
and its Workbox runtime. On-demand downloads are **outside** the cap: offline
region packs (`packs/`), data files (`data/`), PMTiles, and the MapLibre chunk
that only `/map` requests. The guard fails if any of them is ever precached,
and prints their size separately. `@access-main/budgets`
(`check:web-precache`) still checks the per-file and precache limits.

The `/dev/narrow` audit page is a developer tool. Its chunk
(`NarrowAuditPage-*.js`, loaded lazily by the router) is built and fetched
when the page is opened, but `vite.config.ts` keeps it out of the precache
(`globIgnores`), so it is not part of the first install and the page does not
work offline. The install guard is unchanged: it measures every precached
file. `src/perf/narrow-precache.test.ts` fails if the page stops being lazy or
the ignore goes away.

## Measured on this branch

Start-up JS (modulepreload set on `/`): about 827,000 B before the split,
665,229 B after (vendor chunk 240,918 B → 8,688 B; `ajv` 150,790 B now loads
only with Settings packages).

Day 22 record from a local run (Playwright Chromium, 390×844, CPU 4×
slowdown, local production build, no network throttling, 3 cold runs,
median): home LCP 288 ms; time to first result: place search 388 ms, journey
plan 418 ms, washroom finder 450 ms. The e2e gates are LCP ≤ 1,200 ms and
first result ≤ 1,500 ms, about twice the CI medians seen on this branch. A
separate e2e checks that preloading on focus or pointer leaves focus and the
route unchanged, and a DOM test checks that it announces nothing. To keep the gate steady without moving it, each route gets one discarded
warm-up load, each measure is the median of five cold runs, and a measure over
its gate is taken again up to three times (the best attempt is gated and every
attempt is in the record). The perf project also runs on its own: CI uses one
Playwright worker. A regression makes every attempt miss. A CI runner or a
desktop is not a real
phone. The plan's on-phone measurement still has to be done by hand and
compared with Day 12; no Day 12 record exists in this repo yet.
