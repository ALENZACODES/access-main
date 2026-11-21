# Offline coordination brief

This panel is an opt-in, browser-memory worksheet for preparing handoff questions before visiting a venue, meeting with a support person, or travelling between checkpoints in Ontario. It is part of the unbranded App, not a service operated, endorsed, or validated by a named organization. A person's recorded answer does not establish a physical accessibility condition.

## What a person can do

The person builds an ordered set of checkpoints for arrival, entrances, paths, transfers, washrooms, rest areas, communication, departure, or another topic. Each checkpoint has its own question and optional fallback question. An importance level helps the person decide which unanswered questions to prioritize. A contact-method note and a free-text note are entirely manually entered. Nothing automatically calls, emails, texts, or contacts a provider.

The person's conversation workflow uses `UNKNOWN`, `asked`, `reply-recorded`, and `follow-up`. These are **conversation statuses**, not accessibility or suitability determinations. Every checkpoint's separate physical condition is always the exact literal `UNKNOWN`, including when a reply has been recorded or the brief has been imported.

The user can insert, edit, reorder, filter, search, add notes to, or remove checkpoints. The event trail records the action time and step ID, without retaining a duplicate copy of potentially personal answers in every event. The local view includes a brief count, essential-question count, unanswered count, and recent local event trail.

## Evidence and uncertainty

A checkpoint may have a manually supplied source name, licence and publication date. These three values must be supplied together. They are displayed as attributed metadata, not independently assessed facts. If all three are absent, source information stays UNKNOWN. The application does not infer a place's actual conditions from map content, a saved data pack, a conversation note, or a newer source date.

The worksheet does not change region manifests, cell downloads, source provenance, physical place records, or accounts. There are no automatic checks, reminders, schedules, server requests, storage writes, or external communications. The import file may contain sensitive user-supplied notes; the interface advises users to inspect a file before sharing.

## Validated data model

The `offline-coordination-brief-v1` JSON schema has an explicit region ID, title, context, date, ordered checkpoints and chronological events. It enforces unique IDs, contiguous positions, supported enums, timestamp format and ordering, source metadata, bounded lengths, a maximum of 80 steps, a maximum of 320 events, and a maximum of 360,000 UTF-8 bytes on import/export. Extra physical-condition assertions are rejected; each such field must be exactly `UNKNOWN`.

Imported files are previewed before replacement. The preview counts new, removed, reordered and changed checkpoints, new recorded replies, and source-metadata changes; users must choose to apply or cancel. A different region is UNKNOWN and cannot replace the current brief. The manual export actions create an English or French plain-text worksheet or a versioned JSON file. Plain text strips directional formatting characters and flattens embedded line breaks before composing each row. Export filenames use a restricted ASCII character set; the region ID is not interpreted as a path. The browser-local model remains in memory unless the person explicitly exports it.

## Accessibility and language

All actions are real buttons with at least 44 CSS pixels of minimum height and width; selectors, inputs, textareas, and the file input are at least 44 CSS pixels high. Inputs have native labels. Changes are announced with an ARIA polite status region. Selection, editing, saving, filtering, and reordering work without pointer-specific gestures.

Copy is provided in English and French. French typography uses curly apostrophes, a nonbreaking space before colons, and a narrow nonbreaking space before semicolons, exclamation marks and question marks. The status `UNKNOWN` is identical in both languages.

## Integration and lifecycle

The offline robustness barrel exports coordination types only. The runtime model, copy, diff and metadata export helpers are available by direct module imports. This avoids adding new runtime modules to the eager pack-page chunk. The visual panel is loaded only after the person selects a 44px-high launch button in the existing offline dashboard. This uses a guarded dynamic `import("./coordinationBriefPanel")`, so the panel is neither eagerly included in the initial offline bundle nor automatically mounted during region-page tests. The launch control can close the panel again. A disposal flag prevents mounting after the parent is unmounted. The panel returns a cleanup function that removes row listeners, static listeners, and its entire section. Dynamic import failure does not disable the older download and recovery controls.

Existing preparation, inquiry, contingency, continuity, casebook, handoff, timeline, workbook, source-age and recovery mounts remain intact. The RegionPackPage implementation and tests are outside this change. No file or total precache cap, timeout, retry count, or test skip is changed.

## Test coverage

The source and tests cover creation, question validation, status progression, note append, deterministic ordering, moves, deletions, searching, pagination, summaries, multilingual labels, deterministic exports, source metadata retention, privacy-safe plain text, filename sanitization, corrupted imports and chronology constraints. Integration tests audit the existence and cleanup of the new deferred panel while retaining the merged dashboard's existing lifecycle.
