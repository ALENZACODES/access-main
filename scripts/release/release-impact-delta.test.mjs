import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assetChanges, movedPaths, digestChanges, permissionChanges, dependencyChanges,
  impactReview, compareManifest,
} from './release-impact-delta.mjs';
import { DAY, SHA_A, SHA_B, asset, manifest, chain, bilingual, mutate } from './release-impact-fixtures.mjs';
import { UNKNOWN } from './release-impact-contract.mjs';
const before = manifest(asset('root', { entry: true, dependsOn: ['shared'] }), asset('shared'));
const same = () => mutate(before);
const modified = (id, changes = {}) => manifest(...before.assets.map(item => item.id === id ? { ...item, ...changes } : item));
const difference = (a, b) => compareManifest(a, b, { today: DAY });
test('identical snapshot has no asset changes', () => assert.ok(assetChanges(before, same()).every(x => x.kind === 'unchanged')));
test('identical snapshots preserve stable id ordering', () => assert.deepEqual(assetChanges(before, same()).map(x => x.id), ['root', 'shared']));
test('added asset identified', () => assert.equal(assetChanges(before, manifest(...before.assets, asset('extra'))).find(x => x.id === 'extra').kind, 'added'));
test('removed asset identified', () => assert.equal(assetChanges(before, manifest(before.assets[0])) .find(x => x.id === 'shared').kind, 'removed'));
test('digest-only change identified', () => assert.equal(assetChanges(before, modified('shared', { sha256: SHA_B })).find(x => x.id === 'shared').kind, 'changed'));
test('asset kind change identified', () => assert.ok(assetChanges(before, modified('shared', { kind: 'style' })).find(x => x.id === 'shared').fields.includes('kind')));
test('asset locale change identified', () => assert.ok(assetChanges(before, modified('shared', { locale: 'both' })).find(x => x.id === 'shared').fields.includes('locale')));
test('size change identified', () => assert.ok(assetChanges(before, modified('shared', { bytes: 333 })).find(x => x.id === 'shared').fields.includes('bytes')));
test('path change identified', () => assert.ok(assetChanges(before, modified('shared', { path: 'assets/new.js' })).find(x => x.id === 'shared').fields.includes('path')));
test('entry flag change identified', () => assert.ok(assetChanges(before, modified('shared', { entry: true })).find(x => x.id === 'shared').fields.includes('entry')));
test('source label change identified', () => assert.ok(assetChanges(before, modified('shared', { source: 'New fictional file' })).find(x => x.id === 'shared').fields.includes('source')));
test('licence change identified', () => assert.ok(assetChanges(before, modified('shared', { licence: 'ODbL-1.0' })).find(x => x.id === 'shared').fields.includes('licence')));
test('retrieval date change identified', () => assert.ok(assetChanges(before, modified('shared', { retrievedOn: '2026-11-20' })).find(x => x.id === 'shared').fields.includes('retrievedOn')));
test('verification tier change identified', () => assert.ok(assetChanges(before, modified('shared', { tier: UNKNOWN })).find(x => x.id === 'shared').fields.includes('tier')));
test('dependency removal identified', () => assert.ok(assetChanges(before, modified('root', { dependsOn: [] })).find(x => x.id === 'root').fields.includes('dependsOn')));
test('dependency addition identified', () => {
  const old = manifest(asset('root', { entry: true }), asset('extra'));
  const next = manifest(asset('root', { entry: true, dependsOn: ['extra'] }), asset('extra'));
  assert.ok(assetChanges(old, next).find(x => x.id === 'root').fields.includes('dependsOn'));
});
test('dependency order change alone not a semantic change', () => {
  const old = manifest(asset('root', { entry: true, dependsOn: ['a', 'b'] }), asset('a'), asset('b'));
  const next = manifest(asset('root', { entry: true, dependsOn: ['b', 'a'] }), asset('a'), asset('b'));
  assert.equal(assetChanges(old, next).find(x => x.id === 'root').kind, 'unchanged');
});
test('no path movement in identical snapshot', () => assert.deepEqual(movedPaths(before, same()), []));
test('moved asset records old and new paths', () => {
  const record = movedPaths(before, modified('shared', { path: 'assets/new.js' }))[0];
  assert.deepEqual(record, { id: 'shared', before: 'assets/shared.js', after: 'assets/new.js' });
});
test('path movement ignores newly introduced asset', () => assert.deepEqual(movedPaths(before, manifest(...before.assets, asset('new'))), []));
test('path movement ignores removed asset', () => assert.deepEqual(movedPaths(before, manifest(asset('root', { entry: true }))), []));
test('digest comparison empty for same snapshot', () => assert.deepEqual(digestChanges(before, same()), []));
test('digest change records before and after hash', () => {
  const row = digestChanges(before, modified('shared', { sha256: SHA_B }))[0];
  assert.deepEqual(row, { id: 'shared', before: SHA_A, after: SHA_B });
});
test('digest only does not claim source was independently reviewed', () => {
  assert.ok(!Object.keys(digestChanges(before, modified('shared', { sha256: SHA_B }))[0]).includes('verified'));
});
test('digest change ignores size-only change', () => assert.deepEqual(digestChanges(before, modified('shared', { bytes: 12 })), []));
test('permission comparison empty for same snapshot', () => assert.deepEqual(permissionChanges(before, same()), []));
test('permission comparison identifies source change', () => assert.equal(permissionChanges(before, modified('shared', { source: 'Another local source' }))[0].sourceChanged, true));
test('permission comparison identifies licence change', () => assert.equal(permissionChanges(before, modified('shared', { licence: 'CC BY 4.0' }))[0].licenceChanged, true));
test('permission comparison identifies date change', () => assert.equal(permissionChanges(before, modified('shared', { retrievedOn: '2026-11-20' }))[0].dateChanged, true));
test('permission comparison identifies tier change', () => assert.equal(permissionChanges(before, modified('shared', { tier: UNKNOWN }))[0].tierChanged, true));
test('permission comparison does not include digest change', () => assert.deepEqual(permissionChanges(before, modified('shared', { sha256: SHA_B })), []));
test('dependency comparison empty for identical snapshot', () => assert.deepEqual(dependencyChanges(before, same()), []));
test('dependency comparison reports removed shared dependency', () => assert.deepEqual(dependencyChanges(before, modified('root', { dependsOn: [] }))[0].removed, ['shared']));
test('dependency comparison reports no additions when removing', () => assert.deepEqual(dependencyChanges(before, modified('root', { dependsOn: [] }))[0].added, []));
test('dependency comparison reports added dependency', () => {
  const old = manifest(asset('root', { entry: true }), asset('extra'));
  const next = manifest(asset('root', { entry: true, dependsOn: ['extra'] }), asset('extra'));
  assert.deepEqual(dependencyChanges(old, next)[0].added, ['extra']);
});
test('impact review empty for identical snapshots', () => assert.deepEqual(impactReview(before, same()), []));
test('impact review records modified dependency', () => assert.equal(impactReview(before, modified('shared', { bytes: 123 }))[0].id, 'shared'));
test('impact review includes affected root', () => assert.deepEqual(impactReview(before, modified('shared', { sha256: SHA_B }))[0].impactedEntries, ['root']));
test('impact review preserves original bytes', () => assert.equal(impactReview(before, modified('shared', { bytes: 200 }))[0].beforeBytes, 100));
test('impact review preserves replacement bytes', () => assert.equal(impactReview(before, modified('shared', { bytes: 200 }))[0].afterBytes, 200));
test('impact review records positive byte delta', () => assert.equal(impactReview(before, modified('shared', { bytes: 200 }))[0].byteDelta, 100));
test('impact review records negative byte delta', () => assert.equal(impactReview(before, modified('shared', { bytes: 40 }))[0].byteDelta, -60));
test('impact review of unknown tier stays UNKNOWN', () => {
  const old = manifest(asset('root', { entry: true, tier: UNKNOWN }));
  const next = manifest(asset('root', { entry: true, tier: UNKNOWN, bytes: 101 }));
  assert.equal(impactReview(old, next)[0].evidence, UNKNOWN);
});
test('impact review of documented source never claims accessible', () => assert.notEqual(impactReview(before, modified('shared', { bytes: 200 }))[0].evidence, 'accessible'));
test('impact review of orphan has informational priority', () => {
  const old = manifest(asset('root', { entry: true }), asset('orphan'));
  const next = manifest(asset('root', { entry: true }), asset('orphan', { bytes: 111 }));
  assert.equal(impactReview(old, next)[0].priority, 'information');
});
test('impact review of shared asset requires review', () => assert.equal(impactReview(before, modified('shared', { bytes: 101 }))[0].priority, 'review'));
test('impact review of removed root has critical priority', () => {
  const old = manifest(asset('root', { entry: true }), asset('other'));
  const next = manifest(asset('other'));
  assert.equal(impactReview(old, next).find(x => x.id === 'root').priority, 'critical');
});
test('compareManifest refuses unsupported schema before', () => assert.equal(difference({ ...before, version: 9 }, before).ok, false));
test('compareManifest refuses unsupported schema after', () => assert.equal(difference(before, { ...before, version: 9 }).ok, false));
test('compareManifest points issues to before manifest', () => assert.ok(difference({ ...before, version: 9 }, before).issues[0].path.startsWith('before')));
test('compareManifest points issues to after manifest', () => assert.ok(difference(before, { ...before, version: 9 }).issues[0].path.startsWith('after')));
test('compareManifest rejects unresolved references', () => {
  const next = manifest(asset('root', { entry: true, dependsOn: ['missing'] }));
  assert.equal(difference(before, next).ok, false);
});
test('identical comparison has two unchanged ids', () => assert.equal(difference(before, same()).value.unchanged.length, 2));
test('identical comparison has no additions', () => assert.deepEqual(difference(before, same()).value.added, []));
test('identical comparison has no removals', () => assert.deepEqual(difference(before, same()).value.removed, []));
test('identical comparison has no changed', () => assert.deepEqual(difference(before, same()).value.changed, []));
test('identical comparison has equal byte totals', () => assert.deepEqual(difference(before, same()).value.totalBytes, { before: 200, after: 200 }));
test('manifest createdOn retained', () => assert.equal(difference(before, same()).value.before, DAY));
test('comparison preserves added id', () => {
  const next = manifest(...before.assets, asset('new'));
  assert.deepEqual(difference(before, next).value.added, ['new']);
});
test('comparison preserves removed id', () => {
  const old = manifest(asset('root', { entry: true }), asset('orphan'));
  assert.deepEqual(difference(old, manifest(asset('root', { entry: true }))).value.removed, ['orphan']);
});
test('comparison includes changed root digest', () => assert.deepEqual(difference(before, modified('root', { sha256: SHA_B })).value.changed, ['root']));
test('comparison reports newly added entry point', () => {
  const old = manifest(asset('en', { entry: true, locale: 'en' }), asset('fr', { locale: 'fr' }));
  const next = manifest(asset('en', { entry: true, locale: 'en' }), asset('fr', { entry: true, locale: 'fr' }));
  assert.deepEqual(difference(old, next).value.rootChanges.added, ['fr']);
});
test('comparison reports removed entry point', () => {
  const old = bilingual();
  const next = mutate(old);
  next.assets.find(row => row.id === 'fr').entry = false;
  assert.deepEqual(difference(old, next).value.rootChanges.removed, ['fr']);
});
test('comparison reports an added orphan', () => {
  const next = manifest(...before.assets, asset('orphan'));
  assert.deepEqual(difference(before, next).value.orphanChanges.added, ['orphan']);
});
test('comparison reports a removed orphan', () => {
  const old = manifest(asset('root', { entry: true }), asset('orphan'));
  const next = manifest(asset('root', { entry: true }));
  assert.deepEqual(difference(old, next).value.orphanChanges.removed, ['orphan']);
});
test('comparison reports cycles in the new manifest', () => {
  const old = manifest(asset('a', { entry: true }), asset('b'));
  const next = manifest(asset('a', { entry: true, dependsOn: ['b'] }), asset('b', { dependsOn: ['a'] }));
  assert.deepEqual(difference(old, next).value.cycles.after, [['a', 'b']]);
});
test('comparison preserves missing cycle in earlier version', () => {
  const old = manifest(asset('a', { entry: true, dependsOn: ['b'] }), asset('b', { dependsOn: ['a'] }));
  const next = manifest(asset('a', { entry: true }), asset('b'));
  assert.deepEqual(difference(old, next).value.cycles.before, [['a', 'b']]);
});
test('comparison warning is not an accessibility claim', () => assert.match(difference(before, same()).value.warning, /not accessibility conclusions/u));
test('comparison of two unchanged bilingual manifests is empty', () => assert.deepEqual(difference(bilingual(), bilingual()).value.items, []));
test('comparison of identical dependency chain is empty', () => assert.deepEqual(difference(chain(), chain()).value.changed, []));
test('before and after values are never mutated', () => {
  const old = mutate(before); const next = modified('shared', { bytes: 600 });
  const backup = mutate(next);
  difference(old, next);
  assert.deepEqual(old, before);
  assert.deepEqual(next, backup);
});
test('comparison of digest-only change leaves provenance unchanged', () => assert.deepEqual(difference(before, modified('shared', { sha256: SHA_B })).value.provenance, []));
test('comparison of source change records provenance', () => assert.equal(difference(before, modified('shared', { source: 'Changed fictional source' })).value.provenance[0].id, 'shared'));
test('comparison of path-only change records moved path', () => assert.equal(difference(before, modified('shared', { path: 'assets/moved.js' })).value.moved[0].id, 'shared'));
test('comparison of byte-only change does not invent hash change', () => assert.deepEqual(difference(before, modified('shared', { bytes: 200 })).value.hashes, []));
test('comparison of a same id never counts it as added', () => assert.deepEqual(difference(before, modified('shared', { bytes: 200 })).value.added, []));
test('comparison of a same id never counts it as removed', () => assert.deepEqual(difference(before, modified('shared', { bytes: 200 })).value.removed, []));
test('comparison of size-only change is stable across repeated runs', () => {
  const next = modified('shared', { bytes: 200 });
  assert.deepEqual(difference(before, next).value, difference(before, next).value);
});
