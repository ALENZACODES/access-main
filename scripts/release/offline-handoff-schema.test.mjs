import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HANDOFF_VERSION, HANDOFF_LIMITS, HANDOFF_STATES, HANDOFF_TIERS,
  HANDOFF_LICENCES, HANDOFF_DECISIONS, HANDOFF_PRIORITIES,
  isPlainRecord, pointerEscape, makeIssue, safeId, validDay,
  isSafeHttps, hasUnsafeCharacters, safeDisplayText, validBilingualText,
  validateFrenchText, normalisePrivateKey, inspectPrivateKeys,
  handoffLimits, validateSource, validateClaim, validateReviewEvent,
  duplicateIds, sourceReferences, validateHandoff, parseHandoffJson,
  emptyHandoff, stableJson, safeClone,
} from './offline-handoff-schema.mjs';

function source(id = 's1') {
  return { id, title: 'Synthetic citation', url: 'https://example.org/source',
    licence: 'CC0-1.0', retrievedOn: '2026-11-19', tier: 0 };
}
function claim(id = 'c1') {
  return { id, recordId: 'r1', field: 'stepFreeEntrance', state: 'UNKNOWN',
    label: { en: 'Entrance not recorded', fr: 'Entrée non documentée' },
    sourceIds: ['s1'] };
}
function event(id = 'e1') {
  return { id, claimId: 'c1', on: '2026-11-19',
    decision: 'PENDING', priority: 'NORMAL' };
}
function packet() {
  return { version: 1, sources: [source()], claims: [claim()], events: [event()] };
}
function codes(value) { return value.map((item) => item.code); }
function problems(document) { return codes(validateHandoff(document).issues); }

