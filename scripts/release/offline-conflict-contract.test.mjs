import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  CONFLICT_VERSION, CLAIM_STATES, REVIEW_STATES, TIER_VALUES, CONFLICT_LIMITS,
  pointer, issue, isObject, validId, validDate, containsControl, safeUrl,
  frenchTextIssues, localizedIssues, privacyIssues, recordIssues,
  validateRegister, canonicalRegister, fingerprint, parseRegister,
  serializeRegister,
} from './offline-conflict-contract.mjs';
import { DAY, record, register, sample, notes, deepCopy, resultCodes } from './offline-conflict-fixtures.mjs';
const check = value => validateRegister(value, { today: DAY });
const codes = value => resultCodes(check(value));
const invalid = (value, name) => assert.ok(codes(value).includes(name), `${name}: ${codes(value).join(',')}`);

test('schema version is fixed', () => assert.equal(CONFLICT_VERSION, 1));
test('claim states are explicit and unique', () => {
  assert.deepEqual(CLAIM_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.equal(new Set(CLAIM_STATES).size, CLAIM_STATES.length);
});
test('review states are separate from evidence states', () => {
  assert.ok(REVIEW_STATES.includes('open'));
  assert.ok(REVIEW_STATES.includes('needs-source'));
  assert.ok(!REVIEW_STATES.includes('YES'));
});
test('canonical tier is not the claim-state enum', () => {
  assert.deepEqual(TIER_VALUES, [0, 1, 2, 3, 4, 'E']);
  assert.ok(!TIER_VALUES.includes('UNKNOWN'));
});
test('bounded schema limits reject unlimited content', () => {
  assert.ok(CONFLICT_LIMITS.bytes < 50_000_000);
  assert.ok(CONFLICT_LIMITS.records >= 1);
  assert.ok(CONFLICT_LIMITS.depth < 100);
  assert.ok(CONFLICT_LIMITS.dependencies < 1000);
});
test('JSON pointer encodes separators and tildes', () => {
  assert.equal(pointer('a/b~c'), 'a~1b~0c');
  assert.equal(pointer('simple'), 'simple');
  assert.equal(pointer(3), '3');
});
test('issue helper contains only a code and a path', () => {
  assert.deepEqual(issue('BAD', '/where'), { code: 'BAD', path: '/where' });
});
test('plain dictionaries are accepted', () => {
  assert.equal(isObject({}), true);
  assert.equal(isObject(Object.create(null)), true);
});
test('arrays and class instances are not plain dictionaries', () => {
  for (const value of [null, [], 1, 'x', new Date(), new Map()]) assert.equal(isObject(value), false);
});
test('identifiers permit stable schema delimiters', () => {
  for (const value of ['sample', 'test-2', 'test_2', 'a.b', 'id:1']) assert.equal(validId(value), true);
});
test('identifiers reject prototype keys and path syntax', () => {
  for (const value of ['__proto__', 'constructor', 'prototype', 'a/b', 'a b', '', null]) {
    assert.equal(validId(value), false, String(value));
  }
});
test('identifier length is limited', () => {
  assert.equal(validId('a'.repeat(CONFLICT_LIMITS.maxId)), true);
  assert.equal(validId('a'.repeat(CONFLICT_LIMITS.maxId + 1)), false);
});
test('date validator accepts actual leap days', () => {
  for (const day of ['2024-02-29', '2000-02-29', '2026-11-20']) assert.equal(validDate(day), true);
});
test('date validator rejects leap-day rollover and bad month', () => {
  for (const day of ['2025-02-29', '1900-02-29', '2026-13-01', '2026-04-31']) assert.equal(validDate(day), false);
});
test('date validator rejects imprecise and non-calendar text', () => {
  for (const day of ['2026-1-2', '2026', 'tomorrow', '2026-11-20T00:00:00Z', '', undefined]) {
    assert.equal(validDate(day), false);
  }
});
test('date validator does not accept year zero', () => assert.equal(validDate('0000-01-01'), false));
test('printable text does not contain forbidden controls', () => assert.equal(containsControl('Fiche fictive'), false));
test('low control characters are rejected using code points', () => {
  for (const text of ['x\0', 'x\x1f', 'x\n', 'x\r', 'x\t', 'x\x7f']) assert.equal(containsControl(text), true);
});
test('replacement character is refused', () => assert.equal(containsControl('\ufffd'), true));
test('normal HTTPS evidence source passes', () => {
  assert.equal(safeUrl('https://example.org/accessibility'), true);
});
test('only HTTPS is allowed for sources', () => {
  for (const value of ['http://example.org', 'javascript:alert(1)', 'data:text/html,hi',
    'file:///tmp/source', 'ftp://example.org', '//example.org']) assert.equal(safeUrl(value), false, value);
});
test('sources cannot contain credentials or fragments', () => {
  for (const value of ['https://user:pass@example.org', 'https://example.org/#secret']) assert.equal(safeUrl(value), false);
});
test('loopback and local source URLs are rejected', () => {
  for (const value of ['https://localhost/', 'https://a.localhost/', 'https://127.0.0.1/', 'https://[::1]/']) {
    assert.equal(safeUrl(value), false, value);
  }
});
test('URL input limits reject huge links', () => {
  assert.equal(safeUrl('https://example.org/' + 'a'.repeat(CONFLICT_LIMITS.maxUrl)), false);
});
test('URLs containing control characters do not pass', () => {
  assert.equal(safeUrl('https://example.org/a\n'), false);
});
test('French colons require full nonbreaking spaces', () => {
  assert.deepEqual(frenchTextIssues('Source\u00a0: donnée', '/fr'), []);
  assert.ok(frenchTextIssues('Source : donnée', '/fr').some(x => x.code === 'FR_COLON'));
});
test('French question and exclamation require narrow spaces', () => {
  assert.deepEqual(frenchTextIssues('Essai\u202f! Pourquoi\u202f?', '/fr'), []);
  assert.equal(frenchTextIssues('Essai ! Pourquoi ?', '/fr').filter(x => x.code === 'FR_NARROW').length, 2);
});
test('French semicolon requires narrow space', () => {
  assert.ok(frenchTextIssues('Essai ; autre', '/fr').some(x => x.code === 'FR_NARROW'));
  assert.deepEqual(frenchTextIssues('Essai\u202f; autre', '/fr'), []);
});
test('French guillemets require narrow spaces inside', () => {
  assert.deepEqual(frenchTextIssues('«\u202fexemple\u202f»', '/fr'), []);
  assert.equal(frenchTextIssues('«exemple»', '/fr').filter(x => x.code === 'FR_QUOTE').length, 2);
});
test('French apostrophes use curly glyphs for elisions', () => {
  assert.ok(frenchTextIssues("L'App", '/fr').some(x => x.code === 'FR_APOSTROPHE'));
  assert.deepEqual(frenchTextIssues('L’App', '/fr'), []);
});
test('paired notes require both languages', () => {
  assert.ok(localizedIssues({ en: 'Example' }, '/notes').some(x => x.code === 'LOCALE_PAIR'));
  assert.deepEqual(localizedIssues(notes(), '/notes'), []);
});
test('paired notes reject additional language keys', () => {
  assert.ok(localizedIssues({ ...notes(), es: 'Ejemplo' }, '/notes').some(x => x.code === 'LOCALE_PAIR'));
});
test('empty and whitespace-only localizations are rejected', () => {
  assert.ok(localizedIssues({ en: ' ', fr: 'Essai' }, '/notes').some(x => x.code === 'LOCALE_TEXT'));
});
test('localization length is bounded', () => {
  assert.ok(localizedIssues({ en: 'a'.repeat(CONFLICT_LIMITS.notes + 1), fr: 'Essai' }, '/notes')
    .some(x => x.code === 'LOCALE_TEXT'));
});
test('privacy scan returns paths and does not include secrets', () => {
  const result = privacyIssues({ records: [{ token: 'dont-print-this' }] });
  assert.equal(result[0].path, '/records/0/token');
  assert.ok(!JSON.stringify(result).includes('dont-print-this'));
});
test('privacy scan checks nested canonical field spellings', () => {
  const result = privacyIssues({ a: { api_key: 'x', health_card: 'y' } });
  assert.deepEqual(result.map(x => x.code), ['PRIVATE_FIELD', 'PRIVATE_FIELD']);
});
test('privacy scan handles cycles without recursion failure', () => {
  const obj = { id: 'x' }; obj.self = obj;
  assert.ok(privacyIssues(obj).some(x => x.code === 'INPUT_CYCLE'));
});
test('privacy scan has a depth bound', () => {
  let obj = {}; let cursor = obj;
  for (let i = 0; i < CONFLICT_LIMITS.depth + 5; i += 1) { cursor.child = {}; cursor = cursor.child; }
  assert.ok(privacyIssues(obj).some(x => x.code === 'INPUT_DEPTH'));
});
test('valid synthetic record passes source-backed checks', () => {
  assert.deepEqual(recordIssues(record(), '/records/0', DAY), []);
});
test('missing source licence date or tier never passes', () => {
  for (const [key, value, code] of [
    ['source', null, 'SOURCE_URL'], ['licence', null, 'SOURCE_LICENCE'],
    ['retrievedOn', null, 'SOURCE_DATE'], ['tier', null, 'SOURCE_TIER'],
  ]) assert.ok(recordIssues(record('r1', { [key]: value }), '/records/0', DAY).some(x => x.code === code));
});
test('unknown claim still requires complete source', () => {
  invalid(register(record('a', { state: 'UNKNOWN', source: '' })), 'SOURCE_URL');
});
test('unsupported affirmative synonyms fail closed', () => {
  for (const state of [true, false, 'yes', 'accessible', 'not sure', null]) {
    invalid(register(record('a', { state })), 'RECORD_STATE');
  }
});
test('known YES and NO are preserved without inference', () => {
  for (const state of ['YES', 'NO']) assert.equal(check(register(record('a', { state }))).ok, true);
});
test('future captures relative to register date fail', () => {
  invalid(register(record('a', { capturedOn: '2026-11-21' })), 'FUTURE_CAPTURE');
});
test('future retrieval dates fail', () => {
  invalid(register(record('a', { retrievedOn: '2026-11-21' })), 'FUTURE_SOURCE');
});
test('source observations cannot be later than their retrieval', () => {
  invalid(register(record('a', { sourceDate: '2026-11-20' })), 'OBSERVATION_AFTER_SOURCE');
});
test('exactly dated source observations are accepted', () => {
  assert.equal(check(register(record('a', { sourceDate: '2026-11-19' }))).ok, true);
});
test('extra record keys are rejected rather than stripped', () => {
  invalid(register(record('a', { unexpected: true })), 'RECORD_EXTRA');
});
test('extra register keys are rejected', () => invalid({ ...sample(), other: 1 }, 'REGISTER_EXTRA'));
test('duplicate record IDs are rejected', () => invalid(register(record('a'), record('a')), 'DUPLICATE_ID'));
test('related identifiers must exist', () => {
  invalid(register(record('a', { relatedIds: ['missing'] })), 'RELATED_MISSING');
});
test('self-reference is rejected', () => invalid(register(record('a', { relatedIds: ['a'] })), 'RELATED_SELF'));
test('duplicate related IDs are rejected', () => {
  invalid(register(record('a', { relatedIds: ['b', 'b'] }), record('b')), 'RELATED_IDS');
});
test('invalid identifier is rejected in relation array', () => {
  invalid(register(record('a', { relatedIds: ['/bad'] })), 'RELATED_IDS');
});
test('missing notes are allowed, but not guessed', () => {
  const value = record(); delete value.notes;
  assert.equal(check(register(value)).ok, true);
});
test('invalid French label blocks register acceptance', () => {
  invalid(register(record('a', { notes: notes('Un essai !') })), 'FR_NARROW');
});
test('register date is mandatory', () => invalid({ version: 1, records: [] }, 'REGISTER_DATE'));
test('record limit is enforced before deeply scanning records', () => {
  const tooMany = Array.from({ length: CONFLICT_LIMITS.records + 1 }, () => record('a'));
  assert.ok(resultCodes(check(register(...tooMany))).includes('RECORD_LIMIT'));
});
test('input cycles fail closed', () => {
  const data = sample(); data.loop = data;
  assert.ok(resultCodes(check(data)).includes('INPUT_CYCLE'));
});
test('canonical ordering is independent of input order', () => {
  const a = register(record('b'), record('a'));
  const b = register(record('a'), record('b'));
  assert.deepEqual(canonicalRegister(a), canonicalRegister(b));
});
test('canonical ordering normalizes relation order', () => {
  const a = register(record('a', { relatedIds: ['c', 'b'] }), record('b'), record('c'));
  const b = register(record('a', { relatedIds: ['b', 'c'] }), record('c'), record('b'));
  assert.deepEqual(canonicalRegister(a), canonicalRegister(b));
});
test('fingerprints are valid SHA-256 and deterministic', () => {
  const a = fingerprint(sample());
  assert.equal(a.ok, true);
  assert.equal(a.sha256.length, 64);
  assert.equal(a.sha256, createHash('sha256').update(JSON.stringify(canonicalRegister(sample()))).digest('hex'));
});
test('invalid source cannot produce a fingerprint', () => {
  assert.equal(fingerprint(register(record('a', { licence: 'unknown' }))).sha256, null);
});
test('serialization yields a valid deterministic UTF-8 representation', () => {
  const a = serializeRegister(sample());
  assert.equal(a.ok, true);
  assert.ok(a.text.endsWith('\n'));
  assert.equal(parseRegister(a.text).ok, true);
});
test('serialization rejects invalid source data', () => {
  assert.equal(serializeRegister(register(record('a', { tier: 'UNKNOWN' }))).ok, false);
});
test('parser rejects invalid JSON without returning data', () => {
  const result = parseRegister('{');
  assert.deepEqual(result.value, null);
  assert.ok(resultCodes(result).includes('INVALID_JSON'));
});
test('parser rejects huge text', () => {
  const result = parseRegister('a'.repeat(CONFLICT_LIMITS.bytes + 1));
  assert.ok(resultCodes(result).includes('INPUT_SIZE'));
});
test('parser rejects non-string inputs', () => {
  assert.equal(parseRegister(Buffer.from('{}')).ok, false);
});
test('parser does not return invalid data', () => {
  const result = parseRegister(JSON.stringify(register(record('a', { state: 'UNSURE' }))));
  assert.equal(result.value, null);
});
test('round-trip does not mutate the original register', () => {
  const data = sample(); const before = deepCopy(data);
  const serialized = serializeRegister(data);
  assert.equal(parseRegister(serialized.text).ok, true);
  assert.deepEqual(data, before);
});
test('future asOf is rejected when caller provides reference date', () => {
  const data = sample(); data.asOf = '2026-11-21';
  assert.ok(resultCodes(validateRegister(data, { today: DAY })).includes('FUTURE_REGISTER'));
});
test('issue limit cannot convert an invalid record to success', () => {
  const data = register(record('a', { source: null, licence: null, tier: null }));
  const result = validateRegister(data, { maxIssues: 1 });
  assert.equal(result.ok, false);
  assert.ok(resultCodes(result).includes('ISSUE_LIMIT'));
});
