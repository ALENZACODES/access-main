import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRIAGE_VERSION, TRIAGE_STATUS, impactIdentity, buildTriageQueue,
  validateTriageQueue, transitionTriage, reconcileTriage,
  summarizeTriage, queryTriage,
} from './offline-impact-triage.mjs';
import { IMPACT_VERSION } from './offline-impact-plan.mjs';

const DATE = '2026-11-19';
function impact(id = 'review-1', state = 'UNKNOWN', overrides = {}) {
  return { id, recordId: 'sample-record', claimKey: 'stepFreeEntrance', state,
    reason: 'NEW_REVIEW_ITEM', level: 'review', path: '/items',
    before: null, after: null, action: 'HUMAN_REVIEW_REQUIRED', ...overrides };
}
function packet(...impacts) { return { version: IMPACT_VERSION, impacts }; }
function queue(...impacts) {
  const result = buildTriageQueue(packet(...impacts));
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  return result.queue;
}
function issues(result) { return result.problems.map((entry) => entry.code); }
function event(current, key, action, on = DATE, note = '') {
  return transitionTriage(current, key, action, on, note);
}
function advance(current, key, action, on = DATE, note = '') {
  const result = event(current, key, action, on, note);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  return result.queue;
}

test('triage vocabulary is stable and contains only workflow statuses', () => {
  assert.equal(TRIAGE_VERSION, 1);
  assert.deepEqual(TRIAGE_STATUS, ['open', 'deferred', 'resolved']);
});

test('impact identity is deterministic across object insertion order', () => {
  const first = impact();
  const second = { path: first.path, reason: first.reason, id: first.id };
  assert.equal(impactIdentity(first), impactIdentity(second));
});

test('empty packet becomes an empty valid triage queue', () => {
  const result = buildTriageQueue(packet());
  assert.equal(result.ok, true);
  assert.deepEqual(result.queue, { version: TRIAGE_VERSION, items: [] });
  assert.equal(validateTriageQueue(result.queue).ok, true);
});

test('invalid packet never becomes review tasks', () => {
  const result = buildTriageQueue({ version: 2, impacts: [] });
  assert.equal(result.ok, false);
  assert.equal(result.queue, null);
});

test('packet conversion preserves claim and provenance paths', () => {
  const original = impact('review-a');
  const result = buildTriageQueue(packet(original));
  assert.equal(result.queue.items[0].recordId, original.recordId);
  assert.equal(result.queue.items[0].claimKey, original.claimKey);
  assert.equal(result.queue.items[0].state, 'UNKNOWN');
  assert.equal(result.queue.items[0].sourcePath, '/items');
});

test('task identifiers sort independent of packet order', () => {
  const left = queue(impact('z'), impact('a'));
  const right = queue(impact('a'), impact('z'));
  assert.deepEqual(left, right);
});

test('all incoming tasks begin open and have no fabricated review events', () => {
  const result = queue(impact('a'), impact('b'));
  assert.ok(result.items.every((item) => item.status === 'open'));
  assert.ok(result.items.every((item) => item.history.length === 0));
});

test('source loss begins with blocking level', () => {
  const loss = impact('lost', 'UNKNOWN', {
    reason: 'SOURCE_REMOVED', level: 'block', path: '/provenance/source' });
  const current = queue(loss);
  assert.equal(current.items[0].level, 'block');
});

test('invalid externally supplied queue version is rejected', () => {
  const original = queue(impact());
  assert.ok(issues(validateTriageQueue({ ...original, version: 8 })).includes('QUEUE_INVALID'));
});

test('invalid task states are rejected', () => {
  const original = queue(impact());
  original.items[0].state = 'inferred';
  assert.ok(issues(validateTriageQueue(original)).includes('STATE_INVALID'));
});

test('queue cannot contain duplicate review keys', () => {
  const original = queue(impact());
  original.items.push({ ...original.items[0], history: [] });
  assert.ok(issues(validateTriageQueue(original)).includes('DUPLICATE_KEY'));
});

test('queue cannot contain malformed history', () => {
  const original = queue(impact());
  original.items[0].history = [{ action: 'unknown-action', on: DATE, note: '' }];
  assert.ok(issues(validateTriageQueue(original)).includes('HISTORY_EVENT_INVALID'));
});

test('queue does not tolerate inconsistent reported status', () => {
  const original = queue(impact());
  original.items[0].status = 'resolved';
  assert.ok(issues(validateTriageQueue(original)).includes('STATUS_HISTORY_MISMATCH'));
});

test('queue validates history date ordering', () => {
  let original = queue(impact());
  const key = original.items[0].key;
  original = advance(original, key, 'defer', '2026-11-18');
  original = advance(original, key, 'reopen', '2026-11-19');
  original.items[0].history[1].on = '2026-11-17';
  assert.ok(issues(validateTriageQueue(original)).includes('HISTORY_OUT_OF_ORDER'));
});

