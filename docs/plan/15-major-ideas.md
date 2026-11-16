# 15 Major Ideas — product backlog for the App

This file is the App's public product backlog. It is the same product-only summary as the shared plan used by build lanes, plus the status table and issue links below.


This is a product-only regrouping of the master plan. Features F-01 to F-29, games G-01 to G-50, and systems S1 to S7 are carried forward in full and organised into 15 Major Ideas. Nothing in the master plan is removed or replaced.

The product is unbranded and is called **the App**. Unknown stays Unknown. Every record carries a source, licence, date, and verification tier. The App never gives medical advice or benefits-eligibility advice. User-facing copy does not mention how the software was written.

Build phases follow the master plan: Phase 1 Foundations → Phase 2 Verified Core → Phase 3 Live Fusion → Phase 4 Scale with Honesty.

Cross-cutting: personal timing constraints and washroom waypoints may inform routing across Ideas 1, 2, 5, and 9. They are never treated as clinical guidance.

---

## Idea 1 — Verified Access Map and Journey Planner

**Pitch:** A journey planner that answers “will it work for me, my chair, and my transfer, today?” — not a binary “accessible” badge.

**Contains:** F-01 Door-to-Door Accessible Journey Planner · F-03 Place Pages at 100x Depth · F-05 Personal Equipment Profile · F-06 Washroom Finder with Transfer Specs, Adult Change Tables and Hoists · F-07 Parking Finder · F-23 Charging-Point Finder for Power Chairs and Scooters · F-29 Rest, Shade and Sensory-Space Finder · System S4 Adult Change-Table and Hoist Register (Ontario-first).

**Cross-references:** F-15 Offline Packs (Idea 14), F-02 Live Outages (Idea 2), F-04 Photo-Verified Audits (Idea 12).

**Problem:** Generic maps record a badge. SCI usability turns on measured facts — door clear width, step height, turning space, transfer side and space, grab-bar position, bed or chair clearance. Failure modes include a washroom listed as accessible but unusable (FM-03), parking (FM-08), battery and slope (FM-09), the last 200 metres (FM-12), and no washroom en route (FM-13).

**What to build:**
- Place pages (F-03): every place carries measured, dated, sourced fields, photographs, and a freshness stamp — never a bare badge.
- Personal equipment profile (F-05): chair type and dimensions, transfer side, attendant travel — stored on-device, minimised, never required for core use, and never using injury level as a label or proxy. A 700 mm doorway is a fact; whether it is a barrier depends on the chair asking.
- Door-to-door planner (F-01): home exit, surface and gradient, transit legs, transfers, final approach, entry, interior, and washroom, planned as one journey with failure alternatives, not a pin-to-pin line.
- Washroom finder (F-06) with transfer specs, plus the Ontario-first adult change-table and hoist register (S4).
- Parking finder (F-07): bay type and width, access aisle, payment method, van-lift clearance.
- Charging finder (F-23) and rest, shade, and sensory-space finder (F-29).

**Build steps:**
1. Lock the place-record schema (measured fields per category; master plan Part 3 data plan) and the profile schema (minimisation review, Idea 15).
2. Seed Toronto core only — bounded geography, verified depth before thin breadth.
3. Build profile-filtered search and place pages; every field shows value, date, and source tier.
4. Build the journey planner over OpenStreetMap and GTFS foundations with last-200-metres approach notes.
5. Launch the washroom and change-table register as a named, separately citable dataset.
6. Add parking, charging, and rest finders as finder layers on the same record engine.
7. User-test with manual and power chair users (personas 3 and 4) — not simulators — before any expansion.

**Success metric:** Share of place records with all category-critical measured fields present and in-date; journey-plan completion rate; “arrived and it worked as described” confirmations per 100 plans.

**Phase:** 1–2 (Foundations → Verified Core).

**Primary repo:** access-maps (journey and map). Place pages, profile, and finders also live in access-tools and access-main.

---

## Idea 2 — Live Disruption Shield

**Pitch:** Warn before a failure — elevator down, paratransit window missed, snowbank on the ramp, no accessible cab — and re-plan around it.

**Contains:** F-02 Live Elevator and Escalator Outage Layer · F-08 Paratransit Booking and Tracking Links per Ontario System · F-24 Winter and Route-Condition Reporting · F-28 Accessible Taxi and On-Demand WAV Finder.

**Cross-references:** F-14 Emergency Mode (Idea 9), F-01 (Idea 1).

**Problem:** Ontario paratransit is many systems, each with its own booking window, fares, and penalties. Winter is a route condition for a chair user, not just weather. Failure modes include missed windows, cross-boundary seams (FM-11), and times when an accessible cab is effectively unavailable (FM-06).

