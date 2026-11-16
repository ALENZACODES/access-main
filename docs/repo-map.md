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
| `/more/housing` | access-tools `housing`: `HousingFinder`, with the unit and room depth finder and the on-device barrier evidence form | Labelled demonstration rooms and units; the person's own reports, on the device |
| `/more/diary` | access-tools `diary` | Not changed or inspected in this round |
| `/more/auditors` | access-tools `auditors`: `App`, with the record, programme, venue, cases and service panels | Labelled fixtures and the person's own entries |
| `/more/handoff` | access-tools `handoff` | Labelled demonstration records |
| `/more/games` | access-tools `games`: `GamesApp`, 25 games, dwell select setting | Rounds and settings, on the device |
| `/more/safety` | access-tools `safety` | Not changed or inspected in this round |
| `/more/route-reports` | access-maps `conditions`: `RouteReportsList`, and `RouteReportForm` when a place in the data is given with `?place=<id>`. Each place page (`/places/:id`) links there with its id ("Report a route condition here") | Reports saved on the device. None ship |
| `/more/accessible-taxis` | access-maps `conditions`: `WavFinder` over `datasets/wav-services.json` | The published list, which holds zero records |
| `/more/peers` | access-help `peers`: topic list, and a link to the request flow | Topic names only |
| `/more/peer-request` | access-help `peers`: `PeerRequestFlow`, with the package's on-device history | The person's own request, on the device. The recorded routing table holds no streams, so every request routes to Unknown. Nothing is sent |
| `/more/events` | access-help `event-access`: demonstration records | Labelled demonstration events |
| `/more/event-organiser` | access-help `event-access`: `OrganiserForm` | The organiser's own answers, on the device |
| `/more/event-plan` | access-help `outings`: `EventOutingPlanner` | Labelled sample events and the person's own plans |
| `/more/reports` | access-main `advocacy`: `ReportsPanel` | The package's labelled demonstration set. Saving files needs the evidence-export permission |

All four package blockers recorded here on 16 November are fixed at the source and mounted: the report tables (access-main #143), the peer request flow (access-help #66), the housing depth finder and evidence form (access-tools #74). The games package's own shell list now defaults to all 25 games (access-tools #75); the shell still passes `GAME_LIBRARY` explicitly.
