import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUERY_VERSION, QUERY_SORTS, QUERY_GROUPS, QUERY_STATES, QUERY_DEFAULTS,
  validateQuery, matchReview, compareReviews, queryReviews,
  groupReviews, daysBetween, reviewAgeSummary, formatQuerySummary,
} from './offline-review-query.mjs';
import { validateQueue, newQueue } from './offline-review-queue.mjs';

const TODAY = '2026-11-19';
const metadata = () => ({
  source: 'https://example.test/open-source', licence: 'CC0-1.0',
  retrievedOn: TODAY, sourceDate: '2026-10-01', tier: 0,
});
const item = (id = 'item-a', changes = {}) => ({
  id, recordId: `record-${id}`, claimKey: 'stepFreeEntrance',
  status: 'pending', reason: 'unknown-claim', state: 'UNKNOWN',
  createdOn: TODAY, label: { en: `Synthetic ${id}`, fr: `Fiche ${id}` },
  provenance: metadata(), history: [], ...changes,
});
const queue = (...items) => ({ version: 1, items });
const invalidCodes = (result) => result.issues.map(({ code }) => code);
const resultCodes = (result) => result.problems.map(({ code }) => code);
const check = { today: TODAY };

function dataset() {
  return queue(
    item('alpha', { status: 'pending', createdOn: '2026-11-15' }),
    item('bravo', { status: 'deferred', reason: 'missing-evidence', createdOn: '2026-11-08',
      state: 'NO', provenance: { ...metadata(), tier: 1, retrievedOn: '2026-11-01' } }),
    item('charlie', { status: 'closed', reason: 'changed-claim', createdOn: '2026-10-01',
      state: 'YES', provenance: { ...metadata(), tier: 'E', source: 'https://example.test/another' } }),
    item('delta', { status: 'needs-evidence', createdOn: '2026-11-10',
      history: [{ action: 'request-evidence', on: '2026-11-12', to: 'needs-evidence' }] }),
    item('echo', { status: 'pending', createdOn: '2026-11-19' }),
  );
}

function expectFilter(filters, ids) {
  const result = queryReviews(dataset(), filters, check);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.rows.map(({ id }) => id), ids);
}