**What to build:**
- Live elevator layer (F-02): per-elevator state with timestamp and source, a step-free alternative for every outage, and opt-in alerts for saved journeys and stations.
- Paratransit hub (F-08): honest signposting — booking and tracking links per Ontario system, windows and rules in plain language. The App does not book rides and never pretends to. Cross-boundary trips show the seam instead of hiding it.
- Winter and route conditions (F-24): community-reported, freshness-decayed snowbank, curb-cut, surface, and gradient reports, treated as first-class routing data.
- WAV finder (F-28): accessible taxi and on-demand options per city, with availability honestly labelled — including where the honest answer is “effectively unavailable.”

**Build steps:**
1. Inventory live feeds per operator (GTFS and elevator status). Availability per operator is Unknown pending live checks; complete those checks first.
2. Build the outage layer for one system (Toronto / TTC prototype scope), with alternative-route logic.
3. Build the paratransit directory: one verified record per system (window, fare, link, phone), reviewed on a freshness schedule.
4. Add winter reporting with photo, decay, and corroboration rules (verification tiers, Idea 12).
5. Add a WAV directory per city with availability labelling discipline.
6. Extend system by system, North included by design — not as an afterthought.

**Success metric:** Outage-alert lead time before departure; share of saved journeys with a live-checked status at departure; winter-report corroboration rate.

**Phase:** 2–3 (Verified Core → Live Fusion).

**Primary repo:** access-maps. The paratransit directory also lives in access-tools.

---

## Idea 3 — Peer Connect

**Pitch:** Nobody understands a new spinal cord injury like someone who has lived it. The App connects people to a trained peer programme faster, and never replaces it.

**Contains:** F-16 Community and Peer Layer with Moderation.

**Cross-references:** F-21 Caregiver Mode (Idea 10), F-13 Events (Idea 11).

**Problem:** Discovery and matching often depend on referral pathways and staff time. A newly discharged person at 2 a.m. has no low-friction way to say “I need to talk to someone who gets it.”

**What to build:** A safeguarding-governed peer layer (F-16): request a peer connection, browse moderated community spaces, and be routed — with consent — into an existing partner peer programme. The peer layer must not bypass that programme’s training or safeguarding, and no assumption is made that partner staff or peers will populate, verify, or moderate content. Matching is by functional and life context (new injury, parenting, work, sport, region) — never by diagnosis label. Moderation tiers, crisis and escalation pathways, and safeguarding follow master plan Part 2 §4.

**Build steps:**
1. Co-design the peer-request flow with a partner SCI organisation’s peer programme staff — their workflow first, software second.
2. Build request, consent, and routing; no open direct messaging at launch.
3. Implement moderation tiers, escalation, and crisis signposting (never crisis counselling — signpost to real services).
4. Pilot with one peer programme stream; measure time to first peer contact.
5. Only with the partner organisation’s written agreement, add community spaces under that organisation’s moderation policy.

**Success metric:** Median time from request to first peer contact; share of requests routed to a partner programme within the agreed service level; safeguarding incidents (target: zero unhandled).

**Phase:** 2 (Verified Core), gated on partner agreement.

**Primary repo:** access-help.

---

## Idea 4 — Service Navigation and Benefits

**Pitch:** ODSP, equipment funding, home services, 211, rehab — one navigator that signposts honestly and hands off to a human navigator when it gets hard.

**Contains:** F-09 Health and Services Finder (signposting only) · F-10 Benefits and Equipment-Funding Navigator.

**Cross-references:** F-26 (Idea 5), F-11 (Idea 6), 211 Ontario partnership prospect (master plan, Part 3).

**Problem:** Benefits and services for Ontarians with SCI are fragmented across federal, provincial, municipal, and charitable programmes, each with its own eligibility language. Existing comparators each cover part of the maze. Navigators spend scarce hours repeating the same signposting.

**What to build:**
- Health and services finder (F-09): clinics, rehab, attendant and community services — signposting only, with referral and discharge information for clinicians clearly separated from public content.
- Benefits navigator (F-10): a directory-and-linking navigator — never eligibility advice. Every rate and rule carries a “checked on” date. Published rates must be re-checked live before any display. Plain-language and French equivalence from the start (Idea 14).

**Build steps:**
1. Build the service-record schema (service, catchment, referral route, freshness date).
2. Seed from published directories and 211 data — under agreement, not scraping.
3. Build the benefits navigator as guided signposting with live-check dates on every figure.
4. Add a “hand off to a human navigator” pathway with consent-based context sharing.
5. Quarterly freshness audit of every benefits record; stale records visibly flagged, never silently aged.

**Success metric:** Share of navigator enquiries resolved by self-serve signposting (staff-validated sample); benefits records in-date share; hand-off completion rate.

**Phase:** 2 (Verified Core).

**Primary repo:** access-tools.

---

## Idea 5 — Health and Supplies

**Pitch:** A verified repair and supply finder, plus a consented, anonymised coverage diary that can show what rationing supplies costs people — without medical advice and without individual health records.

**Contains:** F-26 Equipment Repair and Supply Finder.

**Cross-references:** F-10 Benefits Navigator (Idea 4), F-19 Analytics (Idea 8), health-aware timing (master plan, Part 4, cross-cutting).

**Problem:** People ration intermittent catheters, reuse supplies, and absorb repair costs and delays for specialized wheelchairs, with no systematic public record.

