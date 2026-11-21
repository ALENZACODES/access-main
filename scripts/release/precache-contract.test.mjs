import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRECACHE_CONTRACT_VERSION, PRECACHE_CHUNK_LIMIT, PRECACHE_MAX_DOCUMENT_BYTES,
  PRECACHE_MAX_ITEMS, PRECACHE_MAX_REFERENCES, PRECACHE_MAX_ASSET_BYTES,
  PRECACHE_STATES, PRECACHE_KINDS, PRECACHE_GROUPS, PRECACHE_LOCALES,
  plainObject, safeIdentifier, safeAssetPath, safeSourceUrl, safeLabel,
  frenchCopyIssues, privateKeyIssues, exactDay, isKnownTier, assetIssues,
  inspectPrecache, parsePrecache, canonicalPrecache, precacheFingerprint,
} from './precache-contract.mjs';

const DAY = '2026-11-19';
const SHA = 'b'.repeat(64);
const source = () => ({
  id: 'a', path: 'offline/entry.json', kind: 'data', group: 'offline-pack',
  locale: 'neutral', state: 'UNKNOWN', bytes: 12, sha256: SHA,
  source: 'https://data.example.org/open', licence: 'CC0-1.0',
  retrievedOn: DAY, tier: 0, dependsOn: [],
  label: { en: 'Synthetic record', fr: 'Fiche fictive' },
});
const document = (...assets) => ({ version: 1, releaseId: 'release-1', retrievedOn: DAY, assets });
const codes = result => result.errors.map(item => item.code);

// Contract fields are intentionally bounded, not negotiable via options.
test('contract version is fixed', () => assert.equal(PRECACHE_CONTRACT_VERSION, 1));
test('offline chunk ceiling remains 524288 bytes', () => assert.equal(PRECACHE_CHUNK_LIMIT, 524288));
test('document input ceiling remains bounded', () => assert.ok(PRECACHE_MAX_DOCUMENT_BYTES <= 8_000_000));
test('asset item ceiling remains bounded', () => assert.ok(PRECACHE_MAX_ITEMS <= 4096));
test('per-asset reference ceiling remains bounded', () => assert.ok(PRECACHE_MAX_REFERENCES <= 64));
test('asset file ceiling remains below fifty million', () => assert.ok(PRECACHE_MAX_ASSET_BYTES <= 50_000_000));
test('states are explicit and include UNKNOWN', () => assert.deepEqual(PRECACHE_STATES, ['PRESENT', 'MISSING', 'UNKNOWN']));
test('kinds are unique', () => assert.equal(new Set(PRECACHE_KINDS).size, PRECACHE_KINDS.length));
test('groups are unique', () => assert.equal(new Set(PRECACHE_GROUPS).size, PRECACHE_GROUPS.length));
test('locales are en, fr and neutral', () => assert.deepEqual(PRECACHE_LOCALES, ['en', 'fr', 'neutral']));

test('only ordinary and null-prototype objects are accepted', () => {
  assert.equal(plainObject({}), true);
  assert.equal(plainObject(Object.create(null)), true);
  assert.equal(plainObject(new Date()), false);
  assert.equal(plainObject([]), false);
  assert.equal(plainObject(null), false);
});

test('safe identifiers do not accept empty or reserved words', () => {
  assert.equal(safeIdentifier('release-2026'), true);
  assert.equal(safeIdentifier('E:1.2'), true);
  assert.equal(safeIdentifier(''), false);
  assert.equal(safeIdentifier('__proto__'), false);
  assert.equal(safeIdentifier('constructor'), false);
  assert.equal(safeIdentifier('prototype'), false);
  assert.equal(safeIdentifier('a'.repeat(129)), false);
  assert.equal(safeIdentifier('a/b'), false);
  assert.equal(safeIdentifier('a b'), false);
});

