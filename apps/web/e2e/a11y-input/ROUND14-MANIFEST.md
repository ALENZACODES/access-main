# Round 14 manifest

Baseline: access-main `92cc5cbd2f3b9d8a4cd51d99383b42ed94f84049`.

All files in this archive are under `apps/web/e2e/a11y-input/`.
New spec imports are limited to:
- `@playwright/test`
- the existing route discovery helper `./helpers`
- round-14 audit modules included in this archive.

Playwright's existing `testDir: ./e2e` automatically discovers the new `*.spec.ts`
files. No package, Playwright configuration, route, or app source is changed.

The live route suite uses `routes()` and `visit()` from the current helper.
The fixture suites include both passing and deliberately failing examples to
prove each audit detects its named regression.
