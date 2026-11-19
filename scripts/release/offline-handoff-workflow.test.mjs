import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGAL_TRANSITIONS, DEFAULT_REVIEW, compareIds, sortById, eventSequence,
  allowedTransition, replayReviews, reviewCounts, filterReviews, priorityOrder,
  triageReviews, appendReviewEvent, identifyChanges, compareHandoffReviews,
  mergeHandoffs, groupReviewsByRecord, sourceCoverage, reviewReadiness,
  constructReviewEvent, explainReviewState, selectNextReview,
  reviewAuditTrail, allStatesUnmodified, reviewConflicts, reviewDigest,
  reassessAll,
} from './offline-handoff-workflow.mjs';

const source = (id = 's1') => ({ id, title: 'Synthetic reference',
  url: `https://example.org/${id}`, licence: 'CC0-1.0',
  retrievedOn: '2026-11-19', tier: 0 });
const claim = (id = 'c1', state = 'UNKNOWN', recordId = 'r1') => ({
  id, recordId, field: 'stepFreeEntrance', state,
  label: { en: 'Synthetic unknown', fr: 'Information inconnue' }, sourceIds: ['s1'],
});
const event = (id, decision, on = '2026-11-19', claimId = 'c1', priority = 'NORMAL') =>
  ({ id, on, claimId, decision, priority });
const packet = () => ({ version: 1, sources: [source()], claims: [claim()], events: [] });
const codes = (result) => result.issues.map((issue) => issue.code);

test('workflow state vocabulary never intersects physical states', () => {
  assert.ok(Object.hasOwn(LEGAL_TRANSITIONS, 'PENDING'));
  assert.equal(DEFAULT_REVIEW.decision, 'PENDING');
  assert.equal(DEFAULT_REVIEW.priority, 'NORMAL');
  assert.equal(LEGAL_TRANSITIONS.UNKNOWN, undefined);
});

test('comparison orders IDs without locale dependence', () => {
  assert.equal(compareIds('a', 'b'), -1);
  assert.equal(compareIds('b', 'a'), 1);
  assert.equal(compareIds('a', 'a'), 0);
  assert.deepEqual(sortById([{ id: 'z' }, { id: 'a' }]).map((x) => x.id), ['a', 'z']);
});

test('event order uses date, then stable ID', () => {
  const items = [event('z', 'DEFERRED', '2026-11-20'),
    event('b', 'PENDING', '2026-11-19'),
    event('a', 'PENDING', '2026-11-19')];
  assert.deepEqual(eventSequence(items).map((item) => item.id), ['a', 'b', 'z']);
});

test('PENDING can transition to review states but not invented approval', () => {
  assert.equal(allowedTransition('PENDING', 'REVIEWED'), true);
  assert.equal(allowedTransition('PENDING', 'NEEDS_SOURCE'), true);
  assert.equal(allowedTransition('PENDING', 'CERTIFIED'), false);
});

test('closed review needs reopening before deferral', () => {
  assert.equal(allowedTransition('REVIEWED', 'DEFERRED'), false);
  assert.equal(allowedTransition('REVIEWED', 'PENDING'), true);
  assert.equal(allowedTransition('DISMISSED', 'REVIEWED'), false);
});

test('initial review does not upgrade UNKNOWN', () => {
  const result = replayReviews(packet());
  assert.equal(result.ok, true);
  assert.equal(result.items[0].state, 'UNKNOWN');
  assert.equal(result.items[0].decision, 'PENDING');
});

test('reviewed claim retains submitted YES without further assertion', () => {
  const data = packet();
  data.claims[0].state = 'YES';
  data.events.push(event('e1', 'REVIEWED'));
  const result = replayReviews(data);
  assert.equal(result.ok, true);
  assert.equal(result.items[0].state, 'YES');
  assert.equal(result.items[0].decision, 'REVIEWED');
});

test('events add source refs without changing original claim', () => {
  const data = packet();
  data.sources.push(source('s2'));
  data.events.push({ ...event('e1', 'NEEDS_SOURCE'), sourceIds: ['s2'] });
  const result = replayReviews(data);
  assert.deepEqual(result.items[0].sourceIds, ['s1', 's2']);
  assert.deepEqual(data.claims[0].sourceIds, ['s1']);
});

test('illegal transitions are reported and rejected', () => {
  const data = packet();
  data.events.push(event('e1', 'REVIEWED', '2026-11-18'));
  data.events.push(event('e2', 'DEFERRED', '2026-11-19'));
  const result = replayReviews(data);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('ILLEGAL_TRANSITION'));
});

test('replay rejects malformed upstream record references', () => {
  const data = packet();
  data.claims[0].sourceIds = ['absent'];
  assert.equal(replayReviews(data).ok, false);
});

test('review counters count records separately from claims', () => {
  const data = packet();
  data.claims.push({ ...claim('c2'), field: 'elevator' });
  const result = replayReviews(data);
  const counts = reviewCounts(result.items);
  assert.equal(counts.items, 2);
  assert.equal(counts.records, 1);
  assert.equal(counts.states.UNKNOWN, 2);
  assert.equal(counts.decisions.PENDING, 2);
});

