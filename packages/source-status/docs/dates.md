# Source-register dates

`retrieved_on` and `as_of` are **UTC calendar dates** in `YYYY-MM-DD` form, or the
value `Unknown`. They are not local dates and not date-time instants.

- `retrieved_on` is the UTC calendar date on which the source was fetched.
- `as_of` is the UTC calendar date the registered data applies to.

A missing `retrieved_on` is treated as `Unknown` in the dashboard. An `as_of`
value is required on every register entry.
