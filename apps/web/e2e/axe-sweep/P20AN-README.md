# P20AN — evidence continuity and offline accessibility audit

The P20 journey / E2E lane is responsible for exposing failures in the App's
accessibility and offline user experience. P20AN is a read-only evidence-handoff
and recovery audit. It does **not** create place facts, edit saved packs, upload
user records, send requests, or infer a place's actual accessibility conditions.

## Features and mounts

- `p20an-evidence.ts` validates provenance, UNKNOWN semantics, route identities,
  date formats, inventory comparisons and transformations. It distinguishes
  incomplete evidence from a known observation without filling missing fields.
- `p20an-interactions.ts` models keyboard targets, dialog focus ownership,
  status announcements, navigation continuity, history and EN/FR audit matrices.
- `p20an-offline.ts` evaluates observed resource and cache states, fallback
  visibility, retry availability, service-worker observation, per-entry and
  total precache budgets, and route-preserving recovery transitions.
- `p20an-report.ts` creates localized, deterministic text/CSV/JSON handoff
  reports. It contains a round-trip source-identity check and CSV formula
  protection. French prose uses a nonbreaking space before colons and the
  required typography in the bilingual copy dictionary.
- `p20an-browser.ts` captures DOM measurements and read-only cache metadata.
  UNKNOWN remains explicit when measurements cannot be obtained.
- `p20an-index.ts` exports the contract surface. The existing Playwright
  discovery mounts `p20an-live.spec.ts`, which reads `appRoutes()` from the
  current app route helper rather than relying on a fixed route count.
- `package.json` registers five focused Node suites with `test:scripts`,
  preserving previous entries and without adding scheduled workflows.

The five Node suites use synthetic test objects only. None of the synthetic
records should be interpreted as evidence for any real Ontario place.

## Development and integration

The static route inventory comes from `apps/web/e2e/a11y-input/helpers.ts`.
The full copy of that helper accompanies this package and its current-main
regex-capture guards are preserved. All new local module imports are included.

Node 22+ is required for TypeScript import stripping during Node tests. The
normal repository CI still owns production build, package-wide lint, the
compiled precache budget and browser-based Playwright gates. Standalone tests
exercise the policy, but they do not replace full integration evidence.

No root PR body, credentials, scheduling workflows, symlinks or packaged
node_modules are required or included.
