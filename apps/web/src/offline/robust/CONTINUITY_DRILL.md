# Offline continuity drill

A user-triggered, read-only exercise for the existing `/offline` dashboard.
The drill models hypothetical loss of saved cells, a change in source metadata,
and a decrease in available storage. It does not delete records, request a
download, contact map services, or schedule background work.

## What the drill uses

The live dashboard supplies a listed `RegionManifest`, its latest
`RegionInventory`, and an optional browser `StorageEstimate`. Each listed cell
must carry an identifier, expected byte count, source, open licence and data
date. The existing `OPEN_LICENCES` list is reused. Records with missing or
contradictory metadata are never assumed to be usable offline.

The panel shows a **Before** and hypothetical **After** state for each cell.
The states describe local copies only, never the accessibility of a physical
place. The literal `UNKNOWN` token is used in both languages. An unreadable
record, ambiguous inventory, unsupported licence, malformed date, or unknown
quota is reported conservatively. The source tier is UNKNOWN because neither
file size nor local storage state establishes an evidence tier.

## Scenarios

- Baseline: read listed cell status without simulated changes.
- Largest saved copies: simulate losing a bounded number of largest current
  copies, breaking equal-size ties by listed order.
- Oldest saved copies: simulate losing a bounded number of current copies with
  the oldest declared publication dates; the date is not a measure of a place.
- Source change: simulate a source-metadata mismatch without changing data.
- Capacity reduction: show hypothetical cell loss when the supplied reduction
  plus the configured storage reserve exceeds estimated free space.

All simulations are pure; no actual file eviction is predicted or promised.
The quota-based scenario is UNKNOWN when browser storage estimation fails.
Changing the scenario does nothing until the person presses **Run local drill**.
A refresh cancels the displayed result. The panel avoids automatically
running a new exercise while downloads are active.

## Accessibility and localization

The controls use the common `createOfflineAction` button helper. Inputs and
selects have visible labels, native keyboard behaviour and minimum 44px
heights. Changes are announced through a polite status region. All strings
are available in English and French, with curved French apostrophes and
required nonbreaking punctuation spacing. Individual cell details retain
source, licence and date. Search and paging bound visible content.

## Local exports

The person may explicitly save text or JSON metadata reports. Reports contain
listed identifiers, source/licence/date, expected byte counts, simulated
states, unknown tiers, and aggregate counts. They do not contain downloaded
cell bytes, an accessibility status for places, or personal device identifiers.

## Tests

- `continuityDrill.test.ts` and `continuityDrillEdge.test.ts`: conservative
  inventory classification, invalid input, source matching, sorting, scenario
  selection, counts, capacity uncertainty, and deterministic paging.
- `continuityDrillCopy.test.ts`: English/French completeness, labels, UNKNOWN,
  and typography.
- `continuityDrillExport.test.ts`: deterministic, metadata-only reports,
  file names, sanitization and date validation.
- `continuityDrillWiring.test.ts`: fail-on-violation checks for barrel exports,
  the live dashboard mount, unmount cleanup, shared controls, and preservation
  of existing P12 panels.

From a complete repository checkout, run `npm run lint`,
`npm run typecheck`, and `npm test` at the repository root.
