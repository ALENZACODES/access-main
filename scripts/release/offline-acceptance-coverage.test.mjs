import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COVERAGE_VERSION, REQUIRED_GLOBAL, REQUIRED_PER_ROUTE,
  defaultAcceptancePolicy, validateAcceptancePolicy, acceptanceCoverage,
  validateAcceptanceQueueLinks, unresolvedAcceptanceWork, coverageCounters,
} from './offline-acceptance-coverage.mjs';
import { ledger, route, check, TODAY } from './offline-acceptance-fixtures.mjs';

const policy = () => defaultAcceptancePolicy();
const minimalPolicy = () => ({ version: COVERAGE_VERSION,
  global: [], perRoute: ['keyboard'], requireQueueLinks: false,
  allowEmptyRoute: false, overrides: [] });
const sample = (state = 'UNKNOWN') => ledger({ routes: [route({ checks: [check({ state })] })] });
const queueItem = (id = 'review-one', changes = {}) => ({
  id, recordId: 'synthetic-record', claimKey: 'stepFreeEntrance',
  reason: 'unknown-claim', status: 'pending', state: 'UNKNOWN',
  createdOn: TODAY, label: { en: 'Synthetic review', fr: 'Examen fictif' },
  provenance: { source: 'https://example.org/source', licence: 'CC0-1.0',
    retrievedOn: TODAY, tier: 0 }, history: [], ...changes,
});
const queue = (...items) => ({ version: 1, items });
const issueCodes = (result) => result.problems.map((problem) => problem.code);

test('default policy includes paired language coverage', () => {
  const entry = policy();
  assert.equal(entry.version, 1);
  assert.ok(entry.global.includes('language-fr'));
  assert.ok(entry.global.includes('language-en'));
  assert.ok(entry.perRoute.includes('focus-visible'));
  assert.ok(entry.perRoute.includes('touch-target'));
});

test('default policy does not claim universal compliance', () => {
  assert.equal(REQUIRED_GLOBAL.includes('asset-integrity'), true);
  assert.equal(REQUIRED_PER_ROUTE.includes('screen-reader'), true);
  assert.equal(defaultAcceptancePolicy().allowEmptyRoute, false);
});

test('default policy arrays are independently modifiable', () => {
  const first = policy();
  first.global.push('keyboard');
  assert.equal(policy().global.includes('keyboard'), false);
});

test('minimal explicit policy is accepted', () => {
  assert.equal(validateAcceptancePolicy(minimalPolicy()).ok, true);
});

test('invalid root policies fail closed', () => {
  for (const value of [null, [], {}, 'policy', 1]) {
    assert.equal(validateAcceptancePolicy(value).ok, false);
  }
});

test('policy requires version one', () => {
  assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), version: 2 })).includes('POLICY_INVALID'));
});

test('global kinds must be a list', () => {
  for (const global of [null, {}, 'keyboard', undefined]) {
    assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), global })).includes('GLOBAL_INVALID'));
  }
});

test('per-route requirements must be a list', () => {
  for (const perRoute of [null, {}, 'keyboard', undefined]) {
    assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), perRoute })).includes('ROUTE_KINDS_INVALID'));
  }
});

test('unknown policy kinds cannot be silently ignored', () => {
  const value = { ...policy(), global: ['made-up-test'] };
  assert.ok(issueCodes(validateAcceptancePolicy(value)).includes('GLOBAL_INVALID'));
});

test('duplicate requirement kinds are rejected', () => {
  const value = { ...policy(), perRoute: ['keyboard', 'keyboard'] };
  assert.ok(issueCodes(validateAcceptancePolicy(value)).includes('ROUTE_KINDS_INVALID'));
});

test('queue link mode must be explicit boolean', () => {
  for (const requireQueueLinks of [null, 'false', 0, undefined]) {
    assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), requireQueueLinks })).includes('QUEUE_MODE_INVALID'));
  }
});

test('empty-route mode must be explicit boolean', () => {
  for (const allowEmptyRoute of [null, 'true', 1, undefined]) {
    assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), allowEmptyRoute })).includes('EMPTY_ROUTE_MODE_INVALID'));
  }
});

test('override list must be bounded', () => {
  const overrides = Array.from({ length: 501 }, (_, i) => ({ routeId: `r-${i}`, kinds: [] }));
  assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), overrides })).includes('OVERRIDES_INVALID'));
});

test('override route ids must be unique', () => {
  const overrides = [{ routeId: 'one', kinds: ['keyboard'] }, { routeId: 'one', kinds: ['touch-target'] }];
  assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), overrides })).includes('OVERRIDE_DUPLICATE'));
});

test('override kinds must be recognized', () => {
  const overrides = [{ routeId: 'one', kinds: ['unsupported'] }];
  assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), overrides })).includes('OVERRIDE_INVALID'));
});

