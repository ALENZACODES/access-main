# EN/FR axe route sweep

`axe-sweep.spec.ts` is a Playwright-discovered test. It runs axe with WCAG
2.0/2.1 A/AA and 2.2 AA rule tags on every live app route, in English and in
French, at 320px and at 1280px. The route list comes from P16's `appRoutes()`
in `e2e/a11y-input/helpers.ts`, which reads `router.tsx` plus the Settings and
More tables the router mounts, so a new page is included without copying a
path list. A link crawl is not a substitute, because unlinked or not-found
paths would be missed or scanned by accident.

Language is forced by writing `access.language` and `access.language.set` in
`localStorage` before navigation (the keys `detectLanguage()` actually reads).
Path prefixes such as `/fr` and `?lang=fr` are not used, because the shell
ignores them. Each French run also asserts `html[lang]` and visible French
copy (the skip link, Accueil, and the English language button) so a single
French page cannot pass the suite. Each run also asserts `window.innerWidth`
so a missed 320px viewport fails.

Failures include the route, language, viewport, axe rule, and target. An
explicit, documented allowlist may waive a known leftover when each entry has
a reason; an empty allowlist means every violation fails CI. These checks do
not prove WCAG 2.2 AA and are not a substitute for keyboard, switch, or
assistive-technology testing.

**Run:** From the repository root, `npm run test:e2e -w @access/web -- e2e/axe-sweep/axe-sweep.spec.ts`
(or the workspace's existing Playwright command with that path). Playwright's
`use.baseURL` must point at the local App, and `@playwright/test` and
`@axe-core/playwright` must be installed in that workspace.
