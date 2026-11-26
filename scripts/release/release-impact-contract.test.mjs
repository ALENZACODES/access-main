import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNKNOWN, KINDS, TIERS, LOCALES, MAX_ASSETS, MAX_INPUT_BYTES, MAX_EDGES,
  cleanText, dateValid, safePath, safeId, isPlain, checkAsset, checkManifest,
  parseManifest, formatIssues,
} from './release-impact-contract.mjs';
import { DAY, SHA_A, asset, manifest, mutate, bilingual, chain } from './release-impact-fixtures.mjs';
const codes = result => result.issues.map(issue => issue.code);
const badAsset = (changes, key) => checkAsset(asset('a', changes), '$.asset', DAY).filter(issue => !key || issue.code === key);
const badDocument = (changes, key) => codes(checkManifest({ ...manifest(), ...changes }, { today: DAY })).filter(code => !key || code === key);

test('UNKNOWN has one display token across languages', () => assert.equal(UNKNOWN, 'UNKNOWN'));
test('contract declares eight artifact types', () => assert.equal(KINDS.length, 8));
test('contract declares exactly four evidence tiers', () => assert.equal(TIERS.length, 4));
test('contract declares bilingual and neutral locale states', () => assert.deepEqual(LOCALES, ['en', 'fr', 'both', 'none']));
test('asset count bounded', () => assert.ok(MAX_ASSETS > 0 && MAX_ASSETS <= 4096));
test('input byte cap bounded', () => assert.ok(MAX_INPUT_BYTES <= 2_097_152));
test('edge cap larger than asset cap', () => assert.ok(MAX_EDGES >= MAX_ASSETS));
test('plain object accepted', () => assert.equal(isPlain({}), true));
test('null prototype accepted', () => assert.equal(isPlain(Object.create(null)), true));
test('array rejected as object', () => assert.equal(isPlain([]), false));
test('null rejected as object', () => assert.equal(isPlain(null), false));
test('date validation supports leap day', () => assert.equal(dateValid('2024-02-29'), true));
test('invalid leap day is rejected', () => assert.equal(dateValid('2025-02-29'), false));
test('31st of November is invalid', () => assert.equal(dateValid('2026-11-31'), false));
test('valid day in November accepted', () => assert.equal(dateValid(DAY), true));
test('date with missing leading zero rejected', () => assert.equal(dateValid('2026-1-01'), false));
test('date with trailing time rejected', () => assert.equal(dateValid('2026-11-21T00:00Z'), false));
test('date with extra whitespace rejected', () => assert.equal(dateValid(' 2026-11-21'), false));
test('date with slash rejected', () => assert.equal(dateValid('2026/11/21'), false));
test('non-string date rejected', () => assert.equal(dateValid(20261121), false));
test('source text retains accents', () => assert.equal(cleanText('Données de terrain'), true));
test('empty source rejected', () => assert.equal(cleanText(''), false));
test('source with leading whitespace rejected', () => assert.equal(cleanText(' source'), false));
test('source with trailing whitespace rejected', () => assert.equal(cleanText('source '), false));
test('source with tab rejected', () => assert.equal(cleanText('one\ttwo'), false));
test('source with newline rejected', () => assert.equal(cleanText('one\ntwo'), false));
test('source with escape rejected', () => assert.equal(cleanText('one\u001btwo'), false));
test('source with bidi newline separator rejected', () => assert.equal(cleanText('one\u2028two'), false));
test('source with U+2029 rejected', () => assert.equal(cleanText('one\u2029two'), false));
test('source maximum length exact accepted', () => assert.equal(cleanText('x'.repeat(12), 12), true));
test('source exceeds maximum rejected', () => assert.equal(cleanText('x'.repeat(13), 12), false));
test('safe path supports nested assets', () => assert.equal(safePath('assets/vendor/app-1.js'), true));
test('safe path supports at-sign chunk', () => assert.equal(safePath('assets/@chunk/app.js'), true));
test('safe path supports parentheses in chunk', () => assert.equal(safePath('assets/app(2).js'), true));
test('safe path rejects a root-relative file', () => assert.equal(safePath('/assets/app.js'), false));
test('safe path rejects parent escape', () => assert.equal(safePath('../secrets.json'), false));
test('safe path rejects embedded escape', () => assert.equal(safePath('assets/../secret'), false));
test('safe path rejects empty segment', () => assert.equal(safePath('assets//app.js'), false));
test('safe path rejects relative current directory', () => assert.equal(safePath('./assets/app.js'), false));
test('safe path rejects query string', () => assert.equal(safePath('assets/a.js?token=1'), false));
test('safe path rejects hash fragment', () => assert.equal(safePath('assets/a.js#part'), false));
test('safe path rejects encoded slash', () => assert.equal(safePath('assets%2fa.js'), false));
test('safe path rejects URL scheme', () => assert.equal(safePath('https://x.invalid/a.js'), false));
test('safe path rejects backslash', () => assert.equal(safePath('assets\\app.js'), false));
test('safe path rejects leading dot segment', () => assert.equal(safePath('.secret'), false));
test('safe path rejects Unicode spoof', () => assert.equal(safePath('assets/é.js'), false));
test('identifier accepts safe punctuation', () => assert.equal(safeId('asset:main_v2'), true));
test('identifier rejects whitespace', () => assert.equal(safeId('asset main'), false));
test('identifier rejects braces', () => assert.equal(safeId('{asset}'), false));
test('identifier rejects very long id', () => assert.equal(safeId('a'.repeat(129)), false));
test('identifier rejects empty id', () => assert.equal(safeId(''), false));
test('minimal complete fictional manifest passes', () => assert.equal(checkManifest(manifest(), { today: DAY }).ok, true));
test('bilingual fictional manifest passes', () => assert.equal(checkManifest(bilingual(), { today: DAY }).ok, true));
test('connected fictional graph passes', () => assert.equal(checkManifest(chain(), { today: DAY }).ok, true));
test('parsed manifest passes', () => assert.equal(parseManifest(JSON.stringify(manifest()), { today: DAY }).ok, true));
test('valid parsed manifest returns a value', () => assert.equal(parseManifest(JSON.stringify(manifest()), { today: DAY }).value.assets[0].id, 'index'));
test('manifest input is not mutated', () => {
  const data = manifest(asset('z'), asset('a'));
  checkManifest(data, { today: DAY });
  assert.deepEqual(data.assets.map(row => row.id), ['z', 'a']);
});
test('validated manifest assets sorted by identifier', () => {
  const data = manifest(asset('z'), asset('a'));
  assert.deepEqual(checkManifest(data, { today: DAY }).value.assets.map(row => row.id), ['a', 'z']);
});
test('validated manifest dependencies copied not aliased', () => {
  const data = manifest(asset('a', { dependsOn: ['b'] }), asset('b'));
  const output = checkManifest(data, { today: DAY });
  assert.notEqual(output.value.assets[0].dependsOn, data.assets[0].dependsOn);
});
test('invalid JSON is not accepted', () => assert.deepEqual(codes(parseManifest('{')), ['JSON_INVALID']));
test('non-string raw input rejected', () => assert.deepEqual(codes(parseManifest({})), ['INPUT_SIZE_INVALID']));
test('oversized raw JSON rejected', () => assert.deepEqual(codes(parseManifest('x'.repeat(MAX_INPUT_BYTES + 1))), ['INPUT_SIZE_INVALID']));
test('unknown root field rejected', () => assert.ok(badDocument({ secret: 'no' }).includes('UNKNOWN_FIELD')));
test('unsupported version rejected', () => assert.ok(badDocument({ version: 2 }).includes('VERSION_UNSUPPORTED')));
test('missing version rejected', () => assert.ok(badDocument({ version: undefined }).includes('VERSION_UNSUPPORTED')));
test('non-array assets rejected', () => assert.ok(badDocument({ assets: {} }).includes('ASSETS_REQUIRED')));
test('future manifest date rejected', () => assert.ok(badDocument({ createdOn: '2026-11-22' }).includes('FUTURE_CREATED_ON')));
test('malformed manifest date rejected', () => assert.ok(badDocument({ createdOn: 'today' }).includes('INVALID_CREATED_ON')));
test('duplicate ids are rejected', () => assert.ok(badDocument({ assets: [asset('same'), asset('same', { path: 'assets/different.js' })] }).includes('DUPLICATE_ID')));
test('duplicate paths rejected', () => assert.ok(badDocument({ assets: [asset('a'), asset('b', { path: 'assets/a.js' })] }).includes('DUPLICATE_PATH')));
test('unresolved dependency rejected', () => assert.ok(badDocument({ assets: [asset('a', { dependsOn: ['missing'] })] }).includes('UNRESOLVED_DEPENDENCY')));
test('valid cross-reference accepted', () => assert.equal(checkManifest(manifest(asset('a', { dependsOn: ['b'] }), asset('b')), { today: DAY }).ok, true));
test('asset null rejected', () => assert.deepEqual(checkAsset(null), [{ code: 'ASSET_OBJECT_REQUIRED', path: '$.assets[0]', detail: '' }]));
test('asset array rejected', () => assert.ok(checkAsset([]).some(row => row.code === 'ASSET_OBJECT_REQUIRED')));
test('missing id rejected', () => assert.ok(badAsset({ id: undefined }, 'INVALID_ID').length));
test('invalid path rejected', () => assert.ok(badAsset({ path: '../bad' }, 'INVALID_PATH').length));
test('invalid digest rejected', () => assert.ok(badAsset({ sha256: 'abc' }, 'INVALID_SHA256').length));
test('uppercase digest rejected', () => assert.ok(badAsset({ sha256: SHA_A.toUpperCase() }, 'INVALID_SHA256').length));
test('negative bytes rejected', () => assert.ok(badAsset({ bytes: -1 }, 'INVALID_BYTES').length));
test('fractional bytes rejected', () => assert.ok(badAsset({ bytes: 1.5 }, 'INVALID_BYTES').length));
test('too-large asset rejected', () => assert.ok(badAsset({ bytes: 50 * 1024 * 1024 + 1 }, 'INVALID_BYTES').length));
test('exact largest allowed asset accepted', () => assert.equal(badAsset({ bytes: 50 * 1024 * 1024 }).length, 0));
test('unknown kind rejected', () => assert.ok(badAsset({ kind: 'executable' }, 'INVALID_KIND').length));
test('unknown locale rejected', () => assert.ok(badAsset({ locale: 'es' }, 'INVALID_LOCALE').length));
test('missing entry boolean rejected', () => assert.ok(badAsset({ entry: undefined }, 'INVALID_ENTRY').length));
test('string entry flag rejected', () => assert.ok(badAsset({ entry: 'true' }, 'INVALID_ENTRY').length));
test('missing dependency list rejected', () => assert.ok(badAsset({ dependsOn: undefined }, 'DEPENDENCIES_REQUIRED').length));
test('duplicate dependency rejected', () => assert.ok(badAsset({ dependsOn: ['b', 'b'] }, 'DUPLICATE_DEPENDENCY').length));
test('invalid dependency rejected', () => assert.ok(badAsset({ dependsOn: ['bad id'] }, 'INVALID_DEPENDENCY').length));
test('self-dependency rejected', () => assert.ok(badAsset({ dependsOn: ['a'] }, 'SELF_DEPENDENCY').length));
test('missing source rejected', () => assert.ok(badAsset({ source: '' }, 'SOURCE_REQUIRED').length));
test('missing licence rejected', () => assert.ok(badAsset({ licence: ' ' }, 'LICENCE_REQUIRED').length));
test('bad retrieval date rejected', () => assert.ok(badAsset({ retrievedOn: 'yesterday' }, 'INVALID_RETRIEVAL_DATE').length));
test('future retrieval date rejected', () => assert.ok(badAsset({ retrievedOn: '2026-11-22' }, 'FUTURE_RETRIEVAL_DATE').length));
test('invalid tier rejected', () => assert.ok(badAsset({ tier: 'certified' }, 'INVALID_TIER').length));
test('UNKNOWN tier accepted without promotion', () => assert.equal(badAsset({ tier: UNKNOWN }).length, 0));
test('data asset cannot be entry', () => assert.ok(badAsset({ kind: 'data', entry: true }, 'ENTRY_KIND_MISMATCH').length));
test('html asset can be entry', () => assert.equal(badAsset({ kind: 'html', entry: true }).length, 0));
test('worker asset can be entry', () => assert.equal(badAsset({ kind: 'worker', entry: true }).length, 0));
test('script asset can be entry', () => assert.equal(badAsset({ kind: 'script', entry: true }).length, 0));
test('unknown asset property rejected', () => assert.ok(badAsset({ privateToken: 'secret' }, 'UNKNOWN_FIELD').length));
test('multiple simultaneous failures preserved', () => {
  const issues = checkAsset(asset('bad name', { bytes: -2, tier: 'invalid' }));
  assert.ok(issues.length >= 3);
});
test('error paths identify individual asset', () => {
  const issues = checkManifest(manifest(asset('a'), asset('b', { path: '../bad' })), { today: DAY }).issues;
  assert.ok(issues.some(row => row.path === '$.assets[1].path'));
});
test('future date check scoped to supplied reference date', () => {
  assert.equal(checkAsset(asset('a', { retrievedOn: DAY }), '$.asset', '2026-11-20').some(row => row.code === 'FUTURE_RETRIEVAL_DATE'), true);
});
test('formatIssues sorts by path and code without mutation', () => {
  const issues = [{ code: 'B', path: '$.z' }, { code: 'A', path: '$.a' }];
  assert.equal(formatIssues(issues)[0].code, 'A');
  assert.equal(issues[0].code, 'B');
});
test('unknown status stays intact through JSON parse', () => {
  const data = manifest(asset('a', { tier: UNKNOWN }));
  assert.equal(parseManifest(JSON.stringify(data), { today: DAY }).value.assets[0].tier, UNKNOWN);
});
test('fictional manifest remains deterministic after serialization', () => {
  const data = bilingual();
  assert.deepEqual(parseManifest(JSON.stringify(data), { today: DAY }).value.assets.map(x => x.id), ['en', 'fr', 'shared']);
});
test('mutating a fixture copy does not alter the fixture', () => {
  const a = manifest(); const b = mutate(a);
  b.assets[0].bytes += 1;
  assert.equal(a.assets[0].bytes, 100);
});
for (const kind of KINDS) {
  test(`kind ${kind} accepted for a nonentry asset`, () => assert.equal(badAsset({ kind, entry: false }).length, 0));
}
for (const tier of TIERS) {
  test(`tier ${tier} remains a valid provenance tier`, () => assert.equal(badAsset({ tier }).length, 0));
}
for (const locale of LOCALES) {
  test(`locale ${locale} retained in valid asset`, () => assert.equal(badAsset({ locale }).length, 0));
}
