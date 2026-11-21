import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHANGE_KINDS, CHANGE_SEVERITIES, keyMap, severityForKind,
  outcomeKind, fieldsChanged, compareChecks, impactForChange,
  changedScopes, summarizeChanges, compareRegressionSnapshots,
  reviewQueue, regressionGate, compareByLocale, evidenceChanged,
  severeChanges,
} from './interaction-regression-compare.mjs';
import { sampleCheck, sampleRun, sampleSnapshot,
  pairedSnapshot, changedSnapshot, copy, HASH_B } from './interaction-regression-fixtures.mjs';

const comparison = (before = sampleSnapshot(), after = changedSnapshot()) =>
  compareRegressionSnapshots(before, after);
const kinds = (result) => result.changes.map((entry) => entry.kind);

test('change taxonomy and priority levels are stable', () => {
  assert.equal(new Set(CHANGE_KINDS).size, CHANGE_KINDS.length);
  assert.deepEqual(CHANGE_SEVERITIES, ['block', 'review', 'information']);
  assert.ok(CHANGE_KINDS.includes('regression'));
  assert.ok(CHANGE_KINDS.includes('unknown-transition'));
});
test('each check receives a unique scope key across locales', () => {
  const map = keyMap(pairedSnapshot());
  assert.equal(map.size, 2);
  assert.ok([...map.keys()].some((key) => key.includes('|fr|')));
  assert.ok([...map.keys()].some((key) => key.includes('|en|')));
});
test('every change kind has a deterministic severity', () => {
  for (const kind of CHANGE_KINDS) {
    assert.ok(CHANGE_SEVERITIES.includes(severityForKind(kind, sampleCheck(), sampleCheck())), kind);
  }
  assert.equal(severityForKind('regression'), 'block');
  assert.equal(severityForKind('removed', { outcome: 'PASS' }), 'block');
  assert.equal(severityForKind('removed', { outcome: 'UNKNOWN' }), 'review');
});
test('outcome transitions require explicit human interpretation', () => {
  const table = [
    ['PASS', 'FAIL', 'regression'],
    ['PASS', 'UNKNOWN', 'unknown-transition'],
    ['FAIL', 'PASS', 'improvement-needs-review'],
    ['FAIL', 'UNKNOWN', 'unknown-transition'],
    ['UNKNOWN', 'PASS', 'unknown-transition'],
    ['UNKNOWN', 'FAIL', 'unknown-transition'],
    ['PASS', 'PASS', 'unchanged'],
  ];
  for (const [before, after, expected] of table) {
    assert.equal(outcomeKind(before, after), expected);
  }
});
test('source metadata changes remain distinct from outcome changes', () => {
  const old = sampleCheck();
  const fresh = { ...old, source: 'https://example.net/another',
    licence: 'CC-BY-4.0', retrievedOn: '2026-11-20', tier: 1,
    artifactSha256: HASH_B };
  assert.deepEqual(fieldsChanged(old, fresh), [
    'source-changed', 'licence-changed', 'retrieval-changed',
    'tier-changed', 'artifact-changed',
  ]);
});
test('measurement and bilingual label changes are independently detected', () => {
  const before = sampleCheck('a', 'target', { targetWidth: 44, targetHeight: 44 });
  const later = { ...before, targetWidth: 48, label: { en: 'Different', fr: 'Différent' } };
  assert.ok(fieldsChanged(before, later).includes('measurement-changed'));
  assert.ok(fieldsChanged(before, later).includes('label-changed'));
});
test('additions and removals do not manufacture a PASS', () => {
  assert.deepEqual(compareChecks(null, sampleCheck()), ['added']);
  assert.deepEqual(compareChecks(sampleCheck(), null), ['removed']);
  assert.deepEqual(compareChecks(sampleCheck(), sampleCheck()), ['unchanged']);
});
test('review action descriptions explain human verification work without changing data', () => {
  for (const kind of ['removed', 'regression', 'unknown-transition',
    'source-changed', 'measurement-changed', 'added']) {
    assert.ok(impactForChange(kind, sampleCheck(), sampleCheck()).length > 10);
  }
});
test('unchanged snapshots have no blocking differences', () => {
  const before = sampleSnapshot('release-a');
  const later = sampleSnapshot('release-b');
  const result = comparison(before, later);
  assert.equal(result.ok, true);
  assert.deepEqual(kinds(result), ['unchanged']);
  assert.equal(result.summary.blocks, 0);
});
test('a recorded regression blocks the technical gate', () => {
  const before = changedSnapshot('PASS', 'release-a');
  const later = changedSnapshot('FAIL', 'release-b');
  const result = comparison(before, later);
  assert.ok(kinds(result).includes('regression'));
  assert.equal(result.summary.blocks, 1);
  assert.equal(regressionGate(result).status, 'FAIL');
});
test('UNKNOWN to PASS is not automatically a release approval', () => {
  const result = comparison(sampleSnapshot(), changedSnapshot('PASS'));
  assert.ok(kinds(result).includes('unknown-transition'));
  assert.equal(regressionGate(result).status, 'UNKNOWN');
});
test('missing check appears as explicit removed evidence', () => {
  const before = sampleSnapshot('a', { runs: [sampleRun('x', {
    checks: [sampleCheck('a'), sampleCheck('b')],
  })] });
  const after = sampleSnapshot('b');
  const result = comparison(before, after);
  assert.ok(kinds(result).includes('removed'));
  assert.ok(result.changes.some((item) => item.before !== null && item.after === null));
});
test('new scoped run is visible in scope comparison', () => {
  const before = sampleSnapshot('a');
  const after = pairedSnapshot('b');
  const result = comparison(before, after);
  assert.equal(result.summary.scopes.added.length, 1);
  assert.equal(result.summary.scopes.removed.length, 0);
  assert.ok(result.summary.scopes.added[0].includes('|fr|'));
});
test('removed scoped run remains in the summary', () => {
  const result = comparison(pairedSnapshot('a'), sampleSnapshot('b'));
  assert.equal(result.summary.scopes.removed.length, 1);
  assert.ok(result.changes.some((item) => item.locale === 'fr' && item.kind === 'removed'));
});
test('provenance changes are reported even with UNKNOWN on both sides', () => {
  const before = sampleSnapshot('a');
  const after = changedSnapshot('UNKNOWN', 'b');
  after.runs[0].checks[0].source = 'https://example.net/updated';
  const result = comparison(before, after);
  assert.deepEqual(kinds(result), ['source-changed']);
  assert.equal(result.changes[0].after.outcome, 'UNKNOWN');
});
test('invalid source snapshot cannot produce a clean report', () => {
  const before = sampleSnapshot('a'); before.runs[0].checks[0].source = '';
  const result = comparison(before, changedSnapshot());
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(result.issues.some((issue) => issue.side === 'earlier'));
});
test('invalid candidate snapshot also blocks comparison', () => {
  const later = changedSnapshot(); later.runs[0].checks[0].licence = 'unknown';
  const result = comparison(sampleSnapshot(), later);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.side === 'later'));
});
test('same release identifiers require explicit opt-in', () => {
  const result = comparison(sampleSnapshot('same'), sampleSnapshot('same'));
  assert.equal(result.ok, false);
  const allowed = compareRegressionSnapshots(sampleSnapshot('same'), sampleSnapshot('same'), { allowSameRelease: true });
  assert.equal(allowed.ok, true);
});
test('queue sorts blocking issues before reviews', () => {
  const before = sampleSnapshot('a', { runs: [sampleRun('a', {
    checks: [sampleCheck('a', 'keyboard', { outcome: 'PASS' }), sampleCheck('b')],
  })] });
  const after = sampleSnapshot('b', { runs: [sampleRun('a', {
    checks: [sampleCheck('a', 'keyboard', { outcome: 'FAIL' }), sampleCheck('b', 'keyboard', { outcome: 'PASS' })],
  })] });
  const queue = reviewQueue(comparison(before, after));
  assert.equal(queue.ok, true);
  assert.equal(queue.items[0].severity, 'block');
});
test('informational changes can be included explicitly', () => {
  const result = comparison(sampleSnapshot(), sampleSnapshot('b'));
  assert.equal(reviewQueue(result).items.length, 0);
  assert.equal(reviewQueue(result, { includeInformational: true }).items.length, 1);
});
test('invalid comparison fails queue and gate closed', () => {
  assert.equal(reviewQueue(null).ok, false);
  assert.equal(regressionGate(null).status, 'UNKNOWN');
  assert.equal(compareByLocale(null), null);
  assert.deepEqual(severeChanges(null), []);
});
test('locale views preserve the original locale for every entry', () => {
  const result = comparison(pairedSnapshot('a'), pairedSnapshot('b'));
  const byLocale = compareByLocale(result);
  assert.equal(byLocale.en.length, 1);
  assert.equal(byLocale.fr.length, 1);
  assert.equal(byLocale.fr[0].locale, 'fr');
});
test('evidenceChanged distinguishes proof metadata from outcomes', () => {
  const before = sampleCheck();
  assert.equal(evidenceChanged(before, before), false);
  assert.equal(evidenceChanged(before, { ...before, outcome: 'FAIL' }), false);
  assert.equal(evidenceChanged(before, { ...before, source: 'https://example.net' }), true);
  assert.equal(evidenceChanged(null, before), true);
});
test('high-risk changes are selected without mutating originals', () => {
  const before = changedSnapshot('PASS', 'a');
  const after = changedSnapshot('FAIL', 'b');
  const beforeCopy = copy(before);
  const changes = severeChanges(comparison(before, after));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'regression');
  assert.deepEqual(before, beforeCopy);
});
test('unchanged metadata does not hide missing check scopes', () => {
  const scopes = changedScopes(pairedSnapshot('a'), sampleSnapshot('b'));
  assert.equal(scopes.removed.length, 1);
  assert.equal(scopes.common.length, 1);
});
test('change summary separates route counts from the route list', () => {
  const result = comparison(sampleSnapshot(), changedSnapshot());
  const summary = summarizeChanges(result.changes, result.summary.scopes);
  assert.equal(summary.uniqueChecks, 1);
  assert.deepEqual(summary.routes, ['/examples']);
  assert.equal(summary.readyForAutomaticRelease, false);
});
