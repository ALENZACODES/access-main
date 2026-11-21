import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLedgers, evidenceReconciliation, compareFindingSets, casesWithFeature,
  caseStateChanges, requireAppendOnly
} from './review-ledger-compare.mjs';
import { analyzeLedger } from './review-ledger-engine.mjs';
import {
  TODAY, fixture, clone, observation, event, caseRecord, withConflict,
  openCase, waitingCase, closedCase, HASH_A
} from './review-ledger-fixtures.mjs';
const diff = (before, after) => compareLedgers(before, after, { today: TODAY });
const reconciliation = ledger => evidenceReconciliation(ledger, { today: TODAY });
function keys(rows) { return rows.map(x => `${x.id}:${x.kind}`); }
function codes(rows) { return rows.map(x => x.code); }

test('identical empty ledgers produce no changes', () => {
  const result = diff({ schemaVersion: 1, observations: [], cases: [], events: [] }, { schemaVersion: 1, observations: [], cases: [], events: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.conclusions, []);
  assert.equal(result.appendOnly, true);
});
test('identical populated ledgers preserve all records', () => {
  const result = diff(fixture(), fixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.observations.counts, { added: 0, removed: 0, changed: 0, unchanged: 1 });
  assert.deepEqual(result.cases.counts, { added: 0, removed: 0, changed: 0, unchanged: 1 });
});
test('new observation is treated as an addition', () => {
  const before = fixture();
  const after = fixture({ observations: [observation(), observation('obs-b')] });
  const result = diff(before, after);
  assert.equal(result.ok, true);
  assert.equal(result.observations.counts.added, 1);
  assert.equal(result.observations.counts.changed, 0);
});
test('source change is detected even when status does not change', () => {
  const before = fixture();
  const after = fixture({ observations: [observation('obs-a', { source: 'Another fictional source' })] });
  const result = diff(before, after);
  assert.deepEqual(result.observations.changes[0].fields, ['source']);
  assert.equal(result.appendOnly, false);
});
test('licence change is tracked as evidence replacement', () => {
  const after = fixture({ observations: [observation('obs-a', { licence: 'CC-BY-4.0' })] });
  const result = diff(fixture(), after);
  assert.ok(result.conclusions.some(x => x.code === 'EVIDENCE_REPLACED_OR_REMOVED'));
  assert.deepEqual(result.observations.changes[0].fields, ['licence']);
});
test('status changes are never promoted into accessibility facts', () => {
  const after = fixture({ observations: [observation('obs-a', { status: 'reported' })] });
  const result = diff(fixture(), after);
  assert.deepEqual(result.observations.changes[0].fields, ['status']);
  assert.equal(result.states.changes[0].after.status, 'reported');
});
test('document hash change is independently detected', () => {
  const after = fixture({ observations: [observation('obs-a', { documentHash: HASH_A })] });
  const result = diff(fixture(), after);
  assert.deepEqual(result.observations.changes[0].fields, ['documentHash']);
});
test('observation deletion causes an invalid case and fails closed', () => {
  const after = fixture({ observations: [] });
  const result = diff(fixture(), after);
  assert.equal(result.ok, false);
  assert.ok(codes(result.issues).includes('MISSING_OBSERVATION'));
});
test('removal of an unreferenced observation is explicit', () => {
  const before = fixture({ observations: [observation(), observation('obs-b')] });
  const after = fixture();
  const result = diff(before, after);
  assert.equal(result.observations.counts.removed, 1);
  assert.equal(result.appendOnly, false);
});
test('event addition creates append-only history', () => {
  const result = diff(fixture(), openCase());
  assert.equal(result.events.counts.added, 1);
  assert.equal(result.appendOnly, true);
});
test('event edit is flagged as non-append history', () => {
  const before = openCase();
  const after = fixture({ events: [event('event-a', 'open', { reason: 'A different manual review reason' })] });
  const result = diff(before, after);
  assert.equal(result.appendOnly, false);
  assert.ok(codes(result.conclusions).includes('EVENT_HISTORY_CHANGED'));
});
test('event deletion is flagged as non-append history', () => {
  const result = diff(openCase(), fixture());
  assert.equal(result.events.counts.removed, 1);
  assert.equal(result.appendOnly, false);
});
test('case status difference appears in state comparison', () => {
  const result = diff(fixture(), openCase());
  assert.equal(result.states.counts.changed, 1);
  assert.deepEqual(result.states.changes[0].fields, ['state']);
});
test('case decision changes appear independently', () => {
  const result = diff(openCase(), waitingCase());
  assert.equal(result.states.counts.changed, 1);
  assert.ok(result.states.changes[0].fields.includes('decision'));
});
test('case addition is supported with complete evidence', () => {
  const after = fixture({ observations: [observation(), observation('obs-b', { feature: 'parking' })], cases: [caseRecord(), caseRecord('case-b', { feature: 'parking', observationIds: ['obs-b'] })] });
  const result = diff(fixture(), after);
  assert.equal(result.ok, true);
  assert.equal(result.cases.counts.added, 1);
});
test('case removal is not considered append only', () => {
  const before = fixture();
  const after = fixture({ cases: [] });
  const result = diff(before, after);
  assert.equal(result.cases.counts.removed, 1);
  assert.equal(result.appendOnly, false);
});
test('case evidence reassignment is detected', () => {
  const before = fixture({ observations: [observation(), observation('obs-b')] });
  const after = fixture({ observations: [observation(), observation('obs-b')], cases: [caseRecord('case-a', { observationIds: ['obs-b'] })] });
  const result = diff(before, after);
  assert.deepEqual(result.cases.changes[0].fields, ['observationIds']);
});
test('invalid before ledger reports before-prefixed issues', () => {
  const before = fixture({ schemaVersion: 4 });
  const result = diff(before, fixture());
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(x => x.path.startsWith('before.')));
});
test('invalid after ledger reports after-prefixed issues', () => {
  const after = fixture({ schemaVersion: 4 });
  const result = diff(fixture(), after);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(x => x.path.startsWith('after.')));
});
test('evidence reconciliation reports UNKNOWN status as review finding', () => {
  const result = reconciliation(fixture());
  assert.equal(result.ok, true);
  assert.ok(codes(result.findings).includes('UNKNOWN_STATUS'));
  assert.equal(result.counts.review > 0, true);
});
test('evidence reconciliation detects absent document hash', () => {
  const result = reconciliation(fixture());
  assert.ok(codes(result.findings).includes('NO_DOCUMENT_HASH'));
});
test('evidence reconciliation detects unknown verification tier', () => {
  const result = reconciliation(fixture());
  assert.ok(codes(result.findings).includes('UNKNOWN_TIER'));
});
test('evidence reconciliation detects a new unreviewed case', () => {
  const result = reconciliation(fixture());
  assert.ok(codes(result.findings).includes('UNOPENED_CASE'));
});
test('evidence reconciliation removes unopened finding after opening', () => {
  const initial = reconciliation(fixture());
  const current = reconciliation(openCase());
  assert.equal(codes(initial.findings).includes('UNOPENED_CASE'), true);
  assert.equal(codes(current.findings).includes('UNOPENED_CASE'), false);
});
test('evidence reconciliation records outstanding evidence requests', () => {
  const result = reconciliation(waitingCase());
  assert.ok(codes(result.findings).includes('AWAITING_EVIDENCE'));
});
test('evidence reconciliation detects contradictory reported statuses', () => {
  const result = reconciliation(withConflict());
  assert.ok(codes(result.findings).includes('CONFLICT'));
  assert.ok(codes(result.findings).includes('UNKNOWN_STATUS'));
});
test('reviewed case can retain evidence contradiction', () => {
  const conflicted = withConflict();
  const data = { ...conflicted, events: [event(), event('event-b', 'close', { decision: 'reviewed' })] };
  const result = reconciliation(data);
  assert.ok(codes(result.findings).includes('REVIEWED_WITH_CONFLICT'));
});
test('old evidence receives explicit review flag', () => {
  const data = fixture({ observations: [observation('obs-a', { retrievedOn: '2024-10-01' })] });
  const result = reconciliation(data);
  assert.ok(codes(result.findings).includes('OLD_EVIDENCE'));
});
test('recent evidence is not falsely called old', () => {
  const result = reconciliation(fixture());
  assert.equal(codes(result.findings).includes('OLD_EVIDENCE'), false);
});
test('reconciliation sorts findings deterministically', () => {
  const data = withConflict();
  const first = reconciliation(data);
  const second = reconciliation(clone(data));
  assert.deepEqual(first, second);
});
test('finding sets identify newly introduced evidence issue', () => {
  const before = fixture({ observations: [observation('obs-a', { documentHash: HASH_A })] });
  const after = fixture();
  const result = compareFindingSets(before, after, { today: TODAY });
  assert.equal(result.ok, true);
  assert.ok(codes(result.newFindings).includes('NO_DOCUMENT_HASH'));
});
test('finding sets identify resolved evidence issue', () => {
  const before = fixture();
  const after = fixture({ observations: [observation('obs-a', { documentHash: HASH_A })] });
  const result = compareFindingSets(before, after, { today: TODAY });
  assert.ok(codes(result.resolvedFindings).includes('NO_DOCUMENT_HASH'));
});
test('finding sets retain unchanged issues', () => {
  const result = compareFindingSets(fixture(), fixture(), { today: TODAY });
  assert.ok(result.retainedFindings.length > 0);
  assert.deepEqual(result.newFindings, []);
  assert.deepEqual(result.resolvedFindings, []);
});
test('findings comparison refuses invalid evidence', () => {
  const result = compareFindingSets(fixture({ observations: [] }), fixture(), { today: TODAY });
  assert.equal(result.ok, false);
});
test('casesWithFeature filters without altering analysis', () => {
  const data = fixture();
  const result = analyzeLedger(data, { today: TODAY });
  assert.deepEqual(casesWithFeature(result, 'entrance').map(x => x.id), ['case-a']);
  assert.deepEqual(casesWithFeature(result, 'parking'), []);
  assert.deepEqual(casesWithFeature({ ok: false }, 'entrance'), []);
});
test('caseStateChanges hides unchanged case snapshots', () => {
  const result = caseStateChanges(fixture(), fixture(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes, []);
});
test('caseStateChanges shows opening as an explicit change', () => {
  const result = caseStateChanges(fixture(), openCase(), { today: TODAY });
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].kind, 'changed');
});
test('requireAppendOnly accepts appended audit events', () => {
  const result = requireAppendOnly(fixture(), openCase(), { today: TODAY });
  assert.equal(result.ok, true);
});
test('requireAppendOnly refuses changes to old observations', () => {
  const after = fixture({ observations: [observation('obs-a', { licence: 'CC-BY-4.0' })] });
  const result = requireAppendOnly(fixture(), after, { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result.issues).includes('HISTORY_NOT_APPEND_ONLY'));
});
test('requireAppendOnly refuses event removals', () => {
  const result = requireAppendOnly(openCase(), fixture(), { today: TODAY });
  assert.equal(result.ok, false);
});
test('comparison does not invent an access conclusion from a review decision', () => {
  const result = diff(openCase(), closedCase());
  assert.equal(result.ok, true);
  assert.equal(result.states.changes[0].after.decision, 'reviewed');
  assert.equal(result.states.changes[0].after.status, 'UNKNOWN');
});
