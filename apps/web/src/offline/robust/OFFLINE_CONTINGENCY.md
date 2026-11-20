# Offline contingency checklist

A local, user-operated planning tool on the existing `/offline` dashboard. It
helps someone write questions and possible alternatives when a planned arrival,
entrance, passage, lift, transfer, washroom, rest area, or exit is uncertain.
The checklists record personal observations and questions; they are not
accessibility assessments or venue data.

The feature is English/French, with native labelled controls, polite status
announcements, a 44 CSS-pixel minimum target size, and explicit add/edit/reorder,
source capture, import, and export actions. The panel is deferred, with a guard
against mounting after navigation or cleanup. The existing dashboard model
and its download behaviour are unchanged.

## Uncertainty

- Every new checkpoint starts with physical signal `UNKNOWN`.
- Each optional cell reference is `UNKNOWN` unless an explicitly requested
  local inventory reading matches the listed ID, byte count and provenance.
- A saved copy only describes local bytes, not access at a physical place.
- A closed note does not change physical conditions or local evidence.
- Imported source readings are reset to `UNKNOWN`, since they are historical.
- Source names, publication dates and licences remain labels, never advice.

## Data boundaries

At most 80 checkpoints, 320 history events and 1,200 characters per text field.
JSON import/export is limited to 262,144 UTF-8 bytes. Imports require the same
region ID and strict schema, chronology, identifier and state validation. JSON
exports are importable full notebook records; plain-text exports are human
readable snapshots. Both can contain personal notes. No downloaded cell
payloads, coordinates or background storage are included. No network calls,
background timers, location permission, or provider messages are initiated.

## Integration

- `contingencyPlan.ts`: typed immutable model, source check, paging and strict import.
- `contingencyCopy.ts`: English/French labels and 27 prepared question prompts per language.
- `contingencyExport.ts`: metadata and notes reports, explicit downloads.
- `contingencyPanel.ts`: browser UI and disposal lifecycle.
- Tests cover the state matrix, validation, localization, report output, and
  dashboard wiring; the original page bundle retains a deferred import.

The existing offline barrel remains unchanged to avoid pulling the user-facing
panel into the eagerly loaded route chunk. The new panel is a direct dynamic
import from `offlineDashboard.ts` and all dependencies reside in this folder.
