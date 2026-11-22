# Manual offline recovery journal

The live `/offline` region dashboard mounts `mountOfflineRecoveryJournal` through
`offlineDashboard.ts`, and `index.ts` exports the journal's public modules.
This panel does not inspect, download, remove, or change any offline content on
its own. It uses only the existing dashboard inventory and its stated manifest.

A person can deliberately capture a local metadata snapshot before cleanup,
after a download, or at any other time. No timer, background task, network
request, or automatic snapshot is introduced. A snapshot records the listed
cell ID, expected byte count, source, open licence, source date and current
**offline copy state**. It does not store map payloads or personal details.
Snapshots stay in page memory and are cleared when the page unmounts. At most
32 snapshots and 4,000 cells per snapshot are retained. Users can clear the
journal themselves or export it as a local UTF-8 text or JSON file.

The engine fails closed when the source list or local inventory is incomplete
or inconsistent, including duplicates, cross-region entries, byte mismatches,
unlisted entries, invalid dates and unsupported licences. The literal token
`UNKNOWN` is used in both English and French. A saved copy is not evidence of
a place's physical accessibility. Recommendations are informational only.

The comparison shows a cell becoming saved or UNKNOWN, a source or size change,
a changed reason, and cells not listed in the later snapshot. It never infers
why a cell disappeared. The panel uses native controls, status announcements,
44-pixel targets, search, pagination, keyboard navigation and French
nonbreaking punctuation spacing.

Tests: `recoveryJournal.test.ts`, `recoveryJournalCopy.test.ts`,
`recoveryJournalExport.test.ts`, `recoveryJournalPanel.test.ts`, and
`recoveryJournalWiring.test.ts`. Run from the repository root with:

```
npm run lint
npm run typecheck
npm test
```
