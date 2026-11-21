/** Clearly synthetic records for tests; never location or user data. */
import { createHash } from 'node:crypto';
export const TODAY = '2026-11-20';
export const SHA = createHash('sha256').update('sample').digest('hex');
export function source(id = 'source-a', changes = {}) {
  return { id, title: 'Synthetic instruction record', url: 'https://example.org/synthetic',
    licence: 'CC0-1.0', retrievedOn: '2026-11-19', tier: 0, digest: SHA, ...changes };
}
export function pair(en = 'Synthetic action', fr = 'Action fictive') { return { en, fr }; }
export function event(type = 'key', id = 'event-a', at = 1, changes = {}) {
  return { id, type, at, stepId: 'step-a', state: 'PASS', sourceId: 'source-a',
    ...(type === 'key' ? { key: 'Tab' } : {}),
    ...(type === 'focus' ? { target: 'control-a' } : {}),
    ...(type === 'announce' ? { message: pair('Panel opened', 'Panneau ouvert'), politeness: 'polite' } : {}),
    ...(type === 'asset' ? { assetId: 'asset-a', availability: 'present' } : {}),
    ...(type === 'storage' ? { storage: 'ready' } : {}),
    ...(type === 'step-end' ? { outcome: 'complete' } : {}),
    ...changes };
}
export function step(channel = 'keyboard', changes = {}) {
  return { id: 'step-a', label: pair(), channel, expected: 'PASS',
    events: [event('step-start', 'start', 0), event('key', 'key', 1), event('step-end', 'end', 3)], ...changes };
}
export function journey(id = 'journey-a', changes = {}) {
  return { id, locale: 'en', network: 'offline', label: pair('Keyboard route', 'Parcours au clavier'),
    steps: [step()], ...changes };
}
export function trace(...journeys) {
  return { version: 1, recordedOn: TODAY, sources: [source()], journeys: journeys.length ? journeys : [journey()] };
}
export function clone(value) { return JSON.parse(JSON.stringify(value)); }
