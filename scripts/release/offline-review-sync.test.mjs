import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SYNC_VERSION, CONFLICT_KINDS, SYNC_MAX_ITEMS, canonicalQueue,
  queueFingerprint, itemDifferences, reconcileQueues, conflictReport,
  createStatusPatch, verifyStatusPatch, validateSyncDate, conflictKindsValid,
} from './offline-review-sync.mjs';
import { validateQueue, transitionReview } from './offline-review-queue.mjs';

const TODAY = '2026-11-19';
const metadata = () => ({
  source: 'https://example.test/data', licence: 'CC0-1.0',
  retrievedOn: TODAY, tier: 0, sourceDate: '2026-10-01',
});
const item = (id = 'item-a', changes = {}) => ({
  id, recordId: `record-${id}`, claimKey: 'ramp',
  status: 'pending', reason: 'unknown-claim', state: 'UNKNOWN',
  createdOn: TODAY, label: { en: 'Fictional ramp', fr: 'Rampe fictive' },
  provenance: metadata(), history: [], ...changes,
});
const queue = (...items) => ({ version: 1, items });
const codes = (result) => result.problems.map(({ code }) => code);
const options = { today: TODAY };

function reviewed(record, status = 'closed') {
  if (status === 'closed') return transitionReview(queue(record), record.id, 'close', TODAY, options).queue.items[0];
  if (status === 'deferred') return transitionReview(queue(record), record.id, 'defer', TODAY, options).queue.items[0];
  throw new Error('unsupported fixture');
}

test('version and bounded conflict vocabulary are stable', () => {
  assert.equal(SYNC_VERSION, 1);
  assert.ok(SYNC_MAX_ITEMS > 0 && SYNC_MAX_ITEMS <= 50_000);
  assert.equal(CONFLICT_KINDS.length, new Set(CONFLICT_KINDS).size);
  assert.ok(CONFLICT_KINDS.includes('claim-changed'));
});

test('empty queues reconcile without inventing records', () => {
  const result = reconcileQueues(queue(), queue(), queue(), options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.merged, queue());
  assert.equal(result.summary.added, 0);
  assert.equal(result.summary.conflicts, 0);
});

test('canonical queue sorts by stable IDs', () => {
  const value = canonicalQueue(queue(item('z'), item('a')));
  assert.deepEqual(value.items.map(({ id }) => id), ['a', 'z']);
});

test('canonical queue copies all provenance dimensions', () => {
  const value = canonicalQueue(queue(item()));
  assert.deepEqual(value.items[0].provenance, metadata());
  assert.equal(value.items[0].state, 'UNKNOWN');
});

