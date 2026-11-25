# P16 Round 16 — magnification and display resilience

Scope: `apps/web/e2e/a11y-input/round16/`.

This is a separate workstream from the previous composite-widget round. It tests
how keyboard and assistive-technology workflows behave when people magnify text,
narrow the viewport, rotate a device, increase text spacing, enable forced
colors, request reduced motion, or use high-contrast and dark display settings.

## Modules

- `visual-harness.ts`: browser fixtures, geometry and overflow observations,
  media-preference snapshots, text-spacing inspection, contrast calculation,
  focus indicator inspection, target sizing and viewport helpers.
- `reflow.spec.ts`, `text-magnification.spec.ts`, `text-spacing.spec.ts`:
  narrow layouts, 200–400% text scaling, long content, spacing overrides and
  non-clipping checks.
- `forced-colors.spec.ts`, `reduced-motion.spec.ts`,
  `display-preferences.spec.ts`, `display-combination.spec.ts`:
  user preference support without removing controls, names, status or focus.
- `contrast.spec.ts`: foreground/background ratio measurements and visible
  boundaries for links, buttons, text and fields.
- `focus-obstruction.spec.ts`, `focus-scroll.spec.ts`,
  `focus-appearance.spec.ts`, `focus-visibility-matrix.spec.ts`,
  `viewport-focus-continuity.spec.ts`: focus visibility after scrolling,
  sticky content, resizing, orientation and preference changes.
- `orientation.spec.ts`, `orientation-control-visibility.spec.ts`,
  `responsive-layout-state.spec.ts`, `responsive-action-rows.spec.ts`,
  `responsive-form.spec.ts`, `responsive-media.spec.ts`,
  `scrollable-regions.spec.ts`, `overflow-diagnostics.spec.ts`:
  content reflow and scroll-container behaviour.
- `target-spacing.spec.ts`, `focus-target-geometry.spec.ts`:
  44 CSS pixel target geometry and non-overlapping actions.
- `zoom-viewport-matrix.spec.ts`, `text-reflow-matrix.spec.ts`,
  `preference-reflow.spec.ts`, `last-mile-checks.spec.ts`,
  `final-responsive-checks.spec.ts`: combined regressions.

All tests use Playwright browser APIs and local inline fixtures. No external
datasets, tile services, storage, timers, scheduled work or network calls are
introduced. The existing Playwright `testDir: ./e2e` discovers the specs
automatically. The fixtures test display and keyboard behaviour; they do not
claim to emulate a screen reader or certify a person's experience.
