import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REVIEW_RULES, eventDigest, rulesForSession, assetDependents,
  dependencyCycles, affectedAssets, assetReview, sessionReview,
  releaseReview, comparePriority, phaseCoverage, nextManualReviews,
} from './offline-update-rehearsal-engine.mjs';
import { asset, event, session, document, fixtureWithTwoAssets, outcomesDocument, TODAY, pair } from './offline-update-rehearsal-fixtures.mjs';

const review = value => releaseReview(value, { today: TODAY });
const findings = value => review(value).findings.map(item => item.code);

test('rule list is unique and makes no inferred accessibility claim', () => {
  assert.equal(REVIEW_RULES.length, new Set(REVIEW_RULES).size);
  assert.ok(REVIEW_RULES.includes('KEYBOARD_OPERABLE'));
  assert.ok(REVIEW_RULES.includes('ROLLBACK_USABLE'));
  assert.ok(REVIEW_RULES.includes('LANGUAGE_COVERAGE'));
});
test('same observations produce identical evidence digests', () => {
  assert.equal(eventDigest([event()]), eventDigest([event()]));
  assert.match(eventDigest([event()]), /^[a-f0-9]{64}$/);
});
test('a changed key or note changes the event digest', () => {
  assert.notEqual(eventDigest([event()]), eventDigest([event('event-one', { note: pair('Changed', 'Modifié') })]));
});
test('reordered events change the sequence digest', () => {
  const a = [event('one', { order: 0 }), event('two', { order: 1 })];
  assert.notEqual(eventDigest(a), eventDigest([...a].reverse()));
});
test('no events means no observed release checks', () => {
  const result = rulesForSession(session('empty', { events: [] }));
  assert.equal(result.observedRules, 0);
  assert.equal(result.rules.COMPLETE_TRACE, 'UNKNOWN');
});
test('one unknown shell response never becomes a pass', () => {
  const result = rulesForSession(session());
  assert.equal(result.rules.SHELL_SURVIVES, 'UNKNOWN');
  assert.equal(result.rules.RESTART_USABLE, 'UNKNOWN');
});
test('a failed response blocks the shell rule', () => {
  const result = rulesForSession(session('s', { events: [event('one', { state: 'FAIL' })] }));
  assert.equal(result.rules.SHELL_SURVIVES, 'FAIL');
  assert.ok(result.findings.some(x => x.severity === 'block'));
});
test('mixed pass and unknown evidence retains UNKNOWN', () => {
  const events = [event('one', { state: 'PASS', order: 0 }), event('two', { state: 'UNKNOWN', order: 1 })];
  assert.equal(rulesForSession(session('s', { events })).rules.SHELL_SURVIVES, 'UNKNOWN');
});
test('two pass observations are recorded as PASS for their specific rule', () => {
  const events = [event('one', { state: 'PASS', order: 0 }), event('two', { state: 'PASS', order: 1 })];
  assert.equal(rulesForSession(session('s', { events })).rules.SHELL_SURVIVES, 'PASS');
});
test('recorded errors are blocking findings only when explicitly FAIL', () => {
  const failed = rulesForSession(session('s', { events: [event('err', { kind: 'error', state: 'FAIL' })] }));
  const unknown = rulesForSession(session('s', { events: [event('err', { kind: 'error', state: 'UNKNOWN' })] }));
  assert.ok(failed.findings.some(x => x.code === 'RECORDED_ERROR'));
  assert.ok(!unknown.findings.some(x => x.code === 'RECORDED_ERROR'));
});
test('PASS outcome contradicts recorded failure', () => {
  const result = rulesForSession(session('s', { outcome: 'PASS', events: [event('e', { state: 'FAIL' })] }));
  assert.ok(result.findings.some(x => x.code === 'OUTCOME_CONTRADICTS_TRACE'));
});
test('FAIL outcome without failed events requires a manual explanation', () => {
  const result = rulesForSession(session('s', { outcome: 'FAIL' }));
  assert.ok(result.findings.some(x => x.code === 'UNEXPLAINED_FAILURE'));
});
test('asset reverse dependencies point toward dependents', () => {
  const reverse = assetDependents(fixtureWithTwoAssets().assets);
  assert.deepEqual([...reverse.get('shell')], ['fonts']);
  assert.equal(reverse.get('fonts').size, 0);
});
test('asset dependency cycles are absent from an acyclic graph', () => {
  assert.deepEqual(dependencyCycles(fixtureWithTwoAssets().assets), []);
});
test('self dependency is detected structurally', () => {
  assert.ok(dependencyCycles([asset('a', { dependsOn: ['a'] })]).length > 0);
});
test('multi-item dependency cycle is detected without recursive calls', () => {
  const assets = [asset('a', { dependsOn: ['b'] }), asset('b', { dependsOn: ['c'] }), asset('c', { dependsOn: ['a'] })];
  assert.deepEqual(dependencyCycles(assets)[0], ['a', 'b', 'c', 'a']);
});
test('large acyclic dependency chain completes iteratively', () => {
  const assets = Array.from({ length: 1500 }, (_, index) => asset(`a${index}`, {
    dependsOn: index ? [`a${index-1}`] : [],
  }));
  assert.deepEqual(dependencyCycles(assets), []);
});
test('affected assets includes transitive descendants and the seed', () => {
  const assets = [asset('a'), asset('b', { dependsOn: ['a'] }), asset('c', { dependsOn: ['b'] })];
  assert.deepEqual(affectedAssets(assets, ['a']), ['a', 'b', 'c']);
});
test('affected assets does not invent absent asset IDs', () => {
  assert.deepEqual(affectedAssets(fixtureWithTwoAssets().assets, ['missing']), []);
});
test('affected assets is stable if dependencies are listed in reverse order', () => {
  const assets = [asset('c', { dependsOn: ['a', 'b'] }), asset('b'), asset('a')];
  assert.deepEqual(affectedAssets(assets, ['b', 'a']), ['a', 'b', 'c']);
});
test('an asset explicitly marked FAIL creates a blocking finding', () => {
  assert.ok(assetReview([asset('a', { state: 'FAIL' })]).some(item => item.severity === 'block'));
});
test('an UNKNOWN asset creates a review item rather than a PASS', () => {
  assert.ok(assetReview([asset()]).some(item => item.code === 'ASSET_UNKNOWN'));
});
test('large JavaScript asset trips the existing per-chunk budget', () => {
  const issues = assetReview([asset('chunk', { bytes: 524_289 })]);
  assert.ok(issues.some(item => item.code === 'SCRIPT_CHUNK_BUDGET'));
});
test('asset exactly at the chunk boundary is accepted by budget check', () => {
  const issues = assetReview([asset('chunk', { bytes: 524_288 })]);
  assert.ok(!issues.some(item => item.code === 'SCRIPT_CHUNK_BUDGET'));
});
test('non-script assets do not receive the script-specific size check', () => {
  const issues = assetReview([asset('font', { path: 'fonts/file.woff2', bytes: 524_289 })]);
  assert.ok(!issues.some(item => item.code === 'SCRIPT_CHUNK_BUDGET'));
});
test('single-session review includes its complete source metadata', () => {
  const result = sessionReview(session());
  assert.equal(result.evidence.source, 'https://example.org/synthetic');
  assert.equal(result.evidence.licence, 'CC0-1.0');
  assert.equal(result.evidence.retrievedOn, TODAY);
  assert.equal(result.evidence.tier, 0);
});
test('single-session review does not modify incoming events', () => {
  const input = session();
  const original = JSON.stringify(input);
  sessionReview(input);
  assert.equal(JSON.stringify(input), original);
});
test('unknown session is explicitly reported as UNKNOWN', () => {
  const result = sessionReview(session());
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.recorded, 'UNKNOWN');
});
test('a recorded failure stays FAIL despite other unknown rules', () => {
  assert.equal(sessionReview(session('s', { outcome: 'FAIL' })).state, 'FAIL');
});
test('a contradictory PASS outcome is reported as FAIL', () => {
  const result = sessionReview(session('s', { outcome: 'PASS', events: [event('x', { state: 'FAIL' })] }));
  assert.equal(result.state, 'FAIL');
});
test('the release review preserves unknown totals', () => {
  const result = review(document());
  assert.equal(result.ok, true);
  assert.equal(result.summary.unknown, 1);
  assert.equal(result.summary.assetUnknown, 1);
  assert.equal(result.summary.state, 'UNKNOWN');
});
test('invalid release has no summary or derived sessions', () => {
  const result = review(document({ version: 2 }));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.deepEqual(result.sessions, []);
});
test('out-of-order input sessions have stable release fingerprints', () => {
  const a = session('a');
  const b = session('b');
  const one = review(document({ sessions: [b, a] }));
  const two = review(document({ sessions: [a, b] }));
  assert.equal(one.fingerprint, two.fingerprint);
});
test('recorded outcome change modifies release fingerprint', () => {
  assert.notEqual(review(document()).fingerprint, review(outcomesDocument('FAIL')).fingerprint);
});
test('outcome comparison distinguishes regression from improvement', () => {
  assert.equal(comparePriority('PASS', 'FAIL'), 'regressed');
  assert.equal(comparePriority('FAIL', 'PASS'), 'improved-record');
  assert.equal(comparePriority('PASS', 'UNKNOWN'), 'evidence-missing');
  assert.equal(comparePriority('UNKNOWN', 'PASS'), 'requires-review');
  assert.equal(comparePriority('UNKNOWN', 'UNKNOWN'), 'unchanged');
});
test('phase matrix includes all pairs of language and connectivity', () => {
  const result = phaseCoverage(document(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 8 * 2 * 2);
});
test('missing phase combinations stay UNKNOWN', () => {
  const rows = phaseCoverage(document()).rows;
  assert.ok(rows.some(row => row.locale === 'fr' && row.state === 'UNKNOWN' && row.count === 0));
});
test('a supplied phase does not count toward a different network state', () => {
  const rows = phaseCoverage(document()).rows;
  assert.equal(rows.find(row => row.phase === 'restart-offline' && row.locale === 'en' && row.network === 'online').count, 0);
});
test('a source-backed unknown session is still a manual review task', () => {
  const result = nextManualReviews(document());
  assert.equal(result.ok, true);
  assert.equal(result.work.length, 1);
  assert.equal(result.work[0].outcome, 'UNKNOWN');
  assert.equal(result.work[0].source, 'https://example.org/synthetic');
});
test('no invented manual tasks when there are no sessions', () => {
  assert.deepEqual(nextManualReviews(document({ sessions: [] })).work, []);
});
test('invalid document does not produce review tasks', () => {
  const result = nextManualReviews({});
  assert.equal(result.ok, false);
  assert.deepEqual(result.work, []);
});
test('asset fail drives overall FAIL even if session outcome stays unknown', () => {
  const data = document({ assets: [asset('shell', { state: 'FAIL' })] });
  assert.equal(review(data).summary.state, 'FAIL');
  assert.ok(findings(data).includes('ASSET_FAILURE'));
});
test('release findings include nonpassing rule identifiers for review', () => {
  const result = review(document());
  assert.ok(result.findings.some(item => item.path.includes('SHELL_SURVIVES')));
});
