import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
  REHEARSAL_VERSION, RESULTS, CONDITIONS, LOCALES, PHASES, EVENT_KINDS,
  LIMITS, issue, object, pointer, goodId, goodDay, hasControls, goodText,
  safePath, safeUrl, goodFrench, textPair, keyName, privateIssues,
  provenanceIssues, assetIssues,
  validateRehearsal, parseRehearsal, canonicalRehearsal, serializeRehearsal,
} from './offline-update-rehearsal-contract.mjs';
import { TODAY, asset, event, session, document, provenance, pair, duplicate, suiteIssueCodes } from './offline-update-rehearsal-fixtures.mjs';

const inspect = value => validateRehearsal(value, { today: TODAY });
const errors = value => suiteIssueCodes(inspect(value));
const badAsset = patch => document({ assets: [asset('shell', patch)] });
const badSession = patch => document({ sessions: [session('session-one', patch)] });
const badEvent = patch => badSession({ events: [event('event-one', patch)] });

test('version and vocabularies are explicitly bounded', () => {
  assert.equal(REHEARSAL_VERSION, 1);
  assert.deepEqual(RESULTS, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.deepEqual(LOCALES, ['en', 'fr']);
  assert.ok(CONDITIONS.includes('limited'));
  assert.ok(PHASES.includes('rollback-complete'));
  assert.ok(EVENT_KINDS.includes('focus-check'));
  assert.ok(LIMITS.maxBytes < 50_000_000);
});
test('empty document is structurally valid but contains no inferred results', () => {
  assert.deepEqual(inspect({ version: 1, assets: [], sessions: [] }), { ok: true, problems: [] });
});
test('synthetic fixture records UNKNOWN without inventing success', () => {
  assert.equal(inspect(document()).ok, true);
  assert.equal(document().sessions[0].outcome, 'UNKNOWN');
});
test('issue helper contains no private input value by default', () => {
  assert.deepEqual(issue('MISSING', '/field'), { code: 'MISSING', path: '/field', detail: '' });
});
test('plain objects accept null prototype and reject arrays', () => {
  assert.equal(object({}), true);
  assert.equal(object(Object.create(null)), true);
  for (const value of [null, [], 2, 'text', new Date()]) assert.equal(object(value), false);
});
test('JSON pointer escaping is reversible for reserved punctuation', () => {
  assert.equal(pointer('a/b~c'), 'a~1b~0c');
  assert.equal(pointer('ordinary'), 'ordinary');
});
test('IDs refuse reserved properties, separators and empty values', () => {
  for (const value of ['__proto__', 'constructor', 'prototype', '', 'a/b', 'a b', 'a'.repeat(97), null]) {
    assert.equal(goodId(value), false, String(value));
  }
  for (const value of ['short', 'a-b', 'abc_001', 'a:1', 'a.b']) assert.equal(goodId(value), true);
});
test('date checking respects real leap days and rejects rollover', () => {
  for (const value of ['2024-02-29', '2000-02-29', TODAY, '1900-01-01']) assert.equal(goodDay(value), true);
  for (const value of ['2025-02-29', '1900-02-29', '2026-11-31', '0000-01-01', '2026-13-01']) assert.equal(goodDay(value), false);
});
test('date checking rejects timestamps without guessing calendar day', () => {
  for (const value of ['2026-11-20T00:00:00Z', '2026-1-1', '', undefined, 'tomorrow']) assert.equal(goodDay(value), false);
});
test('control characters are rejected using code points', () => {
  for (const value of ['abc\0', 'abc\x1f', 'a\t', 'a\n', 'x\x7f']) assert.equal(hasControls(value), true);
  assert.equal(hasControls('École fictive'), false);
});
test('text requires a nonempty printable bounded value', () => {
  for (const value of ['', '  ', '\n', '\uFFFD', 'a'.repeat(LIMITS.maxString + 1), null]) assert.equal(goodText(value), false);
  assert.equal(goodText('Synthetic text'), true);
});
test('source paths reject traversal and platform-specific separators', () => {
  for (const value of ['/root', '../secret', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'C:/file', '%2e%2e/x', 'a?b', '#fragment']) {
    assert.equal(safePath(value), false, value);
  }
});
test('source paths allow clean application-relative resources', () => {
  for (const value of ['index.html', 'assets/icon.svg', 'assets/chunk.js', 'fr/guide.json']) assert.equal(safePath(value), true);
});
test('source URLs allow only credential-free HTTPS links', () => {
  assert.equal(safeUrl('https://example.org/document'), true);
  for (const value of ['http://example.org', 'file:///tmp/a', 'javascript:alert(1)', 'https://a:b@example.org', 'https://localhost/', 'https://127.0.0.1', 'https://example.org/#hash']) {
    assert.equal(safeUrl(value), false, value);
  }
});
test('French typography requires NBSP before colons', () => {
  assert.equal(goodFrench('Source\u00A0: dossier'), true);
  assert.equal(goodFrench('Source : dossier'), false);
});
test('French typography requires narrow spaces before semicolon exclamation and question', () => {
  assert.equal(goodFrench('Bonjour\u202F! Oui\u202F; pourquoi\u202F?'), true);
  for (const value of ['Bonjour !', 'Oui ;', 'Pourquoi ?']) assert.equal(goodFrench(value), false);
});
test('French guillemets use narrow no-break spaces on both sides', () => {
  assert.equal(goodFrench('«\u202Ftexte\u202F»'), true);
  assert.equal(goodFrench('«texte»'), false);
  assert.equal(goodFrench('«\u00A0texte\u00A0»'), false);
});
test('French elisions require curly apostrophes', () => {
  assert.equal(goodFrench('L’application d’essai'), true);
  assert.equal(goodFrench("L'application d'essai"), false);
});
test('bilingual text rejects a missing locale or extra locale', () => {
  assert.equal(textPair(pair()), true);
  assert.equal(textPair({ en: 'English' }), false);
  assert.equal(textPair({ en: 'English', fr: 'Français', es: 'Spanish' }), false);
  assert.equal(textPair({ en: 'English', fr: 'Titre : non' }), false);
});
test('sensitive key normalization ignores case, dashes and underscores', () => {
  assert.equal(keyName('API_KEY'), 'apikey');
  assert.equal(keyName('health-card'), 'healthcard');
});
test('sensitive fields report a path but not values', () => {
  const privateInput = { sessions: [{ password: 'private-key-value' }] };
  const found = privateIssues(privateInput);
  assert.ok(found.some(entry => entry.code === 'PRIVATE_FIELD'));
  assert.equal(JSON.stringify(found).includes('private-key-value'), false);
});
test('nested sensitive fields are rejected without leaking their values', () => {
  const value = document({ sessions: [{ ...session(), medical_history: 'private-history' }] });
  assert.ok(errors(value).includes('PRIVATE_FIELD'));
  assert.ok(!JSON.stringify(inspect(value)).includes('private-history'));
});
test('cycle detection terminates on cyclic objects', () => {
  const value = document();
  value.self = value;
  assert.ok(errors(value).includes('CYCLIC_INPUT'));
});
test('invalid top-level shape fails before running detailed checks', () => {
  for (const value of [null, {}, [], { version: 2, assets: [], sessions: [] }, { version: 1, assets: [] }]) {
    assert.ok(errors(value).includes('DOCUMENT_INVALID'));
  }
});
test('every source must carry URL, licence, date and tier', () => {
  const fields = ['source', 'licence', 'retrievedOn', 'tier'];
  for (const key of fields) {
    const value = provenance();
    delete value[key];
    assert.ok(provenanceIssues(value, '/provenance').length > 0, key);
  }
});
test('unsupported licences and tiers are not promoted', () => {
  const evidence = provenance({ licence: 'All rights reserved', tier: 'UNKNOWN' });
  const codes = provenanceIssues(evidence, '/source').map(item => item.code);
  assert.ok(codes.includes('LICENCE_REQUIRED'));
  assert.ok(codes.includes('TIER_REQUIRED'));
});
test('future retrieval date fails when a reference date is supplied', () => {
  assert.ok(provenanceIssues(provenance({ retrievedOn: '2026-11-21' }), '/src', TODAY)
    .some(item => item.code === 'FUTURE_RETRIEVAL'));
});
test('extra provenance fields fail rather than entering output', () => {
  assert.ok(provenanceIssues({ ...provenance(), extra: 'x' }, '/p').some(x => x.code === 'PROVENANCE_EXTRA'));
});
test('asset validation rejects missing IDs and hashes', () => {
  assert.ok(assetIssues(asset('', { sha256: 'no' }), '/asset').some(x => x.code === 'ASSET_ID'));
  assert.ok(assetIssues(asset('valid', { sha256: 'no' }), '/asset').some(x => x.code === 'ASSET_DIGEST'));
});
test('asset validation requires an explicit claim state', () => {
  assert.ok(errors(badAsset({ state: true })).includes('ASSET_STATE'));
  assert.equal(inspect(badAsset({ state: 'UNKNOWN' })).ok, true);
});
test('asset byte counts are safe integers and bounded', () => {
  for (const bytes of [-1, 0.1, Infinity, Number.MAX_VALUE, 50_000_001]) {
    assert.ok(errors(badAsset({ bytes })).includes('ASSET_BYTES'));
  }
});
test('asset references require an array of valid IDs', () => {
  assert.ok(errors(badAsset({ dependsOn: 'shell' })).includes('ASSET_DEPENDENCIES'));
  assert.ok(errors(badAsset({ dependsOn: ['bad/id'] })).includes('ASSET_DEPENDENCIES'));
});
test('assets are not permitted to contain additional unknown fields', () => {
  assert.ok(errors(badAsset({ unrelated: true })).includes('ASSET_EXTRA'));
});
test('events use recognized kinds, states and integer orders', () => {
  assert.ok(errors(badEvent({ kind: 'inferred' })).includes('EVENT_KIND'));
  assert.ok(errors(badEvent({ state: 'accessible' })).includes('EVENT_STATE'));
  assert.ok(errors(badEvent({ order: -1 })).includes('EVENT_ORDER'));
});
test('events may reference an existing asset, not invent one', () => {
  assert.ok(errors(badEvent({ assetId: 'missing' })).includes('EVENT_MISSING_ASSET'));
});
test('events can omit asset linkage for a screen reader observation', () => {
  assert.equal(inspect(badEvent({ kind: 'announcement-check', assetId: null })).ok, true);
});
test('events reject unknown attributes', () => {
  assert.ok(errors(badEvent({ unexpected: 'x' })).includes('EVENT_EXTRA'));
});
test('event IDs must be unique inside a session', () => {
  const events = [event('dup', { order: 0 }), event('dup', { order: 1 })];
  assert.ok(errors(badSession({ events })).includes('EVENT_DUPLICATE'));
});
test('events must be strictly ordered', () => {
  const events = [event('first', { order: 2 }), event('second', { order: 1 })];
  assert.ok(errors(badSession({ events })).includes('EVENT_OUT_OF_ORDER'));
});
test('sessions reject unsupported locale, phase and network state', () => {
  assert.ok(errors(badSession({ locale: 'es' })).includes('SESSION_LOCALE'));
  assert.ok(errors(badSession({ phase: 'magic' })).includes('SESSION_PHASE'));
  assert.ok(errors(badSession({ network: 'connected' })).includes('SESSION_NETWORK'));
});
test('session outcome remains one of PASS FAIL or UNKNOWN', () => {
  assert.ok(errors(badSession({ outcome: true })).includes('SESSION_OUTCOME'));
  assert.equal(inspect(badSession({ outcome: 'UNKNOWN' })).ok, true);
});
test('future session recording fails closed', () => {
  assert.ok(errors(badSession({ recordedOn: '2026-11-21' })).includes('SESSION_FUTURE'));
});
test('session labels must be bilingual and correctly spaced', () => {
  assert.ok(errors(badSession({ label: { en: 'Synthetic' } })).includes('SESSION_LABEL'));
  assert.ok(errors(badSession({ label: pair('English', 'Essai : non') })).includes('SESSION_LABEL'));
});
test('session event bounds are applied before deep traversal', () => {
  const events = Array.from({ length: LIMITS.maxEventsPerSession + 1 }, (_, order) => event(`e${order}`, { order }));
  assert.ok(errors(badSession({ events })).includes('SESSION_EVENTS'));
});
test('invalid session history fields are rejected', () => {
  assert.ok(errors(badSession({ extra: 'x' })).includes('SESSION_EXTRA'));
});
test('duplicate records, paths and sessions are rejected', () => {
  assert.ok(errors(document({ assets: [asset(), asset()] })).includes('DUPLICATE_ASSET'));
  assert.ok(errors(document({ assets: [asset('a', { path: 'same' }), asset('b', { path: 'same' })] })).includes('DUPLICATE_PATH'));
  assert.ok(errors(document({ sessions: [session(), session()] })).includes('DUPLICATE_SESSION'));
});
test('missing asset dependency and self dependency are explicit failures', () => {
  assert.ok(errors(badAsset({ dependsOn: ['missing'] })).includes('MISSING_DEPENDENCY'));
  assert.ok(errors(badAsset({ dependsOn: ['shell'] })).includes('SELF_DEPENDENCY'));
});
test('extra document properties are rejected, not serialized', () => {
  assert.ok(errors(document({ another: 'field' })).includes('DOCUMENT_EXTRA'));
});
test('malformed JSON returns an issue instead of throwing', () => {
  assert.ok(suiteIssueCodes(parseRehearsal('{')).includes('JSON_INVALID'));
});
test('input size limit is measured in UTF-8 bytes', () => {
  const huge = 'É'.repeat(LIMITS.maxBytes / 2 + 1);
  assert.ok(Buffer.byteLength(huge) > LIMITS.maxBytes);
  assert.ok(suiteIssueCodes(parseRehearsal(huge)).includes('INPUT_LIMIT'));
});
test('canonical serialization is independent of record ordering', () => {
  const first = document({ assets: [asset('a'), asset('b')], sessions: [session('b'), session('a')] });
  const second = document({ assets: [asset('b'), asset('a')], sessions: [session('a'), session('b')] });
  assert.deepEqual(canonicalRehearsal(first), canonicalRehearsal(second));
});
test('serialization includes a newline and never mutates the input', () => {
  const value = document();
  const original = duplicate(value);
  const output = serializeRehearsal(value, { today: TODAY });
  assert.equal(output.ok, true);
  assert.ok(output.text.endsWith('\n'));
  assert.deepEqual(value, original);
});
test('reparsed serialized data still contains UNKNOWN', () => {
  const text = serializeRehearsal(document()).text;
  const again = parseRehearsal(text, { today: TODAY });
  assert.equal(again.ok, true);
  assert.equal(again.document.sessions[0].outcome, 'UNKNOWN');
});
test('serialization never accepts an invalid source', () => {
  const output = serializeRehearsal(badSession({ provenance: { ...provenance(), source: 'http://example.org' } }));
  assert.equal(output.ok, false);
  assert.equal(output.text, null);
});
test('array upper bounds stop unexpectedly large inputs', () => {
  const over = document({ sessions: Array.from({ length: LIMITS.maxSessions + 1 }, (_, n) => session(`x${n}`)) });
  assert.ok(errors(over).includes('SESSION_LIMIT'));
});
test('total event bound stops unbounded combined input', () => {
  const sessions = Array.from({ length: 100 }, (_, n) => session(`session${n}`, {
    events: Array.from({ length: 121 }, (_, k) => event(`e${k}`, { order: k })),
  }));
  assert.ok(errors(document({ sessions })).includes('EVENT_LIMIT'));
});
