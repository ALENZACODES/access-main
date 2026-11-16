# Repository map

| Path | What belongs here |
| --- | --- |
| `apps/web` | The PWA: routes, layout, design system, English and French strings, onboarding, settings, data status, service worker. |
| `packages/shared` | TypeScript contracts: profile shape, provenance checks, cache rules, and the module interfaces other lanes implement. |
| `packages/schema` | JSON Schema 2020-12, the validator, the seed counter, and the canonical verification tiers (`@access-main/schema`). |
| `docs` | Decisions, this map, and the privacy note for device storage. |
| `.github/workflows/ci.yml` | Pull-request checks only. |

`packages/shared/src/lanes.ts` names the package for each route. `apps/web/src/modules/stubs.ts` (`createModules`) is where a real module is passed in. A module must return records that already satisfy `validateCacheEntry` before the shell will store them. The shell does not bundle access-maps data files and does not mount a map.

## How sibling packages reach the shell

| File | What it does |
| --- | --- |
| `lanes.lock.json` + `scripts/sync-lanes.mjs` | Packages behind the module routes (`/places`, `/journey`, `/finders`, `/navigator`, `/games`, `/help`). Each is fetched at one pinned commit into `.lanes/`. All entries are pinned; none reads `PIN-AFTER-MERGE`. |
| `lanes.hub.json` + `scripts/sync-hub.mjs` | Packages mounted under `/more`. Fetched at a pinned commit with a sparse checkout of the package folder only, so no data folder of another repository is checked out. A nested `<main>` or `<h1>` is demoted on sync, because the shell owns both. |
| `apps/web/vite.config.ts` and `vitest.config.ts` (`hubAliases`) | Map each `/more` package name to its folder in `.lanes/`, for the build and for unit tests. The two lists must match. |
| `apps/web/src/hub/` | The `/more` route table (`routes.tsx`), the index (`HubIndex.tsx`), one small page per mounted screen, the strings (`i18n.ts`), and the shared wrapper (`PackageView.tsx`): page title, back link, demonstration label, and an error boundary. |
| `apps/web/src/modules/linked.ts` | The real adapters passed to `createModules`. `lane-adapters.ts` holds a route that has a package but no adapter yet. |

### Module routes (16 November 2026)

| Route | Adapter passed to `createModules` | State |
| --- | --- | --- |
| `/places`, `/places/:id` | access-maps `places-shell` | Real adapter. Unavailable when no data pack can be read |
| `/journey` | `apps/web/src/modules/lane-adapters.ts` | Unavailable. The access-maps `journey-data` planner takes coordinates; the shell form has only origin and destination text |
| `/finders` | access-tools `finders` (`src/shell.ts`) | Real adapter over the data pack |
| `/navigator` | access-tools `navigator` (`src/shell.ts`, `listForShell`) | Real adapter. Lists the package's dated directory records with source, licence note, read date and tier |
| `/games` | access-tools `games` (`src/shell.ts`, `listGamesForShell` over `GAME_LIBRARY`) | Real adapter. Lists the 25 game names. The games are played at `/more/games` |
| `/help`, `/help/:id` | access-help `help` (`src/shell.ts`) | Real adapter |

Every result still passes through `guardModules`. When a package is not in `.lanes/`, its route falls back to the unavailable state.

### Routes under `/more` (16 November 2026)

| Route | Package and screen | Data shown |
| --- | --- | --- |
| `/more/employment` | access-tools `employment`: `EmploymentView`, with the commute check and referral summary | Labelled demonstration listings |
| `/more/housing` | access-tools `housing`: `HousingFinder`, at the earlier pin `8befe99` | Labelled demonstration rooms |
| `/more/diary` | access-tools `diary` | Not changed or inspected in this round |
| `/more/auditors` | access-tools `auditors`: `App`, with the record, programme, venue, cases and service panels | Labelled fixtures and the person's own entries |
| `/more/handoff` | access-tools `handoff` | Labelled demonstration records |
| `/more/games` | access-tools `games`: `GamesApp`, 25 games, dwell select setting | Rounds and settings, on the device |
| `/more/safety` | access-tools `safety` | Not changed or inspected in this round |
| `/more/route-reports` | access-maps `conditions`: `RouteReportsList`, and `RouteReportForm` when a place in the data is given with `?place=<id>` | Reports saved on the device. None ship |
| `/more/accessible-taxis` | access-maps `conditions`: `WavFinder` over `datasets/wav-services.json` | The published list, which holds zero records |
| `/more/peers` | access-help `peers`: topic list | Topic names only |
| `/more/events` | access-help `event-access`: demonstration records | Labelled demonstration events |
| `/more/event-organiser` | access-help `event-access`: `OrganiserForm` | The organiser's own answers, on the device |
| `/more/event-plan` | access-help `outings`: `EventOutingPlanner` | Labelled sample events and the person's own plans |
| `/more/reports` | access-main `advocacy`: `ReportsPanel` | The package's labelled demonstration set. Saving files needs the evidence-export permission |

Not mounted, and the change each one needs in its own package:

- **Housing depth finder and barrier evidence form** (access-tools `housing` at `72d5580`, still true at that commit). `DepthFinder.tsx` renders `<section className="room-facts" aria-labelledby=...>` for every room of every unit, and the room names repeat from unit to unit (axe reports "unit entry"), so the page has several region landmarks with the same name and fails the axe `landmark-unique` rule. Change that `<section>` to a `<div>` (the `<h4>` already labels it), or name each region with the unit as well. Then move the `housing` pin in `lanes.hub.json`.
- **Peer request flow** (access-help `peers`, `PeerRequestFlow`, still true at `4870fa9`). `src/strings.ts` holds the sentence "The App is not affiliated with or endorsed by any organisation." The post-build wording check (`apps/web/scripts/check-dist-overclaim.mjs`) fails on the words "endorsed by" anywhere in the bundle. Reword it in both languages without those words, for example "No organisation has endorsed the App."
- **Route report form from a place page.** The form needs a place the shell has already resolved. `/more/route-reports?place=<id>` accepts one, but no page links to it yet; the place page belongs to another lane.
- **Games list default** (access-tools `games`, `src/shell.ts`). `gamesShellModule.list()` and `listGamesForShell()` without an argument still list only the first ten games (`CATALOG`). The shell passes `GAME_LIBRARY` itself, so `/games` lists all 25. Making `GAME_LIBRARY` the default in the package would let any other host get the full list.