**What to build:**
- Repair and supply finder (F-26): verified repair shops, suppliers, and loaner and emergency-repair options by region — including Northern distance realities — with wait-time reports from the community.
- Voluntary coverage diary (built on F-19 and F-26 data structures): with explicit, revocable consent, people log out-of-pocket supply costs, rationing, and consequences (for example infections or missed work) in a structured, anonymised form. Aggregates only — small-cell suppression, no individual health records, no medical advice (Idea 15 governance).
- Health-aware timing in journey planning (Ideas 1–2) treats supply and washroom needs as routing facts, respectfully and without clinical claims.

**Build steps:**
1. Build the repair and supply directory (verified records, freshness schedule).
2. Co-design the coverage-diary instrument with advocacy and research-community leads.
3. Privacy Impact Assessment and consent-engine sign-off (Idea 15) before any diary data is collected — no exceptions.
4. Pilot the diary with a small, consented cohort; publish aggregate methodology openly.
5. Deliver the first aggregate evidence pack for a coverage campaign.

**Success metric:** Directory records verified and in-date; consented diary participants and retention; evidence packs delivered and cited in campaign materials or submissions.

**Phase:** 2–3 (directory in Verified Core; diary in Live Fusion, privacy-assessment-gated).

**Primary repo:** access-tools.

---

## Idea 6 — Employment and Income

**Pitch:** Job and programme records where the workplace’s access facts travel with the listing, plus a commute check a person can actually use.

**Contains:** F-11 Employment Finder.

**Cross-references:** F-10 (Idea 4), F-01 journey planning to the workplace (Idea 1).

**Problem:** People face inaccessible workplaces and job listings that never say what access actually exists. Employment-services geography was Unknown (U13) in the master plan and still needs to be resolved.

**What to build:** Employment Finder (F-11; master plan MoSCoW: Could — sequenced late): job and programme records where the access record of the workplace itself (step-free entry, accessible washroom, workstation facts from the Idea 1 place engine) travels with the listing. Listings can link into a partner SCI organisation’s employment programme rather than inventing a parallel service. A journey-planned commute check asks whether the person can actually get to the job, in winter, by paratransit window, using Ideas 1–2. The App never duplicates casework.

**Build steps:**
1. Confirm employment-programme geography, streams, and reporting needs (resolves U13).
2. Build listing records joined to verified place-access records — no listing without an access record or an explicit “unverified” label.
3. Integrate referral into a partner employment programme; the App never duplicates casework.
4. Add a commute-feasibility check per listing.
5. Report outcomes in formats a partner employment programme already uses — no parallel metrics.

**Success metric:** Listings with verified access records; referrals to a partner employment programme; 90-day retention where that programme already measures it.

**Phase:** 3 (Live Fusion).

**Primary repo:** access-tools.

---

## Idea 7 — Accessible Housing

**Pitch:** A housing finder and an overnight-room finder recorded at place-page depth, plus anonymised wait and barrier evidence.

**Contains:** F-12 Accessible Housing Finder · F-27 Accessible Overnight Accommodation Finder.

**Cross-references:** F-19 (Idea 8), F-03 place depth applied to dwellings (Idea 1).

**Problem:** Truly accessible units are scarce, poorly described, and allocated through fragmented lists. “Accessible” in a listing can mean anything from a grab bar to full roll-in access. Travellers face the same problem nightly: hotel “accessible rooms” with a high bed, no transfer space, and a shower that is not roll-in.

**What to build:**
- Housing finder (F-12): listings and social-housing signposting recorded at F-03 depth — entry, door widths, washroom transfer facts, lift reliability — with verification tiers and honest “unverified” labels. The App lists and signposts; it does not allocate housing.
- Overnight finder (F-27): room-level records — bed height, transfer space, roll-in shower, hoist availability. The App does not book and does not guarantee availability.
- Barrier-and-wait evidence, aggregated and anonymised, flows to Idea 8.

**Build steps:**
1. Define the dwelling and room record schema from F-03 fields, reviewed by people who have searched (Phase 0).
2. Seed social and accessible housing signposting from public lists under licence review; label every record’s tier.
3. Build room-level overnight records for an initial city set, photo-verified (Idea 12).
4. Add consented barrier reporting (applied, waited, refused, unsuitable — aggregate only).
5. Deliver the first housing evidence pack for advocacy use.

**Success metric:** Verified dwelling and room records; share of listings with complete critical fields; evidence packs delivered.

**Phase:** 2–3.

**Primary repo:** access-tools.

---

## Idea 8 — Advocacy Engine

**Pitch:** Timestamped, mapped, province-wide evidence for campaigns — parking, coverage, housing — with small-community suppression as a hard rule.

**Contains:** F-19 Reporting and Analytics for community organisations and municipalities · System S7 KPI / Evaluation and Logic-Model System.

**Cross-references:** F-07 parking reports (Idea 1), F-26 coverage diary (Idea 5), F-12 housing evidence (Idea 7).

