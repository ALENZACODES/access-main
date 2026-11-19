import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RETENTION_DELTA_KINDS, retentionEqual, retentionDifferences,
  compareRetention, retentionImpact, retainedCoverage, retentionGuard,
} from './offline-release-retention-delta.mjs';
import { retentionFingerprint } from './offline-release-retention.mjs';

const date = '2026-11-19';
const digest = 'a'.repeat(64);
function asset(id = 'item', patch = {}) {
  return {
    id, path: `${id}.json`, kind: 'dataset', digest, bytes: 100,
    state: 'present', claims: ['UNKNOWN'], source: 'https://example.org/data',
    licence: 'CC0-1.0', retrievedOn: date, tier: 0,
    labels: { en: 'Sample record', fr: 'Données fictives' },
    references: [], events: [], ...patch,
  };
}
const snapshot = (...records) => ({ version: 1, records });
function kinds(result) { return result.changes.map(({ kind }) => kind); }
function invalidCodes(result) { return result.problems.map(({ code }) => code); }

// Differential contracts.
test('delta vocabulary lists every recognised change kind exactly once', () => {
  assert.equal(new Set(RETENTION_DELTA_KINDS).size, RETENTION_DELTA_KINDS.length);
  assert.ok(RETENTION_DELTA_KINDS.includes('claim-changed'));
  assert.ok(RETENTION_DELTA_KINDS.includes('licence-changed'));
  assert.ok(RETENTION_DELTA_KINDS.includes('removed'));
});
test('equality compares structured values rather than identities', () => {
  assert.equal(retentionEqual({ id: 'a' }, { id: 'a' }), true);
  assert.equal(retentionEqual({ id: 'a' }, { id: 'b' }), false);
});
test('identical snapshots produce no changes', () => {
  const result = compareRetention(snapshot(asset('a')), snapshot(asset('a')));
  assert.equal(result.ok, true);
  assert.equal(result.summary.changes, 0);
  assert.deepEqual(result.changes, []);
});
test('adding one record requires explicit review', () => {
  const result = compareRetention(snapshot(), snapshot(asset('a')));
  assert.deepEqual(kinds(result), ['added']);
  assert.equal(result.changes[0].severity, 'review');
  assert.equal(result.summary.later, 1);
});
test('removing a record is blocking', () => {
  const result = compareRetention(snapshot(asset('a')), snapshot());
  assert.deepEqual(kinds(result), ['removed']);
  assert.equal(result.changes[0].severity, 'block');
  assert.equal(result.summary.block, 1);
});
test('a changed path is a review event, not a new accessibility fact', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { path: 'new/a.json' })));
  assert.deepEqual(kinds(result), ['path-changed']);
  assert.equal(result.changes[0].afterClaims[0], 'UNKNOWN');
});
test('asset kind changes are detected', () => {
  assert.deepEqual(kinds(compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { kind: 'document' })))), ['kind-changed']);
});
test('asset digests changing are not silently trusted', () => {
  assert.deepEqual(kinds(compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { digest: 'b'.repeat(64) })))), ['digest-changed']);
});
test('asset byte changes are detected independently from digest', () => {
  assert.deepEqual(kinds(compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { bytes: 101 })))), ['bytes-changed']);
});
test('quarantining an item is a lifecycle change', () => {
  const later = asset('a', { state: 'quarantined', events: [
    { action: 'quarantine', on: date, reason: 'Evidence review' },
  ] });
  assert.deepEqual(kinds(compareRetention(snapshot(asset('a')), snapshot(later))),
    ['state-changed', 'event-changed']);
});
test('claim UNKNOWN to YES requires explicit blocking review', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { claims: ['YES'] })));
  assert.deepEqual(kinds(result), ['claim-changed']);
  assert.equal(result.changes[0].severity, 'block');
  assert.deepEqual(result.changes[0].beforeClaims, ['UNKNOWN']);
});
test('claim YES to UNKNOWN is still a blocking change', () => {
  const result = compareRetention(snapshot(asset('a', { claims: ['YES'] })),
    snapshot(asset('a')));
  assert.deepEqual(kinds(result), ['claim-changed']);
  assert.deepEqual(result.changes[0].afterClaims, ['UNKNOWN']);
});
test('claim NO to YES is recorded, not approved', () => {
  const result = compareRetention(snapshot(asset('a', { claims: ['NO'] })),
    snapshot(asset('a', { claims: ['YES'] })));
  assert.deepEqual(kinds(result), ['claim-changed']);
  assert.equal(result.summary.block, 1);
});
test('source URL changes are independently reported', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { source: 'https://example.org/changed' })));
  assert.deepEqual(kinds(result), ['source-changed']);
  assert.equal(result.changes[0].beforeSource, 'https://example.org/data');
});
test('licence changes require blocking review', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { licence: 'CC-BY-4.0' })));
  assert.deepEqual(kinds(result), ['licence-changed']);
  assert.equal(result.summary.block, 1);
});
test('retrieval date changes appear in the comparison', () => {
  const result = compareRetention(snapshot(asset('a', { retrievedOn: '2026-11-18' })),
    snapshot(asset('a')));
  assert.deepEqual(kinds(result), ['date-changed']);
});
test('verification tier changes require review, not an upgrade', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { tier: 1 })));
  assert.deepEqual(kinds(result), ['tier-changed']);
  assert.equal(result.changes[0].afterTier, 1);
});
test('English/French label changes are visible', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { labels: { en: 'Edited', fr: 'Modifié' } })));
  assert.deepEqual(kinds(result), ['label-changed']);
});
test('adding a dependency is tracked', () => {
  const a = asset('a');
  const b = asset('b');
  const later = asset('b', { references: ['a'] });
  const result = compareRetention(snapshot(a, b), snapshot(a, later));
  assert.deepEqual(kinds(result), ['reference-changed']);
});
test('changing event reason is tracked', () => {
  const left = asset('a', { state: 'quarantined', events: [
    { action: 'quarantine', on: date, reason: 'Review A' },
  ] });
  const right = asset('a', { state: 'quarantined', events: [
    { action: 'quarantine', on: date, reason: 'Review B' },
  ] });
  assert.deepEqual(kinds(compareRetention(snapshot(left), snapshot(right))), ['event-changed']);
});
test('multiple changes have stable review-priority order', () => {
  const before = asset('a');
  const after = asset('a', {
    source: 'https://example.org/another', licence: 'MIT', claims: ['YES'],
    digest: 'b'.repeat(64), tier: 'E',
  });
  const result = compareRetention(snapshot(before), snapshot(after));
  assert.deepEqual(kinds(result), ['source-changed', 'licence-changed',
    'claim-changed', 'digest-changed', 'tier-changed']);
});
test('different input order yields the same delta', () => {
  const original = snapshot(asset('b'), asset('a'));
  const later = snapshot(asset('b', { bytes: 101 }), asset('a', { tier: 'E' }));
  const reversed = compareRetention(snapshot(asset('a'), asset('b')),
    snapshot(asset('a', { tier: 'E' }), asset('b', { bytes: 101 })));
  assert.deepEqual(compareRetention(original, later), reversed);
});
test('invalid later snapshot cannot produce a clean diff', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { licence: 'private' })));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.deepEqual(result.changes, []);
  assert.equal(result.problems[0].snapshot, 'later');
});
test('invalid earlier snapshot also fails closed', () => {
  const result = compareRetention(snapshot(asset('a', { claims: ['MAYBE'] })),
    snapshot(asset('a')));
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].snapshot, 'earlier');
});
test('changes are summarized by kind with zero keys preserved', () => {
  const result = compareRetention(snapshot(asset('a')),
    snapshot(asset('a', { bytes: 120 })));
  assert.equal(result.summary.counts['bytes-changed'], 1);
  assert.equal(result.summary.counts['licence-changed'], 0);
});
test('delta never mutates input records', () => {
  const before = snapshot(asset('a'));
  const later = snapshot(asset('a', { claims: ['YES'] }));
  compareRetention(before, later);
  assert.deepEqual(before.records[0].claims, ['UNKNOWN']);
  assert.deepEqual(later.records[0].claims, ['YES']);
});