test('query version and vocabularies are stable', () => {
  assert.equal(QUERY_VERSION, 1);
  assert.ok(QUERY_SORTS.includes('created-desc'));
  assert.ok(QUERY_GROUPS.includes('retrieved-month'));
  assert.deepEqual(QUERY_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.equal(new Set(QUERY_SORTS).size, QUERY_SORTS.length);
  assert.equal(new Set(QUERY_GROUPS).size, QUERY_GROUPS.length);
});

test('default query is valid, bounded and non-mutating', () => {
  assert.equal(validateQuery().ok, true);
  assert.equal(validateQuery({}).query.limit, 50);
  assert.equal(QUERY_DEFAULTS.offset, 0);
  const passed = { status: ['pending'] };
  const normalized = validateQuery(passed);
  assert.equal(normalized.ok, true);
  assert.notEqual(normalized.query.status, passed.status);
});

test('invalid query values fail closed without returning rows', () => {
  const result = queryReviews(dataset(), { limit: 0 }, check);
  assert.equal(result.ok, false);
  assert.deepEqual(result.rows, []);
  assert.equal(result.total, null);
  assert.equal(result.page, null);
});

test('invalid queue fails before displaying records', () => {
  const result = queryReviews(queue({ id: 'broken' }), {}, check);
  assert.equal(result.ok, false);
  assert.equal(result.total, null);
  assert.ok(resultCodes(result).length > 0);
});

test('empty queue is valid and has a bounded page', () => {
  const result = queryReviews(newQueue());
  assert.equal(result.ok, true);
  assert.equal(result.total, 0);
  assert.deepEqual(result.rows, []);
  assert.equal(result.page.hasNext, false);
  assert.equal(result.page.hasPrevious, false);
});

test('query forbids unknown options, even those with innocuous values', () => {
  const result = validateQuery({ extras: true });
  assert.equal(result.ok, false);
  assert.ok(invalidCodes(result).includes('UNKNOWN_FILTER'));
});

test('non-object queries are rejected consistently', () => {
  for (const entry of [null, false, true, [], ['pending'], 'status', 10, new Date()]) {
    assert.ok(invalidCodes(validateQuery(entry)).includes('QUERY_INVALID'));
  }
});

test('limit is a bounded positive safe integer', () => {
  for (const value of [0, -1, 501, 2.5, NaN, Infinity, '20', true, null]) {
    assert.ok(invalidCodes(validateQuery({ limit: value })).includes('LIMIT_INVALID'), String(value));
  }
  for (const value of [1, 50, 500]) assert.equal(validateQuery({ limit: value }).ok, true);
});

test('offset is a bounded nonnegative safe integer', () => {
  for (const value of [-1, 1.5, 1_000_001, Number.MAX_SAFE_INTEGER + 1, null, '5']) {
    assert.ok(invalidCodes(validateQuery({ offset: value })).includes('OFFSET_INVALID'));
  }
  assert.equal(validateQuery({ offset: 0 }).ok, true);
  assert.equal(validateQuery({ offset: 1_000_000 }).ok, true);
});

test('sort and descending are explicit enums', () => {
  for (const sort of QUERY_SORTS) assert.equal(validateQuery({ sort }).ok, true);
  assert.ok(invalidCodes(validateQuery({ sort: '__proto__' })).includes('SORT_INVALID'));
  assert.ok(invalidCodes(validateQuery({ descending: 'true' })).includes('ORDER_INVALID'));
});

test('known statuses are accepted as arrays', () => {
  for (const status of ['pending', 'closed', 'deferred', 'needs-evidence', 'ready-for-human-review']) {
    assert.equal(validateQuery({ status: [status] }).ok, true);
  }
  assert.ok(invalidCodes(validateQuery({ status: ['finished'] })).includes('FILTER_VALUE'));
});

test('filters reject repeated values to avoid ambiguous requests', () => {
  assert.ok(invalidCodes(validateQuery({ state: ['YES', 'YES'] })).includes('FILTER_VALUE'));
  assert.ok(invalidCodes(validateQuery({ tier: [0, 0] })).includes('FILTER_VALUE'));
  assert.ok(invalidCodes(validateQuery({ reason: ['unknown-claim', 'unknown-claim'] })).includes('FILTER_VALUE'));
});

test('filters reject strings, overlarge arrays and unknown tiers', () => {
  assert.ok(invalidCodes(validateQuery({ status: 'pending' })).includes('FILTER_INVALID'));
  assert.ok(invalidCodes(validateQuery({ tier: [99] })).includes('FILTER_VALUE'));
  assert.ok(invalidCodes(validateQuery({ state: Array(51).fill('UNKNOWN') })).includes('FILTER_INVALID'));
});

test('UNKNOWN state filter matches precisely Unknown claims', () => {
  expectFilter({ state: ['UNKNOWN'] }, ['alpha', 'delta', 'echo']);
  expectFilter({ state: ['YES'] }, ['charlie']);
  expectFilter({ state: ['NO'] }, ['bravo']);
});

test('combined state filter selects union of requested claim states', () => {
  expectFilter({ state: ['YES', 'NO'] }, ['bravo', 'charlie']);
  expectFilter({ state: [] }, ['alpha', 'bravo', 'charlie', 'delta', 'echo']);
});

test('status and reason combine as intersection', () => {
  expectFilter({ status: ['pending'], reason: ['unknown-claim'] }, ['alpha', 'echo']);
  expectFilter({ status: ['closed'], reason: ['missing-evidence'] }, []);
});

test('tier filter does not rank sources or infer claims', () => {
  expectFilter({ tier: [0] }, ['alpha', 'delta', 'echo']);
  expectFilter({ tier: ['E'] }, ['charlie']);
  expectFilter({ tier: [0, 1] }, ['alpha', 'bravo', 'delta', 'echo']);
});

test('filter by source requires an exact match, not substring', () => {
  expectFilter({ source: 'https://example.test/another' }, ['charlie']);
  expectFilter({ source: 'https://example.test/open-source' }, ['alpha', 'bravo', 'delta', 'echo']);
  expectFilter({ source: 'https://example.test/unlisted' }, []);
});

test('non-https source filter is invalid', () => {
  for (const value of ['http://example.test', 'not-a-url', '', 10, true]) {
    assert.ok(invalidCodes(validateQuery({ source: value })).includes('SOURCE_FILTER'));
  }
});

test('search is case insensitive and includes record identity', () => {
  expectFilter({ search: 'ALPHA' }, ['alpha']);
  expectFilter({ search: 'record-bravo' }, ['bravo']);
  expectFilter({ search: 'stepfreeentrance' }, ['alpha', 'bravo', 'charlie', 'delta', 'echo']);
});

test('search does not include source URLs or metadata', () => {
  expectFilter({ search: 'example.test' }, []);
  expectFilter({ search: 'CC0' }, []);
});

test('search rejects control characters and oversized queries', () => {
  for (const value of ['A\nB', 'A\tB', 'A\rB', 'x'.repeat(129), 99]) {
    assert.ok(invalidCodes(validateQuery({ search: value })).includes('SEARCH_INVALID'));
  }
});

test('history filters return reviewed and never-reviewed records', () => {
  expectFilter({ hasHistory: true }, ['delta']);
  expectFilter({ hasHistory: false }, ['alpha', 'bravo', 'charlie', 'echo']);
  assert.ok(invalidCodes(validateQuery({ hasHistory: 1 })).includes('HISTORY_FILTER'));
});

test('created date filters are inclusive', () => {
  expectFilter({ after: '2026-11-15' }, ['alpha', 'echo']);
  expectFilter({ before: '2026-11-08' }, ['bravo', 'charlie']);
  expectFilter({ after: TODAY, before: TODAY }, ['echo']);
});

test('date ordering rejects inverted ranges', () => {
  assert.ok(invalidCodes(validateQuery({ after: '2026-11-20', before: '2026-11-19' })).includes('DATE_ORDER'));
});

test('invalid dates reject calendar rollover', () => {
  for (const value of ['2026-02-30', '2026-00-01', '2026-13-01', '2026-11-9']) {
    assert.ok(invalidCodes(validateQuery({ after: value })).includes('DATE_INVALID'));
  }
});

test('pagination returns bounded rows and explicit navigation hints', () => {
  const first = queryReviews(dataset(), { limit: 2 }, check);
  assert.deepEqual(first.rows.map(({ id }) => id), ['alpha', 'bravo']);
  assert.equal(first.total, 5);
  assert.equal(first.page.nextOffset, 2);
  assert.equal(first.page.hasNext, true);
  assert.equal(first.page.hasPrevious, false);
  const next = queryReviews(dataset(), { limit: 2, offset: 2 }, check);
  assert.deepEqual(next.rows.map(({ id }) => id), ['charlie', 'delta']);
  assert.equal(next.page.nextOffset, 4);
  const last = queryReviews(dataset(), { limit: 2, offset: 4 }, check);
  assert.deepEqual(last.rows.map(({ id }) => id), ['echo']);
  assert.equal(last.page.nextOffset, null);
});

test('offset beyond last record returns empty valid page', () => {
  const result = queryReviews(dataset(), { offset: 500 }, check);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, []);
  assert.equal(result.total, 5);
  assert.equal(result.page.nextOffset, null);
});

