import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELTA_VERSION, CHANGE_KINDS, deepEqual, mapEntries, changedKeys,
  classifySourceChange, classifyAssetChange, classifyClaimChange,
  compareRelease, sourceChangeImpact, assetChangeImpact,
  reviewRequiredChanges, guardedReleaseComparison, releaseContinuity,
  compareClaimCoverage, compareSourceLicences, compareRetrievalDates,
} from './offline-release-delta.mjs';
import { fingerprintRelease } from './offline-release-contract.mjs';

const hash = 'b'.repeat(64);
const source = () => ({ id: 'source', title: 'Synthetic source',
  url: 'https://example.org/evidence', licence: 'CC0-1.0',
  retrievedOn: '2026-11-19', tier: 0, review: 'pending' });
const asset = () => ({ id: 'entry', path: 'index.html', kind: 'html',
  size: 200, sha256: hash, cache: 'precache', state: 'included', dependsOn: [] });
const claim = () => ({ id: 'claim', recordId: 'fixture', field: 'accessibleEntrance',
  state: 'UNKNOWN', sourceIds: ['source'] });
const fixture = () => ({ version: 1, releaseId: 'round-1',
  createdOn: '2026-11-19', locale: { en: true, fr: true },
  notice: { en: 'No real-world conclusion', fr: 'Aucune conclusion réelle' },
  sources: [source()], assets: [asset()], claims: [claim()] });
const clone = structuredClone;
function edited(mutator) {
  const release = fixture();
  mutator(release);
  release.releaseId = 'round-2';
  return release;
}
const kinds = (result) => result.changes.map((entry) => entry.kind);

