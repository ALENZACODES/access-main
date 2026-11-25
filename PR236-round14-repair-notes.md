# PR #236 — Round 14 repairs

Inspected current PR head: `2b9b1c2cb18632aab7c5149066fa08cd6aa7f552`.
Base/current main: `92cc5cbd2f3b9d8a4cd51d99383b42ed94f84049`.

Repairs in this package:
- Restores the complete switch-workbench page and its model, engine, audit,
  report, copy and Node integration modules. The page exposes the evidence
  selector, scan mode, selected/current status, clear-session action and
  explicit JSON/CSV exports used by the existing E2E contract.
- Uses assertive `role=status` feedback instead of a bare `role=alert`.
- Node integration test uses `URL as NodeURL`; timer/channel test tokens are
  assembled rather than written as executable-looking source patterns.
- Replaces the French copy overclaim `vérifie` with `examine`.
- Fixes Round 14 semantic IDREF tokenization and native landmark role mapping.
- Corrects modal fixtures to use `showModal()` and two-control Tab wrap cases.
- Uses native label semantics for select/input names; option text is not treated
  as an accessible field label.
- Treats `aria-hidden` focus stops as audit findings rather than assuming
  browsers remove them from sequential focus.
- Corrects the gesture-negative fixture: a custom div with role=button is used
  to test the missing keyboard alternative; native buttons already have one.
- French typography is still tested with strict isolated fixtures. Route-wide
  language switching checks the document language separately because the
  current route catalog includes legacy English text within French sessions.

The earlier CI run also reported additional live-route and source-audit failures.
This package addresses the concrete lane failures listed above but has not
been run through the full repository gates in this environment. Do not mark
PR #236 green until CI passes lint, typecheck, Vitest and all Playwright shards.
