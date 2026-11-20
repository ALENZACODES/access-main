import { URL } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CONTRACT_VERSION, CLAIM_VALUES, EVIDENCE_TIERS, MAX_ITEMS, MAX_STRING,
  MAX_REFERENCES, MAX_DEPTH, MAX_INPUT_BYTES, CLAIM_FIELDS, RESOURCE_KINDS,
  RESOURCE_POLICIES, ENTRY_STATES, REVIEW_STATES, problem, pointer, plainObject,
  safeIdentifier, safeText, validDay, safeHttpsUrl, safeAssetPath,
  frenchTextIssues, textPairIssues, privatePaths,
  sourceIssues, assetIssues, claimIssues, assetCycles,
  inspectRelease, releaseSummary, canonicalRelease, fingerprintRelease,
  parseRelease, serializeRelease,
} from './offline-release-contract.mjs';

const TODAY = '2026-11-19';
const hash = 'a'.repeat(64);
const source = (id = 'src') => ({
  id, title: 'Synthetic source', url: 'https://example.org/evidence',
  licence: 'CC0-1.0', retrievedOn: TODAY, sourceDate: '2026-11-18', tier: 0,
  review: 'pending',
});
const asset = (id = 'index') => ({
  id, path: `${id}.html`, kind: 'html', size: 90, sha256: hash,
  cache: 'precache', state: 'included', dependsOn: [],
  label: { en: 'Offline sample', fr: 'Exemple hors ligne' },
});
const claim = (id = 'entrance') => ({
  id, recordId: 'synthetic-site', field: 'stepFreeEntrance',
  state: 'UNKNOWN', sourceIds: ['src'],
  label: { en: 'Entrance unknown', fr: 'Entrée UNKNOWN' },
  observationOn: '2026-11-18',
});
const release = () => ({ version: CONTRACT_VERSION, releaseId: 'round-29',
  createdOn: TODAY, locale: { en: true, fr: true },
  notice: { en: 'No real-world conclusion.', fr: 'Aucune conclusion réelle.' },
  sources: [source()], assets: [asset()], claims: [claim()],
});
const copy = (value) => globalThis.structuredClone(value);
const codes = (issues) => issues.map((entry) => entry.code);
function check(document) { return inspectRelease(document, { today: TODAY }); }
function change(path, value) {
  const document = release();
  const parts = path.split('.');
  let target = document;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = value;
  return check(document);
}