test('delta version and change kinds are explicit', () => {
  assert.equal(DELTA_VERSION, 1);
  assert.ok(CHANGE_KINDS.includes('claim-unknown-transition'));
  assert.equal(new Set(CHANGE_KINDS).size, CHANGE_KINDS.length);
});
test('structural equality ignores object property insertion order', () => {
  assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
});
test('structural equality preserves array order', () => {
  assert.equal(deepEqual([1, 2], [2, 1]), false);
});
test('structural equality distinguishes zero and positive number', () => {
  assert.equal(deepEqual({ tier: 0 }, { tier: 1 }), false);
});
test('map entries uses stable identifiers', () => {
  assert.equal(mapEntries([source()]).get('source').licence, 'CC0-1.0');
});
test('changed keys are alphabetically sorted', () => {
  assert.deepEqual(changedKeys({ z: 1, a: 1 }, { z: 2, a: 2 }), ['a', 'z']);
});
test('changed keys include newly added values', () => {
  assert.deepEqual(changedKeys({ a: 1 }, { a: 1, b: 2 }), ['b']);
});
test('changed keys include removed values', () => {
  assert.deepEqual(changedKeys({ a: 1, b: 2 }, { a: 1 }), ['b']);
});
test('adding a source has an explicit classification', () => {
  assert.deepEqual(classifySourceChange(null, source()), ['source-added']);
});
test('removing a source has an explicit classification', () => {
  assert.deepEqual(classifySourceChange(source(), null), ['source-removed']);
});
test('source review-only change is separated from evidence changes', () => {
  assert.deepEqual(classifySourceChange(source(), { ...source(), review: 'reviewed' }), ['source-review-changed']);
});
test('source licence change is a substantive evidence change', () => {
  assert.deepEqual(classifySourceChange(source(), { ...source(), licence: 'MIT' }), ['source-changed']);
});
test('source unchanged yields empty classification', () => {
  assert.deepEqual(classifySourceChange(source(), structuredClone(source())), []);
});
test('adding an asset is not confused with source addition', () => {
  assert.deepEqual(classifyAssetChange(null, asset()), ['asset-added']);
});
test('removing an asset is reported explicitly', () => {
  assert.deepEqual(classifyAssetChange(asset(), null), ['asset-removed']);
});
test('asset digest change receives dedicated classification', () => {
  assert.deepEqual(classifyAssetChange(asset(), { ...asset(), sha256: 'c'.repeat(64) }), ['asset-digest-changed']);
});
test('asset size change is digest-relevant', () => {
  assert.deepEqual(classifyAssetChange(asset(), { ...asset(), size: 1000 }), ['asset-digest-changed']);
});
test('asset cache policy change is reported', () => {
  assert.deepEqual(classifyAssetChange(asset(), { ...asset(), cache: 'not-cached' }), ['asset-cache-changed']);
});
test('asset inclusion change is reported', () => {
  assert.deepEqual(classifyAssetChange(asset(), { ...asset(), state: 'withdrawn' }), ['asset-state-changed']);
});
test('asset dependency change is reported', () => {
  assert.deepEqual(classifyAssetChange(asset(), { ...asset(), dependsOn: ['other'] }), ['asset-dependencies-changed']);
});
test('asset name/path change is classified', () => {
  assert.deepEqual(classifyAssetChange(asset(), { ...asset(), path: 'other.html' }), ['asset-changed']);
});
test('asset unchanged yields empty classification', () => {
  assert.deepEqual(classifyAssetChange(asset(), clone(asset())), []);
});
test('adding a claim does not prove the claim', () => {
  assert.deepEqual(classifyClaimChange(null, claim()), ['claim-added']);
});
test('removing a claim is an explicit change', () => {
  assert.deepEqual(classifyClaimChange(claim(), null), ['claim-removed']);
});
test('UNKNOWN to YES is flagged for human review', () => {
  assert.deepEqual(classifyClaimChange(claim(), { ...claim(), state: 'YES' }), ['claim-unknown-transition']);
});
test('YES to UNKNOWN remains a flagged transition', () => {
  const known = { ...claim(), state: 'YES' };
  assert.deepEqual(classifyClaimChange(known, claim()), ['claim-unknown-transition']);
});
test('YES to NO is a claim-state change, not a verification claim', () => {
  assert.deepEqual(classifyClaimChange({ ...claim(), state: 'YES' }, { ...claim(), state: 'NO' }), ['claim-state-changed']);
});
test('claim source changes are distinct from state changes', () => {
  assert.deepEqual(classifyClaimChange(claim(), { ...claim(), sourceIds: ['different'] }), ['claim-source-changed']);
});
test('claim identity metadata changes are reported', () => {
  assert.deepEqual(classifyClaimChange(claim(), { ...claim(), recordId: 'other' }), ['claim-changed']);
});
test('identical release manifests have no changes', () => {
  const result = compareRelease(fixture(), fixture());
  assert.equal(result.ok, true);
  assert.equal(result.summary.total, 0);
});
test('a release notice wording change is flagged', () => {
  const later = edited((document) => { document.notice.en = 'A clearer caution'; });
  assert.ok(kinds(compareRelease(fixture(), later)).includes('release-notice-changed'));
});
test('a later source removal is separately flagged', () => {
  const earlier = fixture(); earlier.claims[0].sourceIds = [];
  const later = edited((document) => { document.claims[0].sourceIds = []; document.sources = []; });
  assert.ok(kinds(compareRelease(earlier, later)).includes('source-removed'));
});
test('changing a source retrieval date is substantive', () => {
  const later = edited((document) => { document.sources[0].retrievedOn = '2026-11-18'; });
  assert.ok(kinds(compareRelease(fixture(), later)).includes('source-changed'));
});
test('UNKNOWN to YES transition is not automatically approved', () => {
  const later = edited((document) => { document.claims[0].state = 'YES'; });
  const result = compareRelease(fixture(), later);
  assert.equal(result.summary.unknownTransitions, 1);
});
test('multiple changes sort deterministically', () => {
  const later = edited((document) => {
    document.claims[0].state = 'YES';
    document.assets[0].cache = 'not-cached';
    document.sources[0].review = 'reviewed';
  });
  const changes = compareRelease(fixture(), later).changes;
  assert.deepEqual(changes.map((entry) => entry.category), ['assets', 'claims', 'sources']);
});
test('invalid earlier manifest fails closed', () => {
  const earlier = fixture(); earlier.sources[0].licence = 'private';
  const result = compareRelease(earlier, fixture());
  assert.equal(result.ok, false);
  assert.equal(result.changes.length, 0);
  assert.equal(result.issues[0].side, 'before');
});
test('invalid later manifest fails closed', () => {
  const later = edited((document) => { document.sources[0].url = 'http://unsafe.example'; });
  const result = compareRelease(fixture(), later);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.side === 'after'));
});
test('source impact lists claim IDs without asserting accessibility', () => {
  const later = edited((document) => { document.sources[0].review = 'reviewed'; });
  const impact = sourceChangeImpact(fixture(), later);
  assert.deepEqual(impact.impacted[0].claimIds, ['claim']);
});
test('asset impact includes affected downstream entry points', () => {
  const earlier = fixture(); earlier.assets.push({ ...asset(), id: 'child', path: 'child.js' });
  earlier.assets[0].dependsOn = ['child'];
  const later = clone(earlier); later.assets[1].sha256 = 'd'.repeat(64);
  const impact = assetChangeImpact(earlier, later);
  assert.deepEqual(impact.impacted[0].dependentIds, ['entry']);
});
test('review-required filter includes source changes', () => {
  const later = edited((document) => { document.sources[0].licence = 'MIT'; });
  assert.ok(reviewRequiredChanges(fixture(), later).required.some((entry) => entry.kind === 'source-changed'));
});
test('review-required filter includes UNKNOWN transitions', () => {
  const later = edited((document) => { document.claims[0].state = 'YES'; });
  assert.equal(reviewRequiredChanges(fixture(), later).count, 1);
});
test('review-required filter excludes mere release notice changes', () => {
  const later = edited((document) => { document.notice.en = 'Alternative caution'; });
  assert.equal(reviewRequiredChanges(fixture(), later).count, 0);
});
test('guarded comparison accepts matching prior fingerprint', () => {
  const old = fixture(); const fingerprint = fingerprintRelease(old).fingerprint;
  assert.equal(guardedReleaseComparison(old, fixture(), fingerprint).ok, true);
});
test('guarded comparison refuses stale prior fingerprint', () => {
  const result = guardedReleaseComparison(fixture(), fixture(), 'sha256:stale');
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'FINGERPRINT_MISMATCH');
});
test('continuity preserves identical asset content', () => {
  assert.deepEqual(releaseContinuity(fixture(), fixture()).continuity.preserved, ['index.html']);
});
test('continuity differentiates replaced content', () => {
  const later = edited((document) => { document.assets[0].sha256 = 'e'.repeat(64); });
  assert.deepEqual(releaseContinuity(fixture(), later).continuity.replaced, ['index.html']);
});
test('continuity differentiates removed and added asset paths', () => {
  const later = edited((document) => { document.assets[0].path = 'home.html'; });
  const result = releaseContinuity(fixture(), later).continuity;
  assert.deepEqual(result.removed, ['index.html']);
  assert.deepEqual(result.added, ['home.html']);
});
test('claim coverage always reports explicit UNKNOWN count', () => {
  const result = compareClaimCoverage(fixture(), fixture()).changes;
  assert.equal(result.before.UNKNOWN, 1);
  assert.equal(result.shifts.UNKNOWN, 0);
});
test('coverage shifts do not rewrite underlying claims', () => {
  const earlier = fixture(); const later = edited((document) => { document.claims[0].state = 'YES'; });
  const result = compareClaimCoverage(earlier, later).changes;
  assert.equal(result.shifts.UNKNOWN, -1);
  assert.equal(result.shifts.YES, 1);
  assert.equal(earlier.claims[0].state, 'UNKNOWN');
});
test('licence changes retain before and after identifiers', () => {
  const later = edited((document) => { document.sources[0].licence = 'CC-BY-4.0'; });
  assert.deepEqual(compareSourceLicences(fixture(), later).changes[0],
    { id: 'source', before: 'CC0-1.0', after: 'CC-BY-4.0' });
});
test('retrieval dates identify stale replacement source', () => {
  const later = edited((document) => { document.sources[0].retrievedOn = '2026-11-18'; });
  assert.equal(compareRetrievalDates(fixture(), later).dates[0].newer, false);
});
test('retrieval date changes preserve explicit ISO days', () => {
  const earlier = fixture(); earlier.sources[0].retrievedOn = '2026-11-18';
  const later = fixture();
  assert.equal(compareRetrievalDates(earlier, later).dates[0].newer, true);
});
test('delta inspection never mutates supplied snapshots', () => {
  const earlier = fixture(); const later = edited((document) => { document.claims[0].state = 'NO'; });
  const oldCopy = clone(earlier); const newCopy = clone(later);
  sourceChangeImpact(earlier, later);
  reviewRequiredChanges(earlier, later);
  assert.deepEqual(earlier, oldCopy);
  assert.deepEqual(later, newCopy);
});