**Problem:** Advocacy evidence is often episodic: surveys, stories, and staff effort. Municipalities and ministries decide on data. If the data does not exist, cost arguments go unanswered.

**What to build:**
- Analytics (F-19): aggregated, de-identified reporting — blocked curb cuts by ward, elevator outage hours by station, misused parking bays by district, washroom deserts by neighbourhood — with small-community re-identification suppression as a hard rule: in a small town, an aggregate can be a person, and the system must refuse to publish it.
- Evaluation system (S7): the master plan’s logic model and KPI tables become the App’s own measurement spine.
- Campaign workspaces: each live campaign (coverage, housing, parking) gets a defined evidence spec — what will be collected, with what consent, reported how — approved before collection starts.

**Build steps:**
1. Map every proposed report to an existing programme or advocacy indicator; drop any report nobody will use.
2. Build the aggregation and suppression engine; test re-identification risk on synthetic small-community data.
3. Launch parking and outage analytics first (data already flowing from Ideas 1–2).
4. Add coverage and housing evidence packs (Ideas 5, 7) on approved specs.
5. Review with the partner organisation on a regular cadence; publish methodology openly.

**Success metric:** Evidence packs delivered per campaign per year; municipal or ministry citations of published aggregates; zero re-identification incidents.

**Phase:** 3 (Live Fusion), design from Phase 1.

**Primary repo:** access-main.

---

## Idea 9 — Emergency and Safety

**Pitch:** Stranded by a dead elevator, a cancelled ride, or a timing emergency — one control, chosen contacts know, help is routed. The App is never an emergency service and says so plainly.

**Contains:** F-14 Emergency and Disruption Mode · F-25 Trip Sharing and Safety Check-In.

**Cross-references:** F-02 (Idea 2), F-21 (Idea 10).

**Problem:** An outage at its worst is a stranding event — for example a power-chair user at a station with no working elevator, in winter, with a body-clock deadline (FM-13). Safety tools built for the general public assume the user can walk to an alternative.

**What to build:**
- Emergency and disruption mode (F-14): a single, high-contrast, voice-operable mode that re-plans around the disruption (accessible alternatives only), surfaces the right phone numbers (paratransit dispatch, WAV, a partner information line, and 911), and works offline with pre-downloaded packs (F-15).
- Trip sharing and check-in (F-25): consent-based sharing of a journey with a chosen contact, with check-in prompts on arrival — no location-history collection. The App routes to 911 and real services first.

**Build steps:**
1. Define disruption playbooks per failure mode (FM-01–FM-14) with people who travel and with navigators.
2. Build disruption mode on the live layer (Idea 2) plus offline packs (Idea 14).
3. Build consented trip sharing with a strict no-history architecture; independent privacy review.
4. Tabletop-test with people who travel (simulated stranding scenarios) before launch.
5. Launch with plain-language limits: what it does, what it never does.

**Success metric:** Disruption-mode resolution rate (the person reaches an accessible alternative); check-in completion rate; tabletop-test pass rate per playbook.

**Phase:** 2–3.

**Primary repo:** access-maps.

---

## Idea 10 — Caregiver and Family

**Pitch:** Spouses, parents, adult children, attendants — the people who make half of all journeys happen, designed for, with permission and boundaries.

**Contains:** F-21 Caregiver Mode.

**Cross-references:** F-16 family peer stream (Idea 3), F-25 check-in (Idea 9), F-05 profile sharing rules (Idea 1).

**Problem:** Caregivers and attendants carry logistics, bookings, and worry, yet almost every accessibility tool pretends the traveller is alone.

**What to build:** Caregiver mode (F-21): a permission-bounded companion view — the person who owns the profile grants, scopes, and can revoke exactly what a caregiver sees (a shared journey, a check-in, an equipment profile for booking purposes). Nothing is shared by default; every grant is logged and visible to that person. Family peer connection routes to a partner family peer programme through Idea 3’s governed pathway.

**Build steps:**
1. Co-design permission scopes with travellers and family caregivers — the profile owner’s control is the feature.
2. Build grant, scope, revoke, and an audit log; test revocation propagation.
3. Add shared journey and check-in views (Ideas 1, 9).
4. Route family peer requests to a partner family peer programme (only with that organisation’s agreement).
5. Pilot with traveller–caregiver pairs; measure planning time saved (self-report) and revocation correctness.

**Success metric:** Active caregiver links with correct scoping (audit); zero unauthorised-access incidents; pair satisfaction (survey alignment, Idea 8 / S7).

**Phase:** 2–3.

**Primary repo:** access-main.

---

## Idea 11 — Community Events and Social

**Pitch:** Community already gathers. The App makes sure everyone can actually get in the door — for that event, that night.

**Contains:** F-13 Events and Venues.

**Cross-references:** F-29 Rest/Sensory (Idea 1), F-03 venue records (Idea 1), F-16 community (Idea 3).

**Problem:** Event accessibility is usually a venue-level claim, when what matters is that event, that night: seating, sightlines, washrooms in event configuration, quiet space, and livestream access.

