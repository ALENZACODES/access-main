/** Fictional test inputs. Not an inventory of real websites or observed status. */
import { UNKNOWN } from './reference-contract.mjs';
export const DAY = '2026-11-21';
export function entry(changes = {}) {
  return { id: 'fictional-guide', route: '/help', locale: 'en', label: 'Fictional guidance', destination: 'https://example.org/resources', purpose: 'public-resource', source: 'Fictional training material', licence: 'CC0-1.0', retrievedOn: DAY, tier: UNKNOWN, status: UNKNOWN, pairId: 'guide', ...changes };
}
export function french(changes = {}) { return entry({ locale: 'fr', label: 'Conseils fictifs', ...changes }); }
export function snapshot(...references) { return { schemaVersion: 1, capturedOn: DAY, references: references.length ? references : [entry()] }; }
export function pair() { return snapshot(entry(), french()); }
export function observed(changes = {}) { return entry({ tier: 'documented', status: 'AVAILABLE', observedOn: DAY, ...changes }); }
export function clone(value) { return JSON.parse(JSON.stringify(value)); }
