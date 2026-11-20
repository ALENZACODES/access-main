import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RETENTION_VERSION, RETENTION_STATES, RETENTION_EVENTS, RETENTION_KINDS,
  RETENTION_TIERS, RETENTION_CLAIMS, RETENTION_LICENCES, RETENTION_LIMITS,
  retentionIssue, retentionObject, retentionDay, retentionId, retentionPath,
  retentionSource, retentionFrenchIssues, retentionPrivateIssues,
  retentionTransition, retentionRecordIssues, retentionCheck, retentionCanonical,
  retentionFingerprint, retentionParse, retentionSerialize, retentionChange,
} from './offline-release-retention.mjs';

const TODAY = '2026-11-19';
const digest = 'a'.repeat(64);
function record(id = 'asset-one', overrides = {}) {
  return {
    id, path: `${id}.json`, kind: 'dataset', digest, bytes: 1024,
    state: 'present', claims: ['UNKNOWN'],
    source: 'https://example.org/public-data', licence: 'CC0-1.0',
    retrievedOn: TODAY, tier: 0,
    labels: { en: 'Synthetic offline data', fr: 'Données fictives hors ligne' },
    references: [], events: [], ...overrides,
  };
}
function register(...records) { return { version: RETENTION_VERSION, records }; }
function codes(result) { return result.problems.map((problem) => problem.code); }
function check(...records) { return retentionCheck(register(...records), { today: TODAY }); }

// Vocabulary and shape checks.
test('version, lifecycle and evidence vocabularies are explicit', () => {
  assert.equal(RETENTION_VERSION, 1);
  for (const vocabulary of [RETENTION_STATES, RETENTION_EVENTS, RETENTION_KINDS,
    RETENTION_TIERS, RETENTION_CLAIMS, RETENTION_LICENCES]) {
    assert.equal(new Set(vocabulary).size, vocabulary.length);
    assert.ok(vocabulary.length > 0);
  }
  assert.ok(RETENTION_CLAIMS.includes('UNKNOWN'));
  assert.equal(RETENTION_CLAIMS.includes('MAYBE'), false);
});
test('limits are bounded and input smaller than the maximum asset size', () => {
  assert.ok(RETENTION_LIMITS.records <= 20_000);
  assert.ok(RETENTION_LIMITS.input < 50_000_000);
  assert.ok(RETENTION_LIMITS.events < RETENTION_LIMITS.records);
});
test('issue objects have deterministic codes and no private values', () => {
  const issue = retentionIssue('MISSING', '/item');
  assert.deepEqual(issue, { code: 'MISSING', path: '/item', detail: '' });
  assert.equal(Object.isFrozen(issue), true);
});
test('only ordinary or null-prototype records are accepted', () => {
  assert.equal(retentionObject({}), true);
  assert.equal(retentionObject(Object.create(null)), true);
  assert.equal(retentionObject([]), false);
  assert.equal(retentionObject(null), false);
  assert.equal(retentionObject(new Date()), false);
});
test('exact ISO calendar days accept leap days without rollover', () => {
  for (const day of ['2024-02-29', '2000-02-29', '2026-11-19', '0001-01-01']) {
    assert.equal(retentionDay(day), true, day);
  }
});
test('invalid calendar dates are rejected rather than normalized', () => {
  for (const day of ['2025-02-29', '1900-02-29', '2026-02-30', '2026-13-01',
    '2026-00-01', '2026-1-1', '2026-11-19T00:00:00Z', '', 'today', undefined]) {
    assert.equal(retentionDay(day), false, String(day));
  }
});
test('safe stable identifiers never accept prototype keys', () => {
  for (const id of ['asset', 'dataset.one', 'asset:two', 'evidence_3']) assert.equal(retentionId(id), true);
  for (const id of ['', '__proto__', 'constructor', 'prototype', 'a/b', 'a b',
    'x'.repeat(129), null]) assert.equal(retentionId(id), false, String(id));
});
test('asset paths are relative and cannot traverse or escape', () => {
  for (const path of ['assets/review.json', 'index.html', 'fonts/type.woff2']) {
    assert.equal(retentionPath(path), true, path);
  }
  for (const path of ['/etc/passwd', '../secret', 'a/../b', 'a//b', 'a\\b',
    'https://example.org', 'asset?key=value', 'asset#hash', 'a/%2e%2e/b',
    '', 'a\nb']) assert.equal(retentionPath(path), false, path);
});
test('source URL must be HTTPS with no credentials or fragments', () => {
  assert.equal(retentionSource('https://example.org/data'), true);
  for (const url of ['http://example.org', 'javascript:alert(1)',
    'https://user:pass@example.org', 'https://example.org/#private',
    'https://localhost/private', 'https://127.0.0.1/data',
    'https://192.168.1.1/data', 'https://[::1]/data',
    'file:///tmp/fixture', '', undefined]) {
    assert.equal(retentionSource(url), false, String(url));
  }
});
test('French typography requires ordinary nonbreaking space before colon', () => {
  assert.deepEqual(retentionFrenchIssues('Source\u00A0: preuve'), []);
  assert.equal(retentionFrenchIssues('Source : preuve').some((issue) => issue.code === 'FR_COLON'), true);
});
test('French typography requires narrow nonbreaking spaces before semicolon', () => {
  assert.deepEqual(retentionFrenchIssues('Fait\u202F; preuve'), []);
  assert.ok(retentionFrenchIssues('Fait ; preuve').some((issue) => issue.code === 'FR_NARROW'));
});
test('French typography requires narrow spaces before exclamation and question', () => {
  assert.deepEqual(retentionFrenchIssues('Pourquoi\u202F? Oui\u202F!'), []);
  assert.equal(retentionFrenchIssues('Pourquoi? Oui!').filter((issue) =>
    issue.code === 'FR_NARROW').length, 2);
});
test('French quotation marks require narrow spaces on the inside', () => {
  assert.deepEqual(retentionFrenchIssues('«\u202Fpreuve\u202F»'), []);
  assert.equal(retentionFrenchIssues('«preuve»').filter((issue) =>
    issue.code === 'FR_GUILLEMET').length, 2);
});
test('French apostrophe is typographical in prose', () => {
  assert.deepEqual(retentionFrenchIssues('L’application est locale.'), []);
  assert.ok(retentionFrenchIssues("L'application est locale.").some((i) =>
    i.code === 'FR_APOSTROPHE'));
});
test('private field detection reports paths but not sensitive values', () => {
  const result = retentionPrivateIssues({ records: [{ token: 'not-for-export',
    nested: { health_card: '123456' } }] });
  assert.ok(result.some((entry) => entry.path === '/records/0/token'));
  assert.ok(result.some((entry) => entry.path === '/records/0/nested/health_card'));
  assert.equal(JSON.stringify(result).includes('not-for-export'), false);
  assert.equal(JSON.stringify(result).includes('123456'), false);
});
test('cycles are detected without hanging', () => {
  const input = { value: 1 };
  input.self = input;
  assert.ok(retentionPrivateIssues(input).some((issue) => issue.code === 'CYCLIC_INPUT'));
});
test('deeply nested objects are bounded', () => {
  let value = {};
  for (let i = 0; i < 30; i += 1) value = { nested: value };
  assert.ok(retentionPrivateIssues(value).some((issue) => issue.code === 'DEPTH_LIMIT'));
});

