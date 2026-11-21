import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNKNOWN, SCHEMA, MAX_BYTES, MAX_ENTRIES, FEATURES, STATES, TIERS, ACTIONS, DECISIONS,
  validDay, validText, validId, plain, exactKeys, checkProvenance, checkObservation,
  checkCase, checkEvent, validateLedger, parseLedger, emptyLedger, exampleLedger
} from './review-ledger-contract.mjs';
import { TODAY, fixture, observation, caseRecord, event, provenance, clone, HASH_A } from './review-ledger-fixtures.mjs';

function codes(result) { return result.issues.map(x => x.code); }
function invalidObservation(changes) { return checkObservation(observation('obs-a', changes), 0, TODAY); }
function invalidCase(changes) { return checkCase(caseRecord('case-a', changes), 0); }
function invalidEvent(changes) { return checkEvent(event('event-a', 'open', changes), 0, TODAY); }

test('contract enumerations contain the allowed public values', () => {
  assert.equal(UNKNOWN, 'UNKNOWN');
  assert.equal(SCHEMA, 1);
  assert.deepEqual(STATES, ['UNKNOWN', 'reported', 'not-reported']);
  assert.ok(FEATURES.includes('entrance'));
  assert.ok(TIERS.includes('unknown'));
  assert.ok(ACTIONS.includes('reopen'));
  assert.ok(DECISIONS.includes('conflicting-evidence'));
  assert.equal(MAX_ENTRIES, 10000);
});
test('validDay accepts Gregorian leap days', () => {
  for (const value of ['2000-02-29', '2024-02-29', '2026-11-20', '1900-01-01']) assert.equal(validDay(value), true, value);
});
test('validDay rejects non-Gregorian and malformed dates', () => {
  for (const value of ['1900-02-29', '2026-02-29', '2026-11-31', '2026-13-01', '2026-00-10', '2026-1-1', '', null, 42]) assert.equal(validDay(value), false, String(value));
});
test('validText handles safe multiline human notes', () => {
  assert.equal(validText('First line\nSecond line'), true);
  assert.equal(validText('Column\tvalue'), true);
  assert.equal(validText('Texte français\nDeuxième phrase'), true);
});
test('validText rejects control characters and padded content', () => {
  for (const value of ['\u0000', 'a\u001fb', 'test\u007f', ' padded', 'padded ', '', 5, null]) assert.equal(validText(value), false, String(value));
});
test('validText supports explicit optional emptiness', () => {
  assert.equal(validText('', 20, true), true);
  assert.equal(validText('abc', 2, true), false);
  assert.equal(validText('ab', 2), true);
});
test('validId rejects path separators and unexpected punctuation', () => {
  for (const value of ['../secret', 'a/b', 'a\\b', ' space', 'hi there', '!hello', '']) assert.equal(validId(value), false, value);
});
test('validId accepts stable opaque identifiers', () => {
  for (const value of ['a', 'a-1', 'case_a', 'district:place:feature', 'a.b', 'A9']) assert.equal(validId(value), true, value);
});
test('plain refuses arrays, prototypes and null', () => {
  for (const value of [null, [], new Date(), new Map(), 2, 'abc']) assert.equal(plain(value), false);
  assert.equal(plain({ a: 1 }), true);
  assert.equal(plain(Object.create(null)), true);
});
test('exactKeys checks missing required keys', () => {
  const issues = exactKeys({ a: 1 }, ['a', 'b']);
  assert.deepEqual(issues, [{ code: 'MISSING_FIELD', path: 'b' }]);
});
test('exactKeys rejects arbitrary unknown keys', () => {
  const issues = exactKeys({ a: 1, privateToken: 'x' }, ['a']);
  assert.deepEqual(issues, [{ code: 'UNRECOGNISED_FIELD', path: 'privateToken' }]);
});
test('exactKeys permits optional keys without weakening required keys', () => {
  assert.deepEqual(exactKeys({ a: 1, b: 2 }, ['a'], ['b']), []);
  assert.deepEqual(codes({ issues: exactKeys({ b: 2 }, ['a'], ['b']) }), ['MISSING_FIELD']);
});
test('provenance requires an explicit source and licence', () => {
  for (const field of ['source', 'licence']) {
    const row = provenance({ [field]: '' });
    assert.ok(checkProvenance(row, 'record', TODAY).length, field);
  }
});
test('provenance rejects invalid and future retrieval dates', () => {
  for (const date of ['2026-11-21', '2026-02-29', null, '2027-01-01']) {
    assert.ok(checkProvenance(provenance({ retrievedOn: date }), 'record', TODAY).some(x => x.code === 'RETRIEVAL_DATE_INVALID'));
  }
});
test('provenance rejects invented verification tiers', () => {
  for (const tier of ['verified', 'agency-certified', 'guaranteed', null]) {
    assert.ok(checkProvenance(provenance({ verificationTier: tier }), 'record', TODAY).some(x => x.code === 'TIER_INVALID'));
  }
});
test('provenance accepts UNKNOWN tier without upgrading it', () => {
  const data = provenance();
  assert.equal(data.verificationTier, 'unknown');
  assert.deepEqual(checkProvenance(data, 'record', TODAY), []);
});
test('observation accepts fictional sourced UNKNOWN content', () => {
  const result = checkObservation(observation(), 0, TODAY);
  assert.deepEqual(result.issues, []);
  assert.equal(result.value.status, 'UNKNOWN');
});
test('observation rejects unsupported status', () => {
  for (const status of ['accessible', 'inaccessible', 'unknown', true, null]) {
    assert.ok(codes(invalidObservation({ status })).includes('STATUS_INVALID'), String(status));
  }
});
test('observation rejects unsupported feature category', () => {
  assert.ok(codes(invalidObservation({ feature: 'hospital-entrance' })).includes('FEATURE_INVALID'));
});
test('observation requires explicit null or valid content hash', () => {
  assert.deepEqual(invalidObservation({ documentHash: HASH_A }).issues, []);
  for (const value of ['', 4, 'ABC', 'f'.repeat(63)]) assert.ok(codes(invalidObservation({ documentHash: value })).includes('HASH_INVALID'));
});
test('observation rejects unrecognized personal-data fields', () => {
  const row = { ...observation(), email: 'somebody@example.invalid' };
  assert.ok(codes(checkObservation(row, 0, TODAY)).includes('UNRECOGNISED_FIELD'));
});
test('observation requires a bounded plain-language summary', () => {
  assert.ok(codes(invalidObservation({ summary: '' })).includes('SUMMARY_INVALID'));
  assert.ok(codes(invalidObservation({ summary: 'a'.repeat(501) })).includes('SUMMARY_INVALID'));
});
test('observation note is optional but bounded', () => {
  assert.deepEqual(invalidObservation({ note: 'Editorial context only' }).issues, []);
  assert.ok(codes(invalidObservation({ note: '' })).includes('NOTE_INVALID'));
  assert.ok(codes(invalidObservation({ note: 'x'.repeat(1001) })).includes('NOTE_INVALID'));
});
test('case requires at least one evidence identifier', () => {
  assert.ok(codes(invalidCase({ observationIds: [] })).includes('OBSERVATIONS_INVALID'));
  assert.ok(codes(invalidCase({ observationIds: null })).includes('OBSERVATIONS_INVALID'));
});
test('case refuses duplicate observations', () => {
  assert.ok(codes(invalidCase({ observationIds: ['obs-a', 'obs-a'] })).includes('OBSERVATIONS_INVALID'));
});
test('case refuses more than one hundred observations', () => {
  const ids = Array.from({ length: 101 }, (_, i) => `obs-${i}`);
  assert.ok(codes(invalidCase({ observationIds: ids })).includes('OBSERVATIONS_INVALID'));
});
test('case refuses invalid place and feature fields', () => {
  assert.ok(codes(invalidCase({ placeId: '../test' })).includes('PLACE_INVALID'));
  assert.ok(codes(invalidCase({ feature: 'platform' })).includes('FEATURE_INVALID'));
});
test('case refuses malformed creation date', () => {
  assert.ok(codes(invalidCase({ createdOn: '2026-02-30' })).includes('CREATED_DATE_INVALID'));
});
test('event action must belong to the review vocabulary', () => {
  assert.ok(codes(invalidEvent({ action: 'autoverify' })).includes('ACTION_INVALID'));
  assert.deepEqual(invalidEvent({ action: 'reopen' }).issues, []);
});
test('event references are opaque identifiers or explicit null', () => {
  assert.deepEqual(invalidEvent({ reference: null }).issues, []);
  assert.deepEqual(invalidEvent({ reference: 'obs-a' }).issues, []);
  assert.ok(codes(invalidEvent({ reference: '../secrets' })).includes('REFERENCE_INVALID'));
});
test('event decision cannot claim eligibility or medical status', () => {
  for (const decision of ['eligible', 'medically-safe', 'verified', 'approved']) {
    assert.ok(codes(invalidEvent({ decision })).includes('DECISION_INVALID'));
  }
});
test('event reason and date are required', () => {
  assert.ok(codes(invalidEvent({ reason: '' })).includes('REASON_INVALID'));
  assert.ok(codes(invalidEvent({ date: '2026-11-21' })).includes('EVENT_DATE_INVALID'));
});
test('empty ledger is valid and includes all required lists', () => {
  const result = validateLedger(emptyLedger(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.events, []);
});
test('example ledger is fictional and preserves UNKNOWN', () => {
  const result = validateLedger(exampleLedger(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.value.observations[0].status, UNKNOWN);
  assert.match(result.value.observations[0].source, /Fictional/);
});
test('normal fixture validates and is not silently modified', () => {
  const original = fixture();
  const copy = clone(original);
  const result = validateLedger(original, { today: TODAY });
  assert.equal(result.ok, true);
  assert.deepEqual(original, copy);
});
test('ledger refuses extra arbitrary root properties', () => {
  assert.ok(codes(validateLedger({ ...fixture(), password: 'x' }, { today: TODAY })).includes('UNRECOGNISED_FIELD'));
});
test('ledger refuses malformed arrays and excessive entries', () => {
  for (const field of ['observations', 'cases', 'events']) {
    const malformed = { ...fixture(), [field]: {} };
    assert.ok(codes(validateLedger(malformed, { today: TODAY })).includes('ARRAY_INVALID'));
  }
  assert.ok(codes(validateLedger({ ...fixture(), events: new Array(MAX_ENTRIES + 1).fill({}) }, { today: TODAY })).includes('ARRAY_INVALID'));
});
test('ledger refuses duplicate IDs within each collection', () => {
  for (const field of ['observations', 'cases', 'events']) {
    const first = field === 'observations' ? observation() : field === 'cases' ? caseRecord() : event();
    const data = fixture({ [field]: [first, clone(first)] });
    assert.ok(codes(validateLedger(data, { today: TODAY })).includes('DUPLICATE_ID'), field);
  }
});
test('case cannot reference missing evidence', () => {
  const data = fixture({ cases: [caseRecord('case-a', { observationIds: ['missing'] })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('MISSING_OBSERVATION'));
});
test('case cannot import evidence from another place', () => {
  const data = fixture({ observations: [observation('obs-a', { placeId: 'other-fictional-place' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('CROSS_PLACE_EVIDENCE'));
});
test('case cannot import evidence from another feature', () => {
  const data = fixture({ observations: [observation('obs-a', { feature: 'parking' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('CROSS_PLACE_EVIDENCE'));
});
test('case cannot be dated before its observations', () => {
  const data = fixture({ cases: [caseRecord('case-a', { createdOn: '2025-11-01' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('OBSERVATION_AFTER_CASE'));
});
test('case cannot be created in the future', () => {
  const data = fixture({ cases: [caseRecord('case-a', { createdOn: '2026-11-21' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('FUTURE_CASE'));
});
test('event must belong to a known case', () => {
  const data = fixture({ events: [event('event-a', 'open', { caseId: 'not-here' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('MISSING_CASE'));
});
test('event cannot be dated before case creation', () => {
  const data = fixture({ events: [event('event-a', 'open', { date: '2025-11-20' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('EVENT_BEFORE_CASE'));
});
test('event reference must exist within same case', () => {
  const data = fixture({ observations: [observation(), observation('obs-b')], events: [event('event-a', 'open', { reference: 'obs-b' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('REFERENCE_NOT_IN_CASE'));
});
test('event refuses unknown references', () => {
  const data = fixture({ events: [event('event-a', 'open', { reference: 'not-here' })] });
  assert.ok(codes(validateLedger(data, { today: TODAY })).includes('MISSING_REFERENCE'));
});
test('JSON parser fails closed on malformed input', () => {
  for (const value of ['{', 'undefined', '[]', 'null', '{}']) assert.equal(parseLedger(value, { today: TODAY }).ok, false, value);
});
test('JSON parser limits encoded byte size', () => {
  assert.ok(codes(parseLedger('x'.repeat(MAX_BYTES + 1), { today: TODAY })).includes('INPUT_TOO_LARGE'));
});
test('JSON parser roundtrips complete valid ledger', () => {
  const input = fixture({ events: [event()] });
  const result = parseLedger(JSON.stringify(input), { today: TODAY });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, input);
});
test('JSON parser disallows invented schema versions', () => {
  const data = fixture({ schemaVersion: 2 });
  assert.ok(codes(parseLedger(JSON.stringify(data), { today: TODAY })).includes('VERSION_INVALID'));
});
test('invalid today fails before interpreting any source record', () => {
  const result = validateLedger(fixture(), { today: 'yesterday' });
  assert.ok(codes(result).includes('TODAY_INVALID'));
});
