# Round 8 CI corrections

The complete round-eight source and specs are supplied against the current
main tree. The Playwright runner discovers the `.spec.ts` files under `e2e`.

- Native `<input type="radio">` elements are recognized inside labelled ARIA
  radiogroups. Empty groups and multiple checked radios still produce findings.
- The shell and embedded tool language controls are audited as independent
  groups. Multiple pressed choices within either group still fail.
- Embedded employment and auditor forms receive accessible names based on
  their displayed headings and field labels, with EN/FR names refreshed when
  the language changes. Personal field values are never used in these names.
- French fixture non-breaking spaces are inserted as Unicode code points so
  ESLint's irregular-whitespace rule does not reject the source.
- The positive reflow fixture uses an actual 44px link target. The size audit
  is unchanged and still rejects undersized controls.

Local Chromium fixtures and strict TypeScript checks can exercise this package.
A full repository `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run test:e2e` are required before a green CI claim. Accessibility facts
without evidence remain UNKNOWN; source, licence, and observation date are not
inferred by these tests.

## Follow-up for PR #294

The French spacing fixture uses literal TypeScript Unicode escape sequences
(`\u00A0` and `\u202F`) instead of source-code non-breaking spaces. The
form audit counts native radio inputs and synthetic radio widgets without
counting a wrapped native input twice. Embedded language selections are
checked independently of the App shell. Negative tests still fail for empty
radio groups, multiple checked radios, conflicting language choices, unnamed
multi-form pages and undersized interaction alternatives.

No live-data assumptions or inferred accessibility statuses are added.
