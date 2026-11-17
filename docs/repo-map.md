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
| `/journey` | access-maps `journey-data` (`createJourneyModule`), wrapped in `apps/web/src/modules/lane-adapters.ts` | Real adapter over the data pack. Unavailable when no data pack can be read. Plans a rolling route between two places with recorded positions where path records cover the area; otherwise says which state applies (see below) |
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

All four package blockers recorded here on 16 November are fixed at the source and mounted: the report tables (access-main #143), the peer request flow (access-help #66), the housing depth finder and evidence form (access-tools #74; its aggregate counts are saved from a button, not a `data:` link, since access-tools #76). The games package's own shell list now defaults to all 25 games (access-tools #75); the shell still passes `GAME_LIBRARY` explicitly.

### Journey from the place search (built 16 November 2026)

`/journey` runs the access-maps `journey-data` planner (`createJourneyModule(source).plan({ origin, destination, profile, locale, now, offline })`) over the data pack on the device. The pieces:

1. **Resolve a place to a point** (`apps/web/src/modules/journey-resolve.ts`). A place chosen from the search is read by its record id (`resolveRecord`). Typed text that was not chosen goes through `resolvePoint(source, label)`: `source.search(label, { tranches: ["venue", "washroom", "transit"], limit: 10 })`, keeping hits whose folded name equals the folded label. None: `not-found`. More than one id: `ambiguous`; the shell never chooses for the person. Exactly one: `source.get(id)`. The point is the record's own `lat` and `lon` fields, used only when both are finite numbers in range and each has a source, licence, date and a tier from 0 to 4. `SearchHit.lat`/`lon` are never used: the search index can set a missing coordinate to 0.
2. **Choose from the search in the form** (`apps/web/src/pages/JourneyForm.tsx`, mounted by `ModulePage.tsx`). Under each text field, "Find places for From/To" runs the same `places.search` the `/places` page uses; each match has a "Use this place" button. The chosen record id is sent as `originId`/`destinationId` (optional fields on the shell's `JourneyRequest`); editing the text again drops it. All controls are native buttons and fields, keyboard operable, in English and French.
3. **Adapter** (`apps/web/src/modules/lane-adapters.ts`). Unavailable (`modules.unavailable`) when the pack cannot be read or the package is not pinned. Otherwise a ready result whose message key names the state, through a case in `statusKey`: `journey.awaiting`, `journey.needBoth`, `journey.notFound`, `journey.ambiguous`, `journey.noCoordinates` ("The planner is not available for this area: this place has no recorded position."), `journey.noArea` (no pack region holds both places, no path records cover them, or offline with the region not downloaded), `journey.tooFar` (over the planner's 3 km rolling limit), `journey.noRoute`, `journey.planned`. `RollProfile`: `stepFreeRequired: true`; width only when the person recorded a chair width; no grade limit, because the profile records none.
4. **Result** (`JourneyPlan`). One item for the rolling route when `roll` is not null: summary from the package's `messages.roll`, the distance, and what the data records (no step recorded, Unknown fields, or a recorded barrier); never a claim that the route works. Provenance is the route evidence with the lowest tier and its `prototype_label`. The item also carries the planner's notices (Unknown fields, missing stops and timetables) and, for each end, the source, licence, date and tier of its recorded position (`JourneyPlanDetails`). Transit options are not mapped until a timetable source is pinned; the planner reports the missing timetables.
5. **Types.** `apps/web/src/modules/lane-packages.d.ts` declares the package's own request and result types. `journey-types.test.ts` compares them with the pinned source and fails on drift.
6. **Tests.** `journey.test.ts` (resolver and adapter over a labelled fixture pack), `journey-types.test.ts`, `ModulePage.journey.dom.test.tsx` (both languages, axe), and `apps/web/e2e/journey.spec.ts` (a served fixture pack, keyboard choice from the search, a planned route and the no-position state, both languages, axe). The e2e build has no data pack, so the shell, axe sweep and Day 17 runs over `/journey` see the unavailable state with every control off; `shell.spec.ts` checks that.
