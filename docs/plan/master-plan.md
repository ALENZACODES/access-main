# Master plan for the App

Date: 16 November 2026 (America/Toronto). Owner: the human owner of the four repositories.

This plan says how the App gets from four repositories of parts to one product a wheelchair user in Ontario can rely on. It sits on top of the product backlog in [`15-major-ideas.md`](15-major-ideas.md), which lists what the product contains (features F-01 to F-29, games G-01 to G-50, systems S1 to S7). This file says in what order the work lands, who owns which paths, and what counts as done. Where the two disagree about scope, the backlog wins. Where they disagree about order or ownership, this file wins.

Statements about the current state were checked against the repositories on the date above. Anything not checked is marked Unknown.

## 1. What the App is

One installable web app, in English and French, that works offline, for people with spinal cord injuries in Ontario. It answers one question better than a generic map: *will this work for me, my chair, and my transfer, today?*

Rules that do not bend:

1. **Unknown stays Unknown.** No accessibility fact is invented, inferred, or rounded up.
2. **Every record carries a source, a licence, a date, and a verification tier.** A source is not a verification.
3. **No medical advice and no eligibility advice.** The App signposts.
4. **WCAG 2.2 AA in both languages**, and usable by keyboard, switch, voice, and dwell.
5. **Data stays on the device** unless the person exports it themselves. No account, no analytics, no location request.
6. **No endorsement is claimed.** No organisation is named as a partner until a written agreement exists.
7. **Counts are honest.** Only peer-verified and surveyed values count as verified. Imports and operator claims are counted separately.

## 2. Where the project stands

### 2.1 What exists

| Repository | Role | State |
| --- | --- | --- |
| access-main | The shell: routes, profile, settings, offline, data status, shared contracts, schema | Built and tested. Module routes for places, journey, finders, navigator, games, and help go through one seam (`createModules`). Every entry in `lanes.lock.json` is pinned to a merged commit. Places, finders, navigator, games, and help use the real adapter from their package; journey has no adapter yet, because the planner takes coordinates and the shell form does not. |
| access-maps | Open-data pipeline, journey engine, map interface, conditions | Imports are in place with tier 0 and tier 1 values only. Verified (tier 2–3) total is 0. |
| access-tools | Place pages, search, finders, directory, games, importers | Place pages and finders run on labelled fixtures. Ten of fifty games ship. |
| access-help | Help centre, onboarding, glossary, peers, events, the cross-repository test harness | Built on demonstration and sample data. French is a draft. |

### 2.2 The real constraint

The project does not lack code. It lacks **landed, joined, verified** code and data:

- **Merge debt.** On the morning of 16 November there were about 75 open pull requests across the four repositories. Many were later rounds of the same lane stacked on earlier rounds that never merged, so a lane's work existed several times and counted zero times.
- **Integration gap.** Many packages are complete in isolation but are not reachable from the shell.
- **Verification gap.** Every accessibility value in the data is an import or an operator claim. None has been checked by a person on site.
- **Human gates.** French review, clinical review of safety content, the privacy-law determination, and any partner agreement cannot be closed by writing code.

The plan below attacks those four in that order.

### 2.3 Work in flight on 16 November

Merged on 16 November (each one was merged onto current main locally and passed typecheck, lint, and unit tests before it was merged; browser tests were not re-run on the merged result):

| Repository | Merged | Left open, and why |
| --- | --- | --- |
| access-main | #13, #21, #89, #123, #124, #125, #126, #127, and #128 (the newest P4 round, rebuilt on main in place of #107) | #69, #90, #113 conflict with main. Older stacked rounds and pull requests with a failing check were not attempted. |
| access-maps | #8, #26, #39, #41, #44 | #5 and #32 conflict with main. |
| access-tools | #16, #33, #64, #65, #66 | #13 conflicts with main. |
| access-help | #48, #51, #55, #56, #57, #58, and #59 (rebuilt on main in place of #49) | #52 and #53 conflict with main, and a rebuild with their side preferred failed typecheck. |

Open pull requests went from about 75 to 54 (access-main 35, access-maps 7, access-tools 1, access-help 11). Most of what remains is superseded rounds waiting to be closed under Phase A step 2.