test('empty counts include all decision buckets', () => {
  const counts = reviewCounts([]);
  assert.equal(counts.items, 0);
  assert.equal(counts.decisions.DEFERRED, 0);
  assert.equal(counts.priorities.URGENT_REVIEW, 0);
});

test('filter by state and record never infers information', () => {
  const data = packet();
  data.claims.push(claim('c2', 'NO', 'r2'));
  const items = replayReviews(data).items;
  assert.deepEqual(filterReviews(items, { state: 'UNKNOWN' }).map((x) => x.claimId), ['c1']);
  assert.deepEqual(filterReviews(items, { recordId: 'r2' }).map((x) => x.claimId), ['c2']);
});

test('filter can select records missing citation links', () => {
  const data = packet();
  data.claims[0].sourceIds = [];
  const items = replayReviews(data).items;
  assert.equal(filterReviews(items, { needsSource: true }).length, 1);
});

test('filters do not mutate the source array', () => {
  const items = replayReviews(packet()).items;
  const before = JSON.stringify(items);
  filterReviews(items, { field: 'stepFreeEntrance' });
  assert.equal(JSON.stringify(items), before);
});

test('priority ordering is explicit and bounded', () => {
  assert.ok(priorityOrder('URGENT_REVIEW') > priorityOrder('NORMAL'));
  assert.equal(priorityOrder('unrecognised'), -1);
});

test('urgent review is selected ahead of routine', () => {
  const data = packet();
  data.claims.push(claim('c2'));
  data.events.push(event('e1', 'PENDING', '2026-11-19', 'c2', 'URGENT_REVIEW'));
  const sorted = triageReviews(replayReviews(data).items);
  assert.equal(sorted[0].claimId, 'c2');
});

test('append event is immutable and validates references', () => {
  const data = packet();
  const result = appendReviewEvent(data, event('e1', 'REVIEWED'));
  assert.equal(result.ok, true);
  assert.equal(data.events.length, 0);
  assert.equal(result.document.events.length, 1);
});

test('append rejects event without matching claim', () => {
  const result = appendReviewEvent(packet(), event('e1', 'PENDING', '2026-11-19', 'missing'));
  assert.equal(result.ok, false);
  assert.equal(result.document, null);
});

test('append cannot circumvent legal transition graph', () => {
  const data = packet();
  data.events.push(event('e1', 'REVIEWED', '2026-11-18'));
  const result = appendReviewEvent(data, event('e2', 'DEFERRED', '2026-11-19'));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('ILLEGAL_TRANSITION'));
});

test('identical review states produce no changes', () => {
  const a = replayReviews(packet());
  const changes = identifyChanges(a, a);
  assert.deepEqual(changes, []);
});

test('new claim is reported explicitly', () => {
  const early = replayReviews(packet());
  const late = packet();
  late.claims.push(claim('c2'));
  assert.ok(identifyChanges(early, replayReviews(late)).some((x) => x.kind === 'ADDED'));
});

test('removed claim is reported explicitly', () => {
  const early = replayReviews(packet());
  const late = { ...packet(), claims: [], events: [] };
  assert.ok(identifyChanges(early, replayReviews(late)).some((x) => x.kind === 'REMOVED'));
});

test('status changes are explicit rather than silently normalised', () => {
  const early = packet();
  const late = packet();
  late.claims[0].state = 'YES';
  const changes = compareHandoffReviews(early, late);
  assert.equal(changes.ok, true);
  assert.ok(changes.changes.some((x) => x.kind === 'STATE_CHANGED'));
});

test('priority and decision changes have separate events', () => {
  const before = packet();
  const after = packet();
  after.events.push(event('e1', 'NEEDS_SOURCE', '2026-11-19', 'c1', 'FOLLOW_UP'));
  const kinds = compareHandoffReviews(before, after).changes.map((x) => x.kind);
  assert.ok(kinds.includes('DECISION_CHANGED'));
  assert.ok(kinds.includes('PRIORITY_CHANGED'));
});

test('invalid comparisons return issues and no apparently clean diff', () => {
  const after = packet();
  after.claims[0].state = 'INFERRED';
  const result = compareHandoffReviews(packet(), after);
  assert.equal(result.ok, false);
  assert.deepEqual(result.changes, []);
});

test('identical sources merge without duplicating evidence', () => {
  const merged = mergeHandoffs(packet(), packet());
  assert.equal(merged.ok, true);
  assert.equal(merged.document.sources.length, 1);
  assert.equal(merged.document.claims.length, 1);
});

test('merge conflicts fail closed without picking a winning claim', () => {
  const other = packet();
  other.claims[0].state = 'YES';
  const merged = mergeHandoffs(packet(), other);
  assert.equal(merged.ok, false);
  assert.ok(codes(merged).includes('MERGE_CONFLICT'));
});