test('contract uses only explicit accessibility states', () => {
  assert.deepEqual(HANDOFF_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.equal(HANDOFF_VERSION, 1);
  assert.ok(!HANDOFF_STATES.includes('accessible'));
});

test('review decisions remain distinct from physical access states', () => {
  assert.ok(HANDOFF_DECISIONS.includes('REVIEWED'));
  assert.ok(HANDOFF_PRIORITIES.includes('URGENT_REVIEW'));
  assert.ok(!HANDOFF_STATES.includes('REVIEWED'));
});

test('canonical tiers exclude status labels', () => {
  assert.deepEqual(HANDOFF_TIERS, [0, 1, 2, 3, 4, 'E']);
  assert.ok(!HANDOFF_TIERS.includes('UNKNOWN'));
});

test('licence allowlist is explicit', () => {
  assert.ok(HANDOFF_LICENCES.includes('CC0-1.0'));
  assert.ok(!HANDOFF_LICENCES.includes('All rights reserved'));
});

test('only JSON plain objects are accepted', () => {
  for (const value of [null, [], new Date(), new Map(), 42, 'object']) {
    assert.equal(isPlainRecord(value), false);
  }
  assert.equal(isPlainRecord({}), true);
  assert.equal(isPlainRecord(Object.create(null)), true);
});

test('JSON pointer escaping prevents ambiguous paths', () => {
  assert.equal(pointerEscape('a/b~c'), 'a~1b~0c');
  assert.equal(pointerEscape(''), '');
});

test('issue metadata is frozen and value-free', () => {
  const finding = makeIssue('TEST', '/thing', 'Failed condition');
  assert.equal(Object.isFrozen(finding), true);
  assert.deepEqual(Object.keys(finding), ['code', 'path', 'detail']);
});

test('IDs reject whitespace and executable path fragments', () => {
  for (const id of ['', ' leading', 'x y', '../x', '/x', 'x/y', 'x\ny', '<x>', null]) {
    assert.equal(safeId(id), false, String(id));
  }
  for (const id of ['abc', 'x-y', 'x_y', 'x.y', 'x:y', 'x123']) {
    assert.equal(safeId(id), true, id);
  }
});

test('ID length is enforced precisely', () => {
  assert.equal(safeId('a'.repeat(128)), true);
  assert.equal(safeId('a'.repeat(129)), false);
  assert.equal(safeId('aa', 1), false);
});

test('Gregorian dates reject rollovers', () => {
  for (const day of ['2026-02-29', '2026-04-31', '2026-13-01',
    '2026-00-01', '2026-11-00', '2026-1-19', '2026-11-1',
    '2026-11-19T00:00Z', 'tomorrow', '', 123]) {
    assert.equal(validDay(day), false, String(day));
  }
  assert.equal(validDay('2024-02-29'), true);
  assert.equal(validDay('2026-11-19'), true);
});

test('year boundaries are treated as calendar dates', () => {
  assert.equal(validDay('0001-01-01'), true);
  assert.equal(validDay('0099-12-31'), true);
  assert.equal(validDay('0000-01-01'), false);
  assert.equal(validDay('9999-12-31'), true);
});

test('HTTPS source checker rejects local and unsafe hosts', () => {
  const bad = ['http://example.org', 'file:///tmp/a', 'javascript:alert(1)',
    'https://localhost/file', 'https://abc.local/x',
    'https://127.0.0.1/x', 'https://10.1.1.1',
    'https://192.168.0.1', 'https://user:pw@example.org',
    'https://example.org/#private', 'https://example.org/\n'];
  for (const value of bad) assert.equal(isSafeHttps(value), false, value);
});

test('well formed citation URL can be an example host', () => {
  assert.equal(isSafeHttps('https://example.org/report?year=2026'), true);
  assert.equal(isSafeHttps('https://example.org'), true);
});

test('unsafe characters include controls and replacement glyph', () => {
  assert.equal(hasUnsafeCharacters('hello'), false);
  assert.equal(hasUnsafeCharacters('hello\u0000'), true);
  assert.equal(hasUnsafeCharacters('hello\ufffd'), true);
  assert.equal(hasUnsafeCharacters('hello\nworld'), true);
});

test('display strings reject HTML and surrounding whitespace', () => {
  for (const value of ['', ' hello', 'hello ', '<script>', 'foo\nbar', 42]) {
    assert.equal(safeDisplayText(value), false, String(value));
  }
  assert.equal(safeDisplayText('A real citation is needed.'), true);
});

test('display text respects configured maximum length', () => {
  assert.equal(safeDisplayText('abc', 3), true);
  assert.equal(safeDisplayText('abcd', 3), false);
});

test('both languages must exist with no stray language keys', () => {
  assert.equal(validBilingualText({ en: 'Hello', fr: 'Bonjour' }), true);
  assert.equal(validBilingualText({ en: 'Hello' }), false);
  assert.equal(validBilingualText({ fr: 'Bonjour' }), false);
  assert.equal(validBilingualText({ en: 'Hello', fr: '' }), false);
  assert.equal(validBilingualText({ en: 'Hello', fr: 'Bonjour', de: 'Hallo' }), false);
});

test('French colons require U+00A0', () => {
  assert.ok(codes(validateFrenchText('Source: donnée', '/fr')).includes('FR_COLON_SPACE'));
  assert.ok(codes(validateFrenchText('Source : donnée', '/fr')).includes('FR_COLON_SPACE'));
  assert.equal(validateFrenchText('Source\u00a0: donnée', '/fr').length, 0);
});

test('French narrow punctuation requires U+202F', () => {
  for (const text of ['Question?', 'Question ?', 'Attention!', 'Un; deux']) {
    assert.ok(codes(validateFrenchText(text, '/fr')).includes('FR_NARROW_SPACE'));
  }
  assert.deepEqual(validateFrenchText('Question\u202f? Attention\u202f!', '/fr'), []);
});

test('French guillemets use inner narrow spaces', () => {
  assert.ok(codes(validateFrenchText('«texte»', '/fr')).includes('FR_GUILLEMET_SPACE'));
  assert.equal(validateFrenchText('«\u202ftexte\u202f»', '/fr').length, 0);
});

test('French elision requires curved apostrophes', () => {
  assert.ok(codes(validateFrenchText("L'application", '/fr')).includes('FR_APOSTROPHE'));
  assert.equal(validateFrenchText('L’application', '/fr').length, 0);
});

test('normalisation catches privacy keys in multiple naming styles', () => {
  assert.equal(normalisePrivateKey('health_card'), 'healthcard');
  assert.equal(normalisePrivateKey('API-Key'), 'apikey');
  assert.equal(normalisePrivateKey('phone number'), 'phonenumber');
});

test('private keys are reported by path and not by value', () => {
  const privateValue = 'sensitive-example-123';
  const issues = inspectPrivateKeys({ entries: [{ health_card: privateValue }] });
  assert.ok(codes(issues).includes('PRIVATE_FIELD'));
  assert.equal(issues[0].path, '/entries/0/health_card');
  assert.ok(!JSON.stringify(issues).includes(privateValue));
});

test('object cycles are rejected instead of recursed forever', () => {
  const data = { one: true };
  data.self = data;
  assert.ok(codes(inspectPrivateKeys(data)).includes('CYCLE'));
});

test('depth limit is observable', () => {
  const result = inspectPrivateKeys({ outer: { inner: {} } }, '', { maxDepth: 1 });
  assert.ok(codes(result).includes('DEPTH'));
});

test('custom limits cannot increase safety ceilings', () => {
  const limits = handoffLimits({ maxEntries: 9999999, maxIssues: 10 });
  assert.equal(limits.maxEntries, HANDOFF_LIMITS.maxEntries);
  assert.equal(limits.maxIssues, 10);
  assert.equal(Object.isFrozen(limits), true);
});

test('source requires all four provenance fields', () => {
  const value = source();
  for (const key of ['title', 'url', 'licence', 'retrievedOn', 'tier']) delete value[key];
  const errors = codes(validateSource(value, '/sources/0', HANDOFF_LIMITS));
  for (const code of ['SOURCE_TITLE', 'SOURCE_URL', 'SOURCE_LICENCE',
    'SOURCE_DATE', 'SOURCE_TIER']) assert.ok(errors.includes(code), code);
});

test('source notes require both languages and French punctuation', () => {
  const value = { ...source(), note: { en: 'Source', fr: 'Source:' } };
  assert.ok(codes(validateSource(value, '/sources/0', HANDOFF_LIMITS)).includes('FR_COLON_SPACE'));
});

test('source optional observation date is checked', () => {
  const value = { ...source(), observedOn: '2026-02-30' };
  assert.ok(codes(validateSource(value, '/sources/0', HANDOFF_LIMITS)).includes('OBSERVED_DATE'));
});

test('claims require a canonical state and stable record identity', () => {
  const value = { ...claim(), state: 'accessible', recordId: '' };
  const errors = codes(validateClaim(value, '/claims/0', HANDOFF_LIMITS));
  assert.ok(errors.includes('CLAIM_STATE'));
  assert.ok(errors.includes('RECORD_ID'));
});

test('claims reject repeated citations', () => {
  const value = { ...claim(), sourceIds: ['s1', 's1'] };
  assert.ok(codes(validateClaim(value, '/claims/0', HANDOFF_LIMITS)).includes('CLAIM_SOURCE_DUPLICATE'));
});

test('claims accept no citation only when the state is UNKNOWN', () => {
  const unknown = { ...claim(), sourceIds: [] };
  assert.equal(validateClaim(unknown, '/claims/0', HANDOFF_LIMITS).length, 0);
  assert.equal(sourceReferences({ sources: [], claims: [unknown], events: [] }, HANDOFF_LIMITS).length, 0);
  const yes = { ...unknown, state: 'YES' };
  assert.ok(codes(sourceReferences({ sources: [], claims: [yes], events: [] }, HANDOFF_LIMITS)).includes('UNSUPPORTED_CLAIM'));
});

test('events reject unknown decision and priority', () => {
  const value = { ...event(), decision: 'CERTIFIED', priority: 'HIGH' };
  const errors = codes(validateReviewEvent(value, '/events/0', HANDOFF_LIMITS));
  assert.ok(errors.includes('EVENT_DECISION'));
  assert.ok(errors.includes('EVENT_PRIORITY'));
});

test('event reason must have both languages', () => {
  const value = { ...event(), reason: { en: 'Missing photo' } };
  assert.ok(codes(validateReviewEvent(value, '/events/0', HANDOFF_LIMITS)).includes('EVENT_REASON'));
});

test('duplicate identifiers are detected within their collection', () => {
  const issues = duplicateIds([source('a'), source('b'), source('a')], '/sources', 100);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, '/sources/2/id');
});

