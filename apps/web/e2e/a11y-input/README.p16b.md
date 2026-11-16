# P16B: keyboard focus and dialog regression checks

`focus-dialog-round2.spec.ts` is discovered directly by Playwright. Run it with
`npx playwright test apps/web/e2e/a11y-input/focus-dialog-round2.spec.ts`
while the web app is served by the existing Playwright `webServer` or locally
at `http://127.0.0.1:3000`.

Set `A11Y_ROUTES=/,/your-route` to exercise actual routes and, optionally,
`A11Y_BASE_URL` to override the origin. Each configured route must load.
The route tests check reverse sequential focus and the Escape/focus-return
contract for elements declaring `aria-haspopup="dialog"`. When a route has
no such opener, the native-dialog fixture still exercises the Escape path.

This is automated keyboard coverage, not a substitute for manual switch and
screen-reader testing or a complete WCAG 2.2 AA audit. Tests do not generate
accessibility data, connect to outside services, or make claims about unknown
accessibility conditions.
