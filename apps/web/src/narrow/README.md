# narrow

Audit helpers for small screens and keyboard use, with EN and FR messages.
Findings are prompts to look, not a conformance statement. A check that cannot
measure reports UNKNOWN, never a pass.

## Checks

| Check | WCAG 2.2 | Notes |
| --- | --- | --- |
| reflow | 1.4.10 | sideways scroll or boxes past the 320px edge |
| target-size | 2.5.8 | the App's own rule is 44px, stricter than the 24px minimum |
| target-spacing | 2.5.8 | 24px circle rule for targets under 24px |
| contrast | 1.4.3 | text only; background images and unresolvable backdrops are UNKNOWN |
| name, label-in-name | 4.1.2, 2.5.3 | name is an approximation of the browser's own |
| language | 3.1.1 | lang attribute present and well formed |
| focus-obscured | 2.4.11 | focus is moved to each control, then restored |
| text-spacing | 1.4.12 | adds a temporary style, reports newly clipped content |
| i18n | none | EN/FR key parity, placeholders, French typography, text identical in both |
| offline | none | needs a service worker, reloads with the network off |

Thresholds come from WCAG 2.2 (W3C Recommendation, 2023-10-05,
https://www.w3.org/TR/WCAG22/). The report records this source and date.

## Where it is used

- `index.ts` exports everything.
- `cli.ts` runs every check over a list of routes; `bin.mjs` launches it.
- `panel.ts` exports `narrowRoute` (`/dev/narrow`), a plain-DOM panel that audits
  the current document at its current width. The shell registers this route.
- `report.ts` writes text, JSON and an HTML report (320px safe, 44px buttons).

## CI gate


`apps/web/e2e/narrow-audit.spec.ts` visits every `ROUTES` entry from
`apps/web/e2e/shell-routes.ts` at 320px wide, in English and in French. Any
reflow or sub-44px target finding fails CI unless it is listed in
`NARROW_ALLOWLIST` in `allowlist.ts`, with a route, kind, id fragment, and
reason. Prefer fixing the layout. An empty allowlist means every finding fails.

## Run

```
npx tsx apps/web/src/narrow/bin.mjs --base-url http://localhost:5173 \
  --route / --route /map --offline --lang fr --out reports/narrow \
  --en src/i18n/en.json --fr src/i18n/fr.json
```

Exit code 0 when no check failed, 1 when one failed, 2 on a usage or run error.
`--strict-unknown` also fails on UNKNOWN. Needs `playwright-core` or
`@playwright/test` and a Chromium.

## Limits

- Contrast is UNKNOWN where no ancestor has an opaque background. Set a
  background on the root element to get a verdict.
- A box in its own scroll container (a wide table) is still reported by reflow.
- Elements that are hidden or have no size are counted as "not measured".
- Focus is moved to up to 60 controls per route; focus and scroll are restored.
- Offline needs a service worker; browsers without one give UNKNOWN.
- Only the first 3000 elements of a page are read.
