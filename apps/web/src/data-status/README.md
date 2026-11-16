# data-status

Pure helpers for showing data quality in the App (EN + FR).

- `formatRate(value, locale)`: a rate is shown only if it is a finite number in 0..100. Anything else (null, undefined, NaN, text, out of range) shows **Unknown** / **Inconnue**, never 0.
- `freshness(retrievedAt, now, staleAfterDays = 180)`: `fresh`, `stale` or `unknown`. Missing, malformed or future dates are `unknown`, never `fresh`.
- `checkProvenance(p, now)`: lists issues (missing source/licence/date, invalid or future date, licence not in `OPEN_LICENCES`).
- `provenanceLine(p, locale)`: one consistent line `Source: … · Licence: … · Retrieved: …`; gaps show Unknown, nothing is guessed.
- `dataBadge(p, locale, now)`: label, provenance line, `ariaLabel`, issues and `minTargetPx` (44) for any interactive badge built on it.

`now` is always passed in so results are testable. FR strings use ’, U+00A0 before `:` and `%`.

Every dataset shown through these helpers must record source, licence (open only) and retrieval date; this module displays them and never fills them in.

Run: `npx vitest run apps/web/src/data-status`