test('sort by created ascending is chronological', () => {
  expectFilter({ sort: 'created-asc' }, ['charlie', 'bravo', 'delta', 'alpha', 'echo']);
});

test('sort by created descending is reversed chronologically', () => {
  expectFilter({ sort: 'created-desc' }, ['echo', 'alpha', 'delta', 'bravo', 'charlie']);
});

test('descending option reverses selected primary sort', () => {
  expectFilter({ sort: 'created-asc', descending: true }, ['echo', 'alpha', 'delta', 'bravo', 'charlie']);
});

test('sort by retrieved date uses record provenance only', () => {
  expectFilter({ sort: 'retrieved-asc' }, ['bravo', 'alpha', 'charlie', 'delta', 'echo']);
});

test('stable ties use record identifier to avoid nondeterminism', () => {
  const result = queryReviews(dataset(), { sort: 'status' }, check);
  assert.equal(result.rows.findIndex((r) => r.id === 'alpha') < result.rows.findIndex((r) => r.id === 'echo'), true);
});

test('returned rows are projections, not references to queue items', () => {
  const input = dataset();
  const output = queryReviews(input, {}, check);
  assert.notEqual(output.rows[0], input.items[0]);
  assert.notEqual(output.rows[0].provenance, input.items[0].provenance);
  assert.equal('history' in output.rows[0], false);
  output.rows[0].label.en = 'Changed externally';
  assert.equal(input.items[0].label.en, 'Synthetic alpha');
});

test('full provenance is retained in every projected row', () => {
  const result = queryReviews(dataset(), {}, check);
  for (const row of result.rows) {
    assert.ok(row.provenance.source.startsWith('https://'));
    assert.ok(row.provenance.licence);
    assert.ok(row.provenance.retrievedOn);
    assert.notEqual(row.provenance.tier, undefined);
  }
});

test('group by status yields exact counts', () => {
  const result = groupReviews(dataset(), 'status', {}, check);
  assert.equal(result.ok, true);
  assert.equal(result.total, 5);
  assert.equal(result.groups.find((r) => r.key === 'pending').count, 2);
});

test('group by claim state does not translate UNKNOWN', () => {
  const result = groupReviews(dataset(), 'state', {}, check);
  assert.equal(result.groups.find((r) => r.key === 'UNKNOWN').count, 3);
  assert.equal(result.groups.find((r) => r.key === 'YES').count, 1);
  assert.equal(result.groups.find((r) => r.key === 'NO').count, 1);
});

