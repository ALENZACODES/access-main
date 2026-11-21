import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAN_VERSION, REVIEW_SCOPES, PLAN_DECISIONS,
  activeIncidentItems, readinessByScope, reviewWorklist, sourceReviewIndex,
  sourceWithdrawalImpact, incidentReleaseDecision, releaseRegressionDecision,
  planReviewBatches,
} from './offline-release-incident-plan.mjs';
import { transitionIncident } from './offline-release-incidents.mjs';
import { fixtureIncident, fixtureSource, fixtureRegister, TODAY, clone } from './offline-release-incident-fixtures.mjs';

const make = (...items) => fixtureRegister(...items);
const ids = (result) => result.items.map((item) => item.id);

test('planning vocabulary has a version and supported scopes', () => {
  assert.equal(PLAN_VERSION, 1);
  assert.equal(new Set(REVIEW_SCOPES).size, REVIEW_SCOPES.length);
  assert.equal(new Set(PLAN_DECISIONS).size, PLAN_DECISIONS.length);
  assert.ok(REVIEW_SCOPES.includes('overall'));
  assert.ok(REVIEW_SCOPES.includes('screen-reader'));
  assert.ok(PLAN_DECISIONS.includes('REVIEW_REQUIRED'));
});

test('empty register yields no work, not an accessibility certification', () => {
  const result = readinessByScope(make());
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'NO_OPEN_ITEMS');
  assert.equal(result.scopes.overall.open, 0);
  assert.equal(result.claimState, 'UNKNOWN');
});

test('active incident is prioritized for review', () => {
  const result = readinessByScope(make(fixtureIncident()));
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'REVIEW_REQUIRED');
  assert.equal(result.scopes.overall.open, 1);
  assert.equal(result.scopes.keyboard.moderate, 1);
  assert.equal(result.scopes.keyboard.needsHumanReview, true);
});

test('critical incidents appear before other severities', () => {
  const register = make(
    fixtureIncident('low', { severity: 'low' }),
    fixtureIncident('high', { severity: 'high' }),
    fixtureIncident('critical', { severity: 'critical' }),
    fixtureIncident('moderate', { severity: 'moderate' }),
  );
  const result = activeIncidentItems(register);
  assert.deepEqual(ids(result), ['critical', 'high', 'moderate', 'low']);
});

test('equal severity sorts by area and identifier', () => {
  const register = make(
    fixtureIncident('z', { area: 'keyboard' }),
    fixtureIncident('a', { area: 'keyboard' }),
    fixtureIncident('x', { area: 'focus' }),
  );
  assert.deepEqual(ids(activeIncidentItems(register)), ['x', 'a', 'z']);
});

test('open incidents are included, resolved incidents excluded', () => {
  const first = fixtureIncident('a');
  const triaged = transitionIncident(make(first), 'a', 'triage', TODAY, ['source-1']).register;
  const resolved = transitionIncident(triaged, 'a', 'resolve', TODAY, ['source-1']).register;
  const original = make(fixtureIncident('b'), resolved.incidents[0]);
  assert.deepEqual(ids(activeIncidentItems(original)), ['b']);
});

test('blocked review remains in active worklist', () => {
  const original = make(fixtureIncident('block-me'));
  const blocked = transitionIncident(original, 'block-me', 'block', TODAY, ['source-1']).register;
  const result = readinessByScope(blocked);
  assert.equal(result.scopes.overall.blocked, 1);
  assert.equal(result.scopes.keyboard.open, 1);
});

test('missing provenance prevents planning', () => {
  const broken = make(fixtureIncident('a', { sources: [] }));
  const result = activeIncidentItems(broken);
  assert.equal(result.ok, false);
  assert.equal(result.items.length, 0);
});

test('a non-UNKNOWN claim state prevents work planning', () => {
  const broken = make(fixtureIncident('a', { claimState: 'YES' }));
  const result = readinessByScope(broken);
  assert.equal(result.ok, false);
  assert.equal(result.scopes, null);
  assert.equal(result.decision, 'INVALID_INPUT');
});

test('active items retain evidence references', () => {
  const result = activeIncidentItems(make(fixtureIncident()));
  assert.deepEqual(result.items[0].sourceRefs, ['source-1']);
  assert.equal(result.items[0].retrievedOn, TODAY);
  assert.equal(result.items[0].claimState, 'UNKNOWN');
});

