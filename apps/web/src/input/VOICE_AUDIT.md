# Voice-control and target-size audit (input)

## Wired into the live app

- **/contribute, Local drafts list** (`contribute/ContributePage.tsx`). Every
  row had identical "Edit" and "Delete" buttons, so a voice command such as
  "click Edit" could not pick a row, and a screen reader read the same name
  for each one. The list is now numbered (`<ol>`), and each button is named
  with `contextualName()`: the visible label first and unchanged, then the
  row, for example "Edit: draft 2, new place, 2026-11-15" or
  "Modifier : brouillon 2, …". `contextualName()` checks the result with
  `labelInName()` and falls back to the visible label if it would ever fail
  WCAG 2.5.3. The photo "Delete" buttons are named for the photo file the
  same way.
- **Header language buttons** (`shell/AppShell.tsx`). "English" and
  "Français" now carry `lang="en"` and `lang="fr"`, so speech output reads
  each in its own language (WCAG 3.1.2) and a French voice user's
  "Français" matches.
- **CI**: `apps/web/e2e/input-voice.spec.ts` saves two drafts in English and
  in French and checks the row names, the visible label and the French
  no-break space. `apps/web/e2e/a11y-input` checks label in name on every
  route.

## Helpers

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
- `contextualName(locale, visible, context)`: see above.

## Known residual gaps

- Real speech-recognition and switch-access software has not been tested on
  these screens. Automated checks find some failures; they do not prove
  WCAG 2.2 AA.
