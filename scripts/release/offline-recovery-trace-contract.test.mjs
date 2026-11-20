import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
  TRACE_VERSION, TRACE_OUTCOMES, TRACE_MODES, TRACE_CATEGORIES, TRACE_STEPS,
  TRACE_LIMITS, problem, pointer, plain, validId, validDay, cleanText,
  validSourceUrl, validRoute, frenchCopyIssues, bilingualIssues,
  privateKeyIssues, extraKeys, sourceIssues, stepIssues, traceIssues,
  inspectTraceDocument, parseTraceDocument, canonicalTraceDocument,
  traceFingerprint,
} from './offline-recovery-trace-contract.mjs';
import { TODAY, source, label, trace, document, emptyDocument, action,
  failure, recovery, check, broken } from './offline-recovery-trace-fixtures.mjs';

const inspect = (value) => inspectTraceDocument(value, { today: TODAY });
const codes = (value) => value.problems.map((item) => item.code);
const has = (value, code) => assert.ok(codes(value).includes(code), `${code}: ${codes(value)}`);
const modify = (change) => {
  const value = document();
  change(value);
  return inspect(value);
};

test('version and enums keep explicit, finite vocabularies', () => {
  assert.equal(TRACE_VERSION, 1);
  assert.deepEqual(TRACE_OUTCOMES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.equal(TRACE_MODES.includes('UNKNOWN'), true);
  assert.equal(TRACE_CATEGORIES.includes('keyboard'), true);
  assert.equal(TRACE_CATEGORIES.includes('announcement'), true);
  assert.deepEqual(TRACE_STEPS, ['action', 'failure', 'recovery', 'check']);
});
test('limits bound work on untrusted documents', () => {
  assert.ok(TRACE_LIMITS.bytes < 50_000_000);
  assert.ok(TRACE_LIMITS.traces >= 1 && TRACE_LIMITS.traces <= 1000);
  assert.ok(TRACE_LIMITS.steps >= 1 && TRACE_LIMITS.steps <= 1000);
  assert.ok(TRACE_LIMITS.findings > 0);
});
test('synthetic complete record is accepted', () => {
  const result = inspect(document());
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.traces.length, 1);
});
test('empty document is permitted but does not create a trace', () => {
  const result = inspect(emptyDocument());
  assert.equal(result.ok, true);
  assert.deepEqual(result.traces, []);
});
test('JSON pointer escaping is deterministic', () => {
  assert.equal(pointer('a/b~c'), 'a~1b~0c');
  assert.equal(pointer(''), '');
  assert.deepEqual(problem('CODE', '/path'), { code: 'CODE', path: '/path' });
});
test('plain object detection rejects arrays and class objects', () => {
  assert.equal(plain({}), true);
  assert.equal(plain(Object.create(null)), true);
  assert.equal(plain(null), false);
  assert.equal(plain([]), false);
  assert.equal(plain(new Date()), false);
});
test('identifier accepts stable punctuation and rejects prototype keys', () => {
  for (const id of ['a', 'a-b', 'a_b', 'a.b', 'a:b', 'r123']) assert.equal(validId(id), true);
  for (const id of ['', 'a/b', 'a b', 'constructor', '__proto__', 'prototype',
    null, 12, 'a'.repeat(129)]) assert.equal(validId(id), false);
});
test('calendar dates are strict including leap years', () => {
  for (const date of ['2024-02-29', '2000-02-29', '2026-11-20', '0001-01-01']) {
    assert.equal(validDay(date), true, date);
  }
  for (const date of ['2025-02-29', '1900-02-29', '2026-04-31',
    '2026-00-02', '2026-13-01', '2026-1-1', '0000-01-01',
    '', 'yesterday', null, undefined, 123]) assert.equal(validDay(date), false, String(date));
});
test('safe text rejects controls, newlines and invalid lengths', () => {
  assert.equal(cleanText('Synthetic label'), true);
  for (const value of ['', ' ', '\n', 'abc\u0000', 'abc\u001f',
    'abc\u007f', 'abc\u2028', 'abc\u2029', 'x'.repeat(513), null]) {
    assert.equal(cleanText(value), false, JSON.stringify(value));
  }
});
test('source URL must be safe HTTPS without credentials or fragments', () => {
  assert.equal(validSourceUrl('https://example.org/evidence'), true);
  for (const value of ['http://example.org', 'file:///tmp/a', 'javascript:alert(1)',
    'https://user:pass@example.org', 'https://localhost/a',
    'https://127.0.0.1/a', 'https://[::1]/', 'https://example.org/#frag',
    'https://example.org/\n', '', 123]) assert.equal(validSourceUrl(value), false, String(value));
});
test('route must be local, absolute and path-safe', () => {
  for (const value of ['/', '/synthetic', '/a/b-c', '/fr/route']) assert.equal(validRoute(value), true);
  for (const value of ['relative', '//external', '/a/../b', '/a/./b', '/a\\b',
    '/a?secret=1', '/a#fragment', '\n', null, 'x'.repeat(515)]) {
    assert.equal(validRoute(value), false, String(value));
  }
});
test('French typography requires NBSP before colons', () => {
  assert.deepEqual(frenchCopyIssues('Source\u00a0: UNKNOWN'), []);
  assert.ok(frenchCopyIssues('Source : UNKNOWN').some((issue) => issue.code === 'FR_COLON_SPACE'));
});
test('French typography requires narrow spaces before punctuation', () => {
  assert.deepEqual(frenchCopyIssues('Vraiment\u202f? Oui\u202f! Essai\u202f; suite'), []);
  for (const text of ['Vraiment ?', 'Oui !', 'Essai ; suite']) {
    assert.ok(frenchCopyIssues(text).some((issue) => issue.code === 'FR_NARROW_SPACE'));
  }
});
test('French guillemets require inner narrow spaces', () => {
  assert.deepEqual(frenchCopyIssues('«\u202fExemple\u202f»'), []);
  assert.equal(frenchCopyIssues('«Exemple»').filter((issue) => issue.code === 'FR_GUILLEMET_SPACE').length, 2);
});
test('French apostrophes must be curly between letters', () => {
  assert.deepEqual(frenchCopyIssues('L’entrée d’essai'), []);
  assert.ok(frenchCopyIssues("L'entrée d'essai").length >= 2);
});
test('bilingual fields accept only en and fr', () => {
  assert.deepEqual(bilingualIssues(label(), '/label'), []);
  assert.equal(bilingualIssues({ en: 'A' }, '/label')[0].code, 'BILINGUAL_TEXT');
  assert.equal(bilingualIssues({ en: 'A', fr: 'B', de: 'C' }, '/label')[0].code, 'BILINGUAL_TEXT');
  assert.equal(bilingualIssues({ en: 'A', fr: ' ' }, '/label')[0].code, 'BILINGUAL_TEXT');
  assert.ok(bilingualIssues({ en: 'A', fr: 'B : X' }, '/label').length > 0);
});
test('private keys report paths without exposing their values', () => {
  const issues = privateKeyIssues({ inner: [{ password: 'never-log-this' }] });
  assert.ok(issues.some((entry) => entry.path === '/inner/0/password'));
  assert.ok(!JSON.stringify(issues).includes('never-log-this'));
});
test('private walker handles cycles and nesting bounds', () => {
  const circular = { id: 'x' };
  circular.loop = circular;
  assert.ok(privateKeyIssues(circular).some((entry) => entry.code === 'CYCLIC_OBJECT'));
  let nested = {};
  for (let i = 0; i < 30; i += 1) nested = { child: nested };
  assert.ok(privateKeyIssues(nested).some((entry) => entry.code === 'DEPTH_LIMIT'));
});
test('extra fields must not be silently carried into reports', () => {
  const result = extraKeys({ foo: 1, bar: 2 }, new Set(['foo']), '/row');
  assert.deepEqual(result, [{ code: 'EXTRA_FIELD', path: '/row/bar' }]);
});
test('source provenance is required even on UNKNOWN records', () => {
  const result = sourceIssues({}, '/source', TODAY).map((entry) => entry.code);
  for (const code of ['SOURCE_URL', 'SOURCE_LICENCE', 'SOURCE_RETRIEVED_ON', 'SOURCE_TIER']) {
    assert.ok(result.includes(code));
  }
});
test('accepted provenance has recognized licence, date and tier', () => {
  assert.deepEqual(sourceIssues(source(), '/source', TODAY), []);
  for (const tier of [0, 1, 2, 3, 4, 'E']) {
    assert.deepEqual(sourceIssues(source({ tier }), '/source', TODAY), []);
  }
});
test('unknown source tier is missing evidence, not a higher tier', () => {
  assert.ok(sourceIssues(source({ tier: 'UNKNOWN' }), '/s', TODAY)
    .some((entry) => entry.code === 'SOURCE_TIER'));
});
test('future retrieval and source-date order are rejected', () => {
  const a = sourceIssues(source({ retrievedOn: '2026-11-21' }), '/s', TODAY);
  assert.ok(a.some((entry) => entry.code === 'SOURCE_RETRIEVED_ON'));
  const b = sourceIssues(source({ sourceDate: '2026-11-20' }), '/s', TODAY);
  assert.ok(b.some((entry) => entry.code === 'SOURCE_DATE_ORDER'));
});
test('step validation prevents duplicate identifiers', () => {
  const seen = new Set();
  assert.deepEqual(stepIssues(action(), '/steps/0', TODAY, seen), []);
  assert.ok(stepIssues(action(), '/steps/1', TODAY, seen).some((entry) => entry.code === 'STEP_DUPLICATE'));
});
test('step requires finite, bounded ordering and fixed outcome vocabulary', () => {
  const seen = new Set();
  assert.ok(stepIssues(action({ at: -1 }), '/s', TODAY, seen).length > 0);
  assert.ok(stepIssues(action({ at: Number.POSITIVE_INFINITY }), '/s', TODAY, new Set()).length > 0);
  assert.ok(stepIssues(action({ outcome: true }), '/s', TODAY, new Set()).some((entry) => entry.code === 'STEP_OUTCOME'));
  assert.ok(stepIssues(action({ kind: 'guess' }), '/s', TODAY, new Set()).some((entry) => entry.code === 'STEP_KIND'));
});
test('trace validates every step and its source', () => {
  assert.deepEqual(traceIssues(trace(), '/trace', TODAY, TODAY), []);
  const invalid = traceIssues(trace('a', { source: {} }), '/trace', TODAY, TODAY);
  assert.ok(invalid.some((entry) => entry.code === 'SOURCE_URL'));
});
test('trace rejects duplicate step references and backward links', () => {
  const bad = trace('a', { steps: [action(), failure(), recovery({ linkedTo: 'c1' }), check()] });
  assert.ok(traceIssues(bad, '/trace', TODAY, TODAY).some((entry) => entry.code === 'BROKEN_STEP_LINK'));
});
test('trace enforces chronological event order', () => {
  const steps = [action(), failure({ at: 1 }), recovery(), check()];
  const result = inspect(document(trace('a', { steps })));
  has(result, 'STEP_ORDER');
});
test('trace locale, category and mode are fixed enumerations', () => {
  has(modify((value) => { value.traces[0].locale = 'es'; }), 'TRACE_LOCALE');
  has(modify((value) => { value.traces[0].mode = 'fast'; }), 'TRACE_MODE');
  has(modify((value) => { value.traces[0].category = 'diagnostic'; }), 'TRACE_CATEGORY');
});
test('document rejects unknown schema and malformed input', () => {
  has(inspect(broken({ version: 2 })), 'DOCUMENT_VERSION');
  has(inspect(null), 'DOCUMENT_INVALID');
  has(inspect([]), 'DOCUMENT_INVALID');
  has(inspect(broken({ releaseId: '' })), 'RELEASE_ID');
});
test('document refuses duplicate traces', () => {
  has(inspect(document(trace('dup'), trace('dup'))), 'DUPLICATE_TRACE');
});
test('document refuses private data before serializing', () => {
  const value = document();
  value.traces[0].steps[0].token = 'private-input';
  const result = inspect(value);
  has(result, 'PRIVATE_FIELD');
  assert.equal(JSON.stringify(result).includes('private-input'), false);
});
test('recordedOn is exact and cannot exceed reference date', () => {
  has(inspect(broken({ recordedOn: '2026-11-21' })), 'RECORD_DATE');
  has(inspect(broken({ recordedOn: '2026-02-30' })), 'RECORD_DATE');
});
test('trace count and step count are bounded', () => {
  const many = document(...Array.from({ length: TRACE_LIMITS.traces + 1 }, (_, i) => trace(`id${i}`)));
  has(inspect(many), 'TRACES_INVALID');
  const long = trace('a', { steps: Array.from({ length: TRACE_LIMITS.steps + 1 }, (_, i) =>
    action({ id: `a${i}`, at: i })) });
  has(inspect(document(long)), 'TRACE_STEPS');
});
test('parsing is bounded by UTF-8 bytes', () => {
  const raw = JSON.stringify(document());
  assert.equal(parseTraceDocument(raw).ok, true);
  assert.equal(parseTraceDocument('{').ok, false);
  assert.equal(parseTraceDocument('x'.repeat(TRACE_LIMITS.bytes + 1)).problems[0].code, 'INPUT_BYTES');
  assert.equal(Buffer.byteLength(raw, 'utf8') > 0, true);
});
test('canonicalization sorts traces independent of insertion order', () => {
  const a = document(trace('z'), trace('a'));
  const b = document(trace('a'), trace('z'));
  assert.deepEqual(canonicalTraceDocument(a).value, canonicalTraceDocument(b).value);
});
test('fingerprint is stable and changes when evidence changes', () => {
  const first = document(trace());
  const copy = JSON.parse(JSON.stringify(first));
  assert.equal(traceFingerprint(first).hash, traceFingerprint(copy).hash);
  copy.traces[0].steps[3].code = 'DIFFERENT_CHECK';
  assert.notEqual(traceFingerprint(first).hash, traceFingerprint(copy).hash);
});
test('invalid document refuses a fingerprint', () => {
  const result = traceFingerprint({ releaseId: 'missing' });
  assert.equal(result.ok, false);
  assert.equal(result.hash, null);
});
test('input and output are not mutated by inspection', () => {
  const value = document();
  const snapshot = JSON.stringify(value);
  inspect(value);
  canonicalTraceDocument(value);
  traceFingerprint(value);
  assert.equal(JSON.stringify(value), snapshot);
});
