# Migration from access-maps PR 1

Source: `ALENZACODES/access-maps`, pull request 1, branch `cursor/ontario-open-data-pipeline-986f`, commit `d832f91abbc8570e3cf165a1b584204efd093c00`.

The import schemas in `schema/import/` keep the access-maps `$id` values and the same required fields. An unmodified venue, washroom, path, transit stop, or source-registry row validates without a rewrite. `schema/import/fields.json` is the field list from that branch.

`migrateImportRecord` builds canonical drafts. It copies values. It does not invent units, booleans, or agency names.

## Record split

| Import `tranche` | Canonical records |
| --- | --- |
| `venue` | one `place` plus one `entrance` (`id` + `#entrance`) |
| `washroom` | one `washroom` |
| `path` | one `segment` |
| `transit` | one `transit_stop` |

Venue fields are partitioned. Every key in `schema/import/fields.json` `venue` is either a place key or an entrance key, never both. Entrance keys are the door, ramp, step, kerb, surface, and elevator tags. The entrance record is emitted even when every entrance field is `UNKNOWN`, so the gap count moves with those fields instead of disappearing.

`record_status` is `draft`. Published place records require municipality and geocode fields the import does not have. Those stay absent rather than being filled in.

`publication_context` is `canonical`. `prototype_label` is `SEEDED-OPEN-DATA` only when every field tier is 0. Tier 1 GTFS rows get no prototype label. Provenance `source_date` and `record_date` are the field `retrieved_at`, because the import has one date.

## Renames that copy the value unchanged

| Import key | Canonical fact | Records |
| --- | --- | --- |
| `name` | `name_en` | place, washroom |
| `name` | `stop_name` | transit stop |
| `lat` / `lon` | `latitude` / `longitude` | place, washroom, transit stop |
| `addr_street` | `address_street` | place |
| `addr_city` | `address_city` | place |
| `addr_postcode` | `postal_code` | place |
| `website` | `website_url` | place |
| `opening_hours` | `hours_general` | place |
| `opening_hours` | `hours_available` | washroom |
| `location_type` | `stop_type` | transit stop, only when the token is already in the canonical enum |
| `wheelchair_boarding` | `gtfs_wheelchair_boarding` | transit stop, only for `some_vehicles_accessible`, `boarding_not_possible`, or an unknown token |
| `parent_station` | `parent_station_id` | transit stop |
| `kind` | `segment_type` | segment, only when the token is already in the canonical enum |

`import_field` stores the access-maps key. `source_key` stays the original tag or column (`geometry`, `amenity`, `wheelchair_boarding`).

Every other import key is stored once under `imported_facts` with that key. It still counts.

## What is deliberately not mapped

| Import value | Not written as | Why |
| --- | --- | --- |
| `wheelchair=yes` | `step_free` or a door width | An OSM tag is not a measurement. |
| `adult_changing_table` | `adult_change_table_present` boolean | A tag is not coerced to true or false. |
| `door_width` text | `door_clear_width_mm` | The unit is not in the import. |
| `addr_housenumber` + `addr_street` | one formatted address | Joining them would create a new string. |
| GTFS code 1 | "station is accessible" | The importer stores `some_vehicles_accessible`. The canonical enum keeps that token. |
| Empty GTFS `location_type` | a new default | The importer already stored `stop` and the raw code. This step does not redo it. |
| `source_id` | `agency_name` or `geocode_source` | That would add a piece the import did not have. |

OSM rows are ODbL. `odblShareAlikeMissing` is true for the registry fixture until `share_alike` is set true. The import schema does not add that flag, because the stored registry row does not have it yet.

Piece, gap, and derived totals are unchanged by migration. The tests check that on the five real fixtures.