test('extra policy fields are rejected', () => {
  assert.ok(issueCodes(validateAcceptancePolicy({ ...policy(), approval: true })).includes('POLICY_EXTRA_FIELD'));
});

test('a missing required kind is reported as missing, not failed', () => {
  const result = acceptanceCoverage(sample(), minimalPolicy());
  assert.equal(result.ok, true);
  assert.equal(result.coverage.missingCount, 0);
  assert.equal(result.coverage.failureCount, 0);
  assert.equal(result.coverage.unknownCount, 1);
});

test('global missing requirements are explicitly visible', () => {
  const result = acceptanceCoverage(sample(), policy());
  assert.ok(result.coverage.missing.some((entry) => entry.scope === 'global'));
  assert.ok(result.coverage.missing.some((entry) => entry.kind === 'asset-integrity'));
});

test('missing route checks receive separate route entries', () => {
  const result = acceptanceCoverage(sample(), policy());
  assert.ok(result.coverage.missing.some((entry) => entry.routeId === 'sample-route' && entry.kind === 'screen-reader'));
});

test('all pass checks can make a minimal policy ready for human review', () => {
  const result = acceptanceCoverage(sample('PASS'), minimalPolicy());
  assert.equal(result.coverage.readyForHumanReview, true);
});

test('PASS does not excuse a missing required category', () => {
  const result = acceptanceCoverage(sample('PASS'), policy());
  assert.equal(result.coverage.readyForHumanReview, false);
});

test('FAIL blocks review readiness even with full coverage', () => {
  const result = acceptanceCoverage(sample('FAIL'), minimalPolicy());
  assert.equal(result.coverage.readyForHumanReview, false);
  assert.equal(result.coverage.failureCount, 1);
});

test('UNKNOWN blocks review readiness even with full coverage', () => {
  const result = acceptanceCoverage(sample(), minimalPolicy());
  assert.equal(result.coverage.readyForHumanReview, false);
  assert.equal(result.coverage.unknownCount, 1);
});

test('a missing check is not interpreted as an observed failure', () => {
  const result = acceptanceCoverage(ledger({ routes: [route({ checks: [] })] }), minimalPolicy());
  assert.equal(result.coverage.failureCount, 0);
  assert.ok(result.coverage.missingCount > 0);
});

test('explicit empty-route permission does not invent a passed check', () => {
  const rules = { ...minimalPolicy(), allowEmptyRoute: true, perRoute: [] };
  const result = acceptanceCoverage(ledger({ routes: [route({ checks: [] })] }), rules);
  assert.equal(result.coverage.passCount, 0);
  assert.equal(result.coverage.missingCount, 0);
});

test('a route override can replace rather than append required categories', () => {
  const rules = { ...policy(), global: [], overrides: [{ routeId: 'sample-route', kinds: ['keyboard'] }] };
  const result = acceptanceCoverage(sample('PASS'), rules);
  assert.equal(result.coverage.missingCount, 0);
});

test('override does not change other routes', () => {
  const rules = { ...minimalPolicy(), overrides: [{ routeId: 'sample-route', kinds: [] }] };
  const a = ledger({ routes: [route(), route({ id: 'two', path: '/two', checks: [] })] });
  const result = acceptanceCoverage(a, rules);
  assert.ok(result.coverage.missing.some((entry) => entry.routeId === 'two' && entry.kind === 'keyboard'));
});

test('global category may be covered on any route', () => {
  const rules = { ...minimalPolicy(), global: ['keyboard'] };
  const result = acceptanceCoverage(sample('PASS'), rules);
  assert.equal(result.coverage.missingCount, 0);
});

test('empty ledger cannot pass nonempty global requirements', () => {
  const result = acceptanceCoverage(ledger({ routes: [] }), policy());
  assert.equal(result.coverage.readyForHumanReview, false);
  assert.ok(result.coverage.missingCount > 0);
});

test('empty global policy does not manufacture a PASS', () => {
  const result = acceptanceCoverage(ledger({ routes: [] }), minimalPolicy());
  assert.equal(result.coverage.passCount, 0);
  assert.equal(result.coverage.readyForHumanReview, false);
});

test('all kinds are counted independently of requirement policy', () => {
  const second = check({ id: 'focus', kind: 'focus-visible', state: 'FAIL' });
  const a = ledger({ routes: [route({ checks: [check({ state: 'PASS' }), second] })] });
  const result = acceptanceCoverage(a, minimalPolicy());
  assert.equal(result.coverage.passCount, 1);
  assert.equal(result.coverage.failureCount, 1);
});

test('invalid ledger yields no apparent coverage', () => {
  const a = ledger({ routes: [route({ checks: [check({ state: 'maybe' })] })] });
  const result = acceptanceCoverage(a, minimalPolicy());
  assert.equal(result.ok, false);
  assert.equal(result.coverage, null);
});

test('invalid policy yields no apparent coverage', () => {
  const result = acceptanceCoverage(sample(), { ...policy(), global: ['not-real'] });
  assert.equal(result.ok, false);
  assert.equal(result.coverage, null);
});

