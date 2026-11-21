import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COVERAGE_VERSION, REQUIRED_CATEGORIES, coveragePolicyIssues,
  defaultCoveragePolicy, expectedScopes, coverageObservation,
  analyzeCoverage, reviewMissingCoverage, compareCoverage,
  policyCoverageCategories, missingLanguages, coverageByRoute,
} from './interaction-regression-coverage.mjs';
import {
  sampleCheck, sampleRun, sampleSnapshot, pairedSnapshot,
  sampleCoveragePolicy, changedSnapshot, copy,
} from './interaction-regression-fixtures.mjs';

const issues = (policy) => coveragePolicyIssues(policy).map((issue) => issue.code);
const calculate = (snapshot = sampleSnapshot(), policy = sampleCoveragePolicy()) =>
  analyzeCoverage(snapshot, policy);

test('coverage vocabulary includes core accessibility categories', () => {
  assert.equal(COVERAGE_VERSION, 1);
  for (const kind of ['keyboard', 'focus', 'screen-reader', 'target',
    'locale', 'offline', 'storage']) assert.ok(REQUIRED_CATEGORIES.includes(kind));
});
test('default policy explicitly requests both languages and network modes', () => {
  const value = defaultCoveragePolicy(['/examples']);
  assert.deepEqual(value.locales, ['en', 'fr']);
  assert.deepEqual(value.networks, ['online', 'offline']);
  assert.deepEqual(value.storages, ['ready', 'blocked']);
  assert.equal(value.viewports[0].width, 390);
});
test('root route is a valid application route', () => {
  assert.deepEqual(coveragePolicyIssues(defaultCoveragePolicy(['/'])), []);
});
test('policy must be a record with the accepted version', () => {
  assert.ok(issues(null).includes('COVERAGE_POLICY_REQUIRED'));
  assert.ok(issues({ ...sampleCoveragePolicy(), version: 2 }).includes('COVERAGE_POLICY_VERSION'));
});
test('route policy rejects empty, duplicate and unsafe routes', () => {
  assert.ok(issues(sampleCoveragePolicy({ routes: [] })).includes('COVERAGE_ROUTES'));
  assert.ok(issues(sampleCoveragePolicy({ routes: ['/examples', '/examples'] })).includes('COVERAGE_DUPLICATE_ROUTE'));
  assert.ok(issues(sampleCoveragePolicy({ routes: ['/a/../b'] })).includes('COVERAGE_ROUTE'));
});
test('language policy must use explicit en/fr entries', () => {
  assert.ok(issues(sampleCoveragePolicy({ locales: [] })).includes('COVERAGE_LOCALES'));
  assert.ok(issues(sampleCoveragePolicy({ locales: ['es'] })).includes('COVERAGE_LOCALES'));
  assert.ok(issues(sampleCoveragePolicy({ locales: ['en', 'en'] })).includes('COVERAGE_DUPLICATE_VALUE'));
});
test('network and storage policies must use accepted states', () => {
  assert.ok(issues(sampleCoveragePolicy({ networks: ['connected'] })).includes('COVERAGE_NETWORKS'));
  assert.ok(issues(sampleCoveragePolicy({ storages: ['OK'] })).includes('COVERAGE_STORAGES'));
  assert.ok(issues(sampleCoveragePolicy({ networks: ['offline', 'offline'] })).includes('COVERAGE_DUPLICATE_VALUE'));
});
test('category lists are explicit and bounded', () => {
  assert.ok(issues(sampleCoveragePolicy({ categories: [] })).includes('COVERAGE_CATEGORIES'));
  assert.ok(issues(sampleCoveragePolicy({ categories: ['guess'] })).includes('COVERAGE_CATEGORIES'));
  assert.ok(issues(sampleCoveragePolicy({ categories: ['keyboard', 'keyboard'] })).includes('COVERAGE_DUPLICATE_VALUE'));
});
test('invalid viewport and duplicate viewport are reported', () => {
  assert.ok(issues(sampleCoveragePolicy({ viewports: [{ width: 100, height: 844 }] })).includes('COVERAGE_VIEWPORT'));
  assert.ok(issues(sampleCoveragePolicy({ viewports: [
    { width: 390, height: 844 }, { width: 390, height: 844 },
  ] })).includes('COVERAGE_DUPLICATE_VIEWPORT'));
});
test('unexpected configuration fields cause a review failure', () => {
  assert.ok(issues(sampleCoveragePolicy({ autoApprove: true })).includes('COVERAGE_EXTRA_FIELD'));
});
test('expected-scope expansion respects the cross product exactly', () => {
  const policy = sampleCoveragePolicy({
    networks: ['offline', 'online'], storages: ['ready', 'blocked'],
    viewports: [{ width: 390, height: 844 }, { width: 768, height: 1_024 }],
  });
  const result = expectedScopes(policy);
  assert.equal(result.ok, true);
  assert.equal(result.scopes.length, 16);
  assert.equal(result.scopes.filter((scope) => scope.locale === 'fr').length, 8);
});
test('scope expansion rejects pathological combinations instead of truncating', () => {
  const routes = Array.from({ length: 101 }, (_, i) => `/route-${i}`);
  const policy = sampleCoveragePolicy({
    routes, networks: ['online', 'offline', 'limited', 'UNKNOWN'],
    storages: ['ready', 'blocked', 'full', 'UNKNOWN'],
    viewports: Array.from({ length: 10 }, (_, i) => ({ width: 390 + i, height: 844 })),
  });
  assert.equal(expectedScopes(policy).ok, false);
});
test('an absent run is UNKNOWN rather than FAIL or PASS', () => {
  assert.deepEqual(coverageObservation(null, 'keyboard'), {
    outcome: 'UNKNOWN', recorded: false, reason: 'SCOPE_MISSING',
  });
});
test('a run with absent category stays UNKNOWN', () => {
  const result = coverageObservation(sampleRun(), 'focus');
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.recorded, false);
});
test('a recorded unknown check is not counted as absent', () => {
  const result = coverageObservation(sampleRun(), 'keyboard');
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.recorded, true);
});
test('one failed check dominates other captured checks in its category', () => {
  const run = sampleRun('a', { checks: [
    sampleCheck('one', 'keyboard', { outcome: 'PASS' }),
    sampleCheck('two', 'keyboard', { outcome: 'FAIL' }),
  ] });
  assert.equal(coverageObservation(run, 'keyboard').outcome, 'FAIL');
});
test('one unknown check prevents apparent full category pass', () => {
  const run = sampleRun('a', { checks: [
    sampleCheck('one', 'keyboard', { outcome: 'PASS' }), sampleCheck('two'),
  ] });
  assert.equal(coverageObservation(run, 'keyboard').outcome, 'UNKNOWN');
});
test('a fully recorded PASS category is only a recorded result', () => {
  assert.equal(coverageObservation(sampleRun('a', { checks: [
    sampleCheck('one', 'keyboard', { outcome: 'PASS' }),
  ] }), 'keyboard').outcome, 'PASS');
});
test('coverage counts absent categories in both languages', () => {
  const result = calculate();
  assert.equal(result.ok, true);
  assert.equal(result.summary.scopes, 2);
  assert.equal(result.summary.checks, 6);
  assert.equal(result.summary.absent, 5);
  assert.equal(result.summary.UNKNOWN, 6);
  assert.equal(result.summary.releaseEligible, false);
});
test('paired snapshots increase recorded coverage without promoting unknown', () => {
  const result = calculate(pairedSnapshot());
  assert.equal(result.summary.recorded, 2);
  assert.equal(result.summary.UNKNOWN, 6);
  assert.equal(result.summary.locales.fr.UNKNOWN, 3);
});
test('recorded failure is retained in coverage, not converted to missing', () => {
  const result = calculate(changedSnapshot('FAIL'));
  assert.equal(result.summary.FAIL, 1);
  assert.equal(result.summary.absent, 5);
});
test('invalid record or invalid policy cannot produce a coverage summary', () => {
  const bad = copy(sampleSnapshot()); bad.runs[0].checks[0].source = '';
  assert.equal(calculate(bad).summary, null);
  assert.equal(calculate(sampleSnapshot(), { version: 0 }).summary, null);
});
test('review worklist contains absent and unknown outcomes', () => {
  const result = calculate();
  const pending = reviewMissingCoverage(result);
  assert.equal(pending.length, 6);
  assert.ok(pending.some((row) => row.action === 'Capture missing evidence'));
  assert.ok(pending.some((row) => row.action === 'Review captured outcome'));
});
test('unrecorded French locale is identified explicitly', () => {
  assert.deepEqual(missingLanguages(calculate()), ['fr']);
  assert.deepEqual(missingLanguages(calculate(pairedSnapshot())), []);
});
test('coverage comparison finds newly captured categories', () => {
  const earlier = calculate();
  const later = calculate(pairedSnapshot());
  const result = compareCoverage(earlier, later);
  assert.equal(result.ok, true);
  assert.ok(result.changes.some((change) => !change.beforeRecorded && change.afterRecorded));
});
test('coverage comparison rejects incomplete inputs', () => {
  assert.equal(compareCoverage(null, calculate()).ok, false);
  assert.equal(compareCoverage(calculate(), null).ok, false);
});
test('policy category summary is sorted and not mutated', () => {
  const policy = sampleCoveragePolicy();
  const before = JSON.stringify(policy);
  assert.deepEqual(policyCoverageCategories(policy).categories, ['focus', 'keyboard', 'screen-reader']);
  assert.equal(JSON.stringify(policy), before);
});
test('route summaries count unknown checks rather than omitting them', () => {
  const result = coverageByRoute(calculate());
  assert.equal(result['/examples'].UNKNOWN, 6);
  assert.equal(result['/examples'].PASS, 0);
});
test('missing scope count can never imply release eligibility', () => {
  const result = calculate(sampleSnapshot('a'), sampleCoveragePolicy({ routes: ['/different'] }));
  assert.equal(result.summary.missingScopes, 2);
  assert.equal(result.summary.releaseEligible, false);
});
