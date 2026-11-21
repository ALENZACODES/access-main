import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverage, index, group, elapsed, findingsFor, duplicatesAcrossRoutes, analyze, selectReview, explainIssue, REVIEW_CODES } from './interaction-evidence-analysis.mjs';
import { UNKNOWN, KINDS } from './interaction-evidence-contract.mjs';
import { snapshot, route, check, measured, paired, DATE, HASH } from './interaction-evidence-fixtures.mjs';
const flags = (record, today = DATE) => findingsFor(record, today);
const report = data => analyze(data, { today: DATE });
const codes = result => result.value.reviews.map(x => x.code);
const variant = (changes = {}) => snapshot(route({ checks: [check(changes)] }));

test('coverage of an empty inventory is honest and zero', () => {
  const result = coverage({ schemaVersion: 1, capturedOn: DATE, routes: [] });
  assert.equal(result.ok, true);
  assert.equal(result.value.checkCount, 0);
  assert.equal(result.value.routeCount, 0);
});
test('empty inventory does not invent a missing route', () => {
  assert.deepEqual(coverage({ schemaVersion: 1, capturedOn: DATE, routes: [] }).value.missing, []);
});
test('unknown source observation is not classified as failure', () => {
  const v = report(snapshot());
  assert.equal(v.value.counts.UNKNOWN, 1);
  assert.equal(v.value.counts.FAIL, 0);
});
test('unknowns have an explicit review flag', () => assert.ok(codes(report(snapshot())).includes('UNKNOWN_RESULT')));
test('unknown evidence tiers have separate review flags', () => assert.ok(codes(report(snapshot())).includes('UNKNOWN_TIER')));
test('missing digests have a separate review flag', () => assert.ok(codes(report(snapshot())).includes('MISSING_DIGEST')));
test('documented digest is not reported as missing', () => assert.ok(!flags(check({ digest: HASH })).includes('MISSING_DIGEST')));
test('source age is computed in whole UTC days', () => {
  assert.equal(elapsed('2026-11-20', '2026-11-21'), 1);
  assert.equal(elapsed('2026-11-21', '2026-11-21'), 0);
});
test('source exactly 365 days old has no older-than-year flag', () => {
  assert.equal(flags(check({ retrievedOn: '2025-11-21' })).includes('OLD_EVIDENCE'), false);
});
test('source older than 365 days is flagged for review', () => {
  assert.equal(flags(check({ retrievedOn: '2025-11-20' })).includes('OLD_EVIDENCE'), true);
});
test('malformed date cannot become a valid age', () => assert.equal(elapsed('no date', DATE), null));
test('zero observations leave all six kinds missing in both language views', () => {
  const v = coverage(snapshot(route({ checks: [] }))).value;
  assert.equal(v.missing.filter(x => x.code === 'MISSING_KIND').length, KINDS.length);
  assert.equal(v.missing.filter(x => x.code === 'MISSING_LANGUAGE').length, 1);
});
test('paired route snapshots do not report a missing language', () => {
  const v = coverage(paired()).value;
  assert.equal(v.missing.some(x => x.code === 'MISSING_LANGUAGE'), false);
});
test('paired route snapshots still report missing interaction kinds', () => {
  const v = coverage(paired()).value;
  assert.equal(v.missing.filter(x => x.code === 'MISSING_KIND').length, 10);
});
test('missing target measurements stay UNKNOWN', () => assert.equal(report(snapshot()).value.observations[0].result, UNKNOWN));
test('minimum compliant target is counted as recorded PASS', () => {
  const v = report(snapshot(route({ checks: [measured()] }))).value;
  assert.equal(v.counts.PASS, 1);
  assert.equal(v.byKind['touch-target'].PASS, 1);
});
test('undersized target is counted as recorded FAIL', () => {
  const v = report(snapshot(route({ checks: [measured('touch-target', 'FAIL')] }))).value;
  assert.equal(v.counts.FAIL, 1);
  assert.equal(v.byKind['touch-target'].FAIL, 1);
});
test('an undersized target has a specific review flag', () => {
  assert.ok(flags(measured('touch-target', 'FAIL')).includes('TOUCH_UNDER_44'));
});
test('a recorded FAIL also has a general failure flag', () => {
  assert.ok(flags(measured('touch-target', 'FAIL')).includes('RECORDED_FAILURE'));
});
test('visible focus is not incorrectly flagged', () => {
  assert.equal(flags(measured('focus')).includes('FOCUS_NOT_VISIBLE'), false);
});
test('invisible focus gets its own review flag', () => {
  assert.ok(flags(measured('focus', 'FAIL')).includes('FOCUS_NOT_VISIBLE'));
});
test('keyboard unreachable produces a specific review flag', () => {
  assert.ok(flags(measured('keyboard', 'FAIL')).includes('KEYBOARD_UNREACHABLE'));
});
test('keyboard reachable is not incorrectly flagged', () => {
  assert.equal(flags(measured('keyboard')).includes('KEYBOARD_UNREACHABLE'), false);
});
test('screen reader not announcing produces a flag', () => {
  assert.ok(flags(measured('screen-reader', 'FAIL')).includes('NOT_ANNOUNCED'));
});
test('status message not announcing produces a flag', () => {
  assert.ok(flags(measured('status-message', 'FAIL')).includes('NOT_ANNOUNCED'));
});
test('positive announcement does not produce failure flag', () => {
  assert.equal(flags(measured('status-message')).includes('NOT_ANNOUNCED'), false);
});
test('missing accessible name yields review finding', () => {
  assert.ok(flags(check({ kind: 'accessible-name' })).includes('NO_ACCESSIBLE_NAME'));
});
test('named control does not yield missing name finding', () => {
  assert.equal(flags(measured('accessible-name')).includes('NO_ACCESSIBLE_NAME'), false);
});
test('unknown measured observation does not upgrade itself', () => {
  const v = report(variant({ width: 65, height: 65 }));
  assert.equal(v.value.counts.UNKNOWN, 1);
});
test('counts by language do not mix English and French', () => {
  const v = report(snapshot(route({ checks: [measured()] }), route({ id: 'fr', language: 'fr', checks: [measured('focus', 'FAIL')] }))).value;
  assert.equal(v.byLanguage.en.PASS, 1);
  assert.equal(v.byLanguage.fr.FAIL, 1);
});
test('counts by kind keep six independent buckets', () => {
  const v = report(snapshot(route({ checks: KINDS.map((kind, i) => check({ id: `u${i}`, kind })) }))).value;
  for (const kind of KINDS) assert.equal(v.byKind[kind].UNKNOWN, 1);
});
test('record evidence source is preserved exactly', () => {
  const v = report(variant({ source: 'Sample source 2026', licence: 'CC-BY-4.0' }));
  assert.equal(v.value.observations[0].source, 'Sample source 2026');
  assert.equal(v.value.observations[0].licence, 'CC-BY-4.0');
});
test('record tier is preserved without promotion', () => {
  const v = report(variant({ verificationTier: 'self-reported' }));
  assert.equal(v.value.observations[0].verificationTier, 'self-reported');
});
test('invalid document fails before producing a report', () => {
  const v = analyze({ ...snapshot(), schemaVersion: 4 });
  assert.equal(v.ok, false);
  assert.equal(v.value, undefined);
});
test('index uses language plus path plus check ID', () => {
  const v = index(paired());
  assert.ok(v.has('en|/fictional|fictional-button'));
  assert.ok(v.has('fr|/fictional|fictional-button'));
});
test('index reports all distinct checks in one route', () => {
  const v = index(snapshot(route({ checks: [check(), check({ id: 'another' })] })));
  assert.equal(v.size, 2);
});
test('group sorts paths deterministically', () => {
  const data = snapshot(route({ id: 'z', path: '/z' }), route({ id: 'a', path: '/a' }));
  assert.deepEqual(group(data).map(x => x.path), ['/a', '/z']);
});
test('group sorts locales within the same path', () => {
  assert.deepEqual(group(paired()).map(x => x.language), ['en', 'fr']);
});
test('observations are sorted by stable composite key', () => {
  const data = snapshot(route({ id: 'b', path: '/b' }), route({ id: 'a', path: '/a' }));
  assert.deepEqual(report(data).value.observations.map(x => x.path), ['/a', '/b']);
});
test('review flags are sorted independent of import order', () => {
  const first = snapshot(route({ checks: [check({ id: 'b' }), check({ id: 'a' })] }));
  const second = snapshot(route({ checks: [check({ id: 'a' }), check({ id: 'b' })] }));
  assert.deepEqual(report(first).value.reviews, report(second).value.reviews);
});
test('filtering to language en excludes fr findings', () => {
  const rows = selectReview(report(paired()), { language: 'en' });
  assert.ok(rows.length > 0);
  assert.ok(rows.every(x => x.language === 'en'));
});
test('filtering by check kind returns only relevant flags', () => {
  const rows = selectReview(report(paired()), { kind: 'touch-target' });
  assert.ok(rows.length > 0);
  assert.ok(rows.every(x => x.kind === 'touch-target'));
});
test('filtering by flag code finds unknowns', () => {
  const rows = selectReview(report(snapshot()), { code: 'UNKNOWN_RESULT' });
  assert.equal(rows.length, 1);
});
test('filtering by route path excludes unrelated routes', () => {
  const data = snapshot(route(), route({ id: 'other', path: '/other' }));
  const rows = selectReview(report(data), { path: '/other' });
  assert.ok(rows.length > 0);
  assert.ok(rows.every(x => x.path === '/other'));
});
test('unknown flag is a named supported review code', () => assert.equal(explainIssue('UNKNOWN_RESULT'), 'UNKNOWN_RESULT'));
test('unrecognized review code never becomes a known result', () => assert.deepEqual(explainIssue('CERTIFIED'), { code: 'UNRECOGNISED_REVIEW_CODE', path: 'CERTIFIED' }));
test('review code vocabulary has no duplicates', () => assert.equal(new Set(REVIEW_CODES).size, REVIEW_CODES.length));
test('duplicate observations agreeing do not produce contradictions', () => {
  const data = snapshot(route({ checks: [check(), check({ id: 'other' })] }));
  assert.equal(duplicatesAcrossRoutes(data).length, 0);
});
test('duplicate observations with different outcomes flag conflict', () => {
  const data = snapshot(route({ checks: [measured(), measured('touch-target', 'FAIL')] }));
  const conflicts = duplicatesAcrossRoutes(data);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'CONFLICT');
});
test('cross-language differences are not conflated as conflicts', () => {
  const data = snapshot(route({ checks: [measured()] }), route({ id: 'fr', language: 'fr', checks: [measured('touch-target', 'FAIL')] }));
  assert.equal(duplicatesAcrossRoutes(data).length, 0);
});
test('contradictory observations remain visible in the review queue', () => {
  const data = snapshot(route({ checks: [measured(), measured('touch-target', 'FAIL')] }));
  assert.ok(codes(report(data)).includes('CONFLICT'));
});
test('no external data is ever inferred for an empty route', () => {
  const v = report(snapshot(route({ checks: [] })));
  assert.equal(v.value.checkCount, 0);
  assert.ok(v.value.missing.every(x => x.code.startsWith('MISSING_')));
});
test('report warning explicitly limits the interpretation', () => {
  assert.match(report(snapshot()).value.warning, /not a general accessibility determination/);
});
test('all source rows have provenance in the observation summary', () => {
  const v = report(snapshot());
  const row = v.value.observations[0];
  for (const field of ['source', 'licence', 'retrievedOn', 'verificationTier']) assert.ok(Object.hasOwn(row, field));
});
test('a multi-route report counts each path exactly once', () => {
  const data = snapshot(route(), route({ id: 'fr', language: 'fr' }), route({ id: 'b', path: '/b' }));
  assert.deepEqual(report(data).value.paths, ['/b', '/fictional']);
});
test('invalid source prevents all coverage data', () => {
  const v = coverage(variant({ source: '' }));
  assert.equal(v.ok, false);
  assert.equal(v.value, undefined);
});
test('a route with only an explicitly measured focus check has five other missing kinds', () => {
  const data = snapshot(route({ checks: [measured('focus')] }));
  assert.equal(coverage(data).value.missing.filter(x => x.code === 'MISSING_KIND').length, 5);
});
test('one route absent from another language remains a missing-language flag', () => {
  const data = snapshot(route({ path: '/one' }), route({ id: 'fr', language: 'fr', path: '/two' }));
  assert.equal(coverage(data).value.missing.filter(x => x.code === 'MISSING_LANGUAGE').length, 2);
});
test('source freshness checks use the explicit audit date', () => {
  const older = check({ retrievedOn: '2025-10-01' });
  assert.ok(findingsFor(older, DATE).includes('OLD_EVIDENCE'));
  assert.equal(findingsFor(older, '2025-10-02').includes('OLD_EVIDENCE'), false);
});
test('same route with two kinds is covered in two buckets', () => {
  const data = snapshot(route({ checks: [measured('focus'), measured('keyboard')] }));
  const counts = coverage(data).value.byKind;
  assert.equal(counts.focus.PASS, 1);
  assert.equal(counts.keyboard.PASS, 1);
});

test('explicit failed accessible-name measurement produces missing-name review flag', () => {
  const item = measured('accessible-name', 'FAIL');
  assert.ok(flags(item).includes('NO_ACCESSIBLE_NAME'));
  assert.ok(flags(item).includes('RECORDED_FAILURE'));
});
test('failed accessible-name report stays a recorded failure, not certified route truth', () => {
  const value = report(snapshot(route({ checks: [measured('accessible-name', 'FAIL')] })));
  assert.equal(value.value.counts.FAIL, 1);
  assert.match(value.value.warning, /not a general accessibility determination/);
});
