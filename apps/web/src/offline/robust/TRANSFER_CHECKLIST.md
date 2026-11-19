# Offline transfer checklist

The live `/offline` dashboard mounts the transfer checklist panel through
`mountOfflineTransferChecklist`. This is a device-local metadata aid, not a
pack-copying or data synchronisation mechanism.

A user may save a checklist that includes the listed cell identifier, byte
count, source, licence, data date, explicitly known evidence tier and the
current scan's offline status. The source manifest has no evidence tier, so
exports use `UNKNOWN` unless a separate documented source is provided in a
future version. The import rejects extra properties, duplicate identifiers,
non-calendar dates, control characters, unsafe identifiers and files above
256 KiB. It does not trust the imported status as evidence that the present
device has downloaded a cell.

The panel displays changes to the listing, including cells that were newly
listed or removed, and keeps unknown states visible. The selected file stays
on the device. The panel writes no pack payloads or metadata to storage and
makes no HTTP calls. An imported file never initiates a download.

English and French copy are provided. Controls are keyboard operable, have a
44px minimum target, and use a live status region. Only metadata is exported.

Test files: `transferChecklist.test.ts`, `transferChecklistCopy.test.ts`.
The existing dashboard and index are the only modified integration files.

The source ledger remains mounted alongside this checklist, and both panels
are exported from the same public barrel. Imported checklists require a
licence on the approved open-licence list, and only the local inventory can
establish whether data is stored on this device. The status token is `UNKNOWN`
in both English and French; the rest of the French interface is translated.
