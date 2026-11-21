import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import {
  TRACE_VERSION, TRACE_STATES, TRACE_LOCALES, TRACE_CHANNELS,
  TRACE_EVENT_TYPES, TRACE_LIMITS, issue, pointer, plain, strictDate,
  safeId, safeString, safeUrl, frenchTextIssues, bilingualIssues,
  privateIssues, sourceIssues, eventIssues, stepIssues, journeyIssues,
  inspectTrace, canonicalTrace, fingerprintTrace, parseTrace,
} from './assistive-trace-contract.mjs';
import { TODAY, source, pair, event, step, journey, trace, clone } from './assistive-trace-fixtures.mjs';

const inspect = (value, options = { today: TODAY }) => inspectTrace(value, options);
const codes = (result) => result.problems.map(({ code }) => code);
const reject = (value, expected) => assert.ok(codes(inspect(value)).includes(expected), `${expected} ${codes(inspect(value))}`);

test('contract exposes unambiguous version and conservative result states', () => {
  assert.equal(TRACE_VERSION, 1);
  assert.deepEqual(TRACE_STATES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.deepEqual(TRACE_LOCALES, ['en', 'fr']);
  assert.ok(TRACE_CHANNELS.includes('announcement'));
  assert.ok(TRACE_EVENT_TYPES.includes('step-end'));
  assert.ok(TRACE_LIMITS.bytes < 50_000_000);
});
test('issue returns code and path but no private input', () => {
  assert.deepEqual(issue('TEST', '/test'), { code: 'TEST', path: '/test', level: 'error' });
  assert.equal(issue('REVIEW', '/', 'review').level, 'review');
});
test('pointer escapes both JSON pointer metacharacters', () => {
  assert.equal(pointer('a~/b'), 'a~0~1b');
  assert.equal(pointer('plain'), 'plain');
});
test('plain includes null prototype but excludes class instances', () => {
  assert.equal(plain({}), true);
  assert.equal(plain(Object.create(null)), true);
  assert.equal(plain(null), false);
  assert.equal(plain([]), false);
  assert.equal(plain(new Date()), false);
});
test('calendar leap years and lower bound are exact', () => {
  for (const date of ['2024-02-29', '2000-02-29', '0001-01-01', TODAY]) assert.equal(strictDate(date), true, date);
  for (const date of ['1900-02-29', '2025-02-29', '2026-02-30', '0000-01-01', '2026-13-01', '2026-1-1', '', null]) assert.equal(strictDate(date), false, String(date));
});
test('safe ids reject prototype keys and slashes', () => {
  for (const id of ['x', 'x:y', 'a-b', 'a_b', 'a.b']) assert.equal(safeId(id), true, id);
  for (const id of ['__proto__', 'constructor', 'prototype', '', '/x', '../x', 'x'.repeat(130), null]) assert.equal(safeId(id), false, String(id));
});
test('safe strings permit French punctuation but exclude control bytes', () => {
  assert.equal(safeString('L’examen\u00A0: prêt\u202F!'), true);
  for (const value of ['', ' ', 'abc\n', 'abc\u0000', 'abc\u007f', 'abc\u2028', 'x'.repeat(3_000), 14]) assert.equal(safeString(value), false, String(value).slice(0, 20));
});
test('only safe HTTPS source URLs are accepted', () => {
  assert.equal(safeUrl('https://example.org/source'), true);
  for (const url of ['http://example.org', 'javascript:alert(1)', 'file:///x',
    'https://x:y@example.org', 'https://localhost/x', 'https://127.0.0.1',
    'https://10.1.1.1/private', 'https://192.168.0.1', 'https://169.254.1.1',
    'https://example.org/#private', 'https://example.org/\n', '', null]) assert.equal(safeUrl(url), false, String(url));
});
test('French colon requires a full nonbreaking space', () => {
  assert.deepEqual(frenchTextIssues('Source\u00A0: oui', '/fr'), []);
  assert.ok(frenchTextIssues('Source : oui', '/fr').some(({ code }) => code === 'FR_COLON'));
  assert.ok(frenchTextIssues('Source\u202F: oui', '/fr').some(({ code }) => code === 'FR_COLON'));
});
test('French semicolon, question and exclamation require narrow spaces', () => {
  for (const punctuation of [';', '!', '?']) {
    assert.deepEqual(frenchTextIssues(`Oui\u202F${punctuation}`, '/fr'), []);
    assert.ok(frenchTextIssues(`Oui ${punctuation}`, '/fr').some(({ code }) => code === 'FR_NARROW'));
    assert.ok(frenchTextIssues(`Oui\u00A0${punctuation}`, '/fr').some(({ code }) => code === 'FR_NARROW'));
  }
});
test('French guillemets use inner narrow spaces', () => {
  assert.deepEqual(frenchTextIssues('«\u202Fsource\u202F»', '/fr'), []);
  assert.equal(frenchTextIssues('«source»', '/fr').filter(({ code }) => code === 'FR_GUILLEMET').length, 2);
});
test('French curly apostrophe is kept', () => {
  assert.deepEqual(frenchTextIssues('L’action', '/fr'), []);
  assert.ok(frenchTextIssues("L'action", '/fr').some(({ code }) => code === 'FR_APOSTROPHE'));
});
test('bilingual metadata requires exactly two nonempty keys', () => {
  assert.deepEqual(bilingualIssues(pair(), '/label'), []);
  assert.ok(bilingualIssues({ en: 'Text' }, '/label').length);
  assert.ok(bilingualIssues({ ...pair(), es: 'Texto' }, '/label').length);
  assert.ok(bilingualIssues({ en: '', fr: 'Oui' }, '/label').length);
  assert.ok(bilingualIssues(null, '/label').length);
});
test('private-key scanner reports paths but never copies secret values', () => {
  const result = privateIssues({ rows: [{ token: 'a-secret', nested: { email: 'address' } }] });
  assert.deepEqual(result.map((x) => x.path), ['/rows/0/token', '/rows/0/nested/email']);
  assert.equal(JSON.stringify(result).includes('a-secret'), false);
});
test('private-key scanner rejects cyclic input', () => {
  const value = { ok: 1 };
  value.self = value;
  assert.ok(privateIssues(value).some(({ code }) => code === 'CYCLIC_INPUT'));
});
test('private-key scanner accepts shared but noncyclic references', () => {
  const reused = { title: 'Synthetic' };
  assert.deepEqual(privateIssues({ a: reused, b: reused }), []);
});
test('source evidence has complete valid attributes', () => {
  assert.deepEqual(sourceIssues(source(), '/sources/0', TODAY), []);
});
test('source URL and title errors stay separate', () => {
  const result = sourceIssues(source('s', { title: '', url: 'file:///x' }), '/s', TODAY);
  assert.ok(result.some(({ code }) => code === 'SOURCE_TITLE'));
  assert.ok(result.some(({ code }) => code === 'SOURCE_URL'));
});
test('source retrieval date cannot be in the future', () => {
  assert.ok(sourceIssues(source('s', { retrievedOn: '2026-11-21' }), '/s', TODAY).some(({ code }) => code === 'SOURCE_DATE'));
});
test('source licence is explicit, not inferred by URL', () => {
  for (const licence of ['', 'Open', 'Private', null]) {
    assert.ok(sourceIssues(source('s', { licence }), '/s').some(({ code }) => code === 'SOURCE_LICENCE'));
  }
});
test('unknown source tier cannot become higher trust', () => {
  assert.ok(sourceIssues(source('s', { tier: 'UNKNOWN' }), '/s').some(({ code }) => code === 'SOURCE_TIER'));
});
test('source digest shape rejects short or malformed values', () => {
  assert.ok(sourceIssues(source('s', { digest: 'short' }), '/s').some(({ code }) => code === 'SOURCE_DIGEST'));
});
test('source schema rejects unexpected fields', () => {
  assert.ok(sourceIssues(source('s', { extra: 1 }), '/s').some(({ code }) => code === 'SOURCE_FIELD'));
});
test('event type requires known vocabulary', () => {
  assert.ok(eventIssues(event('key', 'a', 1, { type: 'teleport' }), '/e').some(({ code }) => code === 'EVENT_TYPE'));
});
test('key event requires explicit recognized key', () => {
  for (const key of ['x', '', null]) assert.ok(eventIssues(event('key', 'a', 1, { key }), '/e').some(({ code }) => code === 'EVENT_KEY'));
});
test('focus event requires stable target id', () => {
  assert.ok(eventIssues(event('focus', 'a', 1, { target: '/bad' }), '/e').some(({ code }) => code === 'EVENT_FOCUS'));
});
test('announcements require bilingual content and known live setting', () => {
  assert.deepEqual(eventIssues(event('announce'), '/e'), []);
  assert.ok(eventIssues(event('announce', 'a', 1, { message: { en: 'No' } }), '/e').some(({ code }) => code === 'LANGUAGE_PAIR'));
  assert.ok(eventIssues(event('announce', 'a', 1, { politeness: 'loud' }), '/e').some(({ code }) => code === 'EVENT_LIVE'));
});
test('asset event must identify asset and state', () => {
  assert.deepEqual(eventIssues(event('asset'), '/e'), []);
  assert.ok(eventIssues(event('asset', 'a', 1, { availability: 'YES' }), '/e').some(({ code }) => code === 'EVENT_ASSET'));
});
test('storage and step-end events require documented outcomes', () => {
  assert.ok(eventIssues(event('storage', 'a', 1, { storage: true }), '/e').some(({ code }) => code === 'EVENT_STORAGE'));
  assert.ok(eventIssues(event('step-end', 'a', 1, { outcome: 'perfect' }), '/e').some(({ code }) => code === 'EVENT_OUTCOME'));
});
test('event clock is bounded', () => {
  for (const at of [-1, 1.5, 3_600_001, null]) assert.ok(eventIssues(event('key', 'a', at), '/e').some(({ code }) => code === 'EVENT_AT'));
});
test('step enforces monotone event chronology', () => {
  const value = step('keyboard', { events: [event('key', 'a', 5), event('key', 'b', 1)] });
  assert.ok(stepIssues(value, '/s').some(({ code }) => code === 'EVENT_ORDER'));
});
test('step enforces unique event IDs', () => {
  const value = step('keyboard', { events: [event('key', 'a', 1), event('key', 'a', 2)] });
  assert.ok(stepIssues(value, '/s').some(({ code }) => code === 'EVENT_DUPLICATE'));
});
test('step rejects event belonging to another step', () => {
  const value = step('keyboard', { events: [event('key', 'a', 1, { stepId: 'other' })] });
  assert.ok(stepIssues(value, '/s').some(({ code }) => code === 'EVENT_STEP_MISMATCH'));
});
test('journey rejects unknown locale and network', () => {
  const ids = new Set(['source-a']);
  assert.ok(journeyIssues(journey('x', { locale: 'es' }), '/j', ids).some(({ code }) => code === 'JOURNEY_LOCALE'));
  assert.ok(journeyIssues(journey('x', { network: 'magical' }), '/j', ids).some(({ code }) => code === 'JOURNEY_NETWORK'));
});
test('journey rejects missing source reference', () => {
  const ids = new Set(['elsewhere']);
  assert.ok(journeyIssues(journey(), '/j', ids).some(({ code }) => code === 'EVENT_SOURCE_MISSING'));
});
test('document accepts explicitly synthetic trace', () => {
  const result = inspect(trace());
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.equal(result.document.journeys[0].steps[0].expected, 'PASS');
});
test('invalid schema never returns an accepted document', () => {
  const value = { ...trace(), version: 100 };
  assert.equal(inspect(value).document, null);
});
test('duplicate sources fail closed', () => {
  const value = trace(); value.sources.push(source());
  reject(value, 'SOURCE_DUPLICATE');
});
test('duplicate journeys fail closed', () => {
  const value = trace(); value.journeys.push(journey());
  reject(value, 'JOURNEY_DUPLICATE');
});
test('missing provenance blocks even an unknown observation', () => {
  const value = trace(); delete value.sources[0].licence;
  reject(value, 'SOURCE_LICENCE');
});
test('future document date fails', () => {
  reject({ ...trace(), recordedOn: '2026-11-21' }, 'DOCUMENT_DATE');
});
test('private data cannot escape through arbitrary properties', () => {
  const value = trace(); value.journeys[0].steps[0].phone = 'private-value';
  reject(value, 'PRIVATE_KEY');
  assert.equal(JSON.stringify(inspect(value)).includes('private-value'), false);
});
test('unknown remains a valid state but cannot bypass provenance', () => {
  const value = trace(); value.journeys[0].steps[0].events[1].state = 'UNKNOWN';
  assert.equal(inspect(value).ok, true);
  delete value.sources[0].url;
  reject(value, 'SOURCE_URL');
});
test('oversized document fails before deep record validation', () => {
  const value = trace(); value.journeys = Array.from({ length: TRACE_LIMITS.journeys + 1 }, () => journey());
  reject(value, 'DOCUMENT_LIMIT');
});
test('canonical trace is deterministic across source and journey ordering', () => {
  const value = trace(journey('z'), journey('a'));
  value.sources.push(source('source-b', { url: 'https://example.org/other' }));
  const reversed = clone(value); reversed.sources.reverse(); reversed.journeys.reverse();
  assert.equal(canonicalTrace(value).text, canonicalTrace(reversed).text);
});
test('fingerprint changes when evidence changes', () => {
  const first = trace(); const second = clone(first);
  second.journeys[0].steps[0].events[1].state = 'UNKNOWN';
  assert.notEqual(fingerprintTrace(first).digest, fingerprintTrace(second).digest);
});
test('parser bounds UTF-8 input bytes', () => {
  assert.equal(parseTrace('x'.repeat(TRACE_LIMITS.bytes + 1)).ok, false);
  assert.equal(Buffer.byteLength('é', 'utf8'), 2);
});
test('parser rejects malformed JSON', () => {
  assert.equal(parseTrace('{').problems[0].code, 'INPUT_JSON');
});
test('parser roundtrip retains all documented states', () => {
  const input = trace(); input.journeys[0].steps[0].events[1].state = 'UNKNOWN';
  const parsed = parseTrace(JSON.stringify(input));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.document.journeys[0].steps[0].events[1].state, 'UNKNOWN');
});

test('total event bound is enforced before deep record inspection', () => {
  const value = trace();
  value.journeys[0].steps[0].events = Array.from({ length: TRACE_LIMITS.events + 1 }, () => event());
  const result = inspect(value);
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].code, 'DOCUMENT_EVENT_LIMIT');
});
