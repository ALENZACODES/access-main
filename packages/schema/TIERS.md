# Verification tiers

`packages/schema` in access-main is the source of truth for schemas and for this vocabulary. access-maps and access-tools map into these ids. They do not keep a second list.

The product is unbranded. In French it is called **l'application**. The tier ids below are not translated.

## Canonical tier ids

Stored as `tier` on provenance and on every field fact. JSON Schema accepts only these values.

| Id | Who | What the record must show |
| --- | --- | --- |
| `0` | Open-data import | Source, licence, retrieval date. Not a verification by l'application. |
| `1` | Business or operator claim, including GTFS `wheelchair_boarding` | Claim date. Not a measurement. |
| `2` | Peer report | Evidence the peer supplied. |
| `3` | Trained surveyor | Protocol version, verifier role, method, observed date. A washroom also needs at least one photo id. |
| `4` | Live feed or corroborated status | Feed time, receipt time, and an expiry. |
| `E` | Desk check of an official page | Source link and desk-verification date. Part 3 Table T3-14. No eligibility decision. |

`unknown` and `UNKNOWN` are missing values. They are not tiers. A missing number is not zero.

A TTC service alert is tier `4`. Feed time is `feed_timestamp`. Receipt time is `retrieved_at`. The schema has no `expires_at` field, and this package does not add one. When an `active_periods` entry has `end`, that end is the expiry. When a period has no end, the next snapshot replaces the alert, and the 30-day status window is what takes it out of the headline.

Tier `3` fails validation when evidence is missing.

## Prototype labels

These are display labels on `provenance.prototype_label`. They are not a replacement for the ids above. A record with `publication_context: "prototype"` may carry only `PROTOTYPE-UNVERIFIED` or `SEEDED-OPEN-DATA`. It cannot carry `VERIFIED` or tier `3`.

| Label | Canonical tier |
| --- | --- |
| `SEEDED-OPEN-DATA` | `0` |
| `PROTOTYPE-UNVERIFIED` | `0` or `1` |
| `COMMUNITY-REPORTED` | `2`, and not on a prototype record |
| `VERIFIED` | `3`, with evidence, and not on a prototype record |
| EN: Administrator or official-page desk check. Not field-verified. FR: Vérification au bureau par un administrateur ou à partir d'une page officielle. Pas une vérification sur le terrain. | `E` |

`E` is a tier id, not a fifth prototype label. The English and French text is the display wording for that id. It is a desk check. It is not field-verified.

## Migration from access-maps

Source: `ALENZACODES/access-maps` pull request 1. Field objects store a numeric `tier`.

| access-maps value | Canonical `tier` |
| --- | --- |
| `0` | `0` |
| `1` | `1` |
| `2` | `2` |
| `3` | `3` |
| `4` | `4` |
| `UNKNOWN` on `value` | not a tier. Keep the value as `unknown` or `UNKNOWN`. It does not count unless the tri-state observation rules are met. |

access-maps has no tier `E` and no prototype labels. A tier `0` import may be labelled `SEEDED-OPEN-DATA` when a prototype record is built from it. A tier `1` GTFS field may be labelled `PROTOTYPE-UNVERIFIED` on a prototype record. Do not invent `VERIFIED` for either.

`canonicalTierFromForeign` accepts the numbers and the strings `"0"` through `"4"`. It returns null for `UNKNOWN`.

## Migration from access-tools

Source: `ALENZACODES/access-tools` pull request 1, `packages/place/src/types.ts`. Those records use string tier ids and a different place shape (`PlaceRecord`). The strings map as follows. The place shape itself is not a canonical record; only the tier id moves.

| access-tools `VerificationTier` | Canonical `tier` |
| --- | --- |
| `tier-0-open-data` | `0` |
| `tier-1-business-claimed` | `1` |
| `tier-2-peer` | `2` |
| `tier-3-surveyor` | `3` |
| `tier-4-live-feed` | `4` |
| `administrator_page` | `E` |

`administrator_page` is the navigator directory field `verificationTier` on `directory-record-1.0.0` (access-tools `packages/navigator`). It means a desk check of an official page, with the page link and the date that page was read. It is not a second tier list, not field verification, and not an eligibility decision. The shell stores that record with provenance `tier` `E`. A payload field named `tier` is not this mapping.

These access-tools fields are not tiers:

| Field | What to do |
| --- | --- |
| `datasetStatus` `labelled-fixture`, `prototype-seed`, `access-maps` | Dataset status. A fixture stays a fixture. It is not tier `3`. |
| `verifierType` | Maps to evidence `verifier_role` when evidence is required. It does not set the tier by itself. |
| `value: null` | Canonical unknown. Do not coerce null to `0` or to `false`. |

`canonicalTierFromForeign("tier-0-open-data")` returns `0`, and the same for the other four strings. The canonical schema still rejects those strings until a record is rewritten with the numeric id.

`canonicalTierFromForeign("administrator_page")` returns `E`. The directory record keeps `verificationTier: "administrator_page"`. The stored provenance `tier` is `E`. Do not rewrite that field to a payload `tier`.