Seven feature lanes each landed one pull request:

| Lane | Repository and paths | Pull request | What it adds |
| --- | --- | --- | --- |
| Games | access-tools `packages/games` | #64 (merged) | Dwell select in the game shell and nine more games, taking the set from 10 to 19 |
| Work and home | access-tools `packages/employment`, `packages/housing` | #65 (merged) | Listings that carry a workplace access record, a commute check, unit and room depth records, an anonymised barrier report with suppression |
| Auditors | access-tools `packages/auditors` | #66 (merged) | Audit observations with tier and freshness rules, volunteer programme, venue responses, correction workflow with due dates |
| Conditions | access-maps `packages/conditions` | #44 (merged) | Route-condition reports with decay and corroboration, routing facts, a WAV finder that ships with zero records |
| Peers | access-help `packages/peers` | #57 (merged) | Peer request with itemised consent, routing as data, crisis signposting, on-device history |
| Events | access-help `packages/event-access`, `packages/outings` | #58 (merged) | Per-event access record, organiser checklist, journey hand-off, outing planner |
| Advocacy | access-main `packages/advocacy` | #127 (merged) | Aggregation with primary and complementary suppression, evidence packs, indicators |

Reachable from the shell after the integration round of 16 November (routes, packages and data are listed in [`docs/repo-map.md`](../repo-map.md)):

| Lane | Reachable at | Not reachable yet |
| --- | --- | --- |
| Games | `/more/games`: 19 games and the dwell select setting. `/games` lists the 19 names | Dwell select outside the games |
| Work and home | `/more/employment`: listings with the access record, commute check and referral summary | Housing unit and room depth finder and the barrier evidence form: `/more/housing` stays on the earlier pin until a repeated-landmark fault in the package is fixed |
| Auditors | `/more/auditors`: observations, programme, venue responses, cases and service summary | — |
| Conditions | `/more/route-reports` (list; the form needs a place) and `/more/accessible-taxis` (zero records, shown as unknown) | A link from a place page to the report form; routing facts are not used by the journey route |
| Peers | `/more/peers`: topic list only | The peer request flow: the package holds wording the post-build check rejects |
| Events | `/more/event-organiser` and `/more/event-plan` | The per-event access page and journey hand-off, which need an event record; `/more/events` still lists demonstration events without them |
| Advocacy | `/settings/advocacy`: the evidence pack export, as before | The report tables and indicators (`ReportsPanel`): its focusable scrolling boxes fail the shell's Day 17 route audit |

Each route was checked in English and French by unit tests and by browser accessibility and keyboard tests. Every record these routes show is demonstration, sample or the person's own entry; none is a verified accessibility fact.

## 3. Phases

Each phase has an exit test. A phase is not done until its exit test passes on main.

### Phase A — Land the backlog (now)

Goal: main in every repository contains the best version of every lane's work, and the open pull-request count is under ten per repository.

1. Merge every pull request that is conflict-free and green, oldest first, re-checking main after each one.
2. For each lane with several stacked rounds, keep only the newest round. Rebuild it on current main as one pull request and close the older rounds with a note naming the replacement.
3. Close pull requests marked partial once their replacement merges.
4. Stop opening a new round while the lane's previous round is open (rule L3 below).

Exit test: `npm run typecheck`, `npm run lint`, and `npm test` pass on main in all four repositories, and no lane has more than one open pull request.

### Phase B — One app (next)

Goal: every built module is reachable from the shell, in both languages, offline.

1. Pin the four `PIN-AFTER-MERGE` entries in `lanes.lock.json` to merged access-maps commits.
2. Replace each remaining stub in `createModules` with the real adapter, one module per pull request: places, journey, finders, navigator, games, help.
3. Give each feature package from the seven lanes of 16 November a route under `/more`, behind the same guard that rejects records without source, licence, date, and tier.
4. One integration lane owns `apps/web/src/router.tsx`, the shell string catalogues, and `lanes.lock.json`. No other lane edits them.
5. Extend the browser accessibility sweep to every new route in English and French.

Exit test: from a fresh install with the network off, a person can open every primary route, complete the profile, search places from a downloaded pack, plan a journey on the bundled sample, open a finder, play a game, and read a help article, by keyboard alone, with no accessibility-check violations.

