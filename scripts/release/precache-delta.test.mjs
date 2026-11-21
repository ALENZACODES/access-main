import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRECACHE_CHANGES, differencesForAsset, comparePrecache, affectedDependents,
  releaseImpact, policyDelta,
} from './precache-delta.mjs';

const SHA = 'a'.repeat(64);
const DAY = '2026-11-19';
const item = (id = 'a', changes = {}) => ({
  id, path: `${id}.json`, kind: 'data', group: 'offline-pack', locale: 'neutral',
  state: 'UNKNOWN', bytes: 5, sha256: SHA,
  source: 'https://example.org/source', licence: 'CC0-1.0',
  retrievedOn: DAY, tier: 0, dependsOn: [],
  label: { en: 'Synthetic entry', fr: 'Entrée fictive' }, ...changes,
});
const release = (...assets) => ({ version: 1, releaseId: 'release-1', retrievedOn: DAY, assets });
const kinds = result => result.changes.map(c => c.kind);
const checks = result => result.errors.map(e => e.code);

test('change vocabulary has no duplicates', () => {
  assert.equal(new Set(PRECACHE_CHANGES).size, PRECACHE_CHANGES.length);
});
test('added change kind is documented', () => assert.ok(PRECACHE_CHANGES.includes('added')));
test('removed change kind is documented', () => assert.ok(PRECACHE_CHANGES.includes('removed')));
test('source change kind is documented', () => assert.ok(PRECACHE_CHANGES.includes('source-changed')));
test('state change kind is documented', () => assert.ok(PRECACHE_CHANGES.includes('state-changed')));
test('fingerprint remains a structural comparison', () => {
  const result = comparePrecache(release(item()), release(item()));
  assert.equal(result.fingerprints.before, result.fingerprints.after);
});
test('identical releases have no changes', () => {
  const result = comparePrecache(release(item()), release(item()));
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes, []);
  assert.equal(result.summary.total, 0);
});
test('both empty releases compare without inventing findings', () => {
  const result = comparePrecache(release(), release());
  assert.equal(result.ok, true);
  assert.equal(result.summary.total, 0);
});
test('new asset is reported as added', () => {
  const result = comparePrecache(release(), release(item()));
  assert.deepEqual(kinds(result), ['added']);
  assert.equal(result.changes[0].before, null);
});
test('removed asset is reported as removed', () => {
  const result = comparePrecache(release(item()), release());
  assert.deepEqual(kinds(result), ['removed']);
  assert.equal(result.changes[0].after, null);
});
test('explicit state difference is reported, never overwritten', () => {
  const result = comparePrecache(release(item()), release(item('a', { state: 'MISSING' })));
  assert.deepEqual(kinds(result), ['state-changed']);
  assert.equal(result.changes[0].before.state, 'UNKNOWN');
  assert.equal(result.changes[0].after.state, 'MISSING');
});
test('MISSING to UNKNOWN is a review change, not a pass', () => {
  const result = comparePrecache(release(item('a', { state: 'MISSING' })), release(item()));
  assert.deepEqual(kinds(result), ['state-changed']);
  assert.equal(result.changes[0].after.state, 'UNKNOWN');
});
for (const [field, updated, changeKind] of [
  ['sha256', 'b'.repeat(64), 'hash-changed'],
  ['bytes', 6, 'bytes-changed'],
  ['source', 'https://different.example.org/source', 'source-changed'],
  ['licence', 'CC-BY-4.0', 'licence-changed'],
  ['retrievedOn', '2026-11-18', 'date-changed'],
  ['tier', 1, 'tier-changed'],
  ['locale', 'fr', 'locale-changed'],
  ['group', 'route', 'group-changed'],
  ['path', 'different.json', 'path-changed'],
  ['kind', 'manifest', 'kind-changed'],
]) {
  test(`${field} transition causes ${changeKind}`, () => {
    const result = comparePrecache(release(item()), release(item('a', { [field]: updated })));
    assert.deepEqual(kinds(result), [changeKind]);
    assert.equal(result.summary.byKind[changeKind], 1);
  });
}
test('dependency order alone does not imply changed evidence', () => {
  const b = item('b');
  const c = item('c');
  const first = item('a', { dependsOn: ['b', 'c'] });
  const second = item('a', { dependsOn: ['c', 'b'] });
  assert.deepEqual(differencesForAsset(first, second), []);
  assert.deepEqual(comparePrecache(release(first, b, c), release(second, b, c)).changes, []);
});
test('dependency set changes produce explicit review entry', () => {
  const b = item('b');
  const first = release(item(), b);
  const second = release(item('a', { dependsOn: ['b'] }), b);
  assert.deepEqual(kinds(comparePrecache(first, second)), ['dependencies-changed']);
});
test('English label changes are tracked', () => {
  const changed = item('a', { label: { en: 'Changed sample', fr: 'Entrée fictive' } });
  assert.deepEqual(kinds(comparePrecache(release(item()), release(changed))), ['label-changed']);
});
test('French label changes are tracked', () => {
  const changed = item('a', { label: { en: 'Synthetic entry', fr: 'Exemple fictif' } });
  assert.deepEqual(kinds(comparePrecache(release(item()), release(changed))), ['label-changed']);
});
test('multiple changed fields retain deterministic order', () => {
  const changed = item('a', {
    state: 'MISSING', sha256: 'b'.repeat(64), bytes: 6,
    source: 'https://other.example.org/x', licence: 'CC-BY-4.0',
  });
  assert.deepEqual(kinds(comparePrecache(release(item()), release(changed))), [
    'state-changed', 'hash-changed', 'bytes-changed', 'source-changed', 'licence-changed',
  ]);
});
test('release input order never changes report order', () => {
  const a = release(item('z'), item('a'));
  const b = release(item('a'), item('z'));
  assert.deepEqual(comparePrecache(a, b).changes, []);
});
test('new and removed IDs are sorted', () => {
  const result = comparePrecache(release(item('z'), item('m')), release(item('a')));
  assert.deepEqual(result.changes.map(change => change.id), ['a', 'm', 'z']);
});
test('unchanged source metadata is retained in the result', () => {
  const changed = item('a', { state: 'MISSING' });
  const result = comparePrecache(release(item()), release(changed));
  assert.equal(result.changes[0].after.licence, 'CC0-1.0');
  assert.equal(result.changes[0].after.source, 'https://example.org/source');
  assert.equal(result.changes[0].after.retrievedOn, DAY);
  assert.equal(result.changes[0].after.tier, 0);
});
test('invalid first manifest fails closed', () => {
  const result = comparePrecache(release({ ...item(), source: '' }), release(item()));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(result.errors.some(error => error.side === 'before'));
});
test('invalid second manifest fails closed', () => {
  const result = comparePrecache(release(item()), release({ ...item(), tier: 'UNKNOWN' }));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(result.errors.some(error => error.side === 'after'));
});
test('invalid records cannot produce an empty successful diff', () => {
  const result = comparePrecache(release(item('a', { state: true })), release(item()));
  assert.equal(result.ok, false);
  assert.deepEqual(result.changes, []);
});
test('summary includes per-group counts', () => {
  const result = comparePrecache(release(), release(item('a'), item('b', { group: 'route' })));
  assert.equal(result.summary.byGroup['offline-pack'], 1);
  assert.equal(result.summary.byGroup.route, 1);
});
test('summary includes locale breakdown', () => {
  const result = comparePrecache(release(), release(item('a', { locale: 'en' }), item('b', { locale: 'fr' })));
  assert.equal(result.summary.byLocale.en, 1);
  assert.equal(result.summary.byLocale.fr, 1);
  assert.equal(result.summary.byLocale.neutral, 0);
});
test('comparison does not mutate either input', () => {
  const a = release(item());
  const b = release(item('a', { state: 'MISSING' }));
  const before = JSON.stringify([a, b]);
  comparePrecache(a, b);
  assert.equal(JSON.stringify([a, b]), before);
});
test('affected dependents are found one hop away', () => {
  const data = release(item('a', { dependsOn: ['b'] }), item('b'));
  const result = affectedDependents(data, ['b']);
  assert.equal(result.ok, true);
  assert.deepEqual(result.affected, ['a']);
});
test('affected dependents are found transitively', () => {
  const data = release(
    item('a', { dependsOn: ['b'] }),
    item('b', { dependsOn: ['c'] }),
    item('c'),
  );
  const result = affectedDependents(data, ['c']);
  assert.deepEqual(result.affected, ['a', 'b']);
});
test('unrelated assets are not included among dependents', () => {
  const data = release(item('a', { dependsOn: ['b'] }), item('b'), item('z'));
  const result = affectedDependents(data, ['b']);
  assert.deepEqual(result.affected, ['a']);
});
test('unknown changed ID causes a refusal', () => {
  const result = affectedDependents(release(item()), ['missing']);
  assert.equal(result.ok, false);
  assert.ok(checks(result).includes('UNKNOWN_SEED'));
});
test('empty changed-ID list has no dependents', () => {
  const result = affectedDependents(release(item()), []);
  assert.deepEqual(result.affected, []);
});
test('duplicate seeds are not repeated', () => {
  const data = release(item('a', { dependsOn: ['b'] }), item('b'));
  assert.deepEqual(affectedDependents(data, ['b', 'b']).affected, ['a']);
});
test('direct changed seed is not included among dependents', () => {
  const data = release(item('a', { dependsOn: ['b'] }), item('b'));
  assert.deepEqual(affectedDependents(data, ['b']).affected, ['a']);
});
test('incomplete document produces no dependent suggestions', () => {
  const result = affectedDependents(release({ ...item(), licence: null }), ['a']);
  assert.equal(result.ok, false);
  assert.deepEqual(result.affected, []);
});
test('release impact counts directly changed assets', () => {
  const result = releaseImpact(release(item()), release(item('a', { state: 'MISSING' })));
  assert.equal(result.ok, true);
  assert.equal(result.summary.directlyChanged, 1);
});
test('release impact reports indirect dependency', () => {
  const a = item('a', { dependsOn: ['b'] });
  const b = item('b');
  const updated = item('b', { sha256: 'b'.repeat(64) });
  const result = releaseImpact(release(a, b), release(a, updated));
  assert.deepEqual(result.affected, ['a']);
});
test('added dependent assets do not invent physical facts', () => {
  const result = releaseImpact(release(item('b')), release(item('a', { dependsOn: ['b'] }), item('b')));
  assert.equal(result.ok, true);
  assert.deepEqual(result.changed, ['a']);
});
test('invalid release impact fails before conclusions', () => {
  const result = releaseImpact(release(item()), release(item('a', { source: '' })));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
});
test('policy review emits UNKNOWN for hash changes', () => {
  const result = policyDelta(release(item()), release(item('a', { sha256: 'b'.repeat(64) })));
  assert.equal(result.ok, true);
  assert.equal(result.review[0].state, 'UNKNOWN');
});
test('policy review emits UNKNOWN for withdrawn state', () => {
  const result = policyDelta(release(item()), release(item('a', { state: 'MISSING' })));
  assert.equal(result.review[0].state, 'UNKNOWN');
});
test('policy review includes source metadata', () => {
  const result = policyDelta(release(item()), release(item('a', { bytes: 6 })));
  assert.equal(result.review[0].source, 'https://example.org/source');
  assert.equal(result.review[0].licence, 'CC0-1.0');
  assert.equal(result.review[0].retrievedOn, DAY);
  assert.equal(result.review[0].tier, 0);
});
test('label-only changes do not become urgent review', () => {
  const changed = item('a', { label: { en: 'New label', fr: 'Entrée fictive' } });
  const result = policyDelta(release(item()), release(changed));
  assert.deepEqual(result.review, []);
});
test('locale-only changes do not create a new claim', () => {
  const result = policyDelta(release(item()), release(item('a', { locale: 'en' })));
  assert.deepEqual(result.review, []);
});
test('invalid policy comparison cannot produce review list', () => {
  const result = policyDelta(release(item()), release(item('a', { tier: null })));
  assert.equal(result.ok, false);
  assert.deepEqual(result.review, []);
});
test('new assets are not treated as automatically accessible', () => {
  const result = policyDelta(release(), release(item()));
  assert.equal(result.ok, true);
  assert.deepEqual(result.review, []);
});
test('removed assets require human review without positive claim', () => {
  const result = policyDelta(release(item()), release());
  assert.equal(result.review[0].kind, 'removed');
  assert.equal(result.review[0].state, 'UNKNOWN');
});
