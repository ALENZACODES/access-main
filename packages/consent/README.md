# @access-main/consent

On-device consent engine for the App (Major Idea 15, issue #20).

- Purpose-limited: each purpose has a stable id, a version, EN/FR text and the data categories it touches.
- Explicit: `grant` needs the version the person was shown; `refuse` and `revoke` are separate actions. Using the App is never consent. The default is not granted.
- A new purpose version invalidates an earlier grant until the person grants again.
- Local only: state and the audit log live in the device's storage. There is no network code and no ingest pipeline.
- Schemas (JSON Schema 2020-12, validated with Ajv) are in `schemas/`. They carry no health fields and no third-party identifiers.

Whether a specific privacy law applies has not been determined. That needs counsel and is out of scope. The engine is built to record consent either way.

The seed purposes in `src/purposes.ts` are demonstration data (`PROTOTYPE-UNVERIFIED`). Verified tiers are not used.

Scripts: `npm test -w @access-main/consent`, `npm run test:e2e -w @access-main/consent` (Playwright + axe-core, EN and FR at 1280 and 320 px).
