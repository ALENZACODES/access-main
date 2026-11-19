# Offline readiness review

This read-only check is mounted from `offlineDashboard.ts` on the live offline
region page. It uses the already-present dashboard model and the host-provided
storage estimate. No additional endpoint, external tile provider, service
worker task, automatic download, or persistent data write is introduced.

The review displays a manifest cell as saved only when the currently inspected
local record explicitly matches its ID, byte count, source, open licence and
date. Stale, absent, mismatched, incomplete or unreadable observations remain
UNKNOWN for the purpose of this review. A complete inventory is required before
any saved status is counted. The documentation tier is always UNKNOWN unless a
separate, explicit tier source is provided; this module does not invent one.

Storage figures are advisory. Browser quota estimates can be unavailable or
change before the next write. The module never starts a download or claims a
location is accessible. A person can use the existing region download controls
to request a fresh copy after reviewing an outdated or missing record.

English and French labels, 44px-native controls, manual refresh, paginated
lists, search, filters, and an explicit local JSON export are included. JSON
contains metadata but no stored pack payloads. The review panel can be closed
and disposed without leaving subscriptions or an ongoing background task.

Run the repository checks from a clean checkout with dependencies installed:

```sh
npm run lint
npm run typecheck
npm test
```

The focused tests are `readinessReview.test.ts` and `readinessCopy.test.ts`.
