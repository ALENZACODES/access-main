# Data-QA display helpers (P6)

Wired into the live **/data-status** page (`pages/DataStatusPage.tsx`):

- Each cached record gets a `dataBadge()`: a provenance line (`Source`,
  `Licence`, `Retrieved`, with Unknown for any gap, never blank or guessed),
  an age label and a licence kind.
- The age label states the age ("Retrieved 12 days ago"). Data older than
  180 days adds "May be out of date." Nothing is ever called "recent".
  Missing, invalid or future dates read "Retrieval date unknown".
- `licenceKind()`: `open`, `terms`, `unrecognised` or `unknown`. Accepted
  provider terms (Metrolinx Access and Use Agreement, OGL-Ontario-Metrolinx,
  LTC Open Data Terms of Use) are `terms`: shown as "Used under the
  provider’s terms of use. Not an open licence." and never flagged. An unlisted
  licence is `unrecognised`, which is not a claim that it is closed.
- `formatRate()` shows the share of cached records with no usable retrieval
  date. With no records it is Unknown, never 0. French uses « Inconnu » for
  the masculine « taux » (visible text and spoken label agree) and
  « Inconnue » for source, licence and date.

`e2e/data-status-quality.spec.ts` seeds records and checks the page in English
and French.
