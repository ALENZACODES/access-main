/** Entirely fictional fixtures. No site or agency accessibility facts. */
import { UNKNOWN, example } from './interaction-evidence-contract.mjs';
export const DATE = '2026-11-21';
export const HASH = 'a'.repeat(64);
export function sample() { return structuredClone(example()); }
export function check(changes = {}) {
  return { id: 'fictional-button', kind: 'touch-target', result: UNKNOWN,
    source: 'Fictional test fixture, not a real-place report', licence: 'CC0-1.0', retrievedOn: DATE,
    verificationTier: UNKNOWN, ...changes };
}
export function route(changes = {}) {
  return { id: 'fictional-route-en', path: '/fictional', language: 'en', checks: [check()], ...changes };
}
export function snapshot(...routes) { return { schemaVersion: 1, capturedOn: DATE, routes: routes.length ? routes : [route()] }; }
export function paired() { return snapshot(route(), route({ id: 'fictional-route-fr', language: 'fr' })); }
export function measured(kind = 'touch-target', result = 'PASS') {
  const values = {
    'touch-target': { width: result === 'FAIL' ? 30 : 44, height: 44 },
    focus: { focusVisible: result !== 'FAIL' }, 'accessible-name': { accessibleName: 'Fictional control' },
    keyboard: { keyboardReachable: result !== 'FAIL' }, 'screen-reader': { announced: result !== 'FAIL' },
    'status-message': { announced: result !== 'FAIL' },
  };
  if (kind === 'accessible-name' && result === 'FAIL') return check({ id: 'accessible_name_fail', kind, result, accessibleName: '', verificationTier: 'documented', digest: HASH });
  return check({ id: `${kind.replaceAll('-', '_')}_${result.toLowerCase()}`, kind, result, ...values[kind], verificationTier: 'documented', digest: HASH });
}