test('contract version and tri-state values are exact', () => {
  assert.equal(CONTRACT_VERSION, 1);
  assert.deepEqual(CLAIM_VALUES, ['YES', 'NO', 'UNKNOWN']);
  assert.equal(CLAIM_VALUES.includes('accessible'), false);
});
test('supported tiers are canonical and UNKNOWN is not a tier', () => {
  assert.deepEqual(EVIDENCE_TIERS, [0, 1, 2, 3, 4, 'E']);
  assert.equal(EVIDENCE_TIERS.includes('UNKNOWN'), false);
});
test('limits bound input, text, depth, records and links', () => {
  assert.ok(MAX_INPUT_BYTES < 50_000_000);
  assert.ok(MAX_ITEMS > 0 && MAX_ITEMS <= 50_000);
  assert.ok(MAX_REFERENCES <= 128);
  assert.ok(MAX_DEPTH <= 64);
  assert.ok(MAX_STRING <= 8192);
});
test('claim field vocabulary contains a bounded set of physical features', () => {
  assert.ok(CLAIM_FIELDS.includes('stepFreeEntrance'));
  assert.ok(CLAIM_FIELDS.includes('accessibleWashroom'));
  assert.equal(new Set(CLAIM_FIELDS).size, CLAIM_FIELDS.length);
});
test('resource kinds cover offline assets and translation bundles', () => {
  assert.ok(RESOURCE_KINDS.includes('translation'));
  assert.ok(RESOURCE_KINDS.includes('service-worker'));
  assert.ok(RESOURCE_KINDS.includes('offline-document'));
});
test('cache policies distinguish precache and noncacheable resources', () => {
  assert.ok(RESOURCE_POLICIES.includes('precache'));
  assert.ok(RESOURCE_POLICIES.includes('not-cached'));
  assert.equal(new Set(RESOURCE_POLICIES).size, RESOURCE_POLICIES.length);
});
test('entry states do not imply a fact about accessibility', () => {
  assert.deepEqual(ENTRY_STATES, ['included', 'omitted', 'withdrawn']);
});
test('source review states only describe administrative review', () => {
  assert.deepEqual(REVIEW_STATES, ['pending', 'reviewed', 'blocked']);
});
test('JSON pointer uses RFC-style escaping', () => {
  assert.equal(pointer('a/b~c'), 'a~1b~0c');
  assert.equal(pointer(''), '');
});
test('problem includes code, pointer and safe detail', () => {
  assert.deepEqual(problem('EXAMPLE', '/claims/0', 'synthetic'),
    { code: 'EXAMPLE', path: '/claims/0', detail: 'synthetic' });
});
test('plain object distinguishes records from arrays and class instances', () => {
  assert.equal(plainObject({}), true);
  assert.equal(plainObject(Object.create(null)), true);
  assert.equal(plainObject([]), false);
  assert.equal(plainObject(null), false);
  assert.equal(plainObject(new Date()), false);
});
test('identifiers accept stable opaque tokens', () => {
  for (const value of ['abc', 'A-12', 'source.45', 'x_23', 'a:b']) {
    assert.equal(safeIdentifier(value), true, value);
  }
});
test('identifiers reject dangerous prototype names', () => {
  for (const value of ['__proto__', 'constructor', 'prototype']) {
    assert.equal(safeIdentifier(value), false, value);
  }
});
test('identifiers reject separators, whitespace and excessive length', () => {
  for (const value of ['', 'ab/cd', 'a b', '.hidden', '-bad', 'x'.repeat(129)]) {
    assert.equal(safeIdentifier(value), false, value);
  }
});
test('text requires bounded nonempty printable content', () => {
  assert.equal(safeText('Example'), true);
  assert.equal(safeText('  '), false);
  assert.equal(safeText('x'.repeat(MAX_STRING + 1)), false);
  assert.equal(safeText(5), false);
});
test('text refuses control characters without treating newline as source syntax', () => {
  assert.equal(safeText('a\u0000b'), false);
  assert.equal(safeText('a\u007fb'), false);
  assert.equal(safeText('line\nnext'), true);
});
test('calendar validation rejects leap-day rollover', () => {
  assert.equal(validDay('2024-02-29'), true);
  assert.equal(validDay('2025-02-29'), false);
  assert.equal(validDay('2026-02-30'), false);
});
test('calendar validation rejects partial dates and invalid years', () => {
  for (const date of ['today', '2026-1-2', '0000-01-01', '10000-01-01', '2026-13-01']) {
    assert.equal(validDay(date), false, date);
  }
});
test('source references require safe HTTPS', () => {
  assert.equal(safeHttpsUrl('https://example.org/open'), true);
  assert.equal(safeHttpsUrl('http://example.org/open'), false);
  assert.equal(safeHttpsUrl('javascript:alert(1)'), false);
});
test('source references reject credentials, fragments and loopback hosts', () => {
  for (const url of ['https://a:b@example.org', 'https://example.org/a#token',
    'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/']) {
    assert.equal(safeHttpsUrl(url), false, url);
  }
});
test('asset paths accept nested relative resources', () => {
  assert.equal(safeAssetPath('assets/icons/icon.svg'), true);
  assert.equal(safeAssetPath('index.html'), true);
});
test('asset paths reject traversal, query strings and remote schemes', () => {
  for (const path of ['/root', '../private', 'a/../b', './a', 'a//b',
    'https://example.org/a', 'assets/a?x=1', 'assets/a#x', 'a\\b']) {
    assert.equal(safeAssetPath(path), false, path);
  }
});
test('asset paths reject percent-encoded separators and empty strings', () => {
  assert.equal(safeAssetPath('a%2fb'), false);
  assert.equal(safeAssetPath(''), false);
});
test('French colon requires U+00A0', () => {
  assert.deepEqual(frenchTextIssues('Source\u00A0: texte', '/fr'), []);
  assert.ok(codes(frenchTextIssues('Source : texte', '/fr')).includes('FR_COLON_NBSP'));
});
test('French semicolon requires U+202F', () => {
  assert.deepEqual(frenchTextIssues('Source\u202F; texte', '/fr'), []);
  assert.ok(codes(frenchTextIssues('Source ; texte', '/fr')).includes('FR_NARROW_SPACE'));
});
test('French question mark requires U+202F', () => {
  assert.deepEqual(frenchTextIssues('Fini\u202F?', '/fr'), []);
  assert.ok(codes(frenchTextIssues('Fini ?', '/fr')).includes('FR_NARROW_SPACE'));
});
test('French exclamation requires U+202F', () => {
  assert.deepEqual(frenchTextIssues('Bravo\u202F!', '/fr'), []);
  assert.ok(codes(frenchTextIssues('Bravo !', '/fr')).includes('FR_NARROW_SPACE'));
});
test('French guillemets require narrow no-break spaces on both sides', () => {
  assert.deepEqual(frenchTextIssues('«\u202Fexemple\u202F»', '/fr'), []);
  assert.equal(codes(frenchTextIssues('«exemple»', '/fr')).filter((c) => c === 'FR_GUILLEMET').length, 2);
});
test('French internal apostrophes are curly', () => {
  assert.deepEqual(frenchTextIssues('l’application', '/fr'), []);
  assert.ok(codes(frenchTextIssues("l'application", '/fr')).includes('FR_APOSTROPHE'));
});
test('translation pairs require English and French', () => {
  assert.equal(textPairIssues({ en: 'Example', fr: 'Exemple' }, '/label').length, 0);
  assert.ok(codes(textPairIssues({ en: 'Example' }, '/label')).includes('TEXT_REQUIRED'));
});
test('translation pairs reject extra language keys', () => {
  assert.ok(codes(textPairIssues({ en: 'A', fr: 'B', es: 'C' }, '/label')).includes('TEXT_KEY_UNEXPECTED'));
});
test('privacy walker flags keys without serializing their values', () => {
  const issues = privatePaths({ user: { password: 'do-not-print-this' } });
  assert.ok(codes(issues).includes('PRIVATE_FIELD'));
  assert.equal(JSON.stringify(issues).includes('do-not-print-this'), false);
});
test('privacy walker catches nested medical and location keys', () => {
  const value = { rows: [{ diagnosis: 'private', other: { location_history: 'private' } }] };
  assert.equal(codes(privatePaths(value)).filter((code) => code === 'PRIVATE_FIELD').length, 2);
});
test('privacy walker is cycle-safe', () => {
  const input = { x: 1 };
  input.self = input;
  assert.ok(codes(privatePaths(input)).includes('CYCLIC_INPUT'));
});
test('source requires open licence and retrieval day', () => {
  assert.equal(sourceIssues(source(), '/sources/0', TODAY).length, 0);
  assert.ok(codes(sourceIssues({ ...source(), licence: 'private' }, '/s')).includes('SOURCE_LICENCE'));
});
test('source rejects a date in the future', () => {
  assert.ok(codes(sourceIssues({ ...source(), retrievedOn: '2026-11-20' }, '/s', TODAY)).includes('SOURCE_FUTURE'));
});
test('source date cannot exceed retrieval date', () => {
  assert.ok(codes(sourceIssues({ ...source(), sourceDate: '2026-11-20' }, '/s')).includes('SOURCE_DATE_ORDER'));
});
test('source review status is bounded', () => {
  assert.ok(codes(sourceIssues({ ...source(), review: 'approved-by-agency' }, '/s')).includes('SOURCE_REVIEW'));
});
test('asset validates hash, size and cache separately', () => {
  assert.equal(assetIssues(asset(), '/a').length, 0);
  assert.ok(codes(assetIssues({ ...asset(), sha256: 'short' }, '/a')).includes('ASSET_DIGEST'));
  assert.ok(codes(assetIssues({ ...asset(), cache: 'remote' }, '/a')).includes('ASSET_CACHE'));
});
test('asset size is bounded below 50 MB', () => {
  assert.ok(codes(assetIssues({ ...asset(), size: 50_000_001 }, '/a')).includes('ASSET_SIZE'));
  assert.ok(codes(assetIssues({ ...asset(), size: -1 }, '/a')).includes('ASSET_SIZE'));
});
test('asset cannot repeat dependency IDs', () => {
  assert.ok(codes(assetIssues({ ...asset(), dependsOn: ['x', 'x'] }, '/a')).includes('ASSET_DUPLICATE_DEPENDENCY'));
});
test('claim preserves explicit UNKNOWN without proof escalation', () => {
  assert.equal(claimIssues(claim(), '/claim').length, 0);
  assert.equal(claim().state, 'UNKNOWN');
});
test('claim rejects boolean or inferred state', () => {
  assert.ok(codes(claimIssues({ ...claim(), state: true }, '/claim')).includes('CLAIM_STATE'));
});
test('claim requires stable record identity and supported field', () => {
  assert.ok(codes(claimIssues({ ...claim(), recordId: '' }, '/claim')).includes('CLAIM_RECORD'));
  assert.ok(codes(claimIssues({ ...claim(), field: 'guess' }, '/claim')).includes('CLAIM_FIELD'));
});
test('cycle analysis finds self-reference', () => {
  const issues = assetCycles([{ ...asset('a'), dependsOn: ['a'] }]);
  assert.ok(codes(issues).includes('ASSET_DEPENDENCY_CYCLE'));
});
test('cycle analysis finds multi-hop cycle', () => {
  const issues = assetCycles([{ ...asset('a'), dependsOn: ['b'] }, { ...asset('b'), dependsOn: ['a'] }]);
  assert.ok(codes(issues).includes('ASSET_DEPENDENCY_CYCLE'));
});
test('minimal synthetic manifest passes without claiming a real place is accessible', () => {
  assert.equal(check(release()).ok, true);
  assert.equal(check(release()).summary.states.UNKNOWN, 1);
});
test('manifest requires both locale flags', () => {
  assert.ok(codes(change('locale', { en: true }).issues).includes('RELEASE_LOCALES'));
});
test('manifest version cannot drift', () => {
  assert.ok(codes(change('version', 2).issues).includes('RELEASE_VERSION'));
});
test('manifest date cannot lie in the future', () => {
  assert.ok(codes(change('createdOn', '2026-11-20').issues).includes('RELEASE_FUTURE'));
});
test('manifest refuses duplicate source IDs', () => {
  const input = release(); input.sources.push(copy(input.sources[0]));
  assert.ok(codes(check(input).issues).includes('DUPLICATE_ID'));
});
test('manifest refuses duplicate asset paths', () => {
  const input = release(); input.assets.push({ ...asset('another'), path: 'index.html' });
  assert.ok(codes(check(input).issues).includes('ASSET_DUPLICATE_PATH'));
});
test('manifest refuses claim references to absent sources', () => {
  const input = release(); input.claims[0].sourceIds = ['missing'];
  assert.ok(codes(check(input).issues).includes('CLAIM_MISSING_SOURCE'));
});
test('manifest refuses affirmative claims with no cited source', () => {
  const input = release(); input.claims[0].state = 'YES'; input.claims[0].sourceIds = [];
  assert.ok(codes(check(input).issues).includes('CLAIM_UNSOURCED'));
});
test('UNKNOWN claim may have no cited source without being promoted', () => {
  const input = release(); input.claims[0].sourceIds = [];
  assert.equal(check(input).ok, true);
  assert.equal(check(input).summary.states.UNKNOWN, 1);
});
test('manifest refuses cached asset referencing a missing dependency', () => {
  const input = release(); input.assets[0].dependsOn = ['missing'];
  assert.ok(codes(check(input).issues).includes('ASSET_MISSING_DEPENDENCY'));
});
test('manifest refuses included asset depending on withdrawn item', () => {
  const input = release(); input.assets.push({ ...asset('child'), state: 'withdrawn' });
  input.assets[0].dependsOn = ['child'];
  assert.ok(codes(check(input).issues).includes('ASSET_DEPENDENCY_UNAVAILABLE'));
});
test('manifest rejects private fields without revealing their values', () => {
  const input = release(); input.claims[0].email = 'private-123';
  const result = check(input);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result.issues).includes('private-123'), false);
});
test('manifest summary totals bundled bytes but not withdrawn bytes', () => {
  const input = release(); input.assets.push({ ...asset('extra'), size: 50, state: 'withdrawn' });
  assert.equal(releaseSummary(input).totalBytes, 90);
});
test('manifest canonicalization sorts IDs deterministically', () => {
  const input = release(); input.sources.push(source('alpha'));
  assert.deepEqual(canonicalRelease(input).sources.map((entry) => entry.id), ['alpha', 'src']);
});
test('manifest fingerprint ignores array ordering of records', () => {
  const input = release(); input.sources.push(source('alpha'));
  const reordered = copy(input); reordered.sources.reverse();
  assert.equal(fingerprintRelease(input).fingerprint, fingerprintRelease(reordered).fingerprint);
});
test('manifest fingerprint changes when source licence changes', () => {
  const input = release(); const changed = copy(input);
  changed.sources[0].licence = 'CC-BY-4.0';
  assert.notEqual(fingerprintRelease(input).fingerprint, fingerprintRelease(changed).fingerprint);
});
test('manifest serializer returns canonical JSON', () => {
  const input = release();
  const output = serializeRelease(input);
  assert.equal(output.ok, true);
  assert.deepEqual(JSON.parse(output.text), canonicalRelease(input));
});
test('manifest parser round-trips a valid source file', () => {
  const input = release();
  const result = parseRelease(serializeRelease(input).text);
  assert.equal(result.ok, true);
  assert.equal(result.summary.states.UNKNOWN, 1);
});
test('manifest parser rejects malformed JSON', () => {
  assert.ok(codes(parseRelease('{not-json').issues).includes('INVALID_JSON'));
});
test('manifest parser rejects oversized input before JSON parsing', () => {
  const output = parseRelease('x'.repeat(MAX_INPUT_BYTES + 1));
  assert.ok(codes(output.issues).includes('INPUT_LIMIT'));
});
test('manifest validation does not mutate source', () => {
  const input = release(); const original = copy(input);
  check(input);
  assert.deepEqual(input, original);
});
test('source files use Unicode escapes rather than literal invisible whitespace', () => {
  const text = readFileSync(new URL('./offline-release-contract.mjs', import.meta.url), 'utf8');
  assert.equal(text.includes('\u00A0'), false);
  assert.equal(text.includes('\u202F'), false);
});

test('an invalid issue limit cannot hide source validation errors', () => {
  const document = release(); document.sources[0].url = 'http://unsafe.example';
  assert.equal(inspectRelease(document, { maxIssues: 0 }).ok, false);
  assert.ok(inspectRelease(document, { maxIssues: 0 }).issues.length > 0);
});
