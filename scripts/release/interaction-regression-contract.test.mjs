import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REGRESSION_VERSION, OUTCOMES, LOCALES, NETWORK_MODES, STORAGE_MODES,
  CHECK_CATEGORIES, REGRESSION_LIMITS, problem, plainObject, pointer,
  normalKey, hasControl, safeIdentifier, safeText, safeRoute, safeHttps,
  dateIssues, frenchCopyIssues, pairIssues, privateFields, extraKeys,
  viewportIssues, checkIssues, runIssues, scopeKey, checkKey,
  inspectRegressionSnapshot, canonicalSnapshot, fingerprintSnapshot,
  parseRegressionSnapshot, serializeRegressionSnapshot,
} from './interaction-regression-contract.mjs';
import { sampleCheck, sampleRun, sampleSnapshot, pairedSnapshot,
  copy, HASH_A, FIXTURE_DAY } from './interaction-regression-fixtures.mjs';

const codes = (issues) => issues.map((issue) => issue.code);
const inspect = (value, extra = {}) => inspectRegressionSnapshot(value, { today: FIXTURE_DAY, ...extra });

test('outcome and environment vocabularies are bounded', () => {
  assert.equal(REGRESSION_VERSION, 1);
  assert.deepEqual(OUTCOMES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.deepEqual(LOCALES, ['en', 'fr']);
  assert.ok(NETWORK_MODES.includes('UNKNOWN'));
  assert.ok(STORAGE_MODES.includes('UNKNOWN'));
  assert.ok(CHECK_CATEGORIES.includes('keyboard'));
  assert.ok(REGRESSION_LIMITS.maxBytes < 50_000_000);
});
test('problem and object semantics are stable', () => {
  assert.deepEqual(problem('NO_SOURCE', '/a'), { code: 'NO_SOURCE', path: '/a' });
  assert.equal(plainObject({}), true);
  assert.equal(plainObject(Object.create(null)), true);
  for (const input of [null, [], new Date(), new Map()]) assert.equal(plainObject(input), false);
  assert.equal(pointer('a~/b'), 'a~0~1b');
  assert.equal(normalKey('API_KEY'), 'apikey');
});
test('control characters are checked without a prohibited character-range regexp', () => {
  for (const input of ['a\nb', 'a\rb', 'a\tb', 'a\u007fb']) assert.equal(hasControl(input), true);
  assert.equal(hasControl('Aucun élément fictif'), false);
});
test('identifiers must not be arbitrary input or prototype fields', () => {
  for (const value of ['abc', 'a.b:c_1', 'check-a']) assert.equal(safeIdentifier(value), true);
  for (const value of ['', '1a', 'a/b', 'a b', 'constructor', '__proto__',
    'prototype', 'a'.repeat(99), null]) assert.equal(safeIdentifier(value), false);
});
test('text is nonempty, bounded, and does not embed markup', () => {
  assert.equal(safeText('Synthetic text'), true);
  for (const value of ['', '  ', '<b>text</b>', 'bad\nline', 'a'.repeat(3_000)]) {
    assert.equal(safeText(value), false);
  }
});
test('routes refuse path traversal, remote references and query strings', () => {
  for (const route of ['/examples', '/examples/step-1']) assert.equal(safeRoute(route), true);
  for (const route of ['relative', 'https://example.org', '//example.org', '/a/../b',
    '/a/./b', '/a//b', '/a?x=1', '/a#hash', '/a%2Fb', '/a\\b', '/a\nb']) {
    assert.equal(safeRoute(route), false, route);
  }
});
test('sources are credential-free HTTPS, not local or network-internal URLs', () => {
  assert.equal(safeHttps('https://example.org/source'), true);
  for (const url of ['http://example.org', 'https://user:pass@example.org',
    'https://example.org/#token', 'https://localhost/x', 'https://127.0.0.1/x',
    'https://192.168.0.1/x', 'https://10.0.0.2/x', 'https://[::1]/x',
    'javascript:alert(1)', 'file:///test', '']) assert.equal(safeHttps(url), false, url);
});
test('valid dates include leap days and refuse later dates', () => {
  assert.deepEqual(dateIssues('2024-02-29', '/date'), []);
  assert.ok(codes(dateIssues('2025-02-29', '/date')).includes('DATE_INVALID'));
  assert.ok(codes(dateIssues('2026-11-21', '/date', FIXTURE_DAY)).includes('FUTURE_DATE'));
});
test('French copy requires exact NBSP and narrow spaces', () => {
  assert.deepEqual(frenchCopyIssues('Source\u00a0: «\u202fEssai\u202f»\u202f!', '/fr'), []);
  for (const [text, code] of [['Source :', 'FR_COLON'], ['Oui ?', 'FR_NARROW'],
    ['Attention !', 'FR_NARROW'], ['Oui ;', 'FR_NARROW'],
    ['«essai»', 'FR_GUILLEMET'], ["l'exemple", 'FR_APOSTROPHE']]) {
    assert.ok(codes(frenchCopyIssues(text, '/fr')).includes(code), text);
  }
});
test('paired copy requires complete languages', () => {
  assert.deepEqual(pairIssues({ en: 'Example', fr: 'Exemple' }, '/label'), []);
  assert.ok(codes(pairIssues({ en: 'Example' }, '/label')).includes('LOCALE_TEXT_REQUIRED'));
  assert.ok(codes(pairIssues({ en: 'Example', fr: 'Exemple', de: 'Test' }, '/label')).includes('LOCALE_EXTRA'));
});
test('private traversal returns paths without sensitive values', () => {
  const value = { rows: [{ email: 'private@example.org', health_card: 'hidden' }] };
  const issues = privateFields(value);
  assert.equal(issues.length, 2);
  assert.ok(!JSON.stringify(issues).includes('private@example.org'));
  const cycle = {}; cycle.self = cycle;
  assert.ok(codes(privateFields(cycle)).includes('CYCLIC_DATA'));
});
test('unknown keys and incorrect viewport values fail closed', () => {
  assert.ok(codes(extraKeys({ a: 1, b: 2 }, new Set(['a']), '/')).includes('EXTRA_FIELD'));
  assert.deepEqual(viewportIssues({ width: 390, height: 844 }, '/viewport'), []);
  for (const width of [0, 199, 8193, 390.5, null, '390']) {
    assert.ok(codes(viewportIssues({ width, height: 844 }, '/viewport')).includes('VIEWPORT_DIMENSION'));
  }
});
test('valid synthetic UNKNOWN record remains unknown', () => {
  assert.deepEqual(checkIssues(sampleCheck(), '/check', FIXTURE_DAY), []);
  assert.equal(inspect(sampleSnapshot()).ok, true);
  assert.equal(inspect(sampleSnapshot()).snapshot.runs[0].checks[0].outcome, 'UNKNOWN');
});
test('every record must carry source licence date and tier', () => {
  for (const [field, code] of [['source', 'SOURCE_URL'], ['licence', 'SOURCE_LICENCE'],
    ['retrievedOn', 'DATE_INVALID'], ['tier', 'SOURCE_TIER']]) {
    const check = sampleCheck(); delete check[field];
    assert.ok(codes(checkIssues(check, '/check')).includes(code), field);
  }
});
test('invalid check outcomes do not become unknown or pass', () => {
  for (const outcome of ['yes', 'pass', 'NO', true, 1, null]) {
    assert.ok(codes(checkIssues(sampleCheck('a', 'keyboard', { outcome }), '/check')).includes('CHECK_OUTCOME'));
  }
});
test('target PASS requires real dimensions at least 44 by 44', () => {
  const base = sampleCheck('target-a', 'target', { outcome: 'PASS' });
  assert.ok(codes(checkIssues(base, '/check')).includes('TARGET_MEASUREMENT_REQUIRED'));
  assert.ok(codes(checkIssues({ ...base, targetWidth: 43, targetHeight: 44 }, '/check')).includes('TARGET_PASS_CONTRADICTION'));
  assert.equal(checkIssues({ ...base, targetWidth: 44, targetHeight: 44 }, '/check').length, 0);
});
test('run validation enforces language network and storage', () => {
  assert.equal(runIssues(sampleRun(), '/runs/0').length, 0);
  for (const [field, value, code] of [['locale', 'es', 'RUN_LOCALE'],
    ['network', 'connected', 'RUN_NETWORK'], ['storage', 'OK', 'RUN_STORAGE']]) {
    assert.ok(codes(runIssues(sampleRun('a', { [field]: value }), '/runs/0')).includes(code));
  }
});
test('duplicate runs and duplicate scope are rejected', () => {
  const same = sampleSnapshot('release', { runs: [sampleRun('a'), sampleRun('b')] });
  assert.ok(codes(inspect(same).issues).includes('DUPLICATE_SCOPE'));
  same.runs[1].id = 'a';
  assert.ok(codes(inspect(same).issues).includes('DUPLICATE_RUN_ID'));
});
test('run scope identity includes locale and viewport', () => {
  assert.equal(scopeKey(sampleRun()), '/examples|en|offline|ready|390|844');
  assert.equal(checkKey(sampleRun(), sampleCheck('x')), '/examples|en|offline|ready|390|844|x');
});
test('canonical order is stable without mutating source', () => {
  const snap = sampleSnapshot('release', { runs: [sampleRun('a', {
    checks: [sampleCheck('z'), sampleCheck('b')],
  })] });
  const before = JSON.stringify(snap);
  assert.deepEqual(canonicalSnapshot(snap).runs[0].checks.map((check) => check.id), ['b', 'z']);
  assert.equal(JSON.stringify(snap), before);
});
test('fingerprints are permutation independent but sensitive to outcomes', () => {
  const left = pairedSnapshot();
  const right = copy(left); right.runs.reverse();
  assert.equal(fingerprintSnapshot(left).fingerprint, fingerprintSnapshot(right).fingerprint);
  right.runs[0].checks[0].outcome = 'FAIL';
  assert.notEqual(fingerprintSnapshot(left).fingerprint, fingerprintSnapshot(right).fingerprint);
});
test('parser and serializer validate rather than tolerating malformed data', () => {
  assert.ok(codes(parseRegressionSnapshot('{').issues).includes('INVALID_JSON'));
  assert.ok(codes(parseRegressionSnapshot('a'.repeat(REGRESSION_LIMITS.maxBytes + 1)).issues).includes('INPUT_BYTES'));
  const result = serializeRegressionSnapshot(sampleSnapshot());
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(result.text).runs[0].checks[0].outcome, 'UNKNOWN');
});
test('missing source date fails a claim even when its outcome is unknown', () => {
  const snap = sampleSnapshot('release', { runs: [sampleRun('a', {
    checks: [sampleCheck('a', 'keyboard', { retrievedOn: null })],
  })] });
  assert.equal(inspect(snap).ok, false);
});
test('unrecognized proof digest format is rejected', () => {
  assert.equal(checkIssues(sampleCheck('a', 'keyboard', { artifactSha256: HASH_A }), '/c').length, 0);
  assert.ok(codes(checkIssues(sampleCheck('a', 'keyboard', { artifactSha256: 'abc' }), '/c')).includes('ARTIFACT_HASH'));
});

test('cyclic and unencodable snapshots fail closed without throwing', () => {
  const cycle = sampleSnapshot();
  cycle.loop = cycle;
  assert.equal(inspect(cycle).ok, false);
  const unencodable = sampleSnapshot();
  unencodable.extra = 10n;
  assert.equal(inspect(unencodable).ok, false);
});
