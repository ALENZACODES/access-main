/** Synthetic records only. Never describe an actual location's features. */
export const TODAY = '2026-11-20';
export const source = (overrides = {}) => ({
  source: 'https://example.org/synthetic-observation', licence: 'CC0-1.0',
  retrievedOn: '2026-11-19', tier: 0, ...overrides,
});
export const label = (overrides = {}) => ({
  en: 'Synthetic recovery journey', fr: 'Parcours fictif de récupération', ...overrides,
});
export const action = (overrides = {}) => ({
  id: 'a1', at: 1, kind: 'action', outcome: 'PASS', code: 'BUTTON_ACTIVATION', ...overrides,
});
export const failure = (overrides = {}) => ({
  id: 'f1', at: 2, kind: 'failure', outcome: 'FAIL', code: 'CACHE_NOT_FOUND', ...overrides,
});
export const recovery = (overrides = {}) => ({
  id: 'r1', at: 3, kind: 'recovery', outcome: 'PASS', code: 'RETRY_SELECTED',
  linkedTo: 'f1', ...overrides,
});
export const check = (overrides = {}) => ({
  id: 'c1', at: 4, kind: 'check', outcome: 'PASS', code: 'PAGE_READY',
  linkedTo: 'r1', ...overrides,
});
export const trace = (id = 'trace-a', overrides = {}) => ({
  id, route: '/synthetic', locale: 'en', mode: 'offline', category: 'navigation',
  label: label(), source: source(),
  steps: [action(), failure(), recovery(), check()], ...overrides,
});
export const document = (...traces) => ({
  version: 1, releaseId: 'release-a', recordedOn: TODAY,
  traces: traces.length ? traces : [trace()],
});
export const emptyDocument = () => ({
  version: 1, releaseId: 'release-a', recordedOn: TODAY, traces: [],
});
export const broken = (overrides = {}) => ({
  ...document(), ...overrides,
});
