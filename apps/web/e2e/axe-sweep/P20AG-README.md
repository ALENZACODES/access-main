# P20AG — Dialog focus ownership and keyboard interaction audits

P20AG adds deterministic focus-lifecycle contracts for native and custom
dialogs, nested modal stacks, disclosures, roving tablists, skip links and
keyboard activation.

## Included
- Focus ownership, sequential tab order, positive tabindex, inert ancestry,
  focus-visible indicators and 44px target checks.
- Dialog open, initial focus, Tab/Shift+Tab wrap, Escape, close and trigger
  focus restoration state transitions.
- Nested modal stack validation and pending focus restoration.
- Native and custom modal semantics, background inertness and accessible names.
- Disclosure expanded/panel visibility parity and keyboard interaction.
- Roving tab stop and arrow-key movement contracts.
- Playwright browser observation, native dialog journeys, nested dialogs,
  accordion and tablist keyboard journeys, and axe scans.
- Node tests for pure contracts and browser-observer boundaries.

All browser observation is read-only. Synthetic fixtures are used for isolated
interaction semantics. No app storage, network, worker, schedule, product UI,
real-place facts or personal data are added.