test('defer transition keeps claim state unchanged', () => {
  const original = queue(impact());
  const updated = advance(original, original.items[0].key, 'defer');
  assert.equal(updated.items[0].status, 'deferred');
  assert.equal(updated.items[0].state, 'UNKNOWN');
});

test('resolved review is not a confirmation of accessibility', () => {
  const original = queue(impact());
  const updated = advance(original, original.items[0].key, 'resolve');
  assert.equal(updated.items[0].status, 'resolved');
  assert.equal(updated.items[0].state, 'UNKNOWN');
});

test('deferred task may be explicitly reopened', () => {
  const original = queue(impact());
  const key = original.items[0].key;
  const deferred = advance(original, key, 'defer');
  const reopened = advance(deferred, key, 'reopen');
  assert.equal(reopened.items[0].status, 'open');
  assert.deepEqual(reopened.items[0].history.map((entry) => entry.action), ['defer', 'reopen']);
});

test('resolved task may be reopened for additional evidence', () => {
  const original = queue(impact());
  const key = original.items[0].key;
  const resolved = advance(original, key, 'resolve');
  const reopened = advance(resolved, key, 'reopen');
  assert.equal(reopened.items[0].status, 'open');
});

test('open task cannot be reopened without intervening closure', () => {
  const original = queue(impact());
  const result = event(original, original.items[0].key, 'reopen');
  assert.equal(result.ok, false);
  assert.ok(issues(result).includes('TRANSITION_DENIED'));
});

test('deferred task cannot resolve without reopening', () => {
  const original = queue(impact());
  const key = original.items[0].key;
  const deferred = advance(original, key, 'defer');
  const result = event(deferred, key, 'resolve');
  assert.equal(result.ok, false);
  assert.ok(issues(result).includes('TRANSITION_DENIED'));
});

test('resolved task cannot resolve a second time', () => {
  const original = queue(impact());
  const key = original.items[0].key;
  const resolved = advance(original, key, 'resolve');
  const result = event(resolved, key, 'resolve');
  assert.equal(result.ok, false);
});

test('backdated transition fails without altering current queue', () => {
  const original = queue(impact());
  const key = original.items[0].key;
  const deferred = advance(original, key, 'defer', DATE);
  const result = event(deferred, key, 'reopen', '2026-11-18');
  assert.equal(result.ok, false);
  assert.equal(result.queue, deferred);
  assert.ok(issues(result).includes('EVENT_OUT_OF_ORDER'));
});

test('missing task is not created by a review action', () => {
  const original = queue(impact());
  const result = event(original, 'not-in-queue', 'defer');
  assert.equal(result.ok, false);
  assert.ok(issues(result).includes('ITEM_NOT_FOUND'));
  assert.equal(result.queue, original);
});

test('invalid calendar dates cannot be stored as history', () => {
  const original = queue(impact());
  for (const day of ['2026-02-30', 'tomorrow', '2026-11-1']) {
    const result = event(original, original.items[0].key, 'defer', day);
    assert.equal(result.ok, false, day);
    assert.ok(issues(result).includes('ACTION_INVALID'));
  }
});

test('large and markup-like notes are refused', () => {
  const original = queue(impact());
  const key = original.items[0].key;
  for (const note of ['x'.repeat(1025), '<script>alert(1)</script>', 'hello\nworld']) {
    const result = event(original, key, 'defer', DATE, note);
    assert.equal(result.ok, false, note.slice(0, 40));
  }
});

test('short ordinary notes can be stored without personal fields', () => {
  const original = queue(impact());
  const result = event(original, original.items[0].key, 'defer', DATE, 'Waiting for citation');
  assert.equal(result.ok, true);
  assert.equal(result.queue.items[0].history[0].note, 'Waiting for citation');
});

test('transition does not mutate its input queue', () => {
  const original = queue(impact());
  const snapshot = structuredClone(original);
  advance(original, original.items[0].key, 'resolve');
  assert.deepEqual(original, snapshot);
});

test('valid packet replay retains previous human decisions', () => {
  const original = queue(impact());
  const key = original.items[0].key;
  const deferred = advance(original, key, 'defer');
  const result = reconcileTriage(deferred, packet(impact()));
  assert.equal(result.ok, true);
  assert.equal(result.queue.items[0].status, 'deferred');
  assert.deepEqual(result.reopened, []);
});

test('new task is explicitly returned as reopened review work', () => {
  const previous = queue(impact('a'));
  const result = reconcileTriage(previous, packet(impact('a'), impact('b')));
  assert.equal(result.ok, true);
  assert.equal(result.reopened.length, 1);
  assert.equal(result.queue.items.length, 2);
});

test('changed claim state forces new review instead of retaining closure', () => {
  const original = queue(impact('a', 'UNKNOWN'));
  const closed = advance(original, original.items[0].key, 'resolve');
  const result = reconcileTriage(closed, packet(impact('a', 'YES')));
  assert.equal(result.ok, true);
  assert.equal(result.queue.items[0].status, 'open');
  assert.deepEqual(result.queue.items[0].history, []);
});

