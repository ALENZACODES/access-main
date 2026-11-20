/** Synthetic fixtures; none refers to a real place or an access assessment. */
export const DAY = '2026-11-20';
export function record(id = 'r1', changes = {}) {
  return {
    id, subject: 'example-site', attribute: 'stepFreeEntrance', state: 'UNKNOWN',
    capturedOn: '2026-11-19', source: 'https://example.org/fictional/record',
    licence: 'CC0-1.0', retrievedOn: '2026-11-19', tier: 0,
    notes: { en: 'Local synthetic record', fr: 'Fiche fictive locale' },
    relatedIds: [], ...changes,
  };
}
export function register(...records) {
  return { version: 1, asOf: DAY, records };
}
export function sample() { return register(record()); }
export function opposed() {
  return register(record('yes', { state: 'YES', source: 'https://example.org/yes' }),
    record('no', { state: 'NO', source: 'https://example.org/no' }));
}
export function sharedSource() {
  return register(record('yes', { state: 'YES' }), record('no', { state: 'NO' }));
}
export function notes(fr = 'Essai fictif') {
  return { en: 'Synthetic observation', fr };
}
export function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }
export function resultCodes(value) { return value.problems.map(problem => problem.code); }