test('missing source IDs are detected in claims and events', () => {
  const document = packet();
  document.claims[0].sourceIds = ['missing'];
  document.events[0].sourceIds = ['also-missing'];
  assert.equal(codes(sourceReferences(document, HANDOFF_LIMITS)).filter((code) => code === 'MISSING_SOURCE').length, 2);
});

test('missing event claim is detected', () => {
  const document = packet();
  document.events[0].claimId = 'absent';
  assert.ok(codes(sourceReferences(document, HANDOFF_LIMITS)).includes('MISSING_CLAIM'));
});

test('complete synthetic fixture validates without claiming accessibility', () => {
  const result = validateHandoff(packet());
  assert.equal(result.ok, true);
  assert.equal(result.document.claims[0].state, 'UNKNOWN');
});

test('document must provide all three bounded arrays', () => {
  const result = validateHandoff({ version: 1, sources: [] });
  assert.equal(result.ok, false);
  assert.ok(codes(result.issues).includes('COLLECTION'));
});

test('document rejects unexpected version', () => {
  assert.ok(problems({ ...packet(), version: 100 }).includes('VERSION'));
});

test('packet rejects injected private data anywhere', () => {
  assert.ok(problems({ ...packet(), token: 'hidden' }).includes('PRIVATE_FIELD'));
});

test('event reference must point to existing claim', () => {
  const value = packet();
  value.events[0].claimId = 'other';
  assert.ok(problems(value).includes('MISSING_CLAIM'));
});

test('stable JSON output sorts object keys', () => {
  assert.equal(stableJson({ z: 2, a: { y: 1, b: 3 } }), '{"a":{"b":3,"y":1},"z":2}');
});

test('safe clones do not share nested mutable references', () => {
  const original = packet();
  const clone = safeClone(original);
  clone.sources[0].title = 'Changed';
  assert.equal(original.sources[0].title, 'Synthetic citation');
});

test('empty packet validates and contains no invented claims', () => {
  assert.deepEqual(emptyHandoff(), { version: 1, sources: [], claims: [], events: [] });
  assert.equal(validateHandoff(emptyHandoff()).ok, true);
});

test('JSON parser refuses malformed input without leaking content', () => {
  const parsed = parseHandoffJson('{"secret":"please do not print"');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.issues[0].code, 'JSON_PARSE');
  assert.ok(!JSON.stringify(parsed).includes('please do not print'));
});

test('JSON size restriction enforces byte length', () => {
  const parsed = parseHandoffJson(JSON.stringify(packet()), { maxBytes: 20 });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.issues[0].code, 'JSON_LIMIT');
});

test('valid round trip preserves the unknown state', () => {
  const data = packet();
  const parsed = parseHandoffJson(JSON.stringify(data));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.document.claims[0].state, 'UNKNOWN');
});
