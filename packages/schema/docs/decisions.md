# Schema decisions

1. **Table T3-16 rows, not the summary sentence.** The place table marks 20 fields as system or provenance ("does not count"). The paragraph above the table says 19 system fields and 81 counted candidates. The catalog follows the rows: 20 system, 80 fact candidates, 100 fields. `name_fr` is one of the 80 and does not add a second piece when `name_en` is populated (Table T3-12).

2. **Two tier vocabularies.** Canonical data uses tiers 0, 1, 2, 3, 4, and E. Prototype records use the four Day 1 labels, and a prototype record cannot be `VERIFIED` or tier 3. See `docs/verification-tiers.md`.

3. **Import records validate as they are.** Canonical records are a second shape. Migration is explicit and tested. See `docs/migration-from-access-maps.md`.

4. **Category lists stay open strings.** The plan says the category list is versioned and does not publish it. A closed enum would relabel OSM amenities.

5. **Journeys, profiles, and the source register are not headline pieces.** Journeys repeat other records. Profiles stay on the device and have no health fields. Source and licence rows are provenance.

6. **Stale is not the same as excluded.** Table T3-15 keeps stale values in the headline until 730 days. The 90-day and 180-day figures are the plan's estimates and are marked `estimate: true`.

7. **No Day 2 seed files and no `apps/web` page.** Those belong to other lanes. This package counts records it is given. It does not download feeds and it does not invent places.

8. **Schema version `1.0.0` on each record type.** A later change bumps that record's `schema_version` and notes the reason here.

9. **Ajv `strictTypes` is off.** `strict` stays on, including the check that a `required` list names properties on that same schema. `if`/`then` branches narrow an object the parent schema already types, and Ajv's strictTypes rule rejects that pattern. The validator sets `strictTypes: false` for that reason only.

10. **This package is the tier source of truth.** Canonical ids are `0`, `1`, `2`, `3`, `4`, and `E`, plus the four prototype labels. access-maps numbers and access-tools `tier-N-*` strings map into that list. The map is `TIERS.md`. In French the product is called l'application. The ids are not translated.

11. **`dist/` is not committed.** `prepare` runs `tsc`. A git install builds it. The profile has no pressure-relief reminder, washroom interval, or continuous-travel limit. Those are health-aware timing, and the prototype does not include them.