**What to build:** Events and venues (F-13): a per-event accessibility record, never inherited from the venue record — step-free route for the event layout, accessible seating and sightlines, washroom configuration, sensory and quiet provision (with F-29), livestream and remote-participation links where they exist, and the journey plan to the door via Idea 1. Fundraising events may carry their giving pathways.

**Build steps:**
1. Define the per-event record template with event organisers, using one worked example.
2. Build event records joined to venue place records and journey planning.
3. Add remote-participation and livestream fields as first-class, not footnotes.
4. Pilot across one event season, including one Northern or regional event.
5. Report attendance and access-friction data in aggregate only.

**Success metric:** Share of listed events published with complete per-event records; attendance at listed events; access-friction reports per event trending down.

**Phase:** 2 (Verified Core).

**Primary repo:** access-help.

---

## Idea 12 — Access Auditors and Venue Dashboard

**Pitch:** A trained community that verifies, venues that can fix and dispute, and a correction service level the App publishes and keeps.

**Contains:** F-04 Photo-Verified Audits · F-17 Volunteer Auditor Programme and Gamification · F-18 Venue-Owner Dashboard and Fix-It Workflow · System S2 Verification-Tier and Freshness-Decay Trust System · System S3 Correction / Report Workflow with Published SLAs.

**Cross-references:** F-19 (Idea 8).

**Problem:** Listings on public access maps often go stale, and people cannot get them fixed. A map that lies confidently is worse than no map for a person who cannot improvise around a barrier.

**What to build:**
- Photo-verified audits (F-04): structured, photographed, measured audits — not star ratings.
- Verification tiers (S2): surveyor / peer / business-claim / live-feed tiers with freshness decay — a record’s trust visibly ages and drops tier until re-verified.
- Volunteer auditor programme (F-17): trained volunteers earning points, badges, and ranked standings for verified contributions only — gamification in service of accuracy, never volume.
- Venue dashboard (F-18): owners claim their venue, see their record, fix facts through the business-claim tier, and dispute through a defined path.
- Correction workflow (S3): every report gets a tracked correction path with published service levels.
- Automated extraction may propose records only, behind a human-review error gate: under 5% error per field type on at least 100 sampled proposals, or the pipeline does not publish.

**Build steps:**
1. Publish the tier, decay, and service-level rules before the first record is collected — rules first, data second.
2. Build audit capture (structured fields, photo evidence, and measurement prompts).
3. Train the first auditor cohort (with a partner volunteer process if a partner organisation agrees — never assumed).
4. Build venue claim, fix, and dispute workflow with a full audit trail.
5. Publish the first service-level performance report — including misses — on schedule.

**Success metric:** Median correction time versus the published service level; share of records in-date by tier; audit quality-assurance pass rate; automated-proposal error rate per field type (under 5% gate).

**Phase:** 1–2 (rules in Foundations; programme in Verified Core).

**Primary repo:** access-tools.

---

## Idea 13 — Play and Rehab Games

**Pitch:** Cognitive play that a person with limited hand function can actually play — joyful, Ontario-flavoured, and honest: fun and engagement, never medical promises.

**Contains:** All 50 games — G-01 to G-50 (master plan, Part 4B).

**Cross-reference:** F-17 gamification mechanics (Idea 12) are a separate system. Each game’s progression and scoring are specified in the master plan.

**The 50 games, by cognitive area:**

| Area | Games |
| --- | --- |
| Speed (8) | G-01 Speed Match · G-02 Speed Pack · G-03 Highway Hazards · G-04 River Ranger · G-05 Splitting Seeds · G-06 Penguin Rally · G-48 Speed Match Overdrive · G-49 Spatial Speed Match |
| Memory (9) | G-07 Familiar Faces · G-08 Follow That Frog · G-09 Memory Match · G-10 Memory Matrix · G-11 Memory Serves · G-12 Pinball Recall · G-13 Tidal Treasures · G-14 What's My Name? · G-47 Memory Match Overdrive |
| Attention (9) | G-15 Eagle Eye · G-16 Train of Thought · G-17 Feel the Beat · G-18 Star Search · G-19 Skyrise · G-20 Playing Koi · G-21 Lost in Migration · G-22 Assist Ants · G-23 Trouble Brewing |
| Flexibility (7) | G-24 Robot Factory · G-25 Ebb and Flow · G-26 Disillusion · G-27 Color Match · G-28 Brain Shift · G-29 Space Trace · G-50 Brain Shift Overdrive |
| Problem-solving (6) | G-30 Ruled Out · G-31 Pirate Passage · G-32 Pet Detective · G-33 Organic Order · G-34 Masterpiece · G-35 Fuse Clues |
| Language (6) | G-36 Contextual · G-37 Continuum · G-38 Editor's Choice · G-39 Taking Root · G-40 Word Bubbles · G-41 Word Snatchers |
| Math (5) | G-42 Raindrops · G-43 Chalkboard Challenge · G-44 Halve Your Cake · G-45 Magic Chance · G-46 Top That |

