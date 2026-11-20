/** Synthetic fixtures only; never location-specific accessibility evidence. */
import { INCIDENT_VERSION } from './offline-release-incidents.mjs';
export const TODAY = '2026-11-19';
export function fixtureSource(id = 'source-1', change = {}) {
  return { id, source: `https://example.org/${id}`, licence: 'CC0-1.0',
    retrievedOn: TODAY, tier: 0, ...change };
}
export function fixtureIncident(id = 'incident-1', change = {}) {
  return {
    id, area: 'keyboard', severity: 'moderate', status: 'open',
    title: { en: 'Synthetic keyboard review', fr: 'Examen fictif du clavier' },
    summary: { en: 'No access conclusion.', fr: 'Aucune conclusion sur l’accessibilité.' },
    createdOn: TODAY, updatedOn: TODAY,
    sourceRefs: ['source-1'], sources: [fixtureSource()],
    claimState: 'UNKNOWN', history: [], relatedIds: [], ...change,
  };
}
export function fixtureRegister(...incidents) {
  return { version: INCIDENT_VERSION, incidents };
}
export function clone(value) { return globalThis.structuredClone(value); }
