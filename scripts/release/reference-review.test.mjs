import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, SEVERITIES, elapsedDays, reviewReferences, queueForReview,
  findingsByCategory,
} from './reference-review.mjs';
import { DAY, entry, french, snapshot, pair, observed, clone } from './reference-fixtures.mjs';

const review = (data = snapshot(), settings = {}) => {
  const result = reviewReferences(data, { today: DAY, ...settings });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  return result.value;
};
const codes = (data = snapshot(), settings = {}) => review(data, settings).findings.map(item => item.code);
const count = (items, code) => items.filter(item => item.code === code).length;

test('review categories document all generated finding types', () => {
  assert.deepEqual(CATEGORIES, ['uncertain', 'age', 'language', 'destination', 'tracking', 'duplicate', 'context']);
});
test('severities include actionable review and informational markers', () => {
  assert.deepEqual(SEVERITIES, ['review', 'caution', 'info']);
});
test('fictional unknown link remains uncertain', () => {
  assert.ok(codes().includes('STATUS_UNKNOWN'));
  assert.ok(codes().includes('TIER_UNKNOWN'));
});
test('unknown does not imply a broken destination', () => {
  assert.equal(codes().includes('UNAVAILABLE_RECORDED'), false);
});
test('fictional status cannot become a live availability claim', () => {
  const result = review();
  assert.equal(result.total, 1);
  assert.equal(result.reviewedOn, DAY);
  assert.ok(result.findings.every(row => !row.code.includes('LIVE')));
});
test('a documented observation can have no review findings', () => {
  const result = review(snapshot(observed({ pairId: undefined })));
  assert.equal(result.findings.length, 0);
});
test('unavailable observation is marked without attempting network access', () => {
  assert.ok(codes(snapshot(observed({ status: 'UNAVAILABLE' }))).includes('UNAVAILABLE_RECORDED'));
});
test('an unavailable record is not silently turned into unknown', () => {
  const result = review(snapshot(observed({ status: 'UNAVAILABLE', pairId: undefined })));
  assert.equal(result.counts.caution, 1);
  assert.equal(result.counts.review, 0);
});
test('unknown tier on an unknown status is separately highlighted', () => {
  const result = review();
  assert.equal(count(result.findings, 'STATUS_UNKNOWN'), 1);
  assert.equal(count(result.findings, 'TIER_UNKNOWN'), 1);
});
test('an unknown status with documented source tier remains status-unknown', () => {
  const result = review(snapshot(entry({ tier: 'documented' })));
  assert.ok(result.findings.some(row => row.code === 'STATUS_UNKNOWN'));
  assert.ok(!result.findings.some(row => row.code === 'TIER_UNKNOWN'));
});
test('invalid input fails before review produces findings', () => {
  const result = reviewReferences(snapshot(entry({ destination: 'http://example.org' })));
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.includes('URL_SCHEME')));
});
test('invalid review date fails closed', () => {
  assert.equal(reviewReferences(snapshot(), { today: 'not-a-date' }).ok, false);
});
test('stale-day policy must be a bounded whole number', () => {
  for (const staleDays of [0, -1, 1.3, 4000, NaN, '180']) {
    const result = reviewReferences(snapshot(), { today: DAY, staleDays });
    assert.equal(result.ok, false, String(staleDays));
    assert.deepEqual(result.problems, ['staleDays:RANGE']);
  }
});
test('one day is one day across a leap-year boundary', () => {
  assert.equal(elapsedDays('2024-02-28', '2024-02-29'), 1);
  assert.equal(elapsedDays('2024-02-29', '2024-03-01'), 1);
});
test('negative day offsets are kept negative rather than made absolute', () => {
  assert.equal(elapsedDays('2026-11-21', '2026-11-20'), -1);
});
test('invalid date arguments produce null', () => {
  assert.equal(elapsedDays('bad', DAY), null);
  assert.equal(elapsedDays(DAY, 'bad'), null);
});
test('retrieval older than the configured threshold is flagged', () => {
  assert.ok(codes(snapshot(entry({ retrievedOn: '2026-01-01' }))).includes('RETRIEVAL_STALE'));
});
test('retrieval exactly at the threshold is not stale', () => {
  const today = '2026-11-21';
  const age = elapsedDays('2026-11-20', today);
  assert.ok(!codes(snapshot(entry({ retrievedOn: '2026-11-20' })), { staleDays: age }).includes('RETRIEVAL_STALE'));
});
test('retrieval exceeding threshold by one day is stale', () => {
  assert.ok(codes(snapshot(entry({ retrievedOn: '2026-11-19' })), { staleDays: 1 }).includes('RETRIEVAL_STALE'));
});
test('observation older than the threshold is separately flagged', () => {
  const result = review(snapshot(observed({ observedOn: '2026-01-01' })));
  assert.ok(result.findings.some(item => item.code === 'OBSERVATION_STALE'));
});
test('observation preceding its source is a caution', () => {
  const result = review(snapshot(observed({ retrievedOn: '2026-11-20', observedOn: '2026-11-19' })));
  assert.ok(result.findings.some(item => item.code === 'OBSERVATION_BEFORE_SOURCE' && item.severity === 'caution'));
});
test('observation equal to retrieval date is not flagged for order', () => {
  assert.ok(!codes(snapshot(observed())).includes('OBSERVATION_BEFORE_SOURCE'));
});
test('a tracker query triggers a caution while keeping the URL', () => {
  const data = snapshot(entry({ destination: 'https://example.org/?utm_medium=mail' }));
  const result = review(data);
  const issue = result.findings.find(row => row.code === 'TRACKING_PARAMETERS');
  assert.equal(issue.severity, 'caution');
  assert.equal(issue.detail, 'utm_medium');
  assert.equal(data.references[0].destination, 'https://example.org/?utm_medium=mail');
});
test('multiple trackers are listed predictably', () => {
  const result = review(snapshot(entry({ destination: 'https://example.org/?gclid=1&utm_source=email' })));
  assert.equal(result.findings.find(row => row.code === 'TRACKING_PARAMETERS').detail, 'gclid, utm_source');
});
test('ordinary language query does not trigger a tracker finding', () => {
  assert.ok(!codes(snapshot(entry({ destination: 'https://example.org/?lang=fr' }))).includes('TRACKING_PARAMETERS'));
});
test('source equal to destination is an informational finding', () => {
  const result = review(snapshot(entry({ source: 'https://example.org/resources' })));
  assert.ok(result.findings.some(row => row.code === 'SOURCE_EQUALS_DESTINATION' && row.severity === 'info'));
});
test('a licence reference at a generic URL prompts context review', () => {
  const result = review(snapshot(entry({ purpose: 'licence' })));
  assert.ok(result.findings.some(row => row.code === 'LICENCE_LINK_CONTEXT'));
});
test('a licence reference with licence path does not require context review', () => {
  const result = review(snapshot(entry({ purpose: 'licence', destination: 'https://example.org/licence' })));
  assert.equal(result.findings.some(row => row.code === 'LICENCE_LINK_CONTEXT'), false);
});
test('two references on the same route and locale with matching destination are flagged', () => {
  const result = review(snapshot(entry(), entry({ id: 'other' })));
  assert.equal(count(result.findings, 'DESTINATION_DUPLICATED'), 2);
});
test('same destination across EN and FR does not count as a duplicate', () => {
  assert.equal(count(review(pair()).findings, 'DESTINATION_DUPLICATED'), 0);
});
test('same destination across different routes does not count as duplicate', () => {
  const result = review(snapshot(entry(), entry({ id: 'other', route: '/places' })));
  assert.equal(count(result.findings, 'DESTINATION_DUPLICATED'), 0);
});
test('a pair containing only English is identified as language incomplete', () => {
  assert.equal(count(review().findings, 'PAIR_LANGUAGE_MISSING'), 1);
});
test('complete EN/FR pairing has no missing language finding', () => {
  assert.equal(count(review(pair()).findings, 'PAIR_LANGUAGE_MISSING'), 0);
});
test('two English references claiming same pair are reported', () => {
  const result = review(snapshot(entry(), entry({ id: 'other' }), french()));
  assert.equal(count(result.findings, 'PAIR_LANGUAGE_DUPLICATED'), 3);
});
test('paired references with different purposes prompt review', () => {
  const result = review(snapshot(entry(), french({ purpose: 'data-source' })));
  assert.equal(count(result.findings, 'PAIR_PURPOSE_DIFFERS'), 2);
});
test('paired references can intentionally have distinct translated destinations', () => {
  const result = review(snapshot(entry(), french({ destination: 'https://example.org/fr/resources' })));
  assert.equal(count(result.findings, 'PAIR_DESTINATION_DIFFERS'), 2);
});
test('paired references with identical destinations have no destination difference', () => {
  const result = review(pair());
  assert.equal(count(result.findings, 'PAIR_DESTINATION_DIFFERS'), 0);
});
test('unpaired records without pairId do not claim a missing translation', () => {
  const result = review(snapshot(entry({ pairId: undefined })));
  assert.equal(count(result.findings, 'PAIR_LANGUAGE_MISSING'), 0);
});
test('route aggregates count EN/FR independently', () => {
  const result = review(pair());
  assert.deepEqual(result.routes, [{ path: '/help', total: 2, english: 1, french: 1, unknown: 2 }]);
});
test('route aggregates remain stable across original input order', () => {
  const first = review(snapshot(entry(), french({ route: '/places' })));
  const second = review(snapshot(french({ route: '/places' }), entry()));
  assert.deepEqual(first.routes, second.routes);
});
test('route review sorts route names for predictable exports', () => {
  const result = review(snapshot(entry({ route: '/places' }), french({ route: '/help' })));
  assert.deepEqual(result.routes.map(item => item.path), ['/help', '/places']);
});
test('status unknown count is per route', () => {
  const result = review(snapshot(entry(), observed({ id: 'other' })));
  assert.equal(result.routes[0].unknown, 1);
});
test('review findings are deterministically ordered by ID then code', () => {
  const result = review(snapshot(entry({ id: 'z' }), entry({ id: 'a' })));
  const names = result.findings.map(row => `${row.id}:${row.code}`);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
});
test('review queue prioritizes actionable review over information', () => {
  const result = review(snapshot(entry({ source: 'https://example.org/resources' })));
  const queue = queueForReview(result);
  assert.equal(queue[0].severity, 'review');
  assert.equal(queue.at(-1).severity, 'info');
});
test('review queue returns a new array', () => {
  const result = review();
  const queued = queueForReview(result);
  assert.notEqual(queued, result.findings);
});
test('empty queue input produces empty list', () => {
  assert.deepEqual(queueForReview(null), []);
  assert.deepEqual(queueForReview({ findings: null }), []);
});
test('category grouping includes every category even if empty', () => {
  const groups = findingsByCategory(review());
  assert.deepEqual(Object.keys(groups), CATEGORIES);
});
test('category grouping keeps review evidence with its category', () => {
  const groups = findingsByCategory(review());
  assert.ok(groups.uncertain.length >= 2);
  assert.ok(groups.uncertain.every(row => row.category === 'uncertain'));
});
test('category grouping handles absent reports', () => {
  const groups = findingsByCategory(undefined);
  assert.ok(Object.values(groups).every(list => list.length === 0));
});
test('unknown tier does not create synthetic inspected claims', () => {
  const result = review();
  assert.equal(result.capturedOn, DAY);
  assert.ok(!Object.hasOwn(result, 'inspectionPassed'));
});
test('report schema is stable for use by downstream renderers', () => {
  const result = review();
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'capturedOn', 'reviewedOn', 'total', 'counts', 'routes', 'findings']);
});
test('review does not alter the records or their order', () => {
  const manifest = pair();
  const original = clone(manifest);
  review(manifest);
  assert.deepEqual(manifest, original);
});
test('the review engine never creates a network fetch function', () => {
  assert.equal(typeof reviewReferences, 'function');
  const result = review();
  assert.equal(result.schemaVersion, 1);
  assert.ok(result.findings.every(item => !Object.hasOwn(item, 'fetchedResponse')));
});
test('every finding has a bounded ID and recognized severity', () => {
  const result = review(pair());
  for (const item of result.findings) {
    assert.ok(item.id.length <= 84);
    assert.ok(SEVERITIES.includes(item.severity));
    assert.ok(CATEGORIES.includes(item.category));
    assert.equal(typeof item.detail, 'string');
  }
});
test('a day boundary is not affected by local timezone', () => {
  assert.equal(elapsedDays('2026-11-20', '2026-11-21'), 1);
});
test('review counts equal findings by priority', () => {
  const result = review(pair());
  for (const severity of SEVERITIES) assert.equal(result.counts[severity], result.findings.filter(item => item.severity === severity).length);
});