**Problem:** Mainstream brain-training games assume two fast hands and a mouse. For many SCI users — especially tetraplegia — those games are unusable. No clinical or rehabilitative benefit is claimed for any game. These are games — adapted with rigour, offered with honesty.

**What to build:** Each game carries the same spec: cognitive area, adapted mechanic, accessibility redesign, an Ontario twist (local places, seasons, transit, lakes, and life), difficulty and progression, controls across touch / switch / voice / gaze / keyboard, scoring, and safety notes. Play is a reason to return between journeys, and can tie into community life via Idea 11 (friendly challenges, event tie-ins) without ever gating essential services behind play.

**Build steps:**
1. Build the accessible game shell (all five control modes, Idea 14) once — every game inherits it.
2. Build the prototype’s 10 games (master plan, Part 5 demo scope) to full spec.
3. Play-test each with switch, voice, and gaze users — not only touch.
4. Grow in batches toward all 50, batch-gated by play-test results.
5. Publish per-game accessibility conformance; retire or fix any game that fails its control-mode tests.

**Success metric:** Weekly active players; session completion rate by control mode (parity across modes is the metric that matters); zero games shipped with unmet control-mode specs.

**Phase:** 1 (10-game prototype set) → 4 (full 50 at Scale).

**Primary repo:** access-tools.

---

## Idea 14 — Voice-First and Full Accessibility

**Pitch:** An accessibility app that is not fully usable — by voice, switch, eye-gaze, one hand, in French, and offline in Northern Ontario — is a press release, not a product.

**Contains:** F-20 Voice, Switch and Eye-Gaze Operation · F-22 French Mode · F-15 Offline Packs.

**Cross-references:** System S6 consent in accessible form (Idea 15); persona 6 (Northern / remote), persona 7 (Francophone).

**Problem:** The master plan sets the legal floor (AODA / Integrated Accessibility Standards, Ontario Building Code context) and aims above it: WCAG 2.2 AA as the design target, with switch, voice, eye-gaze, one-hand, low-vision, and cognitive specifications, tested with SCI users, not simulators. Connectivity cannot be assumed. French is not a translation task: in designated areas the French Language Services Act’s active offer applies.

**What to build:**
- Full alternative operation (F-20): every core task — plan, check, report, connect, play — completable by voice, switch scanning, or eye-gaze, with one-hand and low-vision design throughout.
- French mode (F-22): full shell and content equivalence, active offer in designated areas, French content governed as content — not an afterthought produced only by machine translation.
- Offline packs (F-15): downloadable regional packs (places, washrooms, paratransit rules, playbooks) with defined pack types, sizes, sync, and conflict rules. The Toronto-core offline pack is in the prototype scope.

**Build steps:**
1. Set the accessibility audit gate (Idea 15 / S6–S7): no feature ships failing WCAG 2.2 AA or its control-mode tests.
2. Build voice, switch, and gaze operation into the shell from day one (semantic HTML foundation) — never retrofitted.
3. Commission French content governance (human translation workflow, active-offer rules).
4. Build offline pack generation, sync, and conflict handling; test in airplane mode and low-connectivity field conditions.
5. Run the first full audit with SCI users across all access methods; publish results and fixes.

**Success metric:** Audit-gate pass rate per release; task-completion parity across control modes in user testing; French content equivalence share; offline task success rate in field tests.

**Phase:** 1–4 (foundational in Phase 1, audited every phase).

**Primary repo:** access-main.

---

## Idea 15 — Trust Platform

**Pitch:** Health-adjacent data, location, and disability status are among the most sensitive data a person has. This platform earns the right to hold any of it — or it does not hold it.

**Contains:** System S1 Verified Data Engine and Counting Discipline · System S5 Open-Data Catalogue and Ingest Pipeline with Licence Register · System S6 Privacy Impact Assessment / Threat Model / Consent Engine. Primary home also for the governance faces of S2 (verification tiers), S3 (correction service levels), and S7 (evaluation) — specified operationally in Ideas 12 and 8. Every idea above runs on this platform.

**Problem:** PHIPA versus PIPEDA status is an undecided legal question. Location and profile data invite re-identification, especially in small communities. Headline data claims invite inflation, which is why the master plan defines what a large data-count claim may honestly mean: defined units, per-category record and field arithmetic, no double counting.

**What to build:**
- Data engine (S1): the pipeline — ingest → normalise → dedupe → geocode → automated proposals → human review → publish with an audit trail; failed values are quarantined, never published. Data foundations are OpenStreetMap and GTFS with licence compliance built in, including the ODbL architecture for OpenStreetMap data.
- Open-data catalogue (S5): every source registered with its licence; no scraping; no source without a licence entry.
- Privacy spine (S6): Privacy Impact Assessment and threat model before launch; a consent engine implementing granular, revocable consent per data use; profile and location minimisation (the equipment profile lives on-device; trip sharing keeps no location history); retention, residency, and breach rules; children’s data rules; a privacy-by-design checklist per feature.
- The PHIPA / PIPEDA determination requires legal counsel. The architecture is built to satisfy the stricter outcome, so the answer, whichever it is, does not force a rebuild.