for (const [path, accepted] of [
  ['index.html', true], ['assets/a.js', true], ['data/2026/entry.json', true],
  ['assets/font.woff2', true], ['a.b/c_d', true], ['x-y/z', true],
  ['', false], ['/', false], ['/root/file', false], ['../sensitive', false],
  ['a/../b', false], ['./a', false], ['a/./b', false], ['a//b', false],
  ['a\\b', false], ['a/%2e%2e/b', false], ['https://example.com/x', false],
  ['C:/windows', false], ['a?version=1', false], ['a#fragment', false],
  ['.hidden', false], ['a/.hidden', false], [' a', false], ['a ', false],
  ['line\nname', false], ['a\tname', false], ['a'.repeat(1025), false],
]) {
  test(`asset path ${JSON.stringify(path).slice(0, 80)} is ${accepted ? 'accepted' : 'refused'}`, () => {
    assert.equal(safeAssetPath(path), accepted);
  });
}
for (const [url, accepted] of [
  ['https://example.org/open', true], ['https://sub.example.org/x?a=1', true],
  ['https://example.org:443/pack', true], ['http://example.org', false],
  ['javascript:alert(1)', false], ['file:///etc/passwd', false],
  ['ftp://example.org', false], ['//example.org/x', false],
  ['https://user:pass@example.org/', false], ['https://localhost/private', false],
  ['https://a.local/private', false], ['https://127.0.0.1/a', false],
  ['https://[::1]/', false], ['https://example.org/\n', false],
  ['', false], ['fake source', false], [42, false], [null, false],
]) {
  test(`source URL ${String(url).slice(0, 50)} is ${accepted ? 'accepted' : 'refused'}`, () => {
    assert.equal(safeSourceUrl(url), accepted);
  });
}

test('labels require both languages', () => {
  assert.equal(safeLabel({ en: 'Entrance', fr: 'Entrée' }), true);
  assert.equal(safeLabel({ en: 'Entrance' }), false);
  assert.equal(safeLabel({ fr: 'Entrée' }), false);
  assert.equal(safeLabel({ en: '', fr: 'Entrée' }), false);
  assert.equal(safeLabel({ en: 'Entrance', fr: '' }), false);
  assert.equal(safeLabel({ en: 'Entrance', fr: 'Entrée', es: 'Entrada' }), false);
  assert.equal(safeLabel({ en: 'X'.repeat(513), fr: 'Entrée' }), false);
  assert.equal(safeLabel({ en: 'Entry\nline', fr: 'Entrée' }), false);
});

test('French colon uses ordinary nonbreaking space', () => {
  assert.deepEqual(frenchCopyIssues('Source\u00A0: exemple', '/fr'), []);
  assert.ok(frenchCopyIssues('Source : exemple', '/fr').some(item => item.code === 'FR_COLON'));
  assert.ok(frenchCopyIssues('Source: exemple', '/fr').some(item => item.code === 'FR_COLON'));
});
test('French question and exclamation marks use narrow space', () => {
  assert.deepEqual(frenchCopyIssues('Quoi\u202F? Oui\u202F!', '/fr'), []);
  assert.equal(frenchCopyIssues('Quoi ? Oui !', '/fr').filter(item => item.code === 'FR_NARROW').length, 2);
});
test('French semicolon uses narrow space', () => {
  assert.deepEqual(frenchCopyIssues('Oui\u202F; non', '/fr'), []);
  assert.ok(frenchCopyIssues('Oui ; non', '/fr').some(item => item.code === 'FR_NARROW'));
});
test('French guillemets use narrow interior spaces', () => {
  assert.deepEqual(frenchCopyIssues('«\u202Ftexte\u202F»', '/fr'), []);
  assert.equal(frenchCopyIssues('«texte»', '/fr').filter(item => item.code === 'FR_QUOTES').length, 2);
  assert.equal(frenchCopyIssues('«\u00A0texte\u00A0»', '/fr').filter(item => item.code === 'FR_QUOTES').length, 2);
});
test('French apostrophes use typographic form in contractions', () => {
  assert.deepEqual(frenchCopyIssues('L’application d’essai', '/fr'), []);
  assert.ok(frenchCopyIssues("L'application d'essai", '/fr').some(item => item.code === 'FR_APOSTROPHE'));
});