// Dependency impact and coverage.
test('empty impact request returns empty affected collection', () => {
  assert.deepEqual(retentionImpact(snapshot(asset('a')), []).affected, []);
});
test('direct dependency is included after source withdrawal', () => {
  const data = snapshot(asset('source'), asset('dependent', { references: ['source'] }));
  const result = retentionImpact(data, ['source']);
  assert.equal(result.ok, true);
  assert.deepEqual(result.affected, [{ id: 'dependent', because: 'source' }]);
});
test('transitive dependencies follow graph structure', () => {
  const data = snapshot(asset('source'), asset('mid', { references: ['source'] }),
    asset('end', { references: ['mid'] }));
  const result = retentionImpact(data, ['source']);
  assert.deepEqual(result.affected, [
    { id: 'end', because: 'mid' }, { id: 'mid', because: 'source' },
  ]);
});
test('impact does not invent relationships between unlinked assets', () => {
  const result = retentionImpact(snapshot(asset('a'), asset('b')), ['a']);
  assert.deepEqual(result.affected, []);
});
test('missing change IDs are errors, not silently ignored', () => {
  const result = retentionImpact(snapshot(asset('a')), ['missing']);
  assert.equal(result.ok, false);
  assert.ok(invalidCodes(result).includes('CHANGED_ID_MISSING'));
});
test('non-array change IDs fail closed', () => {
  const result = retentionImpact(snapshot(asset('a')), 'a');
  assert.ok(invalidCodes(result).includes('CHANGED_IDS_INVALID'));
});
test('duplicate changed IDs do not duplicate impact items', () => {
  const result = retentionImpact(snapshot(asset('a'), asset('b', { references: ['a'] })), ['a', 'a']);
  assert.equal(result.affected.length, 1);
});
test('coverage of empty collection is explicit zeros', () => {
  const result = retainedCoverage(snapshot());
  assert.equal(result.summary.records, 0);
  assert.equal(result.summary.bytes, 0);
  assert.equal(result.summary.byClaim.UNKNOWN, 0);
});
test('coverage groups state and kind separately', () => {
  const data = snapshot(asset('a'), asset('b', { kind: 'script' }));
  const result = retainedCoverage(data);
  assert.equal(result.summary.byState.present, 2);
  assert.equal(result.summary.byKind.dataset, 1);
  assert.equal(result.summary.byKind.script, 1);
});
test('coverage counts UNKNOWN as UNKNOWN', () => {
  const result = retainedCoverage(snapshot(asset('a', { claims: ['UNKNOWN'] })));
  assert.equal(result.summary.byClaim.UNKNOWN, 1);
  assert.equal(result.summary.byClaim.YES, 0);
});
test('coverage does not equate provenance with accessibility', () => {
  const result = retainedCoverage(snapshot(asset('a', { claims: [] })));
  assert.equal(result.summary.byClaim.YES, 0);
  assert.equal(result.summary.byClaim.NO, 0);
});
test('withdrawn and quarantined assets count toward blocked bytes', () => {
  const quarantine = asset('a', { state: 'quarantined', events: [
    { action: 'quarantine', on: date, reason: 'Pending review' },
  ] });
  const result = retainedCoverage(snapshot(quarantine, asset('b')));
  assert.equal(result.summary.bytes, 200);
  assert.equal(result.summary.blockedBytes, 100);
});
test('reference count reflects explicit edges only', () => {
  const result = retainedCoverage(snapshot(asset('a'), asset('b', { references: ['a'] })));
  assert.equal(result.summary.references, 1);
});
test('invalid coverage has no summary', () => {
  const result = retainedCoverage(snapshot(asset('a', { source: '' })));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
});

