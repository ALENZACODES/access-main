# P20D: expanded bilingual accessibility gates

These checks extend the existing P20/P20C Playwright harness. No production
modules or unknown repository files are overwritten. The two `*.spec.ts`
files are Playwright-discovered entrypoints, and they import every new runtime
module. They are intended for the web application's existing e2e CI invocation.

## Run

Set `use.baseURL` in the existing Playwright configuration to the running
local web app. Ensure the workspace already has `@playwright/test` and
`@axe-core/playwright`, as required by P20. Run the e2e command that discovers
`apps/web/e2e/axe-sweep/**/*.spec.ts` (or select this directory explicitly).

Optional `AXE_SWEEP_EN_URL` and `AXE_SWEEP_FR_URL` point to actual local
locale entry routes. Both locales must be reachable or the browser audit fails.
The sweep has a hard 100-document limit; exceeding it fails instead of
silently treating partial coverage as complete. No external tile service is
needed, and known external tile requests cause failures.

## New checks

- Bounded crawl with HTTP failures, duplicate routes and EN/FR parity checks.
- Visible-copy checks for unsupported assurances, untranslated state words,
  and French nonbreaking punctuation conventions.
- Document title, one main landmark and one visible first-level heading.
- A working skip link, visible keyboard focus, ordinary Tab progression, and
  Escape dismissal when a dialog is already open.
- 44px controls, input labels, explicit invalid-field descriptions, meaningful
  image alternatives, and live-announcement integrity.
- WCAG 2.2 AA axe tags and a 320px viewport with reduced-motion preference.
- Real offline reload with service-worker control, localized document text,
  main content, recovery action, and source-metadata retention.
- Positive accessibility records that explicitly opt into the
  `data-accessibility-evidence` test contract must include source, open
  licence, and ISO observation date. Missing metadata remains `UNKNOWN`.
- A focused deterministic spec tests invalid source dates, inaccessible
  control sizes, missing locale counterparts, offline failures and other
  failure-producing audit behaviours.

## Marking first-party evidence

A rendered record can opt in without importing a testing module:

```html
<div data-accessibility-evidence="entrance"
     data-accessibility-status="UNKNOWN"
     data-source="" data-licence="" data-observed-at="">
</div>
```

`PASS` or `BLOCKED` must have the provenance fields populated with a
permitted open licence and calendar date; unknown data is not promoted to
an accessibility statement. This DOM contract does not import or combine
geographic feeds, and does not grant reuse rights on any source.

## Scope and limitations

The suite audits actual public pages reachable from the locale entrypoints;
private, hidden, and form-generated routes require separately supplied test
navigation. The script does not submit forms, make eligibility determinations,
or alter application data. Some checks (such as a skip link and offline recovery
control) are stricter product requirements than axe alone. A passing audit is
not a substitute for manual testing with assistive technology. Existing CI
must include this directory in Playwright discovery; the package configuration
is outside this lane's permitted scope and is not changed here.

The reference contracts and e2e tests make no assumptions about actual
accessible places, paths, transit schedules, or an individual's requirements.
