/** Synthetic-only fixtures for offline release checks. No place facts. */
import { LEDGER_VERSION } from "./offline-acceptance-ledger.mjs";
const TODAY = '2026-11-19';
const DIGEST = 'a'.repeat(64);
const provenance = (overrides = {}) => ({
  source: 'https://example.org/release-evidence',
  licence: 'CC0-1.0', retrievedOn: TODAY, tier: 0,
  runId: 'run-1', artifactSha256: DIGEST, ...overrides,
});
const check = (overrides = {}) => ({
  id: 'keyboard-check', kind: 'keyboard', state: 'UNKNOWN',
  label: { en: 'Keyboard navigation', fr: 'Navigation au clavier' },
  evidence: provenance(), ...overrides,
});
const route = (overrides = {}) => ({
  id: 'sample-route', path: '/example',
  label: { en: 'Example route', fr: 'Page fictive' },
  checks: [check()], ...overrides,
});
const ledger = (overrides = {}) => ({
  version: LEDGER_VERSION, capturedOn: TODAY,
  routes: [route()], ...overrides,
});

export { ledger, route, check, provenance, TODAY, DIGEST };
