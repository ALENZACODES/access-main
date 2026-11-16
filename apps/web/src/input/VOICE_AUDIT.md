# Voice-control and target-size audit (input)

Pure helpers in `voiceAudit.ts`, no DOM and no data sources:

- `labelInName(visible, accessibleName)`: WCAG 2.5.3 Label in Name. Case,
  punctuation and spaces (including U+00A0 and U+202F) are ignored; accents
  are kept; matching is on whole words. Returns `null` (unknown) when there is
  no visible text or no accessible name; it never guesses.
- `auditControls(controls)`: also checks the 44 px minimum target size.
  Controls with no measured size are reported as `target-size-unknown`, never
  as passing.
- `describeIssues(controls, "en" | "fr")`: user-facing text from
  `voiceAudit.messages.ts` (FR typography: ’, U+00A0 before ":", U+202F inside « »).

Not wired into any screen yet. Feed it descriptors gathered by a Playwright
spec or a dev-only check. Run: `vitest run apps/web/src/input/voiceAudit.test.ts`.