**Build steps:**
1. Commission the privacy impact assessment, threat model, and the PHIPA-versus-PIPEDA legal determination — before personal-data features.
2. Build the ingest pipeline with licence register and quarantine; prove it on open data only.
3. Implement the consent engine and minimisation rules; independent review.
4. Adopt the master plan’s counting discipline as a published methodology note; report data counts only under it.
5. Annual privacy and security review, reported to the pilot governance body.

**Success metric:** Privacy-assessment actions closed share; zero personal-data features shipped before the legal determination; published data counts passing independent recount under the counting discipline; zero reportable breaches (and a rehearsed breach plan).

**Phase:** 1–4 (spine in Foundations; audited at every gate).

**Primary repo:** access-main.

---

## Coverage table

Every master-plan code appears in at least one idea.

### Features F-01 to F-29 (29/29)

| Code | Feature | Idea |
| --- | --- | --- |
| F-01 | Door-to-Door Accessible Journey Planner | 1 |
| F-02 | Live Elevator and Escalator Outage Layer | 2 |
| F-03 | Place Pages at 100x Depth | 1 |
| F-04 | Photo-Verified Audits | 12 |
| F-05 | Personal Equipment Profile | 1 |
| F-06 | Washroom Finder (transfer specs, change tables, hoists) | 1 |
| F-07 | Parking Finder | 1 |
| F-08 | Paratransit Booking and Tracking Links | 2 |
| F-09 | Health and Services Finder | 4 |
| F-10 | Benefits and Equipment-Funding Navigator | 4 |
| F-11 | Employment Finder | 6 |
| F-12 | Accessible Housing Finder | 7 |
| F-13 | Events and Venues | 11 |
| F-14 | Emergency and Disruption Mode | 9 |
| F-15 | Offline Packs | 14 |
| F-16 | Community and Peer Layer with Moderation | 3 |
| F-17 | Volunteer Auditor Programme and Gamification | 12 |
| F-18 | Venue-Owner Dashboard and Fix-It Workflow | 12 |
| F-19 | Reporting and Analytics for community organisations and municipalities | 8 |
| F-20 | Voice, Switch and Eye-Gaze Operation | 14 |
| F-21 | Caregiver Mode | 10 |
| F-22 | French Mode | 14 |
| F-23 | Charging-Point Finder | 1 |
| F-24 | Winter and Route-Condition Reporting | 2 |
| F-25 | Trip Sharing and Safety Check-In | 9 |
| F-26 | Equipment Repair and Supply Finder | 5 |
| F-27 | Accessible Overnight Accommodation Finder | 7 |
| F-28 | Accessible Taxi and On-Demand WAV Finder | 2 |
| F-29 | Rest, Shade and Sensory-Space Finder | 1 |

### Games G-01 to G-50 (50/50)

All 50 are in Idea 13, as listed above: Speed 8, Memory 9, Attention 9, Flexibility 7, Problem-solving 6, Language 6, Math 5.

### Underlying systems (7/7)

| System | Description | Idea(s) |
| --- | --- | --- |
| S1 | Verified data engine and counting discipline | 15 (used by 1, 12) |
| S2 | Verification-tier and freshness-decay trust system | 12 (governance: 15) |
| S3 | Correction / report workflow with published service levels | 12 (governance: 15) |
| S4 | Adult change-table and hoist register | 1 |
| S5 | Open-data catalogue and ingest pipeline with licence register | 15 |
| S6 | Privacy impact assessment / threat model / consent engine | 15 (applied in 14) |
| S7 | KPI / evaluation and logic-model system | 8 (spine: 15) |

Also preserved: the 14 failure modes FM-01–FM-14 (cited across Ideas 1, 2, 9); the 14 personas (cited across Ideas 1, 3, 4, 10, 14); health-aware timing, winter mode, charging awareness, and plain-language / French content governance (cross-cutting, Ideas 1, 2, 5, 14); the four build phases; the prototype scope; and the unknowns discipline (U1–U97 carried forward).

---

## Backlog status (14 November 2026, America/Toronto)

Statuses describe code already in the four public repositories. Unmerged pull requests are noted and do not count as built. This round adds the plan and tracking issues only; feature code is deferred to the coding lanes.