// Optimistic comparison guard.
test('guard accepts matching base fingerprint', () => {
  const first = snapshot(asset('a'));
  const fingerprint = retentionFingerprint(first).fingerprint;
  const result = retentionGuard(first, snapshot(asset('a', { bytes: 101 })), fingerprint);
  assert.equal(result.ok, true);
  assert.equal(result.comparison.summary.changes, 1);
});
test('guard rejects stale fingerprint without computing a comparison', () => {
  const first = snapshot(asset('a'));
  const result = retentionGuard(first, snapshot(asset('b')), 'sha256:stale');
  assert.equal(result.ok, false);
  assert.equal(result.comparison, null);
  assert.ok(invalidCodes(result).includes('BASE_MISMATCH'));
});
test('guard rejects invalid base document', () => {
  const result = retentionGuard(snapshot(asset('a', { token: 'private' })),
    snapshot(), 'sha256:any');
  assert.equal(result.ok, false);
  assert.ok(invalidCodes(result).includes('PRIVATE_FIELD'));
});
test('guard rejects invalid target document even with valid base', () => {
  const first = snapshot(asset('a'));
  const result = retentionGuard(first, snapshot(asset('a', { bytes: -1 })),
    retentionFingerprint(first).fingerprint);
  assert.equal(result.ok, false);
  assert.ok(invalidCodes(result).includes('ASSET_BYTES'));
});
test('fingerprint guard is stable across earlier record ordering', () => {
  const first = snapshot(asset('b'), asset('a'));
  const fingerprint = retentionFingerprint(snapshot(asset('a'), asset('b'))).fingerprint;
  const result = retentionGuard(first, first, fingerprint);
  assert.equal(result.ok, true);
  assert.equal(result.comparison.summary.changes, 0);
});
test('record differences are empty when all fields agree', () => {
  assert.deepEqual(retentionDifferences(asset('a'), asset('a')), []);
});
