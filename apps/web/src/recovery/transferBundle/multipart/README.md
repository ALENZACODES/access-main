# Multi-part recovery transfer

This feature extends the existing recovery transfer bundle when a case contains
more exports than one ordinary bundle can hold. It does not replace the native
export formats. Each numbered part is still an ordinary recovery bundle and
can be opened separately by the existing bundle reader.

## User flow

1. Choose at least two recovery JSON exports.
2. The reader checks every file with the native schema validator before it is
   added to the draft.
3. The planner keeps the selected order and divides the exports into numbered
   parts without exceeding the ordinary bundle member or byte limits.
4. The user creates one `.rxs` transfer-set file. The file contains every
   ordinary bundle part and a fingerprint over the ordered part fingerprints.
5. A recipient opens the `.rxs` file. No original export is made available until
   all parts have been decoded, fingerprinted, and opened by the ordinary
   bundle reader.
6. The recipient can save a complete ordinary part, save each original export,
   and save a separate counts-only receipt.
7. A separately delivered receipt can be compared with the opened set. A
   mismatch is reported; the receipt never repairs or changes the set.

## Limits

- Four numbered parts per transfer set.
- Twelve original exports per ordinary part.
- Forty-eight original exports across the set.
- Two megabytes of original export bytes per ordinary part.
- Eight megabytes of original export bytes across the set.
- Each ordinary bundle part is limited to 2.8 MB.
- The outer transfer-set file is limited to 16 MB.
- A counts-only receipt is limited to 32 KiB.

The planner preserves the order chosen by the person creating the set. It does
not silently sort, deduplicate, or discard exports. Duplicate content is a
blocking issue and must be resolved by choosing the intended original file.

## Integrity and privacy boundaries

The set identity is SHA-256 over the ordered part fingerprints. Each part has
its own byte length and SHA-256 fingerprint. The ordinary bundle reader then
checks each original export against its native recovery schema and byte
fingerprint. The full set is returned only after every part succeeds.

The receipt contains the set fingerprint, part counts, member counts, byte
counts, and part fingerprints. It does not contain notes or export payloads.

A matching fingerprint compares bytes. It does not identify a sender, establish
who supplied a file, or establish that a recovery record is accurate. The tool
runs locally, makes no network requests, and writes no browser storage. Files
remain in memory until the user clears the selection or leaves the page.

## Test coverage

- Planner boundaries, ordering, duplicate fingerprints, unsupported kinds,
  member count, per-part byte caps, and aggregate size.
- Exact envelope keys, supported schema, canonical base64, part ordering,
  part counts, per-part digests, aggregate identity, and cross-part duplicates.
- Atomic open behavior: a malformed later part never exposes earlier members.
- Original byte preservation, independent ordinary-part opening, and
  counts-only receipt comparison.
- Part audit summaries and expected-versus-received member reconciliation.
- English and French UI, file selection, error recovery, keyboard focus,
  download actions, and axe checks in the DOM test environment.
