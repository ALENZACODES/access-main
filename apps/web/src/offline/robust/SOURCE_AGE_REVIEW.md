# Offline source date review

The live `/offline` dashboard mounts the date review through
`mountOfflineSourceAge`. The panel reads the dashboard's existing region
inventory and current manifest. It does not download cells, create a map,
change stored data, or automatically request newer information.

Each cell's source, open licence, date and listed bytes are retained as
source metadata. The publication date is compared with a user-controlled
threshold measured in calendar days. The threshold is for reviewing data
age; it is **not** an expiry date, a freshness guarantee or a judgement about
a place's physical accessibility.

The model has two separate axes: source-date bands (recent, older, future,
UNKNOWN), and local-copy states (saved, missing, stale, unreadable, UNKNOWN).
Unlisted cells, missing inventories, duplicate IDs, invalid source dates,
unsupported licences and metadata conflicts fail closed. No evidence tier is
inferred from age or downloaded bytes: it remains UNKNOWN.

Native labelled controls have 44-pixel minimum targets. The English and
French catalogue uses the literal UNKNOWN token for absent evidence. French
messages use the proper apostrophe and typography spacing. Search and
pagination are bounded to keep the interface responsive for large regions.

Explicit text and JSON export buttons create a device-local file containing
only metadata, never downloaded cell bytes. No upload or tracking is added.
The review is built entirely from existing first-party sources and requires
no new endpoints, dependencies, secrets or scheduled tasks.

Run the repository's standard `npm run lint`, `npm run typecheck` and `npm test`
commands after applying the files to current main. Focused tests are
`sourceAgeReview.test.ts`, `sourceAgeCopy.test.ts`,
`sourceAgeExport.test.ts` and `sourceAgeWiring.test.ts`.
