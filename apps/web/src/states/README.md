# states

Wording and next actions for error and empty states (EN + FR).

- `stateCopy.ts` is a framework-agnostic model: `getErrorState(kind, locale)` and `getEmptyState(kind, locale)` return a title, description, ARIA role (`alert` for errors, `status` for empty states) and a list of next actions, each with `minTargetPx` of 44. A view renders it; this module fetches nothing.
- `errorKindFromStatus` maps an HTTP status to an error kind.
- The "accessibility unknown" empty state keeps UNKNOWN as UNKNOWN and never implies a place is or is not accessible.
- French copy uses ’, U+00A0 before ":" and U+202F before ; ! ? and inside « ». No medical or eligibility advice is given.
- Copy is original text; no data sources, so no licence or date to record.
- Test: `vitest run apps/web/src/states`.
