/** Synthetic-only test builders. No record identifies a real location. */
import { createHash } from 'node:crypto';
export const TODAY = '2026-11-20';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function pair(en = 'Synthetic step', fr = 'Étape fictive') { return { en, fr }; }
export function provenance(overrides = {}) {
  return { source: 'https://example.org/synthetic', licence: 'CC0-1.0',
    retrievedOn: TODAY, tier: 0, ...overrides };
}
export function asset(id = 'shell', overrides = {}) {
  return { id, path: `assets/${id}.js`, sha256: digest(id), bytes: 25,
    state: 'UNKNOWN', label: pair(), dependsOn: [],
    provenance: provenance(), ...overrides };
}
export function event(id = 'event-one', overrides = {}) {
  return { id, kind: 'shell-response', order: 0, state: 'UNKNOWN',
    assetId: 'shell', note: pair(), ...overrides };
}
export function session(id = 'session-one', overrides = {}) {
  return { id, phase: 'restart-offline', locale: 'en', network: 'offline',
    recordedOn: TODAY, label: pair(), outcome: 'UNKNOWN',
    events: [event()], provenance: provenance(), ...overrides };
}
export function document(overrides = {}) {
  return { version: 1, assets: [asset()], sessions: [session()], ...overrides };
}
export function withSession(overrides = {}) {
  return document({ sessions: [session('session-one', overrides)] });
}
export function withAsset(overrides = {}) {
  return document({ assets: [asset('shell', overrides)] });
}
export function withEvent(overrides = {}) {
  return withSession({ events: [event('event-one', overrides)] });
}
export function duplicate(documentValue) {
  return JSON.parse(JSON.stringify(documentValue));
}
export function suiteIssueCodes(result) { return result.problems.map(item => item.code); }
export function fixtureWithTwoSessions() {
  return document({ sessions: [
    session('first', { locale: 'en', events: [event('one', { order: 0 })] }),
    session('second', { locale: 'fr', events: [event('two', { order: 0 })] }),
  ] });
}
export function fixtureWithTwoAssets() {
  return document({ assets: [asset('shell'), asset('fonts', {
    path: 'assets/fonts.woff2', dependsOn: ['shell'],
  })] });
}
export function outcomesDocument(state) {
  return document({ assets: [asset('shell', { state })],
    sessions: [session('session-one', { outcome: state,
      events: [event('event-one', { state })] })],
  });
}