test('summary is stable under check order changes', () => {
  const second = check({ id: 'second', kind: 'focus-visible', state: 'PASS' });
  const a = ledger({ routes: [route({ checks: [check(), second] })] });
  const b = ledger({ routes: [route({ checks: [second, check()] })] });
  assert.deepEqual(acceptanceCoverage(a, minimalPolicy()), acceptanceCoverage(b, minimalPolicy()));
});

test('a validation queue can be linked without network access', () => {
  const a = ledger({ routes: [route({ checks: [check({ reviewItemId: 'review-one' })] })] });
  const result = validateAcceptanceQueueLinks(a, queue(queueItem()));
  assert.equal(result.ok, true);
  assert.equal(result.links[0].reviewId, 'review-one');
  assert.equal(result.links[0].claimState, 'UNKNOWN');
});

test('missing queue records fail instead of creating references', () => {
  const a = ledger({ routes: [route({ checks: [check({ reviewItemId: 'missing' })] })] });
  const result = validateAcceptanceQueueLinks(a, queue());
  assert.equal(result.ok, false);
  assert.ok(issueCodes(result).includes('REVIEW_NOT_FOUND'));
});

test('invalid queues fail before extracting links', () => {
  const result = validateAcceptanceQueueLinks(sample(), { version: 1, items: [{}] });
  assert.equal(result.ok, false);
  assert.equal(result.links, null);
});

test('queue link metadata is preserved exactly', () => {
  const a = ledger({ routes: [route({ checks: [check({ reviewItemId: 'review-one' })] })] });
  const result = validateAcceptanceQueueLinks(a, queue(queueItem()));
  assert.equal(result.links[0].source, 'https://example.org/source');
  assert.equal(result.links[0].licence, 'CC0-1.0');
  assert.equal(result.links[0].retrievedOn, TODAY);
  assert.equal(result.links[0].tier, 0);
});

test('a link must never update the reported check state', () => {
  const a = ledger({ routes: [route({ checks: [check({ state: 'UNKNOWN', reviewItemId: 'review-one' })] })] });
  validateAcceptanceQueueLinks(a, queue(queueItem('review-one', { state: 'YES' })));
  assert.equal(a.routes[0].checks[0].state, 'UNKNOWN');
});

test('unresolved checks with no review link become work requests', () => {
  const result = unresolvedAcceptanceWork(sample(), queue(), minimalPolicy());
  assert.equal(result.ok, true);
  assert.equal(result.work[0].reason, 'MISSING_REVIEW_LINK');
  assert.equal(result.work[0].state, 'UNKNOWN');
});

test('a pending linked review is not treated as resolved', () => {
  const a = ledger({ routes: [route({ checks: [check({ reviewItemId: 'review-one' })] })] });
  const result = unresolvedAcceptanceWork(a, queue(queueItem()), minimalPolicy());
  assert.ok(result.work.some((entry) => entry.reason === 'REVIEW_OPEN'));
});

test('a completed linked review does not promote the test state', () => {
  const a = ledger({ routes: [route({ checks: [check({ reviewItemId: 'review-one' })] })] });
  const result = unresolvedAcceptanceWork(a, queue(queueItem('review-one', { status: 'closed' })), minimalPolicy());
  assert.equal(result.ok, true);
  assert.equal(a.routes[0].checks[0].state, 'UNKNOWN');
});

test('a failed check cannot be closed without review reference', () => {
  const result = unresolvedAcceptanceWork(sample('FAIL'), queue(), minimalPolicy());
  assert.ok(result.work.some((entry) => entry.reason === 'MISSING_REVIEW_LINK'));
});

test('missing technical checks remain explicit human work', () => {
  const result = unresolvedAcceptanceWork(sample(), queue(), policy());
  assert.ok(result.work.some((entry) => entry.reason === 'MISSING_CHECK'));
});

test('work requests preserve deterministic sorting', () => {
  const a = ledger({ routes: [route({ id: 'z', path: '/z', checks: [check()] }),
    route({ id: 'a', path: '/a', checks: [check()] })] });
  const result = unresolvedAcceptanceWork(a, queue(), minimalPolicy());
  assert.deepEqual(result.work.map((entry) => entry.routeId), ['a', 'z']);
});

test('coverage counters hide record data and retain only counts', () => {
  const result = coverageCounters(acceptanceCoverage(sample(), minimalPolicy()));
  assert.deepEqual(Object.keys(result).sort(), ['failed', 'missing', 'pass', 'readyForHumanReview', 'unknown']);
  assert.equal(result.unknown, 1);
});

test('invalid coverage has no counters', () => {
  assert.equal(coverageCounters({ ok: false }), null);
});

test('the coverage recommendation remains an advisory, not certification', () => {
  const result = acceptanceCoverage(sample('PASS'), minimalPolicy());
  assert.ok(result.coverage.advisory.includes('does not establish'));
});
