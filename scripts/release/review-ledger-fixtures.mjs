/** Fictional fixtures used only in tests; they are not evidence about real locations. */
import { emptyLedger } from './review-ledger-contract.mjs';
export const TODAY = '2026-11-20';
export const PAST = '2025-11-20';
export const HASH_A = 'a'.repeat(64);
export const HASH_B = 'b'.repeat(64);
export const provenance = (changes = {}) => ({
  source: 'Fictional test data; no real-place observation',
  licence: 'CC0-1.0',
  retrievedOn: TODAY,
  verificationTier: 'unknown',
  ...changes
});
export const observation = (id = 'obs-a', changes = {}) => ({
  id,
  placeId: 'fictional-place',
  feature: 'entrance',
  status: 'UNKNOWN',
  summary: 'No observation supplied',
  documentHash: null,
  ...provenance(),
  ...changes
});
export const caseRecord = (id = 'case-a', changes = {}) => ({
  id,
  placeId: 'fictional-place',
  feature: 'entrance',
  observationIds: ['obs-a'],
  createdOn: TODAY,
  ...changes
});
export const event = (id = 'event-a', action = 'open', changes = {}) => ({
  id,
  caseId: 'case-a',
  action,
  date: TODAY,
  reason: 'Manual human review of demonstration case',
  reference: null,
  decision: 'none',
  ...provenance(),
  ...changes
});
export const fixture = (changes = {}) => ({
  schemaVersion: 1,
  observations: [observation()],
  cases: [caseRecord()],
  events: [],
  ...changes
});
export function withEvents(...rows) { return fixture({ events: rows }); }
export function withObservations(...rows) { return fixture({ observations: rows }); }
export function withCases(...rows) { return fixture({ cases: rows }); }
export function withFeature(feature, status = 'UNKNOWN') {
  return fixture({ observations: [observation('obs-a', { feature, status })], cases: [caseRecord('case-a', { feature })] });
}
export function withConflict() {
  return fixture({
    observations: [
      observation('obs-a', { status: 'reported', verificationTier: 'documented', documentHash: HASH_A }),
      observation('obs-b', { status: 'not-reported', verificationTier: 'self-reported', documentHash: HASH_B })
    ],
    cases: [caseRecord('case-a', { observationIds: ['obs-a', 'obs-b'] })]
  });
}
export function openCase() { return withEvents(event()); }
export function waitingCase() {
  return withEvents(event(), event('event-b', 'request-evidence', { decision: 'needs-review' }));
}
export function deferredCase() {
  return withEvents(event(), event('event-b', 'defer', { decision: 'insufficient-evidence' }));
}
export function closedCase(decision = 'reviewed') {
  return withEvents(event(), event('event-b', 'close', { decision }));
}
export function reopenedCase() {
  return withEvents(event(), event('event-b', 'close', { decision: 'insufficient-evidence' }), event('event-c', 'reopen'));
}
export function multiPlaceFixture() {
  return {
    ...emptyLedger(),
    observations: [
      observation('obs-a'),
      observation('obs-b', { placeId: 'fictional-other', feature: 'parking', status: 'reported', verificationTier: 'documented' }),
      observation('obs-c', { placeId: 'fictional-other', feature: 'washroom', status: 'not-reported', verificationTier: 'field-observed' }),
      observation('obs-d', { placeId: 'fictional-place', feature: 'door', status: 'UNKNOWN' })
    ],
    cases: [
      caseRecord('case-a'),
      caseRecord('case-b', { placeId: 'fictional-other', feature: 'parking', observationIds: ['obs-b'] }),
      caseRecord('case-c', { placeId: 'fictional-other', feature: 'washroom', observationIds: ['obs-c'] }),
      caseRecord('case-d', { placeId: 'fictional-place', feature: 'door', observationIds: ['obs-d'] })
    ],
    events: [
      event('event-a'),
      event('event-b', 'open', { caseId: 'case-b' }),
      event('event-c', 'open', { caseId: 'case-c' }),
      event('event-d', 'open', { caseId: 'case-d' })
    ]
  };
}
export function clone(value) { return structuredClone(value); }
export function unsafeLabel() { return '<script>alert("x")</script>'; }
export function formulaValue() { return '=SUM(A1:A5)'; }
export function observedAfter(date, status = 'reported') {
  return observation('obs-a', { retrievedOn: date, status, verificationTier: 'documented' });
}
export function fullReviewHistory() {
  return [
    event('event-a', 'open'),
    event('event-b', 'request-evidence', { decision: 'needs-review' }),
    event('event-c', 'annotate', { decision: 'needs-review', reference: 'obs-a' }),
    event('event-d', 'defer', { decision: 'insufficient-evidence' }),
    event('event-e', 'close', { decision: 'insufficient-evidence' }),
    event('event-f', 'reopen'),
    event('event-g', 'close', { decision: 'reviewed' })
  ];
}