### Phase C — Complete the fifteen ideas in code

Goal: every "What to build" item in the backlog has tested code, on fixtures where real data does not yet exist.

Order is by dependency, then by how often a person would use it:

| Order | Idea | What is still missing in code |
| --- | --- | --- |
| 1 | 1 Journey planner and place pages | Rest, shade, and sensory-space finder (F-29); washroom and change-table register as a separately citable dataset (S4); last-200-metres approach notes |
| 2 | 2 Disruption shield | Live outage layer on main; route-condition reports and the WAV finder joined to the planner; paratransit records beyond links |
| 3 | 9 Emergency and safety | Disruption mode; trip sharing and check-in that the person sends themselves |
| 4 | 14 Voice, switch, dwell, French, offline | Dwell control across the shell, not only games; control-mode parity tests; offline packs on main |
| 5 | 12 Auditors and venues | Audit capture joined to place records; re-check queue feeding tiers |
| 6 | 15 Trust platform | Consent engine used by every package that stores anything; licence register checked at build |
| 7 | 4, 5 Navigation, supplies | Hand-off pathway; quarterly freshness audit; coverage diary behind the privacy gate |
| 8 | 6, 7 Employment, housing | Listings joined to place access records; commute check joined to the planner |
| 9 | 3, 11, 10 Peers, events, caregivers | Request and routing; per-event records; permission-scoped sharing |
| 10 | 8 Advocacy | Aggregation with suppression; evidence packs |
| 11 | 13 Games | Batches of five to ten toward fifty, each gated on control-mode tests |

Exit test: the backlog status table shows no idea as "not started", and each idea's row lists the test file that proves each built item.

### Phase D — Verified core (needs people)

Goal: a bounded area where the App's answers have been checked on site. This is the phase that makes the product true, and software cannot do it alone.

1. Choose one bounded area (the backlog says Toronto core) and a list of place categories.
2. Run surveys with trained volunteers using the audit capture from Idea 12. Two independent observations before a value reaches a verified tier.
3. User-test journeys with manual-chair and power-chair users on real trips. Record "arrived and it worked as described" or what failed.
4. Publish the counts exactly as measured: verified values, imported values, and gaps.

Exit test: every category-critical field on every place in the bounded area is either verified and in date or shown as Unknown, and the published count matches a recount from the data.

### Phase E — Release gates

Nothing is called a launch until each of these is signed by a named person, with a date:

| Gate | Who can close it |
| --- | --- |
| French reviewed by a Franco-Ontarian editor | A human editor |
| Safety and emergency content reviewed | A qualified clinician |
| Privacy-law determination and privacy impact assessment | A privacy lawyer |
| Accessibility audit with assistive-technology users | Users of switch, voice, screen reader, and dwell |
| Licence check on every dataset, on the day of release | The data owner |
| Any partner named in the product | Written agreement from that partner |

### Phase F — Scale with honesty

Extend area by area and operator by operator, Northern Ontario included by design. An area is added only when it can meet the Phase D exit test. Breadth never outruns verified depth.

## 4. Lane model

Parallel work only helps when lanes cannot collide. These rules are what make it safe.

- **L1. One owner per path.** A lane owns named directories. It edits nothing else. Shared files (root `package.json`, lockfiles, CI, the shell router, the shell string catalogues, `lanes.lock.json`) belong to the integration lane only.
- **L2. One pull request per lane per repository**, on a branch named for the topic, built on current main, with no dependency on an unmerged branch.
- **L3. No new round until the last one merges.** A lane with an open pull request fixes that pull request. It does not open another.
- **L4. Green before review.** Typecheck, lint, and tests pass. Tests are never weakened to pass.
- **L5. Check first.** Before writing, a lane reads open pull requests and existing code so nothing is built twice.
- **L6. Nobody pushes to main.** Main changes only by merging a green pull request. No force-push.
- **L7. The honesty checks are code.** The organisation-name check, the Unknown checks, the tier checks, and the copy checks run in CI and are not bypassed.

Standing lane map (one lane per row; rows never share a path):

