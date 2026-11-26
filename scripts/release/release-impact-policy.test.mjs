import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIORITIES, POLICY, sourceAge, reviewManifest, reviewDelta,
  filterReview, planManualTasks, dependencyHealth,
} from './release-impact-policy.mjs';
import { asset, manifest, bilingual, chain, DAY, SHA_B } from './release-impact-fixtures.mjs';
import { UNKNOWN } from './release-impact-contract.mjs';
const issues = value => reviewManifest(value, { today: DAY }).value.issues;
const codes = value => issues(value).map(item => item.finding);
const fresh = () => bilingual();
test('priority order has no duplicates', () => assert.equal(new Set(PRIORITIES).size, PRIORITIES.length));
test('critical priority is first', () => assert.equal(PRIORITIES[0], 'critical'));
test('information priority is last', () => assert.equal(PRIORITIES.at(-1), 'information'));
test('all policy priorities declared', () => assert.ok(Object.values(POLICY).every(value => PRIORITIES.includes(value))));
test('source age equal dates is zero days', () => assert.equal(sourceAge(DAY, DAY), 0));
test('source age previous day is one day', () => assert.equal(sourceAge('2026-11-20', DAY), 1));
test('source age from 365 days ago', () => assert.equal(sourceAge('2025-11-21', DAY), 365));
test('source age handles leap day', () => assert.equal(sourceAge('2024-02-29', '2024-03-01'), 1));
test('source age invalid retrieval returns null', () => assert.equal(sourceAge('not-date', DAY), null));
test('source age invalid reference returns null', () => assert.equal(sourceAge(DAY, 'bad'), null));
test('source age does not round up a missing day', () => assert.equal(sourceAge('2026-11-20', DAY), 1));
test('bilingual fresh manifest has no missing-locale flag', () => assert.ok(!codes(fresh()).includes('MISSING_LOCALE_ENTRY')));
test('bilingual fresh manifest has no orphan flag', () => assert.ok(!codes(fresh()).includes('ORPHAN')));
test('documented bilingual fresh manifest has no tier flag', () => assert.ok(!codes(fresh()).includes('UNKNOWN_TIER')));
test('documented bilingual fresh manifest has no old-source flag', () => assert.ok(!codes(fresh()).includes('OLD_SOURCE')));
test('bilingual fresh manifest has no cycle flag', () => assert.ok(!codes(fresh()).includes('CYCLE')));
test('fresh bilingual manifest passes policy', () => assert.equal(reviewManifest(fresh(), { today: DAY }).ok, true));
test('missing entry in French is review finding', () => assert.ok(codes(manifest(asset('en', { entry: true, locale: 'en' }))).includes('MISSING_LOCALE_ENTRY')));
test('missing entry in English is review finding', () => assert.ok(codes(manifest(asset('fr', { entry: true, locale: 'fr' }))).includes('MISSING_LOCALE_ENTRY')));
test('bilingual entry satisfies both locales', () => {
  const data = manifest(asset('all', { entry: true, locale: 'both' }));
  assert.ok(!codes(data).includes('MISSING_LOCALE_ENTRY'));
});
test('entry with none locale flags unmatched', () => {
  const data = manifest(asset('root', { entry: true, locale: 'none' }));
  assert.ok(codes(data).includes('UNMATCHED_LOCALE'));
});
test('no entries produces NO_ENTRIES', () => assert.ok(codes(manifest(asset('a'))).includes('NO_ENTRIES')));
test('rootless manifest does not claim successful deployment', () => assert.ok(!issues(manifest(asset('a'))).some(x => x.finding === 'DEPLOYMENT_PASS')));
test('unknown provenance produces a review issue', () => {
  const data = manifest(asset('both', { entry: true, locale: 'both', tier: UNKNOWN }));
  assert.ok(codes(data).includes('UNKNOWN_TIER'));
});
test('unknown provenance never reports failure of physical accessibility', () => {
  const data = manifest(asset('both', { entry: true, locale: 'both', tier: UNKNOWN }));
  assert.ok(!codes(data).includes('INACCESSIBLE_PLACE'));
});
test('old source records review', () => {
  const data = manifest(asset('both', { entry: true, locale: 'both', retrievedOn: '2024-01-01' }));
  assert.ok(codes(data).includes('OLD_SOURCE'));
});
test('exact age threshold is not stale', () => {
  const data = manifest(asset('both', { entry: true, locale: 'both', retrievedOn: '2025-11-21' }));
  assert.ok(!codes(data).includes('OLD_SOURCE'));
});
test('age 366 days is stale', () => {
  const data = manifest(asset('both', { entry: true, locale: 'both', retrievedOn: '2025-11-20' }));
  assert.ok(codes(data).includes('OLD_SOURCE'));
});
test('policy supports stricter age threshold', () => {
  const data = manifest(asset('both', { entry: true, locale: 'both', retrievedOn: '2026-11-20' }));
  assert.ok(reviewManifest(data, { today: DAY, oldDays: 0 }).value.issues.some(x => x.finding === 'OLD_SOURCE'));
});
test('negative age cap rejected', () => assert.equal(reviewManifest(fresh(), { today: DAY, oldDays: -1 }).ok, false));
test('fractional age cap rejected', () => assert.equal(reviewManifest(fresh(), { today: DAY, oldDays: 1.2 }).ok, false));
test('unbounded age cap rejected', () => assert.equal(reviewManifest(fresh(), { today: DAY, oldDays: 99999 }).ok, false));
test('invalid reference date rejected', () => assert.equal(reviewManifest(fresh(), { today: 'someday' }).ok, false));
test('negative byte cap rejected', () => assert.equal(reviewManifest(fresh(), { today: DAY, maxBytes: -1 }).ok, false));
test('noninteger byte cap rejected', () => assert.equal(reviewManifest(fresh(), { today: DAY, maxBytes: 1.5 }).ok, false));
test('byte cap exactly total does not flag', () => assert.ok(!reviewManifest(fresh(), { today: DAY, maxBytes: 300 }).value.issues.some(x => x.finding === 'EXCESSIVE_BUNDLE_BYTES')));
test('byte cap one less flags review', () => assert.ok(reviewManifest(fresh(), { today: DAY, maxBytes: 299 }).value.issues.some(x => x.finding === 'EXCESSIVE_BUNDLE_BYTES')));
test('bundle policy never increases byte threshold', () => assert.equal(reviewManifest(fresh(), { today: DAY, maxBytes: 299 }).value.bytes, 300));
test('orphan asset review appears', () => {
  const data = manifest(asset('all', { entry: true, locale: 'both' }), asset('forgotten'));
  assert.ok(codes(data).includes('ORPHAN'));
});
test('graph cycle is a critical issue', () => {
  const data = manifest(asset('all', { entry: true, locale: 'both', dependsOn: ['loop'] }), asset('loop', { dependsOn: ['all'] }));
  assert.ok(issues(data).some(x => x.finding === 'CYCLE' && x.priority === 'critical'));
});
test('cycle review precedes orphan review', () => {
  const data = manifest(asset('all', { entry: true, locale: 'both', dependsOn: ['loop'] }), asset('loop', { dependsOn: ['all'] }), asset('orphan'));
  assert.equal(issues(data)[0].finding, 'CYCLE');
});
test('manifest policy returns counts summing issues', () => {
  const result = reviewManifest(manifest(asset('all', { entry: true, locale: 'both', tier: UNKNOWN })), { today: DAY }).value;
  assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), result.issues.length);
});
test('policy results stable on repeated execution', () => assert.deepEqual(issues(fresh()), issues(fresh())));
test('invalid manifest rejected instead of generating false tasks', () => assert.equal(reviewManifest({ version: 2, assets: [] }).ok, false));
test('policy warnings preserve UNKNOWN', () => assert.match(reviewManifest(fresh()).value.warning, /UNKNOWN/u));
test('changed asset creates human review item', () => {
  const a = fresh(), b = fresh(); b.assets.find(x => x.id === 'shared').sha256 = SHA_B;
  assert.ok(reviewDelta(a, b, { today: DAY }).value.items.some(x => x.finding === 'CHANGED_ASSET'));
});
test('removed root creates critical item', () => {
  const a = manifest(asset('root', { entry: true, locale: 'both' }), asset('extra'));
  const b = manifest(asset('extra'));
  assert.ok(reviewDelta(a, b, { today: DAY }).value.items.some(x => x.finding === 'DISAPPEARED_ENTRY' && x.priority === 'critical'));
});
test('removed unused asset creates review item', () => {
  const a = manifest(asset('root', { entry: true, locale: 'both' }), asset('extra'));
  const b = manifest(asset('root', { entry: true, locale: 'both' }));
  assert.ok(reviewDelta(a, b, { today: DAY }).value.items.some(x => x.finding === 'REMOVED_ASSET'));
});
test('added artifact creates informational item', () => {
  const a = manifest(asset('root', { entry: true, locale: 'both' }));
  const b = manifest(asset('root', { entry: true, locale: 'both' }), asset('extra'));
  assert.ok(reviewDelta(a, b, { today: DAY }).value.items.some(x => x.finding === 'ASSET_ADDED'));
});
test('source change creates provenance review', () => {
  const a = fresh(), b = fresh(); b.assets[0].source = 'A changed fictional source';
  assert.ok(reviewDelta(a, b, { today: DAY }).value.items.some(x => x.finding === 'SOURCE_CHANGED'));
});
test('reviewDelta rejects malformed after', () => assert.equal(reviewDelta(fresh(), { version: 2 }).ok, false));
test('reviewDelta rejects malformed before', () => assert.equal(reviewDelta({ version: 2 }, fresh()).ok, false));
test('reviewDelta reports both snapshots without mutation', () => {
  const a = fresh(), b = fresh();
  assert.deepEqual(reviewDelta(a, b, { today: DAY }).value.items, []);
});
test('reviewDelta warns against inferring accessibility', () => assert.match(reviewDelta(fresh(), fresh()).value.warning, /not been shown to be safe or accessible/u));
test('filterReview works on critical items', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both', dependsOn: ['loop'] }), asset('loop', { dependsOn: ['root'] }));
  assert.ok(filterReview(reviewManifest(data), { priority: 'critical' }).every(x => x.priority === 'critical'));
});
test('filterReview works by id', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both' }), asset('orphan'));
  assert.ok(filterReview(reviewManifest(data), { id: 'orphan' }).every(x => x.id === 'orphan'));
});
test('filterReview works by issue type', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both', tier: UNKNOWN }));
  assert.ok(filterReview(reviewManifest(data), { finding: 'UNKNOWN_TIER' }).every(x => x.finding === 'UNKNOWN_TIER'));
});
test('filterReview invalid result returns []', () => assert.deepEqual(filterReview({ ok: false }), []));
test('filterReview cannot mutate original results', () => {
  const source = reviewManifest(fresh()); const before = source.value.issues.length;
  filterReview(source, { priority: 'review' });
  assert.equal(source.value.issues.length, before);
});
test('planManualTasks uses OPEN status', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both', tier: UNKNOWN }));
  assert.ok(planManualTasks(reviewManifest(data)).every(x => x.status === 'OPEN'));
});
test('planManualTasks deterministic ids', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both', tier: UNKNOWN }));
  assert.equal(planManualTasks(reviewManifest(data))[0].taskId, 'release-review-0001');
});
test('planManualTasks requests provenance for unknown tier', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both', tier: UNKNOWN }));
  assert.ok(planManualTasks(reviewManifest(data)).some(x => x.action === 'request-provenance'));
});
test('planManualTasks requests current source for old evidence', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both', retrievedOn: '2024-01-01' }));
  assert.ok(planManualTasks(reviewManifest(data, { today: DAY })).some(x => x.action === 'seek-current-source'));
});
test('planManualTasks never certifies release', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both', tier: UNKNOWN }));
  assert.ok(planManualTasks(reviewManifest(data)).every(x => x.action !== 'certify'));
});
test('planManualTasks invalid review returns []', () => assert.deepEqual(planManualTasks({ ok: false }), []));
test('dependencyHealth rejects invalid manifest', () => assert.equal(dependencyHealth({}).ok, false));
test('dependencyHealth preserves all ids', () => assert.equal(dependencyHealth(fresh()).value.length, 3));
test('dependencyHealth computes upstream count', () => assert.equal(dependencyHealth(chain()).value.find(x => x.id === 'index').upstream, 1));
test('dependencyHealth does not promote missing tier', () => {
  const data = manifest(asset('root', { entry: true, tier: UNKNOWN }));
  assert.equal(dependencyHealth(data).value[0].provenance, UNKNOWN);
});
test('dependencyHealth reports zero broken references for validated graph', () => assert.ok(dependencyHealth(chain()).value.every(x => x.unresolved === 0)));
test('dependencyHealth retains byte counts', () => assert.equal(dependencyHealth(chain()).value.find(x => x.id === 'app').bytes, 100));
