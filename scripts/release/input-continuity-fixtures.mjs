/** Synthetic recordings. Not evidence about a physical place or actual user. */
export const TODAY = '2026-11-20';
export const provenance = (overrides = {}) => ({ source: 'https://example.org/public-notes', licence: 'CC0-1.0', retrievedOn: TODAY, tier: 0, ...overrides });
export const step = (id = 'start', overrides = {}) => ({ id, kind: 'start', order: 1, state: 'PASS', ...overrides });
export const session = (id = 'case-one', overrides = {}) => ({ id, language: 'en', input: 'keyboard', task: 'search', network: 'offline', outcome: 'UNKNOWN', label: 'Synthetic journey', provenance: provenance(), steps: [step()], ...overrides });
export const document = (...sessions) => ({ version: 1, sessions: sessions.length ? sessions : [session()] });
export const complete = (id = 'complete', overrides = {}) => session(id, { outcome: 'PASS', steps: [step('start'), step('nav', { kind: 'navigate', order: 2 }), step('act', { kind: 'activate', order: 3 }), step('confirm', { kind: 'confirm', order: 4 })], ...overrides });
export const interrupted = (id = 'resuming', overrides = {}) => session(id, { outcome: 'PASS', steps: [step('start'), step('nav', { kind: 'navigate', order: 2 }), step('act', { kind: 'activate', order: 3 }), step('interrupt', { kind: 'interrupt', order: 4 }), step('restore', { kind: 'restore', order: 5 }), step('confirm', { kind: 'confirm', order: 6 })], ...overrides });
export const pair = () => document(session('en'), session('fr', { language: 'fr', label: 'Parcours synthétique' }));
export const clone = value => JSON.parse(JSON.stringify(value));