test('group by source retains exact URLs and counts', () => {
  const result = groupReviews(dataset(), 'source', {}, check);
  assert.equal(result.groups.find((r) => r.key === 'https://example.test/open-source').count, 4);
});

test('group by retrieval month stays calendar-based', () => {
  const result = groupReviews(dataset(), 'retrieved-month', {}, check);
  assert.deepEqual(result.groups, [{ key: '2026-11', count: 5 }]);
});

test('group by tier uses canonical values without implied ranking', () => {
  const result = groupReviews(dataset(), 'tier', {}, check);
  assert.equal(result.groups.find((r) => r.key === '0').count, 3);
  assert.equal(result.groups.find((r) => r.key === '1').count, 1);
  assert.equal(result.groups.find((r) => r.key === 'E').count, 1);
});

test('group operations reject unknown group names', () => {
  const result = groupReviews(dataset(), '__proto__', {}, check);
  assert.equal(result.ok, false);
  assert.ok(resultCodes(result).includes('GROUP_INVALID'));
});

test('group counts ignore pagination, but respect filters', () => {
  const result = groupReviews(dataset(), 'status', { limit: 1, state: ['UNKNOWN'] }, check);
  assert.equal(result.total, 3);
  assert.equal(result.groups.find((r) => r.key === 'pending').count, 2);
});

test('day difference validates leap years and exact boundaries', () => {
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2);
  assert.equal(daysBetween('2026-11-19', '2026-11-19'), 0);
  assert.equal(daysBetween('2026-11-20', '2026-11-19'), -1);
  assert.equal(daysBetween('no', TODAY), null);
});

test('administrative age buckets never alter claim status', () => {
  const result = reviewAgeSummary(dataset(), TODAY, {}, check);
  assert.equal(result.ok, true);
  assert.equal(result.summary.total, 5);
  assert.equal(result.summary.neverReviewed, 4);
  assert.equal(result.summary.categories['0-7'], 2);
  assert.equal(result.summary.categories['8-30'], 2);
  assert.equal(result.summary.categories['31-90'], 1);
});

test('future-created record is counted as future only when caller permits it', () => {
  const input = queue(item('future', { createdOn: '2026-11-20' }));
  const result = reviewAgeSummary(input, TODAY);
  assert.equal(result.ok, true);
  assert.equal(result.summary.categories.future, 1);
});

test('empty age summary has no invented zero-day age', () => {
  const result = reviewAgeSummary(newQueue(), TODAY);
  assert.equal(result.summary.total, 0);
  assert.equal(result.summary.medianDays, null);
  assert.equal(result.summary.youngestDays, null);
  assert.equal(result.summary.oldestDays, null);
});

test('median age uses true midpoint for even result counts', () => {
  const input = queue(item('one', { createdOn: '2026-11-17' }), item('two', { createdOn: '2026-11-15' }));
  const result = reviewAgeSummary(input, TODAY, {}, check);
  assert.equal(result.summary.medianDays, 3);
});

test('age summary refuses malformed date rather than guessing today', () => {
  const result = reviewAgeSummary(dataset(), 'today', {}, check);
  assert.equal(result.ok, false);
  assert.ok(resultCodes(result).includes('AS_OF_INVALID'));
});

test('query summary warns review status is not venue truth', () => {
  const result = queryReviews(dataset(), {}, check);
  assert.ok(formatQuerySummary(result, 'en').includes('UNKNOWN remains UNKNOWN'));
  assert.ok(formatQuerySummary(result, 'fr').includes('UNKNOWN reste UNKNOWN'));
  assert.equal(formatQuerySummary({ ok: false }, 'en'), null);
});

test('French summary requires nonbreaking space before colon', () => {
  const result = formatQuerySummary(queryReviews(dataset(), {}, check), 'fr');
  assert.ok(result.includes('Fiches\u00A0:'));
  assert.equal(result.includes('Fiches :'), false);
});

test('the query does not mutate the original review queue', () => {
  const input = dataset();
  const before = JSON.stringify(input);
  queryReviews(input, { status: ['pending'], sort: 'created-desc' }, check);
  groupReviews(input, 'reason', {}, check);
  reviewAgeSummary(input, TODAY, {}, check);
  assert.equal(JSON.stringify(input), before);
  assert.equal(validateQueue(input, check).ok, true);
});

test('calling comparison helper with normalized query is deterministic', () => {
  const [left, right] = dataset().items;
  const normalized = validateQuery({ sort: 'id' }).query;
  assert.ok(compareReviews(left, right, normalized) < 0);
  assert.ok(compareReviews(right, left, normalized) > 0);
  assert.equal(compareReviews(left, left, normalized), 0);
  assert.equal(matchReview(left, normalized), true);
});
