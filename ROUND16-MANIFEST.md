# P16 Round 16 package manifest

Repository: `ALENZACODES/access-main`
Current main baseline inspected: `92cc5cbd2f3b9d8a4cd51d99383b42ed94f84049`
PR #236 head inspected: `2b9b1c2cb18632aab7c5149066fa08cd6aa7f552`

The new Round 16 feature and test files are all under
`apps/web/e2e/a11y-input/round16/`. Each local import resolves to
`visual-harness.ts`, included in the archive. Playwright discovers the specs
through the existing configuration.

The archive also contains targeted Round 14 / PR #236 repairs:
- the complete switch workbench page and its local model, engine, audit,
  report, copy and integration modules;
- corrections to dialog, focus, form-name, locale and semantic E2E audits;
- a repair note recording the observed CI failures and remaining validation.

The package does not contain a repository checkout or claim that the full
application lint, strict typecheck, Vitest and Playwright gates were executed.
A fresh CI run is required after applying it.
