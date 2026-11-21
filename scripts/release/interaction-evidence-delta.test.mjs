import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGE_FIELDS, CHANGE_KINDS, changesFor, compare, changedOnly, regressionsOnly, summarizeChanges } from './interaction-evidence-delta.mjs';
import { check, route, snapshot, paired, measured, DATE, HASH } from './interaction-evidence-fixtures.mjs';
const diff = (a, b) => compare(a, b, { today: DATE });
const state = changes => snapshot(route({ checks: [check(changes)] }));
const changes = (a, b) => diff(state(a), state(b));

test('all tracked fields are explicit in the comparison contract', () => {
  for (const field of ['result', 'kind', 'source', 'licence', 'retrievedOn', 'verificationTier', 'digest']) assert.ok(CHANGE_FIELDS.includes(field));
});
test('change kinds use an exhaustive nonduplicated vocabulary', () => {
  assert.deepEqual(CHANGE_KINDS, ['added', 'removed', 'changed', 'unchanged']);
  assert.equal(new Set(CHANGE_KINDS).size, CHANGE_KINDS.length);
});
test('identical empty snapshots have empty comparison', () => {
  const a = { schemaVersion: 1, capturedOn: DATE, routes: [] };
  const result = diff(a, a);
  assert.equal(result.ok, true);
  assert.equal(result.value.changes.length, 0);
});
test('identical populated snapshots are unchanged', () => {
  const result = diff(snapshot(), snapshot());
  assert.equal(result.value.counts.unchanged, 1);
  assert.equal(result.value.counts.changed, 0);
});
test('unchanged records produce no regressions', () => {
  const result = diff(snapshot(), snapshot());
  assert.deepEqual(result.value.regressions, []);
});
test('unchanged records produce no indeterminate changes', () => {
  const result = diff(snapshot(), snapshot());
  assert.deepEqual(result.value.indeterminate, []);
});
test('record addition is explicit', () => {
  const before = snapshot(route({ checks: [] }));
  const after = snapshot();
  const result = diff(before, after);
  assert.equal(result.value.counts.added, 1);
  assert.equal(result.value.changes[0].kind, 'added');
});
test('record removal is explicit', () => {
  const before = snapshot();
  const after = snapshot(route({ checks: [] }));
  assert.equal(diff(before, after).value.counts.removed, 1);
});
test('record result change is preserved', () => {
  const result = changes({ width: 44, height: 44, result: 'PASS' }, { width: 43, height: 44, result: 'FAIL' });
  assert.equal(result.ok, true);
  assert.ok(result.value.changes[0].fields.includes('result'));
});
test('PASS to FAIL is a recorded regression', () => {
  const result = changes({ width: 44, height: 44, result: 'PASS' }, { width: 43, height: 44, result: 'FAIL' });
  assert.deepEqual(result.value.regressions.map(x => [x.from, x.to]), [['PASS', 'FAIL']]);
});
test('FAIL to PASS is a recorded improvement', () => {
  const result = changes({ width: 43, height: 44, result: 'FAIL' }, { width: 44, height: 44, result: 'PASS' });
  assert.deepEqual(result.value.improvements.map(x => [x.from, x.to]), [['FAIL', 'PASS']]);
});
test('UNKNOWN to PASS is not classified as a confirmed improvement', () => {
  const result = changes({}, { width: 44, height: 44, result: 'PASS' });
  assert.equal(result.value.improvements.length, 0);
  assert.equal(result.value.indeterminate.length, 1);
});
test('PASS to UNKNOWN is not called an observed failure', () => {
  const result = changes({ width: 44, height: 44, result: 'PASS' }, {});
  assert.equal(result.value.regressions.length, 0);
  assert.equal(result.value.indeterminate.length, 1);
});
test('UNKNOWN to FAIL is explicitly indeterminate', () => {
  const result = changes({}, { width: 43, height: 44, result: 'FAIL' });
  assert.equal(result.value.regressions.length, 0);
  assert.equal(result.value.indeterminate.length, 1);
});
test('removed PASS is not called an observed regression', () => {
  const before = snapshot(route({ checks: [measured()] }));
  const after = snapshot(route({ checks: [] }));
  assert.equal(diff(before, after).value.regressions.length, 0);
});
test('added FAIL is not called a before/after regression', () => {
  const before = snapshot(route({ checks: [] }));
  const after = snapshot(route({ checks: [measured('focus', 'FAIL')] }));
  assert.equal(diff(before, after).value.regressions.length, 0);
});
test('added FAIL is tracked as an indeterminate historical transition', () => {
  const before = snapshot(route({ checks: [] }));
  const after = snapshot(route({ checks: [measured('focus', 'FAIL')] }));
  assert.equal(diff(before, after).value.indeterminate.length, 1);
});
test('source changes are tracked even if the recorded status stays UNKNOWN', () => {
  const result = changes({}, { source: 'Different fictional source' });
  assert.deepEqual(result.value.changes[0].fields, ['source']);
});
test('licence changes are not ignored', () => {
  const result = changes({}, { licence: 'CC-BY-4.0' });
  assert.deepEqual(result.value.changes[0].fields, ['licence']);
});
test('retrieval date changes are not ignored', () => {
  const result = changes({ retrievedOn: '2026-11-20' }, {});
  assert.deepEqual(result.value.changes[0].fields, ['retrievedOn']);
});
test('tier changes are not treated as a recorded accessibility result', () => {
  const result = changes({}, { verificationTier: 'documented' });
  assert.deepEqual(result.value.changes[0].fields, ['verificationTier']);
  assert.equal(result.value.regressions.length, 0);
});
test('digest changes are independently tracked', () => {
  const result = changes({ digest: HASH }, { digest: 'b'.repeat(64) });
  assert.deepEqual(result.value.changes[0].fields, ['digest']);
});
test('removal of the digest is tracked', () => {
  const result = changes({ digest: HASH }, {});
  assert.deepEqual(result.value.changes[0].fields, ['digest']);
});
test('note changes are independently tracked', () => {
  const result = changes({ note: 'Earlier note' }, { note: 'Later note' });
  assert.deepEqual(result.value.changes[0].fields, ['note']);
});
test('measurement dimensions changes are tracked', () => {
  const result = changes({ width: 40, height: 44 }, { width: 41, height: 44 });
  assert.deepEqual(result.value.changes[0].fields, ['width']);
});
test('focus observation changes are tracked', () => {
  const a = check({ kind: 'focus', focusVisible: false, result: 'FAIL' });
  const b = { ...a, focusVisible: true, result: 'PASS' };
  const result = diff(snapshot(route({ checks: [a] })), snapshot(route({ checks: [b] })));
  assert.ok(result.value.changes[0].fields.includes('focusVisible'));
});
test('keyboard observation changes are tracked', () => {
  const a = check({ kind: 'keyboard', keyboardReachable: false, result: 'FAIL' });
  const b = { ...a, keyboardReachable: true, result: 'PASS' };
  const result = diff(snapshot(route({ checks: [a] })), snapshot(route({ checks: [b] })));
  assert.ok(result.value.changes[0].fields.includes('keyboardReachable'));
});
test('screen reader observation changes are tracked', () => {
  const a = check({ kind: 'screen-reader', announced: false, result: 'FAIL' });
  const b = { ...a, announced: true, result: 'PASS' };
  const result = diff(snapshot(route({ checks: [a] })), snapshot(route({ checks: [b] })));
  assert.ok(result.value.changes[0].fields.includes('announced'));
});
test('accessible name text changes are tracked', () => {
  const a = check({ kind: 'accessible-name', accessibleName: 'First' });
  const b = { ...a, accessibleName: 'Second' };
  const result = diff(snapshot(route({ checks: [a] })), snapshot(route({ checks: [b] })));
  assert.deepEqual(result.value.changes[0].fields, ['accessibleName']);
});
test('language is part of the identity key', () => {
  const before = snapshot(route());
  const after = paired();
  assert.equal(diff(before, after).value.counts.added, 1);
});
test('path is part of the identity key', () => {
  const before = snapshot(route());
  const after = snapshot(route({ path: '/different' }));
  const result = diff(before, after);
  assert.equal(result.value.counts.added, 1);
  assert.equal(result.value.counts.removed, 1);
});
test('check identifier is part of the identity key', () => {
  const before = snapshot(route());
  const after = snapshot(route({ checks: [check({ id: 'new' })] }));
  const result = diff(before, after);
  assert.equal(result.value.counts.added, 1);
  assert.equal(result.value.counts.removed, 1);
});
test('invalid before document is rejected with a before prefix', () => {
  const v = diff({ ...snapshot(), schemaVersion: 0 }, snapshot());
  assert.equal(v.ok, false);
  assert.ok(v.issues.some(x => x.path.startsWith('before.')));
});
test('invalid after document is rejected with an after prefix', () => {
  const v = diff(snapshot(), { ...snapshot(), schemaVersion: 0 });
  assert.equal(v.ok, false);
  assert.ok(v.issues.some(x => x.path.startsWith('after.')));
});
test('before and after invalidities are both reported', () => {
  const a = { ...snapshot(), schemaVersion: 0 };
  const b = { ...snapshot(), schemaVersion: 2 };
  const v = diff(a, b);
  assert.equal(v.ok, false);
  assert.equal(v.issues.length, 2);
});
test('change list is sorted deterministically', () => {
  const before = snapshot(route({ checks: [check({ id: 'z' }), check({ id: 'a' })] }));
  const after = snapshot(route({ checks: [check({ id: 'a' }), check({ id: 'z' })] }));
  assert.deepEqual(diff(before, after).value.changes.map(x => x.key), ['en|/fictional|a', 'en|/fictional|z']);
});
test('unchanged rows do not appear in changedOnly', () => {
  const result = diff(snapshot(), snapshot());
  assert.deepEqual(changedOnly(result), []);
});
test('changedOnly includes additions and removals', () => {
  const before = snapshot(route({ checks: [check({ id: 'old' })] }));
  const after = snapshot(route({ checks: [check({ id: 'new' })] }));
  assert.deepEqual(changedOnly(diff(before, after)).map(x => x.kind), ['added', 'removed']);
});
test('changedOnly returns empty for malformed comparison', () => {
  assert.deepEqual(changedOnly({ ok: false }), []);
});
test('regressionsOnly returns empty for malformed comparison', () => {
  assert.deepEqual(regressionsOnly({ ok: false }), []);
});
test('regressionsOnly returns only PASS to FAIL changes', () => {
  const result = changes({ width: 44, height: 44, result: 'PASS' }, { width: 43, height: 44, result: 'FAIL' });
  assert.equal(regressionsOnly(result).length, 1);
});
test('summary includes all change counts', () => {
  const value = summarizeChanges(diff(snapshot(), snapshot()));
  assert.equal(value.ok, true);
  assert.equal(value.value.unchanged, 1);
});
test('summary includes separate regression count', () => {
  const value = summarizeChanges(changes({ width: 44, height: 44, result: 'PASS' }, { width: 43, height: 44, result: 'FAIL' }));
  assert.equal(value.value.regressions, 1);
});
test('summary includes separate introduced and resolved flag counts', () => {
  const value = summarizeChanges(changes({}, { width: 44, height: 44, result: 'PASS', verificationTier: 'documented', digest: HASH }));
  assert.ok(value.value.resolved > 0);
});
test('summary refuses malformed comparisons', () => {
  assert.equal(summarizeChanges({ ok: false, issues: [{ code: 'BAD' }] }).ok, false);
});
test('changed source provenance cannot silently retain old flags', () => {
  const value = changes({ retrievedOn: '2024-01-01' }, {});
  assert.ok(value.value.resolved.some(x => x.endsWith('|OLD_EVIDENCE')));
});
test('new missing digest is an introduced flag', () => {
  const value = changes({ digest: HASH }, {});
  assert.ok(value.value.introduced.some(x => x.endsWith('|MISSING_DIGEST')));
});
test('resolved unknown does not establish route-level accessibility', () => {
  const value = changes({}, { result: 'PASS', width: 44, height: 44 });
  assert.match(value.value.warning, /not proof/);
});
test('captured dates are preserved in the comparison output', () => {
  const before = snapshot(); before.capturedOn = '2026-11-20';
  const after = snapshot();
  const result = diff(before, after);
  assert.equal(result.value.beforeDate, '2026-11-20');
  assert.equal(result.value.afterDate, DATE);
});
test('a source difference is not counted as a regression', () => {
  const value = changes({}, { source: 'Another fictional source' });
  assert.equal(value.value.regressions.length, 0);
});
test('a digest difference is not counted as an improvement', () => {
  const value = changes({ digest: HASH }, { digest: 'b'.repeat(64) });
  assert.equal(value.value.improvements.length, 0);
});
test('comparison never fabricates a source value for a removed record', () => {
  const after = snapshot(route({ checks: [] }));
  const value = diff(snapshot(), after).value.changes[0];
  assert.equal(value.after, null);
  assert.equal(value.before.source, check().source);
});
test('tracked source fields are not reinterpreted as accessibility determinations', () => {
  const fields = changesFor(check(), check({ source: 'X' }));
  assert.deepEqual(fields, ['source']);
});
