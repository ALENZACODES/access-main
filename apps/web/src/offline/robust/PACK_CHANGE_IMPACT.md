# Offline pack change impact review

## Purpose

The review compares the manifest for a currently listed offline region with a second manifest manually pasted by the user. It does not download, delete, install or inspect private content. It helps someone spot changes to source names, licence declarations, dates and listed bytes before choosing whether to obtain new data. A comparison cannot establish the physical accessibility of an entrance, washroom, route or building. That condition remains `UNKNOWN`.

## Activation and install budget

The existing offline dashboard shows an **Open pack change review** action. The module is loaded by `import("./packChangeImpactPanel")` only after a user clicks. Its model, copy, report and panel modules are not exported from `offline/robust/index.ts`, which is imported by the region page. The launch action has a disposal guard and revision token, so a slow module import cannot mount after the user closes the panel or navigates away. The panel unsubscribes from the dashboard model, removes its listeners and DOM, and does not leave timers or background processes.

The service worker precaches the review chunk on first install. Opening the review for the first time works offline after installation completes. The production build includes the chunk in its 4,718,592-byte first-install budget and its 524,288-byte per-entry limit.

## Input schema

The second manifest must be a JSON object containing exactly `regionId` and `cells`. Each cell must contain exactly `id`, non-negative safe-integer `bytes`, and `provenance`, which must contain exactly `source`, `licence` and `date`. IDs are unique. Region and cell IDs cannot be blank. Source names and licences must not be blank. Dates must be valid Gregorian ISO calendar dates. Control and bidi-override characters are rejected. The list is limited to 1,024 cells, 128 KiB of UTF-8 JSON and bounded field lengths. Unsupported keys are rejected to prevent accidental import of private notes or unsupported claims. No source fields are filled from guesses.

## Comparison semantics

The view compares the listed cells in stable order: every ID from the current manifest, then IDs newly present in the second manifest. It records additions, removals, and changes to the source, licence, date and byte count. A cell may have several changed fields, all of which are preserved in the result. The delta is explicitly a difference in *listed bytes*, not a storage-availability promise.

The view also compares the manifest's original source metadata with the current local inventory. A local copy may be shown as saved only when its recorded byte count, source, licence, date and storage state match exactly. An unreadable, stale, mismatched or missing observation is `UNKNOWN`. When the two manifests have different region IDs, the overall comparison and all local availability states remain `UNKNOWN`. A removed cell's new physical accessibility is never inferred from its former record.

## User controls

The panel has a labelled paste area, Compare and Clear actions, a polite status announcement, count summary, search, filter, sorting, pages of up to 15 records, and explicit JSON/text download actions. Native form elements and action buttons provide a minimum of 44 CSS pixels for touch. Cell IDs and source strings are inserted through text nodes only. Changing a local inventory after a comparison updates storage status without turning a physical condition into a known fact. All downloaded reports contain source-listing metadata and follow-up questions only, never offline cell payloads.

## Quality gates

Run the full repository's ESLint, strict TypeScript, Vitest, production Vite build and existing install-budget checker; do not adjust the checker, precache exclusions, timeouts, retries or privacy exemptions. The focused test suite exercises unknown and stale inventory, source conflicts, metadata changes, untrusted JSON, pagination and bilingual output. A full CI result is required before declaring a feature release-ready.
