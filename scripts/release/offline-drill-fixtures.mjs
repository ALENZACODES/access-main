/** Reusable wholly fictional captures for the bounded audit tests. */
export const DAY = '2026-11-19';
export const SHA = 'a'.repeat(64);
export function provenance(overrides = {}) {
  return { source: 'https://example.org/synthetic', licence: 'CC0-1.0',
    retrievedOn: DAY, tier: 0, ...overrides };
}
export function pair(en, fr) {
  return { en, fr };
}
export function source(id = 'source-a', overrides = {}) {
  return { id, title: pair('Synthetic observation', 'Observation fictive'),
    provenance: provenance(), ...overrides };
}
export function control(id = 'control-a', overrides = {}) {
  return { id, role: 'button', name: pair('Open sample', 'Ouvrir l’exemple'),
    keyboard: 'PASS', focus: 'PASS', target: { width: 44, height: 44 },
    ...overrides };
}
export function asset(path = 'app/shell.js', overrides = {}) {
  return { path, available: 'YES', shell: true, sha256: SHA, ...overrides };
}
export function claim(id = 'claim-a', overrides = {}) {
  return { id, label: pair('Entrance state', 'État de l’entrée'),
    state: 'UNKNOWN', sourceId: 'source-a', ...overrides };
}
export function capture(id = 'capture-a', overrides = {}) {
  return { id, route: '/synthetic', locale: 'en', network: 'offline',
    storage: 'ready', shell: 'PASS', privacy: 'PASS', consent: 'PASS',
    viewport: { width: 390, height: 844 }, provenance: provenance(),
    controls: [control()], assets: [asset()], claims: [claim()], ...overrides };
}
export function document(...captures) {
  return { version: 1, sources: [source()], captures: captures.length ? captures : [capture()] };
}
export function mutate(object, path, value) {
  const copy = JSON.parse(JSON.stringify(object));
  const parts = path.split('/').filter(Boolean);
  let cursor = copy;
  for (const key of parts.slice(0, -1)) cursor = cursor[key];
  cursor[parts.at(-1)] = value;
  return copy;
}
