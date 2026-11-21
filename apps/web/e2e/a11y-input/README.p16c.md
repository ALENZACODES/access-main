# P16C: live-route input audit, dialog contracts and offline observations

This is a Playwright discovery directory. The new `route-audit-round3.spec.ts`
imports and runs the navigation, dialog and locale/offline audit modules against
**served application routes**. `fixtures-round3.spec.ts` checks both passing
and failing conditions deterministically. No production router is assumed or
modified; route wiring happens through the Playwright test runner and actual
pages. Both specs are discovered by the existing `npx playwright test` command.

```sh
A11Y_ROUTES=/,/map \
  npx playwright test apps/web/e2e/a11y-input
```

Use the real route paths from the application. Set `A11Y_BASE_URL` if the
existing Playwright `baseURL` or `http://127.0.0.1:3000` is not correct.
Missing configured routes are failures, not skips.

For projects with locale-prefixed routes, opt into paired English/French checks:

```sh
A11Y_LOCALE_PAIRS=/en/map\|/fr/carte \
  npx playwright test apps/web/e2e/a11y-input/route-audit-round3.spec.ts
```

`A11Y_LOCALE_PAIRS` is a comma-separated collection of `en-path|fr-path`
entries (quote the value in shells where `|` is special). It never guesses a
translation or route. The locale tests confirm language metadata and structural
accessibility, not translation quality. The French punctuation check covers
only text marked `data-a11y-localized-copy`; no changes are made to user copy.

Offline shell coverage is opt-in because an offline shell is not evidence of
complete, current, or locally stored place data. Set `A11Y_OFFLINE_ROUTES` to a
comma-separated set of real paths with a warm offline service worker cache.
The browser context is restored online in a `finally` block after every check.

The read-only evidence census examines elements explicitly marked
`data-a11y-evidence-record`. These must supply `data-source`, `data-licence`,
`data-observed-date` (ISO date), and can expose
`data-accessibility-state="UNKNOWN"`. UNKNOWN must not be inferred or
presented as a positive accessibility claim. Unmarked application records
are not guessed about or altered. There are no external feeds or fixtures.

## Coverage and limits

- Bounded forward/reverse Tab traversal detects focus mismatches and traps.
- Focusable content inside hidden or inert regions and positive tabindex are
  flagged. Visible controls, navigation, tabs and forms are checked for 44px
  touch targets; inline links inside prose use a separate exception.
- Dialog-open triggers are explicitly identified using `aria-haspopup`.
  Escape, initial focus, focus containment and return to opener are assessed.
  Unlabelled, hidden or incorrectly referenced dialogs are reported.
- Paired locale checks preserve semantic headings, language and keyboard
  traversal. Offline checks report shell survival, not dataset completeness.
- All source/test helpers are imported by live-route or regression specs.
  No third-party tile requests, uploads, credentials, scheduled jobs or network
  submissions are introduced by this lane.

This is test infrastructure, not a new app feature or proof of WCAG 2.2 AA
conformance. Physical switch, screen-reader, language, interrupted-download and
map-content testing still require manual work on supported platforms. The
existing app must actually implement any required behaviour for the live-route
assertions to pass; the tests never fabricate those behaviours.