test('changed impact level forces a new human review', () => {
  const original = queue(impact());
  const deferred = advance(original, original.items[0].key, 'defer');
  const result = reconcileTriage(deferred,
    packet(impact('review-1', 'UNKNOWN', { level: 'block' })));
  assert.equal(result.ok, false);
});

test('reconcile rejects invalid previous history', () => {
  const original = queue(impact());
  original.items[0].history = [{ action: 'resolve', on: 'not-a-day' }];
  const result = reconcileTriage(original, packet(impact()));
  assert.equal(result.ok, false);
  assert.equal(result.queue, null);
});

test('reconcile rejects invalid new packet', () => {
  const original = queue(impact());
  const result = reconcileTriage(original, { version: -1, impacts: [] });
  assert.equal(result.ok, false);
});

test('summary separates workflow from the underlying claim states', () => {
  let original = queue(impact('a', 'YES'), impact('b', 'NO'), impact('c', 'UNKNOWN'));
  const first = original.items[0].key;
  original = advance(original, first, 'resolve');
  const summary = summarizeTriage(original);
  assert.equal(summary.summary.total, 3);
  assert.equal(summary.summary.UNKNOWN, 1);
  assert.equal(summary.summary.byStatus.resolved, 1);
});

test('blocking unresolved work is counted independently', () => {
  const first = impact('a', 'UNKNOWN', {
    reason: 'SOURCE_REMOVED', level: 'block', path: '/provenance/source' });
  const original = queue(first, impact('b'));
  const before = summarizeTriage(original).summary;
  assert.equal(before.blockedOpen, 1);
  const afterQueue = advance(original, original.items[0].key, 'resolve');
  assert.equal(summarizeTriage(afterQueue).summary.blockedOpen, 0);
});

test('invalid queue never returns a misleading summary', () => {
  assert.equal(summarizeTriage({ version: -1, items: [] }).summary, null);
});

test('query supports filtering by each workflow status', () => {
  let original = queue(impact('a'), impact('b'));
  original = advance(original, original.items[0].key, 'defer');
  const filtered = queryTriage(original, { status: 'deferred' });
  assert.equal(filtered.ok, true);
  assert.equal(filtered.items.length, 1);
});

test('query supports filtering by original claim state', () => {
  const original = queue(impact('a', 'UNKNOWN'), impact('b', 'YES'));
  const filtered = queryTriage(original, { state: 'UNKNOWN' });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].state, 'UNKNOWN');
});

test('query supports filtering by review priority', () => {
  const blocked = impact('a', 'UNKNOWN', {
    reason: 'SOURCE_REMOVED', level: 'block', path: '/provenance/source' });
  const original = queue(blocked, impact('b'));
  assert.equal(queryTriage(original, { level: 'block' }).items.length, 1);
});

test('query supports filtering by change reason', () => {
  const original = queue(impact('a'), impact('b', 'UNKNOWN', {
    reason: 'CLAIM_CHANGED' }));
  const result = queryTriage(original, { reason: 'CLAIM_CHANGED' });
  assert.equal(result.items.length, 1);
});

test('query caps result size with a validated positive limit', () => {
  const original = queue(impact('a'), impact('b'), impact('c'));
  assert.equal(queryTriage(original, { limit: 2 }).items.length, 2);
});

test('query rejects zero, negative and fractional limits', () => {
  const original = queue(impact());
  for (const limit of [0, -1, 1.5, 1001]) {
    assert.equal(queryTriage(original, { limit }).ok, false);
  }
});

test('query refuses unsupported statuses and unknown states', () => {
  const original = queue(impact());
  assert.ok(issues(queryTriage(original, { status: 'automatically-approved' })).includes('FILTER_STATUS'));
  assert.ok(issues(queryTriage(original, { state: 'probably' })).includes('FILTER_STATE'));
});

test('query result is a defensive copy of entries and their history', () => {
  const original = queue(impact());
  const result = queryTriage(original);
  result.items[0].state = 'YES';
  result.items[0].history.push({ action: 'resolve', on: DATE });
  assert.equal(original.items[0].state, 'UNKNOWN');
  assert.equal(original.items[0].history.length, 0);
});

test('reconciling the same packet twice is deterministic', () => {
  const original = queue(impact('a'), impact('b'));
  const first = reconcileTriage(original, packet(impact('a'), impact('b')));
  const second = reconcileTriage(original, packet(impact('b'), impact('a')));
  assert.deepEqual(first, second);
});

test('triage never creates timers, scheduling metadata or network connections', () => {
  const original = queue(impact());
  const encoded = JSON.stringify(original);
  for (const field of ['scheduledAt', 'cron', 'notify', 'webhook', 'email']) {
    assert.equal(encoded.includes(`"${field}"`), false);
  }
});