// Record validation and evidence completeness.
test('empty register is valid but makes no claims', () => {
  const result = check();
  assert.equal(result.ok, true);
  assert.equal(result.records.size, 0);
});
test('synthetic fixture with UNKNOWN has complete provenance', () => {
  const result = check(record());
  assert.equal(result.ok, true);
  assert.deepEqual(result.records.get('asset-one').claims, ['UNKNOWN']);
});
test('invalid root version is rejected', () => {
  const result = retentionCheck({ version: 99, records: [] });
  assert.ok(codes(result).includes('REGISTER_INVALID'));
});
test('invalid root collection cannot be treated as empty', () => {
  const result = retentionCheck({ version: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.records, null);
});
test('root extra keys fail closed', () => {
  const input = { ...register(), networkEnabled: true };
  assert.ok(codes(retentionCheck(input)).includes('UNEXPECTED_FIELD'));
});
test('missing digest is rejected', () => {
  assert.ok(codes(check(record('a', { digest: null }))).includes('ASSET_DIGEST'));
});
test('uppercase digest is rejected', () => {
  assert.ok(codes(check(record('a', { digest: 'A'.repeat(64) }))).includes('ASSET_DIGEST'));
});
test('bytes must be safe bounded integers', () => {
  for (const bytes of [-1, 1.2, 50_000_001, Infinity, NaN, '500']) {
    assert.ok(codes(check(record('a', { bytes }))).includes('ASSET_BYTES'), String(bytes));
  }
});
test('valid asset kinds are accepted', () => {
  for (const kind of RETENTION_KINDS) assert.equal(check(record('a', { kind })).ok, true, kind);
});
test('unknown asset kind fails closed', () => {
  assert.ok(codes(check(record('a', { kind: 'streaming-map' }))).includes('ASSET_KIND'));
});
test('each source-backed record needs a source URL', () => {
  assert.ok(codes(check(record('a', { source: '' }))).includes('SOURCE_INVALID'));
});
test('each record needs an accepted open licence', () => {
  assert.ok(codes(check(record('a', { licence: 'open' }))).includes('LICENCE_INVALID'));
});
test('each record needs valid retrieval date', () => {
  assert.ok(codes(check(record('a', { retrievedOn: '2026-02-30' }))).includes('RETRIEVED_INVALID'));
});
test('future retrievals fail against supplied reference date', () => {
  assert.ok(codes(check(record('a', { retrievedOn: '2026-11-20' }))).includes('RETRIEVED_FUTURE'));
});
test('tier UNKNOWN is not a verification tier', () => {
  assert.ok(codes(check(record('a', { tier: 'UNKNOWN' }))).includes('TIER_INVALID'));
});
test('canonical numeric and E tiers are accepted as metadata', () => {
  for (const tier of RETENTION_TIERS) assert.equal(check(record('a', { tier })).ok, true, String(tier));
});
test('only explicit YES NO UNKNOWN claim states are accepted', () => {
  for (const value of RETENTION_CLAIMS) assert.equal(check(record('a', { claims: [value] })).ok, true);
  for (const value of ['yes', true, 'accessible', 'MAYBE']) {
    assert.ok(codes(check(record('a', { claims: [value] }))).includes('CLAIMS_INVALID'));
  }
});
test('label must be a bilingual pair', () => {
  assert.ok(codes(check(record('a', { labels: { en: 'Only English' } }))).includes('LABEL_FR'));
});
test('unsafe French label punctuation blocks record', () => {
  const labels = { en: 'Example', fr: 'Exemple : incomplet' };
  assert.ok(codes(check(record('a', { labels }))).includes('FR_COLON'));
});
test('unexpected label language is rejected', () => {
  const labels = { en: 'Example', fr: 'Exemple', es: 'Ejemplo' };
  assert.ok(codes(check(record('a', { labels }))).includes('UNEXPECTED_FIELD'));
});
test('duplicate record IDs are rejected', () => {
  assert.ok(codes(check(record('a'), record('a'))).includes('DUPLICATE_ID'));
});
test('duplicate paths are rejected even if IDs differ', () => {
  assert.ok(codes(check(record('a'), record('b', { path: 'a.json' }))).includes('DUPLICATE_PATH'));
});
test('missing referenced record is reported', () => {
  assert.ok(codes(check(record('a', { references: ['b'] }))).includes('REFERENCE_MISSING'));
});
test('direct self reference is rejected', () => {
  assert.ok(codes(check(record('a', { references: ['a'] }))).includes('SELF_REFERENCE'));
});
test('mutual reference cycle is rejected', () => {
  assert.ok(codes(check(record('a', { references: ['b'] }),
    record('b', { references: ['a'] }))).includes('REFERENCE_CYCLE'));
});
test('reference to an earlier fixture is valid', () => {
  assert.equal(check(record('a'), record('b', { references: ['a'] })).ok, true);
});
test('duplicate references are rejected', () => {
  assert.ok(codes(check(record('a'), record('b', { references: ['a', 'a'] })))
    .includes('REFERENCE_DUPLICATE'));
});
test('extra record fields are not silently ignored', () => {
  assert.ok(codes(check(record('a', { unsupported: true }))).includes('UNEXPECTED_FIELD'));
});
test('private data in a record fails validation', () => {
  const result = check(record('a', { diagnosis: 'secret information' }));
  assert.ok(codes(result).includes('PRIVATE_FIELD'));
  assert.equal(JSON.stringify(result).includes('secret information'), false);
});

// Lifecycle, event log, and canonical persistence.
test('a present item can be quarantined', () => {
  assert.equal(retentionTransition('present', 'quarantine'), 'quarantined');
});
test('quarantined item can be restored', () => {
  assert.equal(retentionTransition('quarantined', 'restore'), 'present');
});
test('withdrawn source can be restored with an explicit event', () => {
  assert.equal(retentionTransition('withdrawn', 'restore'), 'present');
});
test('retired item cannot be restored or withdrawn', () => {
  assert.equal(retentionTransition('retired', 'restore'), null);
  assert.equal(retentionTransition('retired', 'withdraw'), null);
});
test('a note does not alter lifecycle state', () => {
  for (const state of RETENTION_STATES) assert.equal(retentionTransition(state, 'note'), state);
});
test('events must match current lifecycle status', () => {
  const input = record('a', { events: [{ action: 'quarantine', on: TODAY, reason: 'Review pending' }] });
  assert.ok(codes(check(input)).includes('EVENT_STATE_MISMATCH'));
});
test('matching lifecycle and event log are accepted', () => {
  const input = record('a', { state: 'quarantined', events: [
    { action: 'quarantine', on: TODAY, reason: 'Review pending' },
  ] });
  assert.equal(check(input).ok, true);
});
test('event cannot predate retrieval', () => {
  const input = record('a', { state: 'quarantined', events: [
    { action: 'quarantine', on: '2026-11-18', reason: 'Review pending' },
  ] });
  assert.ok(codes(check(input)).includes('EVENT_ORDER'));
});
test('event requires a reason', () => {
  const input = record('a', { state: 'quarantined', events: [
    { action: 'quarantine', on: TODAY, reason: '' },
  ] });
  assert.ok(codes(check(input)).includes('EVENT_REASON'));
});
test('atomic change preserves original register', () => {
  const original = register(record('a'));
  const result = retentionChange(original, 'a', 'quarantine', TODAY, 'Review needed', { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(original.records[0].state, 'present');
  assert.equal(original.records[0].events.length, 0);
  assert.equal(result.document.records[0].state, 'quarantined');
});
test('atomic change never updates claim state', () => {
  const original = register(record('a'));
  const result = retentionChange(original, 'a', 'withdraw', TODAY, 'Source withdrawn');
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.records[0].claims, ['UNKNOWN']);
});
test('invalid transition returns original object', () => {
  const original = register(record('a'));
  const result = retentionChange(original, 'a', 'restore', TODAY, 'Invalid transition');
  assert.equal(result.ok, false);
  assert.equal(result.document, original);
});
test('change to nonexistent record does not create it', () => {
  const original = register(record('a'));
  const result = retentionChange(original, 'missing', 'withdraw', TODAY, 'Unlisted');
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('RECORD_MISSING'));
});
test('invalid action cannot update record', () => {
  const original = register(record('a'));
  const result = retentionChange(original, 'a', 'approve', TODAY, 'Not supported');
  assert.equal(result.ok, false);
});
test('canonical serialization is stable across input ordering', () => {
  const first = retentionSerialize(register(record('z'), record('a')));
  const second = retentionSerialize(register(record('a'), record('z')));
  assert.equal(first.ok, true);
  assert.equal(first.text, second.text);
});
test('fingerprints are stable across record ordering', () => {
  const a = retentionFingerprint(register(record('z'), record('a')));
  const b = retentionFingerprint(register(record('a'), record('z')));
  assert.equal(a.fingerprint, b.fingerprint);
  assert.ok(a.fingerprint.startsWith('sha256:'));
});
test('fingerprints change when source disappears', () => {
  const a = retentionFingerprint(register(record('a')));
  const b = retentionFingerprint(register(record('a', { source: 'https://example.org/alternate' })));
  assert.notEqual(a.fingerprint, b.fingerprint);
});
test('parser validates rather than trusting JSON shape', () => {
  const parsed = retentionParse('{"version":1,"records":[{"id":"a"}]}');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.document, null);
});
test('roundtrip retains explicit UNKNOWN and source', () => {
  const original = register(record('a'));
  const saved = retentionSerialize(original);
  const loaded = retentionParse(saved.text);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.document.records[0].source, original.records[0].source);
  assert.deepEqual(loaded.document.records[0].claims, ['UNKNOWN']);
});
test('invalid JSON returns a code rather than throwing', () => {
  assert.ok(codes(retentionParse('{')).includes('INVALID_JSON'));
});
test('serialize refuses invalid or private records', () => {
  const result = retentionSerialize(register(record('a', { token: 'private' })));
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('canonical register returns a distinct object', () => {
  const original = register(record('a'));
  const copied = retentionCanonical(original);
  assert.equal(copied.ok, true);
  assert.notEqual(copied.document, original);
  assert.notEqual(copied.document.records[0], original.records[0]);
});
test('record issue function rejects null without throwing', () => {
  assert.ok(retentionRecordIssues(null).some((issue) => issue.code === 'RECORD_INVALID'));
});
