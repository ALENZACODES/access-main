import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHANGE_KINDS, compareRecoveryReleases, reviewChange,
  changedTraceIds, stableChangeSummary,
} from './offline-recovery-trace-delta.mjs';
import { document, trace, action, failure, source, label } from './offline-recovery-trace-fixtures.mjs';

const base = () => document(trace());
const compare = (change) => {
  const a = base();
  const b = base();
  change?.(b);
  return compareRecoveryReleases(a, b);
};
const kinds = (result) => result.changes.map((entry) => entry.kind);

test('change vocabulary is deterministic and complete', () => {
  assert.ok(Object.isFrozen(CHANGE_KINDS));
  assert.ok(CHANGE_KINDS.includes('source-changed'));
  assert.ok(CHANGE_KINDS.includes('evidence-changed'));
  assert.ok(CHANGE_KINDS.includes('outcome-changed'));
  assert.ok(CHANGE_KINDS.includes('removed'));
});
test('identical release snapshots have zero material changes', () => {
  const result = compare();
  assert.equal(result.ok, true);
  assert.deepEqual(kinds(result), ['unchanged']);
  assert.equal(result.summary.changes, 0);
});
test('new trace is reported as added without an invented before outcome', () => {
  const a = base();
  const b = document(trace(), trace('new-one'));
  const result = compareRecoveryReleases(a, b);
  const added = result.changes.find((entry) => entry.kind === 'added');
  assert.equal(added.id, 'new-one');
  assert.equal(added.before, null);
  assert.equal(added.after, 'PASS');
});
test('removed trace is flagged without silently retaining its outcome', () => {
  const a = document(trace(), trace('removed'));
  const b = base();
  const result = compareRecoveryReleases(a, b);
  assert.ok(result.changes.some((entry) => entry.id === 'removed' && entry.kind === 'removed'));
  assert.equal(result.summary.removed, 1);
});
test('recovery regression from PASS to FAIL is flagged', () => {
  const result = compare((b) => { b.traces[0].steps[3].outcome = 'FAIL'; });
  assert.ok(kinds(result).includes('outcome-changed'));
  assert.ok(kinds(result).includes('evidence-changed'));
  assert.ok(result.summary.regressions >= 1);
});
test('recovery regression from PASS to UNKNOWN is flagged', () => {
  const result = compare((b) => { b.traces[0].steps.pop(); });
  assert.ok(kinds(result).includes('outcome-changed'));
  assert.ok(result.changes.some((entry) => entry.after === 'UNKNOWN'));
});
test('a new PASS after UNKNOWN is not automatic source confirmation', () => {
  const a = document(trace('trace-a', { steps: [action(), failure()] }));
  const b = base();
  const result = compareRecoveryReleases(a, b);
  assert.ok(kinds(result).includes('outcome-changed'));
  assert.equal(reviewChange(result.changes[0]), 'review');
});
test('event code change is material even with identical final outcome', () => {
  const result = compare((b) => { b.traces[0].steps[0].code = 'ANOTHER_ACTIVATION'; });
  assert.ok(kinds(result).includes('evidence-changed'));
  assert.equal(result.changes.some((entry) => entry.kind === 'outcome-changed'), false);
});
test('source URL change cannot be hidden behind unchanged PASS', () => {
  const result = compare((b) => { b.traces[0].source.source = 'https://example.org/second-source'; });
  assert.ok(kinds(result).includes('source-changed'));
});
test('licence change is independently reported', () => {
  const result = compare((b) => { b.traces[0].source.licence = 'CC-BY-4.0'; });
  assert.ok(kinds(result).includes('licence-changed'));
});
test('retrieval-date change is independently reported', () => {
  const result = compare((b) => { b.traces[0].source.retrievedOn = '2026-11-18'; });
  assert.ok(kinds(result).includes('date-changed'));
});
test('source-tier change does not silently approve a record', () => {
  const result = compare((b) => { b.traces[0].source.tier = 'E'; });
  assert.ok(kinds(result).includes('tier-changed'));
  assert.equal(result.summary.changes, 1);
});
test('route change is not treated as equivalent evidence', () => {
  const result = compare((b) => { b.traces[0].route = '/another-synthetic-route'; });
  assert.ok(kinds(result).includes('route-changed'));
});
test('locale changes are visible in release comparisons', () => {
  const result = compare((b) => { b.traces[0].locale = 'fr'; });
  assert.ok(kinds(result).includes('locale-changed'));
});
test('network-mode change is visible in release comparisons', () => {
  const result = compare((b) => { b.traces[0].mode = 'limited'; });
  assert.ok(kinds(result).includes('mode-changed'));
});
test('category change is separately visible', () => {
  const result = compare((b) => { b.traces[0].category = 'keyboard'; });
  assert.ok(kinds(result).includes('category-changed'));
});
test('label change does not alter recorded outcomes', () => {
  const result = compare((b) => { b.traces[0].label.en = 'Different synthetic title'; });
  assert.ok(kinds(result).includes('label-changed'));
  assert.equal(result.changes[0].after, 'PASS');
});
test('multiple independent changes all appear', () => {
  const result = compare((b) => {
    b.traces[0].source = source({ licence: 'CC-BY-4.0', tier: 1 });
    b.traces[0].label = label({ en: 'Updated synthetic label' });
  });
  assert.ok(kinds(result).includes('licence-changed'));
  assert.ok(kinds(result).includes('tier-changed'));
  assert.ok(kinds(result).includes('label-changed'));
});
test('invalid earlier snapshot refuses comparison', () => {
  const result = compareRecoveryReleases({ version: 0 }, base());
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(result.problems.every((item) => item.snapshot === 'before'));
});
test('invalid later snapshot refuses comparison', () => {
  const result = compareRecoveryReleases(base(), { version: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(result.problems.every((item) => item.snapshot === 'after'));
});
test('both malformed snapshots yield independent problem annotations', () => {
  const result = compareRecoveryReleases({ version: 0 }, { version: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((item) => item.snapshot === 'before'));
  assert.ok(result.problems.some((item) => item.snapshot === 'after'));
});
test('comparison ignores record insertion order', () => {
  const a = document(trace('b'), trace('a'));
  const b = document(trace('a'), trace('b'));
  assert.equal(compareRecoveryReleases(a, b).summary.changes, 0);
});
test('review severity prioritizes a recorded regression', () => {
  assert.equal(reviewChange({ kind: 'outcome-changed', before: 'PASS', after: 'FAIL' }), 'block');
  assert.equal(reviewChange({ kind: 'outcome-changed', before: 'PASS', after: 'UNKNOWN' }), 'review');
  assert.equal(reviewChange({ kind: 'removed' }), 'review');
  assert.equal(reviewChange({ kind: 'unchanged' }), 'information');
});
test('changed ids are deduplicated despite multiple reasons', () => {
  const result = compare((b) => {
    b.traces[0].steps[0].code = 'DIFFERENT';
    b.traces[0].source.tier = 1;
  });
  assert.deepEqual(changedTraceIds(result), ['trace-a']);
});
test('invalid result has no ids or summary', () => {
  assert.deepEqual(changedTraceIds({ ok: false }), []);
  assert.equal(stableChangeSummary({ ok: false }), null);
});
test('change summary includes each class with zero counts', () => {
  const summary = stableChangeSummary(compare());
  assert.equal(summary.categories.unchanged, 1);
  assert.equal(summary.categories['source-changed'], 0);
  assert.equal(summary.total, 1);
});
test('before/after hashes change when source evidence changes', () => {
  const result = compare((b) => { b.traces[0].source.tier = 2; });
  const change = result.changes.find((entry) => entry.kind === 'tier-changed');
  assert.notEqual(change.beforeHash, change.afterHash);
  assert.equal(change.beforeHash.length, 64);
});
test('invalid input returns no hashes, no implied findings', () => {
  const result = compareRecoveryReleases(base(), { traces: [], token: 'private' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.changes, []);
});
test('comparing does not modify original snapshots', () => {
  const a = base();
  const b = base();
  const originalA = JSON.stringify(a);
  const originalB = JSON.stringify(b);
  compareRecoveryReleases(a, b);
  assert.equal(JSON.stringify(a), originalA);
  assert.equal(JSON.stringify(b), originalB);
});
