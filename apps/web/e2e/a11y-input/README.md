# Keyboard, switch and screen-reader route checks

These Playwright tests exercise keyboard navigation, sequential switch-style
activation and accessible structure on configured web routes. They use no
external services, map tiles or credentials.

These specs live under `apps/web/e2e`, so `npm run test:e2e -w @access/web`
runs them with the rest of the web Playwright suite (default route `/`).

From the repository root, with the web server running (or an existing
Playwright `webServer` configuration):

```sh
A11Y_ROUTES=/,/map,/services A11Y_BASE_URL=http://127.0.0.1:3000 \
  npx playwright test apps/web/e2e/a11y-input
```

`A11Y_ROUTES` is a comma-separated list of actual local paths. It defaults to
`/` because other route names are not known in this lane. `A11Y_BASE_URL`
overrides Playwright's configured `baseURL`; otherwise localhost:3000 is used.
A missing route fails instead of being silently skipped. Run the suite once
per supported locale, using its actual locale-prefixed routes where applicable.

Checks include landmark and heading semantics, document language, named
controls, image alternatives, forward/reverse keyboard focus, native button
activation with Enter and Space, and 44×44 CSS-pixel target dimensions on
applicable controls. The target check is intentionally stricter than some
WCAG exceptions; annotate justified exceptions in application-level tests.

Automated DOM tests cannot verify real assistive-technology announcements,
physical switch timing, complete keyboard workflows or full WCAG 2.2 AA
conformance. Follow with manual screen-reader, switch and keyboard testing.

These tests contain no accessibility-location dataset. Any future fixture
must carry its source, open licence and collection date; missing accessibility
facts must remain UNKNOWN rather than inferred.
