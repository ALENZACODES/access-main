import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHANGE_KINDS, assetChanges, compareRehearsals,
  coverageDelta, reviewChanges, safeSummary, crossReleaseSourceChanges,
  provenanceDictionary,
} from './offline-update-rehearsal-compare.mjs';
import { TODAY, asset, session, event, document, provenance, fixtureWithTwoAssets } from './offline-update-rehearsal-fixtures.mjs';
const compare = (a, b) => compareRehearsals(a, b, { today: TODAY });
const kinds = result => result.changes.map(item => item.kind);
const old = () => document();

test('change vocabulary is bounded and unique', () => {
  assert.equal(new Set(CHANGE_KINDS).size, CHANGE_KINDS.length);
  assert.ok(CHANGE_KINDS.includes('asset-source'));
  assert.ok(CHANGE_KINDS.includes('session-evidence'));
});
test('identical release snapshots produce no changes', () => {
  const result = compare(old(), old());
  assert.equal(result.ok, true);
  assert.equal(result.summary.changes, 0);
  assert.deepEqual(result.changes, []);
});
test('input is never mutated by the comparison', () => {
  const a = old();
  const b = old();
  const before = JSON.stringify([a, b]);
  compare(a, b);
  assert.equal(JSON.stringify([a, b]), before);
});
test('added assets are recorded without inferring availability', () => {
  const result = compare(old(), document({ assets: [asset(), asset('new')] }));
  assert.ok(kinds(result).includes('asset-added'));
});
test('removed assets are an explicit blocking review', () => {
  const result = compare(document({ assets: [asset(), asset('removed')] }), old());
  assert.ok(result.changes.some(item => item.kind === 'asset-removed' && item.review === 'block'));
});
test('changed hash emits a byte-difference review', () => {
  const result = assetChanges(old(), document({ assets: [asset('shell', { sha256: 'b'.repeat(64) })] }));
  assert.ok(result.some(item => item.kind === 'asset-bytes'));
});
test('changed byte size emits a difference even with unchanged hash', () => {
  assert.ok(assetChanges(old(), document({ assets: [asset('shell', { bytes: 26 })] })).some(x => x.kind === 'asset-bytes'));
});
test('changed asset path triggers review', () => {
  assert.ok(assetChanges(old(), document({ assets: [asset('shell', { path: 'new/shell.js' })] })).some(x => x.kind === 'asset-bytes'));
});
test('PASS to FAIL asset state is a regression', () => {
  const a = document({ assets: [asset('shell', { state: 'PASS' })] });
  const b = document({ assets: [asset('shell', { state: 'FAIL' })] });
  const change = assetChanges(a, b).find(item => item.kind === 'asset-state');
  assert.equal(change.review, 'regressed');
});
test('PASS to UNKNOWN asset state is evidence loss', () => {
  const a = document({ assets: [asset('shell', { state: 'PASS' })] });
  const result = assetChanges(a, old());
  assert.equal(result.find(x => x.kind === 'asset-state').review, 'evidence-missing');
});
test('UNKNOWN to PASS is review rather than silent endorsement', () => {
  const result = assetChanges(old(), document({ assets: [asset('shell', { state: 'PASS' })] }));
  assert.equal(result.find(x => x.kind === 'asset-state').review, 'requires-review');
});
test('source URI change produces an explicit source difference', () => {
  const next = document({ assets: [asset('shell', { provenance: provenance({ source: 'https://example.net/revision' }) })] });
  assert.ok(kinds(compare(old(), next)).includes('asset-source'));
});
test('licence change is not treated as an automatic success', () => {
  const next = document({ assets: [asset('shell', { provenance: provenance({ licence: 'MIT' }) })] });
  assert.ok(kinds(compare(old(), next)).includes('asset-licence'));
});
test('retrieval date change is distinct from file-byte change', () => {
  const next = document({ assets: [asset('shell', { provenance: provenance({ retrievedOn: '2026-11-19' }) })] });
  assert.deepEqual(kinds(compare(old(), next)), ['asset-date']);
});
test('tier changes require review without increasing trust', () => {
  const next = document({ assets: [asset('shell', { provenance: provenance({ tier: 1 }) })] });
  assert.deepEqual(kinds(compare(old(), next)), ['asset-tier']);
});
test('dependency order alone is not a release change', () => {
  const a = document({ assets: [asset('shell'), asset('a'), asset('b', { dependsOn: ['shell', 'a'] })] });
  const b = document({ assets: [asset('shell'), asset('a'), asset('b', { dependsOn: ['a', 'shell'] })] });
  assert.equal(compare(a, b).summary.changes, 0);
});
test('dependency set changes are reported', () => {
  const a = fixtureWithTwoAssets();
  const b = fixtureWithTwoAssets();
  b.assets[1].dependsOn = [];
  assert.ok(kinds(compare(a, b)).includes('asset-dependencies'));
});
test('removed session is a blocking review, not an omitted row', () => {
  const result = compare(old(), document({ sessions: [] }));
  assert.ok(result.changes.some(x => x.kind === 'session-removed' && x.review === 'block'));
});
test('added session does not imply the older release failed', () => {
  const result = compare(document({ sessions: [] }), old());
  assert.ok(kinds(result).includes('session-added'));
});
test('session PASS to FAIL is a regression', () => {
  const a = document({ sessions: [session('session-one', { outcome: 'PASS' })] });
  const b = document({ sessions: [session('session-one', { outcome: 'FAIL' })] });
  assert.ok(compare(a, b).changes.some(x => x.kind === 'session-outcome' && x.review === 'regressed'));
});
test('changed event order is detected even if outcome remains UNKNOWN', () => {
  const before = old();
  const after = document({ sessions: [session('session-one', { events: [event('changed', { order: 0 })] })] });
  assert.ok(kinds(compare(before, after)).includes('session-evidence'));
});
test('recorded event state change produces a trace-digest difference', () => {
  const after = document({ sessions: [session('session-one', { events: [event('event-one', { state: 'FAIL' })] })] });
  assert.ok(kinds(compare(old(), after)).includes('session-evidence'));
});
test('session network change is not interpreted as a measured outage', () => {
  const after = document({ sessions: [session('session-one', { network: 'limited' })] });
  assert.deepEqual(kinds(compare(old(), after)), ['session-network']);
});
test('session phase and language changes remain distinct', () => {
  const after = document({ sessions: [session('session-one', { phase: 'warm-start', locale: 'fr' })] });
  assert.ok(kinds(compare(old(), after)).includes('session-phase'));
  assert.ok(kinds(compare(old(), after)).includes('session-locale'));
});
test('session provenance is compared independently', () => {
  const after = document({ sessions: [session('session-one', { provenance: provenance({ tier: 'E' }) })] });
  assert.ok(kinds(compare(old(), after)).includes('session-tier'));
});
test('session source withdrawal is surfaced for human review', () => {
  const after = document({ sessions: [session('session-one', { provenance: provenance({ source: 'https://example.net/new' }) })] });
  assert.ok(kinds(compare(old(), after)).includes('session-source'));
});
test('reordering records does not alter difference ordering', () => {
  const a = document({ assets: [asset('a'), asset('b')], sessions: [session('s1'), session('s2')] });
  const b = document({ assets: [asset('b', { state: 'FAIL' }), asset('a')], sessions: [session('s2'), session('s1', { outcome: 'FAIL' })] });
  const c = document({ assets: [...a.assets].reverse(), sessions: [...a.sessions].reverse() });
  const d = document({ assets: [...b.assets].reverse(), sessions: [...b.sessions].reverse() });
  assert.deepEqual(compare(a, b).changes, compare(c, d).changes);
});
test('invalid previous snapshot blocks comparison', () => {
  const result = compare({ version: 2, assets: [], sessions: [] }, old());
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.equal(result.problems[0].snapshot, 'previous');
});
test('invalid later snapshot blocks comparison', () => {
  const result = compare(old(), { version: 2, assets: [], sessions: [] });
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].snapshot, 'next');
});
test('changed assets mark transitive dependents', () => {
  const a = fixtureWithTwoAssets();
  const b = fixtureWithTwoAssets();
  b.assets[0].sha256 = 'b'.repeat(64);
  assert.deepEqual(compare(a, b).affected, ['fonts', 'shell']);
});
test('coverage delta reports newly supplied French evidence', () => {
  const a = old();
  const b = document({ sessions: [session('session-one'), session('second', { locale: 'fr', network: 'offline' })] });
  assert.ok(coverageDelta(a, b).changes.some(x => x.locale === 'fr' && x.nextCount > x.previousCount));
});
test('coverage delta emits no changes for identical inputs', () => {
  assert.deepEqual(coverageDelta(old(), old()).changes, []);
});
test('coverage delta rejects invalid inputs', () => {
  const result = coverageDelta({}, old());
  assert.equal(result.ok, false);
  assert.deepEqual(result.changes, []);
});
test('review tasks are always UNKNOWN administrative tasks', () => {
  const a = old();
  const b = document({ sessions: [session('session-one', { outcome: 'FAIL' })] });
  const result = reviewChanges(a, b);
  assert.equal(result.ok, true);
  assert.ok(result.tasks.length > 0);
  assert.ok(result.tasks.every(x => x.status === 'UNKNOWN'));
});
test('review tasks are sorted by stable keys', () => {
  const a = document({ assets: [asset('a'), asset('b')] });
  const b = document({ assets: [asset('a', { state: 'FAIL' }), asset('b', { state: 'FAIL' })] });
  const tasks = reviewChanges(a, b).tasks;
  assert.deepEqual(tasks.map(x => x.key), [...tasks.map(x => x.key)].sort());
});
test('safe summary counts changed source metadata separately', () => {
  const b = document({ assets: [asset('shell', { provenance: provenance({ source: 'https://example.net/new' }) })] });
  const report = safeSummary(old(), b);
  assert.equal(report.ok, true);
  assert.equal(report.summary.sourceChanges, 1);
});
test('cross-release source list includes only provenance changes', () => {
  const b = document({ assets: [asset('shell', { bytes: 26, provenance: provenance({ licence: 'MIT' }) })] });
  const result = crossReleaseSourceChanges(old(), b);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, 'asset-licence');
});
test('a provenance dictionary aggregates repeated sources', () => {
  const result = provenanceDictionary(old());
  assert.equal(result.ok, true);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].recordCount, 2);
});
test('a provenance dictionary separates different licences', () => {
  const value = document({ sessions: [session('session-one', { provenance: provenance({ licence: 'MIT' }) })] });
  assert.equal(provenanceDictionary(value).sources.length, 2);
});
test('a provenance dictionary does not return data for invalid documents', () => {
  const result = provenanceDictionary({});
  assert.equal(result.ok, false);
  assert.deepEqual(result.sources, []);
});
