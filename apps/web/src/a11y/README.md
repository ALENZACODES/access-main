# a11y shell polish (AAA-reach)

Small, dependency-free helpers for shell routes:

- `contrast.ts`: WCAG 2.x contrast ratio; throws on unknown colours.
- `tokens.ts`: light/dark colour tokens; every text/focus pair is tested at AAA (7:1). Original values, no third-party palette.
- `styles.ts`: `buildA11yCss()` / `injectA11yStyles(document)`: two-tone `:focus-visible` ring (3px + 2px halo), 44px minimum targets, 8px gaps, `scroll-padding` so focus is not hidden under sticky bars, reduced-motion and forced-colors support.
- `labels.ts`: EN/FR skip-link label.

Run: `vitest run apps/web/src/a11y`.

Limits: checks are static (token pairs and generated CSS); not a substitute for manual keyboard and screen-reader testing.