| Lane | Repository | Paths owned |
| --- | --- | --- |
| Integration | access-main | `apps/web/src/router.tsx`, shell string catalogues, `apps/web/src/modules/**`, `lanes.lock.json`, root files |
| Shell states and offline | access-main | `apps/web/src/states/**`, `apps/web/src/offline/**` |
| Data status | access-main | `apps/web/src/data-status/**` |
| Narrow-screen and audits | access-main | `apps/web/src/narrow/**`, `apps/web/src/a11y/**` |
| Release and recovery | access-main | `apps/web/src/release/**`, `apps/web/src/recovery/**` |
| Trust | access-main | `packages/consent`, `packages/schema`, `packages/freshness` |
| Advocacy | access-main | `packages/advocacy` |
| Caregiver | access-main | `packages/caregiver` |
| Controls | access-main | `packages/controls`, `packages/sr-switch` |
| Pipeline | access-maps | `src/**`, `scripts/**`, `sources/**`, `data/**` |
| Journey | access-maps | `packages/journey`, `packages/journey-data`, `packages/profile-routing` |
| Map | access-maps | `packages/map-ui`, `packages/places-shell` |
| Conditions | access-maps | `packages/conditions` |
| Places and search | access-tools | `packages/place`, `packages/search`, `packages/finders` |
| Directory | access-tools | `packages/navigator`, `packages/directory-links`, `packages/handoff` |
| Work and home | access-tools | `packages/employment`, `packages/housing` |
| Auditors | access-tools | `packages/auditors` |
| Safety | access-tools | `packages/safety`, `packages/timing` |
| Games | access-tools | `packages/games` |
| Importers | access-tools | `packages/importer-*`, `packages/normalise`, `packages/place-import` |
| Help and onboarding | access-help | `packages/help`, `packages/onboarding`, `packages/glossary` |
| Peers | access-help | `packages/peers`, `packages/community` |
| Events | access-help | `packages/event-access`, `packages/outings` |
| Centre screens and harness | access-help | `apps/centre/**`, `qa/**` |

## 5. Definition of done

A feature is done when all of these are true on main:

1. It is reachable from the shell in English and French.
2. It works with the network off, or says plainly what needs a connection.
3. It passes keyboard, switch, and automated accessibility checks, and its targets are at least 24 pixels.
4. Every record it shows has a source, a licence, a date, and a tier, and Unknown is shown as Unknown.
5. It has unit tests for its rules and a browser test for its main path.
6. Its copy makes no medical, eligibility, endorsement, or verification claim the data cannot support.
7. The backlog status table is updated in the same pull request.

## 6. Measures

Report these as measured. When there is no data, the figure is "no data yet".

| Measure | Why |
| --- | --- |
| Open pull requests per repository | Merge debt |
| Shell routes backed by a real module, out of all module routes | Integration |
| Verified values, imported values, and Unknown gaps, per category | Truth of the data |
| Share of place records in the bounded area with every critical field verified and in date | Phase D |
| Routes passing the accessibility sweep in both languages | Access |
| Control-mode parity: tasks completable by keyboard, switch, voice, and dwell | Access |
| "Arrived and it worked as described" confirmations per 100 plans | Whether the product is true |

## 7. Risks

| Risk | Response |
| --- | --- |
| Lanes produce faster than main absorbs | Rule L3, and Phase A before anything else |
| A fixture is mistaken for a real place | Fixtures are labelled in data and on screen; the verified label is refused for them in code |
| A licence changes after import | Licence check on the day of download and again on the day of release |
| Stale data read as current | Freshness decay on every tier; expired values are shown as expired |
| Sensitive data collected by accident | Free text is limited and screened; nothing leaves the device; the privacy gate comes before any diary |
| French lags English | Both catalogues change in the same pull request; a missing French string fails a test |
| The App is taken for an emergency service | Emergency contacts are first in tab order; the App says it is not an emergency service |

## 8. Decisions the owner needs to make

1. The bounded area and categories for Phase D.
2. Whether two independent user reports may raise a route-condition report to tier 2, given that tier 2 counts toward verified totals elsewhere.
3. The licence under which people contribute observations.
4. Which lane is the integration lane.
5. Who the human reviewers are for each Phase E gate.