test('merge accepts distinct evidence and leaves UNKNOWN intact', () => {
  const other = packet();
  other.sources = [source('s2')];
  other.claims = [claim('c2', 'UNKNOWN', 'r2')];
  other.claims[0].sourceIds = ['s2'];
  const merged = mergeHandoffs(packet(), other);
  assert.equal(merged.ok, true);
  assert.equal(merged.document.claims.length, 2);
  assert.ok(merged.document.claims.every((c) => c.state === 'UNKNOWN'));
});

test('group by record does not group unrelated identities', () => {
  const data = packet();
  data.claims.push(claim('c2', 'UNKNOWN', 'r2'));
  const groups = groupReviewsByRecord(replayReviews(data).items);
  assert.deepEqual(groups.map((x) => x.recordId), ['r1', 'r2']);
});

test('coverage reports uncited sources without deleting them', () => {
  const data = packet();
  data.sources.push(source('s2'));
  const coverage = sourceCoverage(data);
  assert.equal(coverage.ok, true);
  assert.deepEqual(coverage.coverage.uncitedSources, ['s2']);
});

test('source coverage reports UNKNOWN claims without evidence', () => {
  const data = packet();
  data.claims[0].sourceIds = [];
  assert.deepEqual(sourceCoverage(data).coverage.claimsWithoutSources, ['c1']);
});

test('readiness needs recorded review decisions', () => {
  const result = reviewReadiness(packet());
  assert.equal(result.ok, true);
  assert.equal(result.readiness.complete, false);
  assert.deepEqual(result.readiness.unfinished, ['c1']);
});

test('complete review is not an accessibility guarantee', () => {
  const data = packet();
  data.events.push(event('e1', 'REVIEWED'));
  const result = reviewReadiness(data);
  assert.equal(result.readiness.complete, true);
  assert.match(result.readiness.caution, /does not prove/u);
});

test('constructor rejects invalid events before mutation', () => {
  assert.equal(constructReviewEvent({ id: '', claimId: 'c1', on: '2026-11-19', decision: 'PENDING' }), null);
  assert.equal(constructReviewEvent({ id: 'e1', claimId: 'c1', on: 'today', decision: 'PENDING' }), null);
  assert.equal(constructReviewEvent({ id: 'e1', claimId: 'c1', on: '2026-11-19', decision: 'APPROVED' }), null);
});

test('constructor returns a minimal valid event', () => {
  const created = constructReviewEvent({ id: 'e1', claimId: 'c1', on: '2026-11-19', decision: 'DEFERRED' });
  assert.deepEqual(created, event('e1', 'DEFERRED'));
});

test('review descriptions are bilingual', () => {
  const item = { decision: 'NEEDS_SOURCE' };
  assert.equal(explainReviewState(item, 'en'), 'Source needed');
  assert.equal(explainReviewState(item, 'fr'), 'Source nécessaire');
});

test('selectNextReview returns null for empty or closed queues', () => {
  assert.equal(selectNextReview([]), null);
  const data = packet();
  data.events.push(event('e1', 'DISMISSED'));
  assert.equal(selectNextReview(replayReviews(data).items), null);
});

test('audit trail is ordered and carries no personal information', () => {
  const data = packet();
  data.events.push(event('e2', 'NEEDS_SOURCE', '2026-11-19'));
  data.events.push(event('e1', 'PENDING', '2026-11-18'));
  const trail = reviewAuditTrail(data, 'c1');
  assert.deepEqual(trail.map((x) => x.id), ['e1', 'e2']);
  assert.ok(!JSON.stringify(trail).includes('reason'));
});

test('event replay does not mutate access states', () => {
  const data = packet();
  data.events.push(event('e1', 'REVIEWED'));
  const result = replayReviews(data);
  assert.equal(allStatesUnmodified(data, result), true);
});

test('different same-day outcomes receive conflict finding', () => {
  const data = packet();
  data.events.push(event('a', 'PENDING'));
  data.events.push(event('b', 'NEEDS_SOURCE'));
  assert.ok(codes({ issues: reviewConflicts(data) }).includes('SAME_DAY_CONFLICT'));
});

test('same-day duplicates with identical decision are not ambiguous', () => {
  const data = packet();
  data.events.push(event('a', 'PENDING'));
  data.events.push(event('b', 'PENDING'));
  assert.equal(reviewConflicts(data).length, 0);
});

test('digest finds next review claim and sources coverage', () => {
  const result = reviewDigest(packet());
  assert.equal(result.ok, true);
  assert.equal(result.digest.nextClaimId, 'c1');
  assert.equal(result.digest.coverage.citedSources, 1);
});

test('reassessment fails on same-day conflicting reviews', () => {
  const data = packet();
  data.events.push(event('a', 'PENDING'));
  data.events.push(event('b', 'DEFERRED'));
  const result = reassessAll(data);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('SAME_DAY_CONFLICT'));
});

test('clean reassessment does not change original access claims', () => {
  const result = reassessAll(packet());
  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
  assert.equal(result.reviewCount, 1);
});