test('worklist filter accepts one area', () => {
  const result = reviewWorklist(make(
    fixtureIncident('first', { area: 'keyboard' }),
    fixtureIncident('second', { area: 'focus' }),
  ), { area: 'focus' });
  assert.deepEqual(ids(result), ['second']);
  assert.equal(result.total, 1);
});

test('worklist filter accepts one severity', () => {
  const result = reviewWorklist(make(
    fixtureIncident('first', { severity: 'low' }),
    fixtureIncident('second', { severity: 'critical' }),
  ), { severity: 'critical' });
  assert.deepEqual(ids(result), ['second']);
});

test('worklist filter accepts one review status', () => {
  const original = make(fixtureIncident('first'), fixtureIncident('second'));
  const triaged = transitionIncident(original, 'first', 'triage', TODAY, ['source-1']).register;
  const result = reviewWorklist(triaged, { status: 'triaged' });
  assert.deepEqual(ids(result), ['first']);
});

test('worklist rejects unknown area values', () => {
  const result = reviewWorklist(make(fixtureIncident()), { area: 'unknown-area' });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((item) => item.code === 'AREA_INVALID'));
});

test('worklist rejects unknown severity values', () => {
  const result = reviewWorklist(make(fixtureIncident()), { severity: 'urgent' });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((item) => item.code === 'SEVERITY_INVALID'));
});

test('worklist rejects unsupported statuses', () => {
  const result = reviewWorklist(make(fixtureIncident()), { status: 'forgotten' });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((item) => item.code === 'STATUS_INVALID'));
});

test('worklist rejects invalid pagination inputs', () => {
  const source = make(fixtureIncident());
  for (const options of [{ from: -1 }, { limit: 0 }, { limit: 501 }, { from: 2.4 }, { limit: 3.5 }]) {
    const result = reviewWorklist(source, options);
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.ok(result.problems.some((item) => item.code === 'PAGE_INVALID'));
  }
});

test('worklist pagination returns deterministic follow-up', () => {
  const source = make(...['a', 'b', 'c', 'd', 'e'].map((id) => fixtureIncident(id)));
  const first = reviewWorklist(source, { limit: 2 });
  assert.deepEqual(ids(first), ['a', 'b']);
  assert.equal(first.next, 2);
  assert.equal(first.total, 5);
  const second = reviewWorklist(source, { from: 2, limit: 2 });
  assert.deepEqual(ids(second), ['c', 'd']);
  assert.equal(second.next, 4);
  const third = reviewWorklist(source, { from: 4, limit: 2 });
  assert.deepEqual(ids(third), ['e']);
  assert.equal(third.next, null);
});

test('source index tracks all incidents citing one URL', () => {
  const source = make(fixtureIncident('a'), fixtureIncident('b'));
  const result = sourceReviewIndex(source);
  assert.equal(result.ok, true);
  assert.equal(result.index.length, 1);
  assert.deepEqual(result.index[0].incidents.map((item) => item.id), ['a', 'b']);
});

test('source index retains per-record licences and tiers', () => {
  const source = make(fixtureIncident());
  const result = sourceReviewIndex(source);
  assert.equal(result.index[0].incidents[0].licence, 'CC0-1.0');
  assert.equal(result.index[0].incidents[0].tier, 0);
  assert.equal(result.index[0].incidents[0].retrievedOn, TODAY);
});

test('source index output is deterministic across incident ordering', () => {
  const a = make(fixtureIncident('b'), fixtureIncident('a'));
  const b = make(fixtureIncident('a'), fixtureIncident('b'));
  assert.deepEqual(sourceReviewIndex(a), sourceReviewIndex(b));
});

test('source withdrawal reports affected records without changing them', () => {
  const source = make(fixtureIncident('a'), fixtureIncident('b'));
  const result = sourceWithdrawalImpact(source, 'https://example.org/source-1');
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.needsHumanReview, true);
  assert.equal(result.claimState, 'UNKNOWN');
  assert.equal(source.incidents[0].claimState, 'UNKNOWN');
});

test('unknown source is not treated as proof of safety', () => {
  const result = sourceWithdrawalImpact(make(fixtureIncident()), 'https://example.org/missing');
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  assert.equal(result.needsHumanReview, false);
  assert.equal(result.claimState, 'UNKNOWN');
});

test('source withdrawal rejects malformed identifiers', () => {
  for (const source of ['', 'http://example.org', 'not-a-url', null]) {
    const result = sourceWithdrawalImpact(make(fixtureIncident()), source);
    assert.equal(result.ok, false);
  }
});

