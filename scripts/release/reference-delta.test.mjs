import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changedFields, compareReferenceSets, proposedReviewItems, changeMatrix,
} from './reference-delta.mjs';
import { DAY, entry, french, snapshot, observed, clone } from './reference-fixtures.mjs';

const comparison = (before, after) => {
  const result = compareReferenceSets(before, after, { today: DAY });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  return result.value;
};
const singleChange = (before, after) => {
  const value = comparison(snapshot(before), snapshot(after));
  assert.equal(value.changes.length, 1);
  return value.changes[0];
};

test('identical manifests have no recorded changes', () => {
  const source = snapshot();
  assert.deepEqual(comparison(source, clone(source)).changes, []);
});
test('empty inventories compare without synthetic additions', () => {
  const empty = { schemaVersion: 1, capturedOn: DAY, references: [] };
  assert.deepEqual(comparison(empty, empty).changes, []);
});
test('added English reference is recorded as an addition', () => {
  const empty = { schemaVersion: 1, capturedOn: DAY, references: [] };
  const result = comparison(empty, snapshot(entry()));
  assert.deepEqual(result.changes.map(row => row.kind), ['added']);
});
test('removed reference is recorded without claiming the URL is broken', () => {
  const empty = { schemaVersion: 1, capturedOn: DAY, references: [] };
  const result = comparison(snapshot(entry()), empty);
  assert.deepEqual(result.changes.map(row => row.kind), ['removed']);
  assert.equal(result.changes[0].to, null);
});
test('added unknown reference remains unknown', () => {
  const empty = { schemaVersion: 1, capturedOn: DAY, references: [] };
  const result = comparison(empty, snapshot(entry()));
  assert.equal(result.changes[0].to, 'UNKNOWN');
  assert.equal(result.changes[0].classification, 'needs-review');
});
test('removed unknown reference keeps the earlier uncertainty', () => {
  const empty = { schemaVersion: 1, capturedOn: DAY, references: [] };
  const result = comparison(snapshot(entry()), empty);
  assert.equal(result.changes[0].from, 'UNKNOWN');
});
test('a label edit is recorded as a metadata-only change for observed statuses', () => {
  const change = singleChange(observed(), observed({ label: 'Updated fictional label' }));
  assert.deepEqual(change.fields, ['label']);
  assert.equal(change.classification, 'metadata-only');
});
test('label edits involving unknown status remain indeterminate', () => {
  const change = singleChange(entry(), entry({ label: 'Updated fictional label' }));
  assert.equal(change.classification, 'indeterminate');
});
test('AVAILABLE to UNAVAILABLE is a recorded regression, not a live assertion', () => {
  const change = singleChange(observed(), observed({ status: 'UNAVAILABLE' }));
  assert.equal(change.classification, 'recorded-regression');
  assert.deepEqual([change.from, change.to], ['AVAILABLE', 'UNAVAILABLE']);
});
test('UNAVAILABLE to AVAILABLE is a recorded improvement', () => {
  const change = singleChange(observed({ status: 'UNAVAILABLE' }), observed());
  assert.equal(change.classification, 'recorded-improvement');
});
test('UNKNOWN to AVAILABLE stays indeterminate', () => {
  const change = singleChange(entry(), observed());
  assert.equal(change.classification, 'indeterminate');
});
test('AVAILABLE to UNKNOWN stays indeterminate', () => {
  const change = singleChange(observed(), entry());
  assert.equal(change.classification, 'indeterminate');
});
test('UNKNOWN to UNAVAILABLE stays indeterminate', () => {
  const change = singleChange(entry(), observed({ status: 'UNAVAILABLE' }));
  assert.equal(change.classification, 'indeterminate');
});
test('UNAVAILABLE to UNKNOWN stays indeterminate', () => {
  const change = singleChange(observed({ status: 'UNAVAILABLE' }), entry());
  assert.equal(change.classification, 'indeterminate');
});
test('unchanged observed status with destination change needs review', () => {
  const change = singleChange(observed(), observed({ destination: 'https://example.org/new' }));
  assert.equal(change.classification, 'needs-review');
  assert.equal(change.destinationChanged, true);
});
test('route changes with stable status still need review', () => {
  const change = singleChange(observed(), observed({ route: '/places' }));
  assert.equal(change.classification, 'needs-review');
});
test('purpose changes with stable status still need review', () => {
  const change = singleChange(observed(), observed({ purpose: 'data-source' }));
  assert.equal(change.classification, 'needs-review');
});
test('source changes with stable status still need review', () => {
  const change = singleChange(observed(), observed({ source: 'Another fictional source' }));
  assert.equal(change.classification, 'needs-review');
});
test('licence changes with stable status still need review', () => {
  const change = singleChange(observed(), observed({ licence: 'Public Domain' }));
  assert.equal(change.classification, 'needs-review');
});
test('evidence tier changes with stable status still need review', () => {
  const change = singleChange(observed(), observed({ tier: 'field-observed' }));
  assert.equal(change.classification, 'needs-review');
});
test('observation date changes are metadata-only for stable status', () => {
  const change = singleChange(observed({ observedOn: '2026-11-19' }), observed());
  assert.deepEqual(change.fields, ['observedOn']);
  assert.equal(change.classification, 'metadata-only');
});
test('retrieval date changes are metadata-only for stable status', () => {
  const change = singleChange(observed({ retrievedOn: '2026-11-19' }), observed());
  assert.deepEqual(change.fields, ['retrievedOn']);
  assert.equal(change.classification, 'metadata-only');
});
test('note changes are metadata-only for stable status', () => {
  const change = singleChange(observed({ note: 'First observation' }), observed({ note: 'Follow-up observation' }));
  assert.deepEqual(change.fields, ['note']);
  assert.equal(change.classification, 'metadata-only');
});
test('pairId changes are metadata-only for stable status', () => {
  const change = singleChange(observed({ pairId: 'a' }), observed({ pairId: 'b' }));
  assert.deepEqual(change.fields, ['pairId']);
});
test('fields absent on both sides are not considered changed', () => {
  const fields = changedFields(entry(), entry());
  assert.deepEqual(fields, []);
});
test('fields list follows stable schema order', () => {
  const before = observed();
  const after = observed({ label: 'Changed', route: '/places', purpose: 'download', note: 'Note' });
  assert.deepEqual(changedFields(before, after), ['route', 'label', 'purpose', 'note']);
});
test('changed destination canonicalization is exposed explicitly', () => {
  const change = singleChange(observed(), observed({ destination: 'https://EXAMPLE.org/resources' }));
  assert.equal(change.destinationChanged, false);
  assert.ok(change.fields.includes('destination'));
});
test('destination case differences are still recorded as raw-field edits', () => {
  const change = singleChange(observed(), observed({ destination: 'https://EXAMPLE.org/resources' }));
  assert.equal(change.classification, 'needs-review');
});
test('multiple changed records are ordered by language-qualified ID', () => {
  const before = snapshot(entry({ id: 'z' }), french({ id: 'a' }));
  const after = snapshot(entry({ id: 'z', label: 'Z after' }), french({ id: 'a', label: 'A après' }));
  const result = comparison(before, after);
  assert.deepEqual(result.changes.map(row => row.id), ['en:z', 'fr:a']);
});
test('an ID change is represented as removal and addition', () => {
  const result = comparison(snapshot(entry({ id: 'old' })), snapshot(entry({ id: 'new' })));
  assert.deepEqual(result.changes.map(row => row.kind), ['added', 'removed']);
});
test('same ID across languages never collides in the comparison map', () => {
  const result = comparison(snapshot(entry(), french()), snapshot(entry(), french({ label: 'Changed' })));
  assert.deepEqual(result.changes.map(row => row.id), ['fr:fictional-guide']);
});
test('unchanged entries are omitted from changed records', () => {
  const result = comparison(snapshot(entry(), french()), snapshot(entry(), french({ label: 'Changed' })));
  assert.equal(result.changes.length, 1);
});
test('counters reflect additions removals and modifications independently', () => {
  const result = comparison(snapshot(entry({ id: 'removed' }), entry({ id: 'edited' })),
    snapshot(entry({ id: 'added' }), entry({ id: 'edited', note: 'Change' })));
  assert.equal(result.counters.added, 1);
  assert.equal(result.counters.removed, 1);
  assert.equal(result.counters.modified, 1);
});
test('recorded regression count increments once', () => {
  const result = comparison(snapshot(observed()), snapshot(observed({ status: 'UNAVAILABLE' })));
  assert.equal(result.counters['recorded-regression'], 1);
});
test('indeterminate count increments for unknown status transitions', () => {
  const result = comparison(snapshot(entry()), snapshot(observed()));
  assert.equal(result.counters.indeterminate, 1);
});
test('a metadata-only edit is excluded from the high-priority review queue', () => {
  const result = comparison(snapshot(observed()), snapshot(observed({ label: 'Updated' })));
  assert.deepEqual(proposedReviewItems(result), []);
});
test('a recorded regression is included in proposed review items', () => {
  const result = comparison(snapshot(observed()), snapshot(observed({ status: 'UNAVAILABLE' })));
  assert.equal(proposedReviewItems(result).length, 1);
});
test('a recorded improvement is not automatically included as a regression', () => {
  const result = comparison(snapshot(observed({ status: 'UNAVAILABLE' })), snapshot(observed()));
  assert.deepEqual(proposedReviewItems(result), []);
});
test('added and removed references are both review candidates', () => {
  const result = comparison(snapshot(entry({ id: 'old' })), snapshot(entry({ id: 'new' })));
  assert.equal(proposedReviewItems(result).length, 2);
});
test('missing delta produces an empty review queue', () => {
  assert.deepEqual(proposedReviewItems(null), []);
});
test('change matrix groups observed status transitions', () => {
  const result = comparison(snapshot(observed()), snapshot(observed({ status: 'UNAVAILABLE' })));
  assert.equal(changeMatrix(result)['AVAILABLE->UNAVAILABLE'], 1);
});
test('change matrix groups additions and removals separately', () => {
  const result = comparison(snapshot(entry({ id: 'old' })), snapshot(entry({ id: 'new' })));
  assert.equal(changeMatrix(result).ADDED, 1);
  assert.equal(changeMatrix(result).REMOVED, 1);
});
test('empty change matrix has a safe null prototype', () => {
  assert.equal(Object.getPrototypeOf(changeMatrix(null)), null);
});
test('invalid prior manifest is prefixed with before', () => {
  const result = compareReferenceSets(snapshot(entry({ destination: '/unsafe' })), snapshot(), { today: DAY });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.startsWith('before:')));
});
test('invalid next manifest is prefixed with after', () => {
  const result = compareReferenceSets(snapshot(), snapshot(entry({ destination: '/unsafe' })), { today: DAY });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.startsWith('after:')));
});
test('comparison retains before and after capture dates', () => {
  const before = { ...snapshot(entry({ retrievedOn: '2026-11-20' })), capturedOn: '2026-11-20' };
  const result = comparison(before, snapshot());
  assert.equal(result.beforeDate, '2026-11-20');
  assert.equal(result.afterDate, DAY);
});
test('comparison totals preserve unchanged items', () => {
  const result = comparison(snapshot(entry(), french()), snapshot(entry(), french()));
  assert.equal(result.totalBefore, 2);
  assert.equal(result.totalAfter, 2);
});
test('comparison does not mutate the earlier or later records', () => {
  const before = snapshot(entry());
  const after = snapshot(entry({ label: 'Changed' }));
  const baseline = clone([before, after]);
  comparison(before, after);
  assert.deepEqual([before, after], baseline);
});
test('comparison produces deterministic keys for the same input', () => {
  const before = snapshot(entry(), french());
  const after = snapshot(french({ note: 'French note' }), entry({ note: 'English note' }));
  assert.deepEqual(comparison(before, after).changes.map(row => row.id), ['en:fictional-guide', 'fr:fictional-guide']);
});
test('comparisons of unknown status cannot claim a positive result', () => {
  const result = comparison(snapshot(entry()), snapshot(observed()));
  assert.ok(result.changes.every(row => row.classification !== 'recorded-improvement'));
});
