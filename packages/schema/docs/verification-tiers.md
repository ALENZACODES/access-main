# Verification tiers

l'application keeps two vocabularies. They are not the same list, and a record may not collapse them into one colour. The ids and the map from access-maps and access-tools are in [TIERS.md](../TIERS.md). Tier E is the desk tier in Part 3 Table T3-14.

## Canonical tiers

From Part 1 section 5.5 and Part 3 Table T3-14. Stored as `tier` on provenance and on every field fact.

| Tier | Who | What the record must show |
| --- | --- | --- |
| 0 | Open-data import | Source, licence, retrieval date. Not App-verified. |
| 1 | Business or operator claim, including GTFS `wheelchair_boarding` | Claim date. Not a measurement. |
| 2 | Peer report | Evidence the peer supplied. Stale after 90 days for washrooms and 180 days for venues. Those two periods are estimates in the plan. |
| 3 | Trained surveyor | Protocol version, verifier role, method, observed date. A washroom also needs at least one photo id. |
| 4 | Live feed or corroborated status | Feed time, receipt time, and an expiry. Status older than 30 days leaves the headline count. |
| E | Desk check of an official page | Source link and desk-verification date. No eligibility decision. |

Tier 3 and the label `VERIFIED` fail validation when evidence is missing. Unknown stays `unknown` or `UNKNOWN`. A missing number is not zero.

## Prototype labels

Part 5 Day 1 uses four labels. A record with `publication_context: "prototype"` may carry only `PROTOTYPE-UNVERIFIED` or `SEEDED-OPEN-DATA`. It cannot carry `VERIFIED` or tier 3, because this prototype does not produce survey evidence.

| Prototype label | Canonical tier it may sit on |
| --- | --- |
| `SEEDED-OPEN-DATA` | 0 |
| `PROTOTYPE-UNVERIFIED` | 0 or 1 |
| `COMMUNITY-REPORTED` | 2, and not on a prototype record |
| `VERIFIED` | 3, with evidence, and not on a prototype record |

## Freshness

A stale field stays visible and stays in the headline count until it is older than 730 days (Table T3-15). The layer date that turns the stale flag on is earlier: 90 days for washrooms, charging, and benefits (estimate), 180 days for tier 1 claims and tier 2 venues (estimate), 365 days for tier 3 measurements. November through April, a segment last observed in May through October is winter-unverified. That flag does not delete the summer observation.

Status observations use a 30-day snapshot. After that they are not headline pieces. The plan does not fix a minute threshold for "show the feed as unknown"; each outage record carries its own `expires_at`.