test('fingerprint remains constant under source order permutations', () => {
  const a = queueFingerprint(queue(item('z'), item('a')), options);
  const b = queueFingerprint(queue(item('a'), item('z')), options);
  assert.equal(a.ok, true);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.match(a.fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test('fingerprint changes when provenance changes', () => {
  const first = queueFingerprint(queue(item()), options).fingerprint;
  const second = queueFingerprint(queue(item('item-a', { provenance: {
    ...metadata(), retrievedOn: '2026-11-18',
  } })), options).fingerprint;
  assert.notEqual(first, second);
});

test('fingerprint changes when claim state changes', () => {
  const a = queueFingerprint(queue(item()), options).fingerprint;
  const b = queueFingerprint(queue(item('item-a', { state: 'YES' })), options).fingerprint;
  assert.notEqual(a, b);
});

test('fingerprint rejects invalid queue with no hash', () => {
  const result = queueFingerprint(queue({ id: 'broken' }), options);
  assert.equal(result.ok, false);
  assert.equal(result.fingerprint, null);
});

test('base and both unchanged sides produce unchanged entry', () => {
  const original = queue(item());
  const result = reconcileQueues(original, original, original, options);
  assert.equal(result.ok, true);
  assert.equal(result.summary.unchanged, 1);
  assert.equal(result.merged.items[0].state, 'UNKNOWN');
});

test('only local change is adopted with source and claim unchanged', () => {
  const base = queue(item());
  const local = queue(reviewed(item()));
  const result = reconcileQueues(base, local, base, options);
  assert.equal(result.ok, true);
  assert.equal(result.summary.local, 1);
  assert.equal(result.merged.items[0].status, 'closed');
  assert.equal(result.merged.items[0].state, 'UNKNOWN');
});

test('only remote change is adopted with no silent vote', () => {
  const base = queue(item());
  const remote = queue(reviewed(item(), 'deferred'));
  const result = reconcileQueues(base, base, remote, options);
  assert.equal(result.ok, true);
  assert.equal(result.summary.remote, 1);
  assert.equal(result.merged.items[0].status, 'deferred');
});

test('identical parallel edits do not count as a conflict', () => {
  const base = queue(item());
  const same = queue(reviewed(item()));
  const result = reconcileQueues(base, same, same, options);
  assert.equal(result.ok, true);
  assert.equal(result.summary.conflicts, 0);
  assert.equal(result.merged.items[0].status, 'closed');
});

test('divergent reviews become explicit conflicts without a merged queue', () => {
  const base = queue(item());
  const a = queue(reviewed(item()));
  const b = queue(reviewed(item(), 'deferred'));
  const result = reconcileQueues(base, a, b, options);
  assert.equal(result.ok, false);
  assert.equal(result.merged, null);
  assert.equal(result.conflicts.length, 1);
  assert.ok(codes(result).includes('SYNC_CONFLICT'));
});

test('conflicting claim changes cannot promote UNKNOWN', () => {
  const base = queue(item());
  const a = queue(item('item-a', { state: 'YES' }));
  const b = queue(item('item-a', { state: 'NO' }));
  const result = reconcileQueues(base, a, b, options);
  assert.equal(result.ok, false);
  assert.equal(result.conflicts[0].kind, 'claim-changed');
});

test('conflicting source revisions never resolve by tier', () => {
  const base = queue(item());
  const a = queue(item('item-a', { provenance: { ...metadata(), tier: 1 } }));
  const b = queue(item('item-a', { provenance: { ...metadata(), tier: 2 } }));
  const result = reconcileQueues(base, a, b, options);
  assert.equal(result.ok, false);
  assert.equal(result.conflicts[0].kind, 'provenance-changed');
});

test('different bilingual labels are recorded as conflicts', () => {
  const base = queue(item());
  const a = queue(item('item-a', { label: { en: 'A', fr: 'Une' } }));
  const b = queue(item('item-a', { label: { en: 'B', fr: 'Deux' } }));
  const result = reconcileQueues(base, a, b, options);
  assert.equal(result.conflicts[0].kind, 'label-changed');
});

test('parallel creation with identical item succeeds', () => {
  const result = reconcileQueues(queue(), queue(item()), queue(item()), options);
  assert.equal(result.ok, true);
  assert.equal(result.summary.added, 1);
  assert.equal(result.merged.items.length, 1);
});

test('creation on local side alone succeeds', () => {
  const result = reconcileQueues(queue(), queue(item('new')), queue(), options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.merged.items.map(({ id }) => id), ['new']);
});

test('creation on remote side alone succeeds', () => {
  const result = reconcileQueues(queue(), queue(), queue(item('new')), options);
  assert.equal(result.ok, true);
  assert.equal(result.merged.items[0].state, 'UNKNOWN');
});

test('parallel additions with different claims conflict', () => {
  const result = reconcileQueues(queue(), queue(item()), queue(item('item-a', { state: 'YES' })), options);
  assert.equal(result.ok, false);
  assert.equal(result.conflicts[0].kind, 'concurrent-addition');
});

test('deletion on both sides succeeds', () => {
  const base = queue(item());
  const result = reconcileQueues(base, queue(), queue(), options);
  assert.equal(result.ok, true);
  assert.equal(result.summary.removed, 1);
  assert.deepEqual(result.merged.items, []);
});

test('deletion on one side and unchanged on other succeeds', () => {
  const base = queue(item());
  const result = reconcileQueues(base, queue(), base, options);
  assert.equal(result.ok, true);
  assert.equal(result.summary.removed, 1);
});

test('deletion against review update becomes explicit conflict', () => {
  const base = queue(item());
  const result = reconcileQueues(base, queue(), queue(reviewed(item())), options);
  assert.equal(result.ok, false);
  assert.equal(result.conflicts[0].kind, 'removed');
});

test('invalid base never produces a merge result', () => {
  const result = reconcileQueues(queue({ bad: true }), queue(), queue(), options);
  assert.equal(result.ok, false);
  assert.equal(result.merged, null);
  assert.ok(result.problems.some((p) => p.snapshot === 'base'));
});

test('invalid remote never masquerades as valid', () => {
  const result = reconcileQueues(queue(), queue(), queue({ bad: true }), options);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.snapshot === 'remote'));
});

test('reconciliation is deterministic under ordering', () => {
  const a = queue(item('z'), item('a'));
  const b = queue(item('a'), item('z'));
  const resultA = reconcileQueues(a, a, a, options);
  const resultB = reconcileQueues(b, b, b, options);
  assert.deepEqual(resultA, resultB);
});

test('merging does not mutate any input snapshots', () => {
  const base = queue(item());
  const local = queue(reviewed(item()));
  const remote = queue(item());
  const originals = [base, local, remote].map((value) => JSON.stringify(value));
  reconcileQueues(base, local, remote, options);
  assert.deepEqual([base, local, remote].map((value) => JSON.stringify(value)), originals);
});

test('item differences reveal status changes without altering facts', () => {
  assert.deepEqual(itemDifferences(item(), reviewed(item())), [
    'history-diverged', 'workflow-diverged',
  ]);
});

test('item differences distinguish provenance, label and claim', () => {
  const before = item();
  assert.ok(itemDifferences(before, item('item-a', { provenance: { ...metadata(), tier: 1 } }))
    .includes('provenance-changed'));
  assert.ok(itemDifferences(before, item('item-a', { state: 'YES' }))
    .includes('claim-changed'));
  assert.ok(itemDifferences(before, item('item-a', { label: { en: 'Other', fr: 'Autre' } }))
    .includes('label-changed'));
});

test('a conflict report discloses no raw source content', () => {
  const base = queue(item());
  const a = queue(item('item-a', { provenance: { ...metadata(), source: 'https://example.test/a' } }));
  const b = queue(item('item-a', { provenance: { ...metadata(), source: 'https://example.test/b' } }));
  const result = reconcileQueues(base, a, b, options);
  const report = conflictReport(result, 'en');
  assert.ok(report.includes('provenance-changed'));
  assert.ok(!report.includes('https://example.test/a'));
});

test('French report retains stable UNKNOWN token', () => {
  const output = conflictReport(reconcileQueues(queue(), queue(), queue(), options), 'fr');
  assert.ok(output.includes('UNKNOWN reste UNKNOWN'));
  assert.ok(output.includes('Conflits\u00A0: 0'));
});

test('conflict report accepts invalid input conservatively', () => {
  assert.equal(conflictReport(null), null);
  assert.equal(conflictReport({}), null);
});

test('conflict kinds match declared vocabulary', () => {
  const base = queue(item());
  const left = queue(reviewed(item()));
  const right = queue(reviewed(item(), 'deferred'));
  assert.equal(conflictKindsValid(reconcileQueues(base, left, right, options)), true);
});

test('status patch is tied to exact fingerprint', () => {
  const input = queue(item());
  const fingerprint = queueFingerprint(input, options).fingerprint;
  const output = createStatusPatch(input, 'item-a', 'pending', fingerprint, options);
  assert.equal(output.ok, true);
  assert.equal(output.patch.version, SYNC_VERSION);
  assert.equal(output.patch.state, 'UNKNOWN');
  assert.equal(verifyStatusPatch(input, output.patch, options).ok, true);
});

test('status patch cannot change status outside workflow transition', () => {
  const input = queue(item());
  const fingerprint = queueFingerprint(input, options).fingerprint;
  const output = createStatusPatch(input, 'item-a', 'closed', fingerprint, options);
  assert.equal(output.ok, false);
  assert.ok(codes(output).includes('ACTION_REQUIRED'));
});

test('patch refuses stale fingerprint', () => {
  const input = queue(item());
  const output = createStatusPatch(input, 'item-a', 'pending', 'sha256:stale', options);
  assert.equal(output.ok, false);
  assert.ok(codes(output).includes('BASE_MISMATCH'));
});

test('patch refuses missing ID', () => {
  const input = queue(item());
  const fingerprint = queueFingerprint(input, options).fingerprint;
  const output = createStatusPatch(input, 'absent', 'pending', fingerprint, options);
  assert.ok(codes(output).includes('ITEM_NOT_FOUND'));
});

test('patch verification rejects injected attributes', () => {
  const input = queue(item());
  const fingerprint = queueFingerprint(input, options).fingerprint;
  const created = createStatusPatch(input, 'item-a', 'pending', fingerprint, options);
  const result = verifyStatusPatch(input, { ...created.patch, secret: 'extra' }, options);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('PATCH_EXTRA_FIELD'));
});

