# P16D: end-to-end accessibility regression gates

This round extends P16, P16B and P16C without assuming unprovided application
paths or changing the production router. The new `live-round4.spec.ts` imports
all five audit modules and exercises every configured, served route. Playwright
collects `*.spec.ts` from this directory, so the modules are not orphaned.

## Run against a running web application

```sh
A11Y_BASE_URL=http://127.0.0.1:3000 \
A11Y_ROUTES=/,/map \
npx playwright test apps/web/e2e/a11y-input
```

Replace example routes with actual routes; an absent route fails. Pair languages
explicitly, without guessing application path naming conventions:

```sh
A11Y_LOCALE_PAIRS='/en/map|/fr/carte' \
npx playwright test apps/web/e2e/a11y-input/live-round4.spec.ts
```

## Failure gates

- Semantic references: unresolved `aria-controls`, `aria-labelledby`,
  `aria-describedby`, and `aria-errormessage` report failures.
- Stateful widgets: custom checkbox, radio, tab, option and switch roles
  require state and names. Invalid expanded/current/live values fail.
- Keyboard: a bounded Tab scan reports missing focus indicators, completely
  obscured focus, focus outside the viewport, and incomplete traversal.
- Reflow: major regions must fit a 320 CSS-pixel viewport; content that
  genuinely needs two-dimensional layout can identify its local exemption.
- Bypass: an explicitly labelled skip link must point to a unique working
  target. The audit does not demand an invented skip-link implementation.
- Dialogs: declared openers must reference a dialog; modal focus stays
  inside, Escape dismisses the dialog, and the trigger regains focus.
- Language: English or French is declared by HTML `lang`, and opt-in authored
  French strings follow the typographic spacing contract.
- Evidence: opt-in UI evidence requires a source, an open licence and an ISO
  calendar date. The `UNKNOWN` state cannot be inferred into a known state.
- Images, headings and landmarks retain basic assistive-technology semantics.

All violations become Playwright assertion failures. Fixtures are intentionally
local HTML with no external network calls; each violation has a corresponding
regression scenario. Live checks do not click arbitrary links or submit forms.
Dialog exercises only use an explicit `aria-haspopup="dialog"` declaration.

## Scope and interpretation

The focus-colour test detects presence, not WCAG contrast ratios; perform
separate manual contrast and screen-reader checks. A passing scan does not
assert complete WCAG 2.2 AA conformance. Browser zoom, physical switch access,
mobile virtual keyboard and speech-control usage still need device testing.
The tests do not assume the availability of offline data, fresh measurements or
an accessibility value where no source exists. They do not import external maps
or request network data from a third party.

Opt-in attributes on actual evidence components:

```html
<div data-a11y-evidence data-source="Public dataset"
     data-licence="CC-BY-4.0" data-date="2026-01-15"
     data-accessibility-status="UNKNOWN">Unknown</div>
```

Open-licence recognition is intentionally conservative; expand the allowlist
only with documented, approved licence identifiers. The tests do not grant
rights to reuse any upstream material. Source and licence data are metadata,
not a replacement for legal review of the underlying dataset.

## Repository integration

This lane is constrained to `apps/web/e2e/a11y-input/**`. Its integration is
through a live-route Playwright spec, not a fabricated application-shell change
or a new CI configuration outside the allowed scope. A CI pipeline running the
existing Playwright suite will discover the additional specs. The repository
must provide Playwright and a test server; this patch does not add dependencies
or lockfiles.