| Idea | Title | Primary repo | Status | Issue | What's there now |
| --- | --- | --- | --- | --- | --- |
| 1 | Verified Access Map and Journey Planner | access-maps | partial | [#9](https://github.com/ALENZACODES/access-maps/issues/9) | Equipment profile, place pages on labelled fixtures, and washroom, parking, and charging finders exist. The journey engine is only in an unmerged access-maps pull request. No rest or sensory-space finder. No verified Toronto-core depth. |
| 2 | Live Disruption Shield | access-maps | partial | [#10](https://github.com/ALENZACODES/access-maps/issues/10) | A links-only paratransit directory is on access-tools main. Outage schemas exist. Live outage views are only in an unmerged pull request. No winter route-condition product and no WAV finder. |
| 3 | Peer Connect | access-help | partial | [#8](https://github.com/ALENZACODES/access-help/issues/8) | A community skeleton, moderation explainer, and demonstration directory exist. No peer request, matching, messaging, or partner routing. |
| 4 | Service Navigation and Benefits | access-tools | partial | [#19](https://github.com/ALENZACODES/access-tools/issues/19) | A dated signposting directory covers benefits, funding, equipment, employment, housing, and services. No navigator hand-off pathway and no quarterly freshness-audit workflow. |
| 5 | Health and Supplies | access-tools | partial | [#20](https://github.com/ALENZACODES/access-tools/issues/20) | A repair and supply finder exists on labelled fixtures. No coverage diary and no privacy-assessment-gated evidence packs. |
| 6 | Employment and Income | access-tools | partial | [#21](https://github.com/ALENZACODES/access-tools/issues/21) | Three employment directory records exist. No workplace access-record join, commute check, or referral flow. |
| 7 | Accessible Housing | access-tools | partial | [#22](https://github.com/ALENZACODES/access-tools/issues/22) | Two housing directory records and a hotel-room place type exist. No housing finder at place-page depth, no room-level overnight finder, and no barrier reporting. |
| 8 | Advocacy Engine | access-main | not started | [#17](https://github.com/ALENZACODES/access-main/issues/17) | No aggregation, suppression, or campaign evidence-pack product. |
| 9 | Emergency and Safety | access-maps | partial | [#11](https://github.com/ALENZACODES/access-maps/issues/11) | Emergency phone links exist in the access-tools timing package. No disruption mode and no trip sharing or check-in. |
| 10 | Caregiver and Family | access-main | not started | [#9](https://github.com/ALENZACODES/access-maps/issues/9)0 | No caregiver mode and no permission-scoped profile sharing. |
| 11 | Community Events and Social | access-help | partial | [#9](https://github.com/ALENZACODES/access-maps/issues/9)1 | Demonstration events exist in the help centre. No per-event accessibility record and no journey join. |
| 12 | Access Auditors and Venue Dashboard | access-tools | partial | [#9](https://github.com/ALENZACODES/access-maps/issues/9)2 | Verification tiers, freshness policy, and an on-device correction form exist. No auditor programme, venue-owner dashboard, or published service-level workflow. |
| 13 | Play and Rehab Games | access-tools | partial | [#9](https://github.com/ALENZACODES/access-maps/issues/9)3 | Ten of the 50 prototype games ship with keyboard, tap, and switch. Gaze is not built. The remaining 40 games are not started. |
| 14 | Voice-First and Full Accessibility | access-main | partial | [#9](https://github.com/ALENZACODES/access-maps/issues/9)4 | English and French catalogues, axe checks, and switch and voice controls on tools screens exist. French is still a draft. Offline packs are only in an unmerged pull request. Eye-gaze and control-mode parity are not done. |
| 15 | Trust Platform | access-main | partial | [#9](https://github.com/ALENZACODES/access-maps/issues/9)5 | Shared schema, validator, counting rules, verification tiers, licence notes, and a privacy-assessment draft exist. The ingest pipeline is only in an unmerged access-maps pull request. The consent engine and the legal determination are not done. |

### Reachable from the shell (16 November 2026)

The table above is dated 14 November. Since then seven feature packages merged, and an integration round gave them routes in the shell. This table says only what a person can open in the App today. All data on these routes is demonstration, sample, or the person's own entries on the device.

| Idea | Route in the shell | What is still not reachable |
| --- | --- | --- |
| 2 Live Disruption Shield | `/more/route-reports` lists route-condition reports saved on the device; `/more/accessible-taxis` is the accessible-vehicle finder over a published list of zero records | Adding a report needs a place, and no place page links to the form yet. No live feed |
| 3 Peer Connect | `/more/peers` lists the request topics | The request flow with consent and routing is built in access-help but not mounted: its text fails the shell's post-build wording check |
| 6 Employment and Income | `/more/employment`: listing with workplace access record, commute check, referral summary | Real listings |
| 7 Accessible Housing | `/more/housing`: the first housing finder | The unit and room depth finder and barrier evidence form: built in access-tools, not mounted because of a repeated-landmark fault |
| 8 Advocacy Engine | `/settings/advocacy` (evidence pack export) | The suppressed report tables and indicators are built in `packages/advocacy` but not mounted: the panel's focusable scrolling boxes fail the shell's route audit. No real consented reports exist |
| 11 Community Events and Social | `/more/events`, `/more/event-organiser` (organiser checklist), `/more/event-plan` (outing plan) | A per-event access page for a real event, and the journey join |
| 12 Access Auditors and Venue Dashboard | `/more/auditors`: observations, volunteer programme, venue responses, correction cases | Publication of any audited value |
| 13 Play and Rehab Games | `/more/games`: 19 of the 50 games, with dwell select | The other 31 games; gaze |