test('patch verification rejects a changed state', () => {
  const input = queue(item());
  const fingerprint = queueFingerprint(input, options).fingerprint;
  const created = createStatusPatch(input, 'item-a', 'pending', fingerprint, options);
  assert.equal(verifyStatusPatch(input, { ...created.patch, state: 'YES' }, options).ok, false);
});

test('patch verification rejects malformed patch', () => {
  assert.equal(verifyStatusPatch(queue(item()), null, options).ok, false);
  assert.equal(verifyStatusPatch(queue(item()), [], options).ok, false);
});

test('date boundary validation requires caller-supplied reference', () => {
  assert.equal(validateSyncDate('2026-11-18', TODAY), true);
  assert.equal(validateSyncDate('2026-11-20', TODAY), false);
  assert.equal(validateSyncDate('tomorrow', TODAY), false);
  assert.equal(validateSyncDate('2024-02-29'), true);
});

test('merged records remain schema-valid after reconciliation', () => {
  const base = queue(item('a'), item('b'));
  const local = queue(reviewed(item('a')), item('b'));
  const remote = queue(item('a'), reviewed(item('b')));
  const result = reconcileQueues(base, local, remote, options);
  assert.equal(result.ok, true);
  assert.equal(validateQueue(result.merged, options).ok, true);
  assert.equal(result.merged.items.length, 2);
});
