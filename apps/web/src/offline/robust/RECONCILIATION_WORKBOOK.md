# Offline reconciliation workbook

A local, user-initiated comparison of two historical inventory readings. The
workbook concerns explicitly listed offline cell records, not the accessibility
of any destination. Local metadata and open-licence provenance are retained;
unsupported observations remain `UNKNOWN`.

## Scope

- Capture the current manifest and region inventory after an explicit user action.
- Capture a second reading on demand, then compare lost, gained, changed,
  unchanged, and UNKNOWN local-record observations.
- Review ordered results with searching, filtering, sorting, and pagination.
- Record optional user-written notes and explicit follow-up statuses.
- Export metadata and written notes to JSON or plain text, and import compatible
  historical JSON from the same region.
- Keep everything in browser page memory; no periodic work or background storage.
- Do not download, delete, or alter cell payloads from this panel.
- Display English/French copy with French punctuation spacing and the exact
  literal `UNKNOWN` token.
- Make controls native keyboard controls with at least 44 CSS pixels of size.
- Keep the exact attribution `© OpenStreetMap contributors` where attribution
  is shown.

## Integration

`mountOfflineReconciliationWorkbook` is loaded from a dynamic import in
`offlineDashboard.ts`. It mounts into a dedicated host and is released on
navigation. Pending module loads cannot mount after dashboard disposal.
`storagePressure.ts` also delays importing `offlineDashboard`, so its substantial
subpanels no longer form a synchronous dependency of the initial offline page.
The public barrel retains the existing exports and adds the new workbook API.

## Guardrails

Historical imports are never treated as proof that current files exist.
Unknown or misaligned inventory entries are not promoted to saved. Source,
licence, date, and expected byte count changes block claims of a continuous
unchanged local copy. Only explicitly listed metadata and user notes are
exported. JSON import is limited to 524,288 UTF-8 bytes, 2,048 cells, and
256 notes of 1,200 characters each. The package makes no claims about user
suitability, medical matters, or destination eligibility.

## Quality gates

Run the full repository commands after applying to current `main`:

```bash
npm run lint
npm run typecheck
npm test
npm run build -w @access/web
npm run check:web-precache -w @access-main/budgets
```

Do not adjust byte budgets, timeouts, or unrelated performance thresholds to
make a build pass. The current permitted maximum for any precached JS entry
remains 524,288 bytes. The complete application build is required to measure
whether the split meets that threshold.