test('source index tracks distinct URLs separately', () => {
  const second = fixtureIncident('second', {
    sources: [fixtureSource('source-2')], sourceRefs: ['source-2'],
  });
  const result = sourceReviewIndex(make(fixtureIncident(), second));
  assert.equal(result.index.length, 2);
  assert.deepEqual(result.index.map((item) => item.source), [
    'https://example.org/source-1', 'https://example.org/source-2',
  ]);
});

test('decision on empty review set stays administrative only', () => {
  const result = incidentReleaseDecision(make());
  assert.equal(result.decision, 'NO_OPEN_ITEMS');
  assert.equal(result.disclaimer, 'NO_ACCESSIBILITY_CERTIFICATION');
  assert.equal(result.claimState, 'UNKNOWN');
});

test('decision with active incident requires review', () => {
  const result = incidentReleaseDecision(make(fixtureIncident()));
  assert.equal(result.decision, 'REVIEW_REQUIRED');
  assert.deepEqual(result.reasons, ['OPEN_MODERATE_INCIDENT']);
});

test('critical and blocked incident yields separate reasons', () => {
  const source = make(fixtureIncident('a', { severity: 'critical' }));
  const blocked = transitionIncident(source, 'a', 'block', TODAY, ['source-1']).register;
  const result = incidentReleaseDecision(blocked);
  assert.ok(result.reasons.includes('OPEN_CRITICAL_INCIDENT'));
  assert.ok(result.reasons.includes('BLOCKED_INCIDENT'));
});

test('decision includes deterministic optimistic-concurrency fingerprint', () => {
  const first = incidentReleaseDecision(make(fixtureIncident('b'), fixtureIncident('a')));
  const second = incidentReleaseDecision(make(fixtureIncident('a'), fixtureIncident('b')));
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^sha256:[0-9a-f]{64}$/u);
});

test('invalid register cannot provide a ready decision', () => {
  const result = incidentReleaseDecision(make(fixtureIncident('a', { sources: [] })));
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'INVALID_INPUT');
});

test('release regression catches newly severe incident', () => {
  const result = releaseRegressionDecision(make(),
    make(fixtureIncident('high', { severity: 'high' })));
  assert.equal(result.decision, 'REVIEW_REQUIRED');
  assert.ok(result.reasons.some((item) => item.includes('NEW_SEVERE_INCIDENT')));
});

test('release regression without new concerns stays administrative', () => {
  const result = releaseRegressionDecision(make(), make());
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'NO_OPEN_ITEMS');
  assert.equal(result.claimState, 'UNKNOWN');
});

test('release regression fails if previous evidence is invalid', () => {
  const invalid = make(fixtureIncident('a', { sourceRefs: [] }));
  const result = releaseRegressionDecision(invalid, make());
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'INVALID_INPUT');
});

test('batches sort by severity and preserve source claim state', () => {
  const register = make(...['low', 'high', 'critical'].map((id) =>
    fixtureIncident(id, { severity: id })));
  const result = planReviewBatches(register, { batchSize: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.batches[0].ids, ['critical', 'high']);
  assert.deepEqual(result.batches[1].ids, ['low']);
  assert.equal(result.batches[0].state, 'UNKNOWN');
});

test('batch size input must be a safe bounded integer', () => {
  const register = make(fixtureIncident());
  for (const value of [0, -1, 101, 1.2, '1']) {
    const result = planReviewBatches(register, { batchSize: value });
    assert.equal(result.ok, false, String(value));
    assert.ok(result.problems.some((item) => item.code === 'BATCH_SIZE'));
  }
});

test('batches never include resolved incidents', () => {
  const start = make(fixtureIncident('a'), fixtureIncident('b'));
  const triaged = transitionIncident(start, 'a', 'triage', TODAY, ['source-1']).register;
  const resolved = transitionIncident(triaged, 'a', 'resolve', TODAY, ['source-1']).register;
  const result = planReviewBatches(resolved, { batchSize: 1 });
  assert.deepEqual(result.batches.map((item) => item.ids), [['b']]);
});

test('planning cannot alter input record ordering', () => {
  const original = make(fixtureIncident('z'), fixtureIncident('a'));
  const copy = clone(original);
  planReviewBatches(original);
  assert.deepEqual(original, copy);
});
