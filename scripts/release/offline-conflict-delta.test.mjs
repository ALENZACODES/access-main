import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHANGE_KINDS, recordDifferences, classifyTransition, compareRegisters,
  releaseReviewTasks, sameCanonicalRegister,
} from './offline-conflict-delta.mjs';
import { record, register, sample, deepCopy, DAY } from './offline-conflict-fixtures.mjs';
const compare = (a, b) => compareRegisters(a, b, { today: DAY });
const types = result => result.changes.map(change => change.kind);
const transition = (changed, previous = sample()) => compare(previous, changed);

test('public change vocabulary has stable unique entries', () => {
  assert.equal(new Set(CHANGE_KINDS).size, CHANGE_KINDS.length);
  assert.ok(CHANGE_KINDS.includes('source'));
  assert.ok(CHANGE_KINDS.includes('state'));
});
test('identical snapshots produce zero changes', () => {
  const result = compare(sample(), sample());
  assert.equal(result.ok, true);
  assert.equal(result.summary.changes, 0);
  assert.deepEqual(result.changes, []);
});
test('input order does not affect comparison result', () => {
  const a = register(record('b'), record('a'));
  const b = register(record('a'), record('b'));
  assert.deepEqual(compare(a, b).changes, []);
});
test('new record is a named review, not a physical assessment', () => {
  const result = compare(register(), sample());
  assert.deepEqual(types(result), ['added']);
  assert.equal(result.changes[0].outcome, 'UNKNOWN');
});
test('removed record triggers blocking review', () => {
  const result = compare(sample(), register());
  assert.deepEqual(types(result), ['removed']);
  assert.equal(result.changes[0].priority, 'block');
});
test('UNKNOWN to YES emits an explicit state change', () => {
  const result = transition(register(record('r1', { state: 'YES' })));
  assert.deepEqual(types(result), ['state']);
  assert.equal(result.changes[0].priority, 'review');
  assert.equal(result.changes[0].outcome, 'UNKNOWN');
});
test('UNKNOWN to NO also requires human review', () => {
  const result = transition(register(record('r1', { state: 'NO' })));
  assert.equal(result.changes[0].priority, 'review');
});
test('YES to UNKNOWN is blocked as evidence loss', () => {
  const result = compare(register(record('r1', { state: 'YES' })), sample());
  assert.equal(result.changes[0].priority, 'block');
});
test('NO to UNKNOWN is blocked as evidence loss', () => {
  const result = compare(register(record('r1', { state: 'NO' })), sample());
  assert.equal(result.changes[0].priority, 'block');
});
test('YES to NO is a contradiction requiring blocking review', () => {
  const result = compare(register(record('r1', { state: 'YES' })), register(record('r1', { state: 'NO' })));
  assert.equal(result.changes[0].priority, 'block');
});
test('NO to YES is also a blocking change', () => {
  const result = compare(register(record('r1', { state: 'NO' })), register(record('r1', { state: 'YES' })));
  assert.equal(result.changes[0].priority, 'block');
});
test('changed source URL is reported separately from state', () => {
  const result = transition(register(record('r1', { source: 'https://example.net/updated' })));
  assert.deepEqual(types(result), ['source']);
});
test('source URL change is review rather than pass', () => {
  const result = transition(register(record('r1', { source: 'https://example.net/new' })));
  assert.equal(result.changes[0].priority, 'review');
});
test('licence changes are reported', () => {
  assert.deepEqual(types(transition(register(record('r1', { licence: 'MIT' })))), ['licence']);
});
test('tier changes do not silently increase trust', () => {
  const result = transition(register(record('r1', { tier: 1 })));
  assert.deepEqual(types(result), ['tier']);
  assert.equal(result.changes[0].outcome, 'UNKNOWN');
});
test('retrieval date changes are identified', () => {
  const result = transition(register(record('r1', { retrievedOn: DAY })));
  assert.deepEqual(types(result), ['date']);
});
test('source observation date changes are identified', () => {
  const base = register(record('r1', { sourceDate: '2026-11-18' }));
  const next = register(record('r1', { sourceDate: '2026-11-19' }));
  assert.deepEqual(types(compare(base, next)), ['date']);
});
test('capture-date change is not lost among other source dates', () => {
  const result = transition(register(record('r1', { capturedOn: '2026-11-18' })));
  assert.deepEqual(types(result), ['capture']);
});
test('related evidence changes are not ignored', () => {
  const base = register(record('r1'), record('b'));
  const next = register(record('r1', { relatedIds: ['b'] }), record('b'));
  assert.ok(types(compare(base, next)).includes('relations'));
});
test('relation-order changes alone are not material', () => {
  const base = register(record('r1', { relatedIds: ['b', 'c'] }), record('b'), record('c'));
  const next = register(record('r1', { relatedIds: ['c', 'b'] }), record('b'), record('c'));
  assert.deepEqual(compare(base, next).changes, []);
});
test('note changes are classified without leaking raw text', () => {
  const result = transition(register(record('r1', { notes: { en: 'New note', fr: 'Nouvelle note' } })));
  assert.deepEqual(types(result), ['notes']);
  assert.ok(!JSON.stringify(result).includes('New note'));
});
test('changing subject produces an explicit identity-context review', () => {
  assert.deepEqual(types(transition(register(record('r1', { subject: 'different' })))), ['subject']);
});
test('changing attribute produces an explicit identity-context review', () => {
  assert.deepEqual(types(transition(register(record('r1', { attribute: 'ramp' })))), ['attribute']);
});
test('recordDifferences are stable for canonical equivalents', () => {
  assert.deepEqual(recordDifferences(record('a'), record('a')), []);
});
test('recordDifferences preserve a deterministic field order', () => {
  const before = record('a');
  const after = record('a', { state: 'YES', source: 'https://example.net', tier: 1 });
  assert.deepEqual(recordDifferences(before, after), ['state', 'source', 'tier']);
});
test('classification of removed evidence blocks the release', () => {
  assert.equal(classifyTransition('removed', record('a'), undefined), 'block');
});
test('classification of a new record requires human review', () => {
  assert.equal(classifyTransition('added', undefined, record('a')), 'review');
});
test('unrecognized change kinds do not manufacture blocking evidence', () => {
  assert.equal(classifyTransition('other', record('a'), record('a')), 'information');
});
test('invalid earlier snapshot blocks a seemingly clean diff', () => {
  const base = register(record('r1', { source: '' }));
  const result = compare(base, sample());
  assert.equal(result.ok, false);
  assert.deepEqual(result.changes, []);
  assert.ok(result.problems.some(problem => problem.register === 'previous'));
});
test('invalid later snapshot blocks a seemingly clean diff', () => {
  const later = register(record('r1', { licence: null }));
  const result = compare(sample(), later);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.register === 'current'));
});
test('invalid snapshots do not return a summary', () => {
  const result = compare(sample(), register(record('r1', { state: 'unknown' })));
  assert.equal(result.summary, null);
});
test('comparison never mutates inputs', () => {
  const a = sample(); const b = register(record('r1', { state: 'YES' }));
  const stored = deepCopy([a, b]);
  compare(a, b);
  assert.deepEqual([a, b], stored);
});
test('change entries retain source URLs, not only tier labels', () => {
  const result = transition(register(record('r1', { state: 'YES' })));
  assert.ok(result.changes[0].before.source.startsWith('https://'));
  assert.ok(result.changes[0].after.source.startsWith('https://'));
});
test('change entries retain deterministic evidence signatures', () => {
  const result = transition(register(record('r1', { state: 'YES' })));
  assert.match(result.changes[0].before.signature, /^[0-9a-f]{64}$/u);
  assert.match(result.changes[0].after.signature, /^[0-9a-f]{64}$/u);
});
test('newly opposed records are counted separately from changed fields', () => {
  const a = register(record('yes', { state: 'YES' }));
  const b = register(record('yes', { state: 'YES' }), record('no', { state: 'NO' }));
  const result = compare(a, b);
  assert.ok(result.summary.newlyRecordedConflicts >= 1);
});
test('withdrawn contradictions do not imply a physical fact changed', () => {
  const a = register(record('yes', { state: 'YES' }), record('no', { state: 'NO' }));
  const b = register(record('yes', { state: 'YES' }));
  const result = compare(a, b);
  assert.ok(result.summary.withdrawnConflicts >= 1);
  assert.equal(result.changes[0].outcome, 'UNKNOWN');
});
test('summary number of changes matches emitted entries', () => {
  const result = transition(register(record('r1', { state: 'YES', tier: 1 })));
  assert.equal(result.summary.changes, result.changes.length);
});
test('change kinds summary matches every individual finding', () => {
  const result = transition(register(record('r1', { state: 'YES', tier: 1 })));
  for (const kind of CHANGE_KINDS) {
    assert.equal(result.summary.byKind[kind], result.changes.filter(change => change.kind === kind).length);
  }
});
test('priority summary matches individual changes', () => {
  const result = transition(register(record('r1', { state: 'YES', tier: 1 })));
  for (const priority of ['block', 'review', 'information']) {
    assert.equal(result.summary.byPriority[priority], result.changes.filter(change => change.priority === priority).length);
  }
});
test('stability across input record order', () => {
  const first = register(record('z'), record('a'));
  const second = register(record('a', { state: 'YES' }), record('z'));
  const left = compare(first, second);
  const right = compare(register(...first.records.reverse()), register(...second.records.reverse()));
  assert.deepEqual(left, right);
});
test('release worklist excludes informational-only changes', () => {
  const result = releaseReviewTasks(sample(), register(record('r1', { capturedOn: '2026-11-18' })));
  assert.deepEqual(result.tasks, []);
});
test('release worklist includes source changes', () => {
  const result = releaseReviewTasks(sample(), register(record('r1', { source: 'https://example.net' })));
  assert.equal(result.tasks[0].reason, 'source');
});
test('release worklist prioritizes blocking over review', () => {
  const earlier = register(record('a', { state: 'YES' }), record('b'));
  const later = register(record('a', { state: 'NO' }), record('b', { source: 'https://example.net' }));
  const tasks = releaseReviewTasks(earlier, later).tasks;
  assert.deepEqual(tasks.map(x => x.priority), ['block', 'review']);
});
test('release tasks remain UNKNOWN', () => {
  const result = releaseReviewTasks(sample(), register(record('r1', { state: 'YES' })));
  assert.ok(result.tasks.every(item => item.state === 'UNKNOWN'));
});
test('invalid diff has no worklist', () => {
  const output = releaseReviewTasks(sample(), register(record('r1', { tier: 'unknown' })));
  assert.equal(output.ok, false);
  assert.deepEqual(output.tasks, []);
});
test('canonical register equivalence ignores input order', () => {
  const a = register(record('b'), record('a'));
  const b = register(record('a'), record('b'));
  assert.equal(sameCanonicalRegister(a, b), true);
});
test('canonical register equivalence detects state change', () => {
  assert.equal(sameCanonicalRegister(sample(), register(record('r1', { state: 'YES' }))), false);
});
test('invalid canonical compare fails closed', () => {
  assert.equal(sameCanonicalRegister(sample(), register(record('r1', { source: null }))), false);
});
test('no output record is a final accessibility determination', () => {
  const output = transition(register(record('r1', { state: 'YES' })));
  assert.ok(output.changes.every(change => change.outcome === 'UNKNOWN'));
});
