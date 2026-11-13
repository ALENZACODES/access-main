# Counting rules

A **piece** is one populated field value on one canonical record. This is Table T3-12, not a count of places.

Counted:

- A collected value that is not empty and not an unknown token.
- `unknown` or `unknown_recorded` only when `tri_state_observation` is true and method, `observed_at`, and `source_id` are present.
- The number zero, when it was actually observed.
- One array as one piece, not one piece per item.
- One linestring as one piece, not one piece per vertex.

Not counted:

- `unknown`, `UNKNOWN`, empty, null, `not_applicable`, and `not assessed` without observation metadata.
- `derived: true` copies. Access-maps uses this for coordinates copied onto a child.
- A French value when the English value on the same record is already a piece. If only the French value is populated, it counts once.
- Identifiers, schema versions, provenance, links to child records, and computed tier summaries.
- Free-text notes on correction reports (`note`).
- User profiles. They stay on the device.
- Source and licence registry rows. They are provenance.
- Journeys. Legs repeat other records, so the journey is a derived product.
- Records with `example: true`.
- Records identified as fixtures without that flag: a path with a `fixtures` directory or a `.synthetic.` file name, an id that starts with `example-` or `synthetic-`, or source id `example` or licence id `not-a-real-dataset`. The flag alone is not the only signal.
- Values older than 730 days.
- Status observations outside the 30-day window.
- Values with no date.

The counter also reports **accessibility-fact pieces** on their own. Those are measurements, barriers, tags that describe access, and live status. Names, addresses, phones, and coordinates are pieces too, but they are not accessibility facts. `headline_pieces = accessibility_fact_pieces + other_pieces`.

Section 5.6's 500,000 is illustrative arithmetic: 250,000 venue field-values, 100,000 path, 50,000 transit, 100,000 washroom. Table T3-13's 502,300 is a target across 19 categories. Neither number is a claim that a file has reached it. The report repeats the definition, the tier split, and the as-of date whenever it prints a total.

Import records from access-maps use the same piece rule their pipeline uses: a non-derived field whose value is not `UNKNOWN`. That rule is the Table T3-12 rule applied to their envelope. Child fields count on the child after migration, not twice.
