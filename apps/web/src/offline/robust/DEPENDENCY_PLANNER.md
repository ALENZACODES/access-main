# Offline dependency planner — local information, not physical accessibility

The offline dependency planner helps people prepare a list of specific **information checkpoints** for a planned outing. It compares the listed offline data cells against what the current device inventory reports. The status applies only to the **presence of information bytes and matching source metadata**; it does not describe entrances, routes, transport services, washrooms, operating hours or a person's access requirements.

## User workflow

1. Open the optional planner from the offline region dashboard. The feature does not start background work or contact a provider.
2. Enter a short name for a checkpoint, describe what information is needed, choose a topic and mark its importance. Categories include arrival, entrances, indoor routes, washrooms, transport and communication.
3. Optionally list exact cell IDs from the selected region manifest, separated by commas. These are data identifiers, not coordinates, addresses or verified measurements. Up to 32 IDs may be attached to one checkpoint.
4. Review the local data status. A cell reports `saved` only if its ID, listed byte size, named source, licence and source publication date match an inventory entry marked both `saved` and `present`. Unknown or conflicting data is always `UNKNOWN`.
5. If useful, enter a personal note and independently change the follow-up stage. A note or recorded response does not change the physical accessibility flag.
6. Filter, search, sort, and page through the checkpoints. Essential missing information can be flagged for follow-up, but the tool does not rank the importance of a user's personal accessibility needs.
7. Export plain text for an easy-to-read personal checklist, or JSON for a versioned local record. Both exports explicitly identify physical access as `UNKNOWN`. JSON import accepts only the current schema and the selected region ID.

## Local evidence and uncertainty

The planner is intentionally fail-closed. Missing inventories, mismatched region IDs, duplicate inventory entries, absent cell IDs, stale/unreadable cells and source-metadata differences are never silently treated as available. A manifest can supply its named source, licence, date and expected byte count without proving that any data was actually saved. An empty checkpoint list does not produce a successful readiness result.

Two independent assessments remain separate. An information file may be listed as locally saved; nevertheless, the accessibility of the corresponding physical location is still `UNKNOWN`. A manually recorded reply is not a certification of conditions or suitability. No agency, provider, service, city, municipality or accessibility organization endorses this feature.

## Data model and privacy

`offline-dependency-book-v1` is a bounded JSON structure: region ID, outing label, explicit creation/edit dates and up to 120 checkpoints. Each checkpoint has a stable ID, topic, importance, manually selected follow-up stage, short explanation, optional note and zero to 32 exact cell references. Export size is bounded to 196,608 UTF-8 bytes; input checking validates ISO dates including leap years, item chronology, unique identifiers, enumerated states and bounded text. The import parser rejects foreign region IDs, malformed or oversized documents, missing required keys, unexpected item keys and duplicate references.

The planner stores working data only in the mounted component. It does not access local storage, session storage, remote accounts or geolocation, and it does not modify downloaded cells. On a page refresh or after unmounting, unsaved notes are lost. Export is always an explicit user action; the UI warns that exported files can contain personal notes. Source and licence data comes from the supplied manifest and the current local inventory, not invented place descriptions.

## Accessibility and internationalization

Every action and editable field is a labelled native HTML element with at least a 44-by-44 CSS-pixel target where applicable. Live updates use a polite status announcement. The UI uses text nodes instead of `innerHTML` for untrusted notes and source information. The interface has English and Canadian French copy with matching keys and appropriate nonbreaking French punctuation. `UNKNOWN` is deliberately unchanged in both languages.

## Integration and performance

The existing offline dashboard dynamically imports `dependencyPlannerPanel.ts` and guards mounting after disposal. An unmount callback removes listener subscriptions and the panel. The public robustness barrel exports only the model, copy and metadata-report helpers, not the DOM panel, so the UI does not become an eager dependency of the offline chunk. Existing recovery, casebook, drill, handoff, timeline, workbook and preparation mounts and teardown calls remain byte-for-byte preserved outside this additive mount.

Do not increase test timeouts, skip suites or change the 524,288-byte precache-entry budget. Full budget confirmation requires a complete production build on a synchronized repository checkout. A package-level or isolated compiler check does not replace full CI.

## Regression coverage

Tests cover immutable editing, chronological changes, duplicate IDs, oversized imports and notes, invalid dates and schema migrations, mismatched region and source information, partial inventories, saved/missing/stale/unknown states, summary counts, sorting and pagination, stable JSON/text export, bilingual copy, privacy statements, safe filenames, and the late-mount disposal contract.