test('private paths are rejected without returning values', () => {
  const result = privateKeyIssues({ assets: [{ token: 'never-copy-me', child: { health_card: '123' } }] });
  assert.ok(result.some(item => item.path === '/assets/0/token'));
  assert.ok(result.some(item => item.path === '/assets/0/child/health_card'));
  assert.equal(JSON.stringify(result).includes('never-copy-me'), false);
});
test('cycles are detected in structured input', () => {
  const value = { a: 1 };
  value.self = value;
  assert.ok(privateKeyIssues(value).some(item => item.code === 'CYCLE'));
});
test('nested depth is bounded', () => {
  let object = { value: 'end' };
  for (let i = 0; i < 30; i++) object = { next: object };
  assert.ok(privateKeyIssues(object).some(item => item.code === 'DEPTH_LIMIT'));
});
test('date validation accepts leap years and rejects rollover', () => {
  assert.equal(exactDay('2024-02-29'), true);
  assert.equal(exactDay('2025-02-29'), false);
  assert.equal(exactDay('2026-02-30'), false);
  assert.equal(exactDay('2026-11-19'), true);
  assert.equal(exactDay('today'), false);
});
test('canonical tiers reject UNKNOWN as a tier', () => {
  for (const value of [0, 1, 2, 3, 4, 'E']) assert.equal(isKnownTier(value), true);
  for (const value of ['UNKNOWN', null, '0', 5, 'unreviewed', undefined]) assert.equal(isKnownTier(value), false);
});
test('sample asset has no contract findings', () => assert.deepEqual(assetIssues(source()), []));
test('sample release is accepted', () => {
  const result = inspectPrecache(document(source()), { today: DAY });
  assert.equal(result.ok, true);
  assert.equal(result.assets.length, 1);
});
test('empty release is accepted as data but does not imply readiness', () => {
  const result = inspectPrecache(document(), { today: DAY });
  assert.equal(result.ok, true);
  assert.equal(result.assets.length, 0);
});
test('unknown states remain UNKNOWN', () => {
  const asset = source();
  assert.equal(inspectPrecache(document(asset)).assets[0].state, 'UNKNOWN');
  assert.equal(asset.state, 'UNKNOWN');
});
test('invalid affirmative state is refused', () => {
  const result = inspectPrecache(document({ ...source(), state: 'YES' }));
  assert.ok(codes(result).includes('ASSET_STATE'));
});
test('missing source refuses whole release', () => {
  const result = inspectPrecache(document({ ...source(), source: '' }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.assets, []);
});
test('missing licence refuses whole release', () => {
  assert.ok(codes(inspectPrecache(document({ ...source(), licence: '' }))).includes('ASSET_LICENCE'));
});
test('future retrieval is refused when caller supplies today', () => {
  assert.ok(codes(inspectPrecache(document({ ...source(), retrievedOn: '2026-11-20' }), { today: DAY })).includes('ASSET_DATE'));
});
test('missing tier refuses whole release', () => {
  assert.ok(codes(inspectPrecache(document({ ...source(), tier: 'UNKNOWN' }))).includes('ASSET_TIER'));
});
test('offline-pack at ceiling is accepted', () => {
  assert.deepEqual(assetIssues({ ...source(), bytes: PRECACHE_CHUNK_LIMIT }), []);
});
test('offline-pack above ceiling is refused', () => {
  assert.ok(assetIssues({ ...source(), bytes: PRECACHE_CHUNK_LIMIT + 1 }).some(item => item.code === 'OFFLINE_CHUNK_LIMIT'));
});
test('other asset still uses global file limit', () => {
  assert.deepEqual(assetIssues({ ...source(), group: 'route', bytes: PRECACHE_CHUNK_LIMIT + 1 }), []);
});
test('negative file size is refused', () => {
  assert.ok(assetIssues({ ...source(), bytes: -1 }).some(item => item.code === 'ASSET_BYTES'));
});
test('noninteger file size is refused', () => {
  assert.ok(assetIssues({ ...source(), bytes: 4.5 }).some(item => item.code === 'ASSET_BYTES'));
});
test('malformed SHA is refused', () => {
  assert.ok(assetIssues({ ...source(), sha256: 'z'.repeat(64) }).some(item => item.code === 'ASSET_HASH'));
});
test('duplicate IDs are refused', () => {
  const result = inspectPrecache(document(source(), { ...source(), path: 'b/file.json' }));
  assert.ok(codes(result).includes('DUPLICATE_ID'));
});
test('duplicate paths are refused', () => {
  const result = inspectPrecache(document(source(), { ...source(), id: 'different' }));
  assert.ok(codes(result).includes('DUPLICATE_PATH'));
});
test('missing dependencies are refused', () => {
  const result = inspectPrecache(document({ ...source(), dependsOn: ['missing'] }));
  assert.ok(codes(result).includes('MISSING_REFERENCE'));
});
test('self dependencies are refused', () => {
  assert.ok(codes(inspectPrecache(document({ ...source(), dependsOn: ['a'] }))).includes('SELF_REFERENCE'));
});
test('duplicate dependencies are refused', () => {
  const result = inspectPrecache(document({ ...source(), dependsOn: ['b', 'b'] }, { ...source(), id: 'b', path: 'b.js' }));
  assert.ok(codes(result).includes('DUPLICATE_REFERENCE'));
});
test('a two-asset cycle is refused', () => {
  const result = inspectPrecache(document(
    { ...source(), dependsOn: ['b'] },
    { ...source(), id: 'b', path: 'b.js', dependsOn: ['a'] },
  ));
  assert.ok(codes(result).includes('REFERENCE_CYCLE'));
});
test('valid dependency chain remains accepted', () => {
  const result = inspectPrecache(document(
    { ...source(), id: 'a', dependsOn: ['b'] },
    { ...source(), id: 'b', path: 'b.js', dependsOn: ['c'] },
    { ...source(), id: 'c', path: 'c.js', dependsOn: [] },
  ));
  assert.equal(result.ok, true);
});
test('unexpected release root keys are refused', () => {
  assert.ok(codes(inspectPrecache({ ...document(source()), privateNote: 'extra' })).includes('DOCUMENT_EXTRA'));
});
test('unexpected asset keys are refused', () => {
  assert.ok(codes(inspectPrecache(document({ ...source(), extra: 'x' }))).includes('ASSET_EXTRA'));
});
test('malformed JSON is refused', () => {
  assert.ok(codes(parsePrecache('{')).includes('INPUT_JSON'));
});
test('oversized input is refused', () => {
  assert.ok(codes(parsePrecache(' '.repeat(PRECACHE_MAX_DOCUMENT_BYTES + 1))).includes('INPUT_LIMIT'));
});
test('identical valid releases have identical fingerprints', () => {
  const one = precacheFingerprint(document(source()));
  const two = precacheFingerprint(document({ ...source() }));
  assert.equal(one.ok, true);
  assert.equal(one.hash, two.hash);
});
test('sorted canonical output is independent of input order', () => {
  const a = source();
  const b = { ...source(), id: 'b', path: 'b.json' };
  assert.equal(canonicalPrecache(document(a, b)).text, canonicalPrecache(document(b, a)).text);
});
test('invalid release cannot have a fingerprint', () => {
  const result = precacheFingerprint(document({ ...source(), tier: 'UNKNOWN' }));
  assert.equal(result.ok, false);
  assert.equal(result.hash, null);
});
test('fingerprints change when source changes', () => {
  const original = precacheFingerprint(document(source())).hash;
  const changed = precacheFingerprint(document({ ...source(), source: 'https://other.example.org/record' })).hash;
  assert.notEqual(original, changed);
});
test('fingerprints change when state changes to MISSING', () => {
  const original = precacheFingerprint(document(source())).hash;
  const changed = precacheFingerprint(document({ ...source(), state: 'MISSING' })).hash;
  assert.notEqual(original, changed);
});
test('contract check never mutates input', () => {
  const original = document(source());
  const snapshot = JSON.stringify(original);
  inspectPrecache(original);
  assert.equal(JSON.stringify(original), snapshot);
});
