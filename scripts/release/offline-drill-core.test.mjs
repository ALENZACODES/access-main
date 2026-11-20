import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
  DRILL_VERSION, DRILL_LIMITS, CAPTURE_STATES, NETWORK_STATES,
  STORAGE_STATES, INTERACTION_STATES, CAPTURE_LOCALES, CONTROL_ROLES,
  GATE_RULES, object, pointer, goodId, goodText, safeHttps, localPath,
  deepPrivateKeys, goodFrenchCopy, goodPair, provenanceIssues,
  captureIssues, inspectDrill, parseDrill, canonicalDrill, serializeDrill,
} from './offline-drill-core.mjs';
import { DAY, source, control, asset, claim, capture, document, provenance, pair, mutate } from './offline-drill-fixtures.mjs';

const codes = (result) => result.problems.map((problem) => problem.code);
const inspect = (input) => inspectDrill(input, { today: DAY });
const withCapture = (changes) => document(capture('capture-a', changes));
const invalid = (doc, code) => assert.ok(codes(inspect(doc)).includes(code), `${code} => ${JSON.stringify(codes(inspect(doc)))}`);

// The contract is explicit, bounded, and never interprets flags as booleans.
test('version and limits remain stable and bounded', () => {
  assert.equal(DRILL_VERSION, 1);
  assert.ok(DRILL_LIMITS.maxBytes < 50_000_000);
  assert.ok(DRILL_LIMITS.maxCaptures > 0);
  assert.ok(DRILL_LIMITS.maxItems > DRILL_LIMITS.maxCaptures);
  assert.ok(DRILL_LIMITS.maxIssues > 0);
  assert.ok(DRILL_LIMITS.maxDepth > 0);
});
test('state domains contain no invented confirmation state', () => {
  assert.deepEqual(CAPTURE_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.deepEqual(NETWORK_STATES, ['offline', 'limited', 'online', 'UNKNOWN']);
  assert.deepEqual(STORAGE_STATES, ['ready', 'blocked', 'UNKNOWN']);
  assert.deepEqual(INTERACTION_STATES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.deepEqual(CAPTURE_LOCALES, ['en', 'fr']);
  assert.ok(CONTROL_ROLES.includes('button'));
  assert.ok(GATE_RULES.includes('UNKNOWN_PRESERVED'));
});
test('object accepts plain records and null prototype maps only', () => {
  for (const value of [{}, Object.create(null)]) assert.equal(object(value), true);
  for (const value of [null, '', 12, [], new Date(), new Set(), new Map(), new Error()]) {
    assert.equal(object(value), false);
  }
});
test('pointer encoding preserves JSON pointer grammar', () => {
  assert.equal(pointer('hello/world'), 'hello~1world');
  assert.equal(pointer('a~b'), 'a~0b');
  assert.equal(pointer('~a/b'), '~0a~1b');
  assert.equal(pointer(''), '');
  assert.equal(pointer(42), '42');
});
test('IDs reject reserved names and path-like strings', () => {
  for (const id of ['simple', 'A-1', 'a.b', 'pack:west', 'a_b']) assert.equal(goodId(id), true);
  for (const id of ['', '/', 'a/b', ' ', '__proto__', 'constructor', 'prototype',
    '-starting', 'a'.repeat(129), null, 5]) assert.equal(goodId(id), false, String(id));
});
test('text requires printable, bounded nonempty values', () => {
  assert.equal(goodText('Read only'), true);
  assert.equal(goodText('épreuve'), true);
  for (const value of ['', '  ', '\t', 'x\n', 'x\u0000', 'x'.repeat(4097), null, 7]) {
    assert.equal(goodText(value), false);
  }
  assert.equal(goodText('x'.repeat(4), 3), false);
  assert.equal(goodText('x'.repeat(3), 3), true);
});
test('HTTPS identifiers must not contact local systems or include secrets', () => {
  assert.equal(safeHttps('https://example.org/synthetic'), true);
  assert.equal(safeHttps('https://example.org/path?q=1'), true);
  for (const url of ['http://example.org', 'https://user:pw@example.org',
    'https://localhost/x', 'https://local.localhost/path',
    'https://127.0.0.1/x', 'https://[::1]/',
    'javascript:alert(1)', 'file:///tmp/file', '//example.org/path',
    'https://example.org/#token', 'https://example.org/\n', '', undefined]) {
    assert.equal(safeHttps(url), false, String(url));
  }
});
test('asset paths exclude traversal, URL, fragment and query syntax', () => {
  for (const path of ['app/shell.js', 'en/messages.json', 'fr/a.css', 'index.html']) {
    assert.equal(localPath(path), true, path);
  }
  for (const path of ['../a', './a', 'a//b', '/a', '//a', 'a/../b',
    'http://example.org', 'file:x', 'a\\b', 'a#b', 'a?b', 'a%2fb',
    'a/<b>', '', 'x\n', 'x'.repeat(DRILL_LIMITS.maxPath + 1)]) {
    assert.equal(localPath(path), false, path);
  }
});
test('privacy walk only reports paths, never the private values', () => {
  const input = { captures: [{ public: 'okay', token: 'never print', nested: { health_card: '123' } }] };
  const issues = deepPrivateKeys(input);
  assert.deepEqual(issues.map((entry) => entry.path).sort(),
    ['/captures/0/nested/health_card', '/captures/0/token']);
  assert.equal(JSON.stringify(issues).includes('never print'), false);
  assert.equal(JSON.stringify(issues).includes('123'), false);
});
test('privacy walk rejects a cycle without recursing forever', () => {
  const value = { a: 1 };
  value.self = value;
  assert.ok(deepPrivateKeys(value).some((entry) => entry.code === 'CYCLE'));
});
test('privacy walk rejects an overdeep graph', () => {
  const value = { a: { b: { c: { d: 1 } } } };
  assert.ok(deepPrivateKeys(value, '', 1).some((entry) => entry.code === 'DEPTH_LIMIT'));
});
test('ordinary names for public content do not count as personal identifiers', () => {
  const input = { source: { name: 'Synthetic public title', displayName: 'Synthetic' } };
  assert.deepEqual(deepPrivateKeys(input), []);
});
test('French labels accept curly elision and required spaces', () => {
  for (const text of ['L’application', 'Source\u00A0: exemple', 'Question\u202F?',
    'Attention\u202F!', 'Oui\u202F; non', '«\u202Fexemple\u202F»']) {
    assert.equal(goodFrenchCopy(text), true, text);
  }
});
test('French labels reject ordinary spaces before punctuation', () => {
  for (const text of ['Source : exemple', 'Question ?', 'Attention !',
    'Oui ; non', '« exemple »', '«exemple»', "L'application"] ) {
    assert.equal(goodFrenchCopy(text), false, text);
  }
});
test('paired content needs EN and FR without extra keys', () => {
  assert.equal(goodPair(pair('Entrance', 'Entrée')), true);
  assert.equal(goodPair({ en: 'English' }), false);
  assert.equal(goodPair({ fr: 'Français' }), false);
  assert.equal(goodPair({ en: 'English', fr: 'Français', es: 'Español' }), false);
  assert.equal(goodPair(pair('', 'Français')), false);
  assert.equal(goodPair(pair('English', 'Français !')), false);
});
test('synthetic complete provenance satisfies the shared open-licence policy', () => {
  assert.deepEqual(provenanceIssues(provenance(), '/x', DAY), []);
});
test('provenance missing or malformed fails closed', () => {
  assert.ok(provenanceIssues(null).some((p) => p.code === 'SOURCE_METADATA'));
  assert.ok(provenanceIssues({}).length >= 4);
  assert.ok(provenanceIssues({ source: '', licence: '', retrievedOn: '', tier: null }).length >= 4);
});
test('provenance rejects non-HTTPS URLs, unknown licence, date and tier', () => {
  const cases = [
    [{ source: 'http://example.org' }, 'SOURCE_URL'],
    [{ licence: 'All rights reserved' }, 'SOURCE_LICENCE'],
    [{ retrievedOn: '2026-02-30' }, 'SOURCE_DATE'],
    [{ retrievedOn: '2026-11-20' }, 'SOURCE_DATE'],
    [{ tier: 'UNKNOWN' }, 'SOURCE_TIER'],
    [{ tier: 9 }, 'SOURCE_TIER'],
    [{ sourceDate: '2026-11-20' }, 'SOURCE_OBSERVED_DATE'],
    [{ sourceDate: 'tomorrow' }, 'SOURCE_OBSERVED_DATE'],
    [{ newField: 'x' }, 'SOURCE_EXTRA'],
  ];
  for (const [change, expected] of cases) {
    assert.ok(provenanceIssues(provenance(change), '/x', DAY).some((p) => p.code === expected), expected);
  }
});
test('record metadata includes provenance even when claim is UNKNOWN', () => {
  assert.equal(inspect(document()).ok, true);
  const bad = mutate(document(), '/captures/0/provenance/source', null);
  invalid(bad, 'SOURCE_URL');
});
test('empty document is accepted with no fabricated source or capture', () => {
  const input = { version: DRILL_VERSION, sources: [], captures: [] };
  const result = inspect(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.captures, []);
});
test('simple fictional capture remains valid', () => {
  const result = inspect(document());
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});
test('source needs unique ID, bilingual title and metadata', () => {
  invalid({ ...document(), sources: [source('bad/id')] }, 'SOURCE_ID');
  invalid({ ...document(), sources: [source('a'), source('a')] }, 'DUPLICATE_SOURCE');
  invalid({ ...document(), sources: [source('a', { title: { en: 'Only English' } })] }, 'SOURCE_TITLE');
  invalid({ ...document(), sources: [source('a', { provenance: null })] }, 'SOURCE_METADATA');
});
test('source rejects additional undeclared properties', () => {
  invalid({ ...document(), sources: [source('source-a', { hiddenFlag: true })] }, 'SOURCE_EXTRA');
});
test('controls require supported roles and identifiers', () => {
  invalid(withCapture({ controls: [control('a/b')] }), 'CONTROL_ID');
  invalid(withCapture({ controls: [control('x', { role: 'custom' })] }), 'CONTROL_ROLE');
  invalid(withCapture({ controls: [control('x', { name: { en: 'Only EN' } })] }), 'LANGUAGE_COPY');
});
test('controls require explicit keyboard and focus outcomes', () => {
  invalid(withCapture({ controls: [control('x', { keyboard: true })] }), 'CONTROL_KEYBOARD');
  invalid(withCapture({ controls: [control('x', { focus: 'INFERRED' })] }), 'CONTROL_FOCUS');
  assert.equal(inspect(withCapture({ controls: [control('x', { keyboard: 'UNKNOWN', focus: 'UNKNOWN' })] })).ok, true);
});
test('controls require numeric and nonnegative target dimensions', () => {
  for (const target of [{ width: '44', height: 44 }, { width: -1, height: 44 },
    { width: Infinity, height: 44 }, null, { width: 44 }, { width: 10001, height: 50 }]) {
    invalid(withCapture({ controls: [control('x', { target })] }), 'CONTROL_TARGET');
  }
});
test('controls reject unexpected fields and duplicate IDs', () => {
  invalid(withCapture({ controls: [control('x', { color: 'blue' })] }), 'CONTROL_EXTRA');
  invalid(withCapture({ controls: [control('x'), control('x')] }), 'DUPLICATE_ITEM');
});
test('asset digest UNKNOWN is explicitly represented by null', () => {
  assert.equal(inspect(withCapture({ assets: [asset('a', { sha256: null })] })).ok, true);
});
test('assets reject bad digest, local path, missing state and extra keys', () => {
  invalid(withCapture({ assets: [asset('../a')] }), 'ASSET_PATH');
  invalid(withCapture({ assets: [asset('a', { sha256: 'short' })] }), 'ASSET_DIGEST');
  invalid(withCapture({ assets: [asset('a', { available: 'maybe' })] }), 'ASSET_STATE');
  invalid(withCapture({ assets: [asset('a', { shell: 'YES' })] }), 'ASSET_SHELL');
  invalid(withCapture({ assets: [asset('a', { unknown: true })] }), 'ASSET_EXTRA');
});
test('assets reject duplicate paths', () => {
  invalid(withCapture({ assets: [asset('x'), asset('x')] }), 'DUPLICATE_ITEM');
});
test('claims accept explicit UNKNOWN and never infer truth from booleans', () => {
  assert.equal(inspect(withCapture({ claims: [claim('x', { state: 'UNKNOWN' })] })).ok, true);
  for (const value of [true, false, 'yes', 'No', '', null, 1]) {
    invalid(withCapture({ claims: [claim('x', { state: value })] }), 'CLAIM_STATE');
  }
});
test('claims need IDs, source references and bilingual labels', () => {
  invalid(withCapture({ claims: [claim('x/y')] }), 'CLAIM_ID');
  invalid(withCapture({ claims: [claim('x', { sourceId: '' })] }), 'CLAIM_SOURCE');
  invalid(withCapture({ claims: [claim('x', { label: pair('X', 'Texte !') })] }), 'LANGUAGE_COPY');
  invalid(withCapture({ claims: [claim('x', { detail: 'not allowed' })] }), 'CLAIM_EXTRA');
});
test('claims cannot refer to nonexistent sources', () => {
  invalid(withCapture({ claims: [claim('x', { sourceId: 'missing' })] }), 'CLAIM_SOURCE_MISSING');
});
test('claims with duplicate IDs are rejected', () => {
  invalid(withCapture({ claims: [claim('x'), claim('x')] }), 'DUPLICATE_ITEM');
});
test('capture requires an explicit route, locale and environment', () => {
  invalid(withCapture({ route: 'relative/path' }), 'CAPTURE_ROUTE');
  invalid(withCapture({ locale: 'es' }), 'CAPTURE_LOCALE');
  invalid(withCapture({ network: 'maybe' }), 'CAPTURE_NETWORK');
  invalid(withCapture({ storage: 'maybe' }), 'CAPTURE_STORAGE');
});
test('capture permits unknown environmental observations', () => {
  const result = inspect(withCapture({ network: 'UNKNOWN', storage: 'UNKNOWN',
    shell: 'UNKNOWN', privacy: 'UNKNOWN', consent: 'UNKNOWN' }));
  assert.equal(result.ok, true);
});
test('capture requires explicit PASS, FAIL, or UNKNOWN instead of booleans', () => {
  for (const key of ['shell', 'privacy', 'consent']) {
    invalid(withCapture({ [key]: true }), `CAPTURE_${key.toUpperCase()}`);
  }
});
test('capture viewport requires finite positive integer screen dimensions', () => {
  const bad = [{ width: 239, height: 600 }, { width: 390.5, height: 600 },
    { width: 500, height: 200 }, { width: 9000, height: 500 }, null];
  for (const viewport of bad) invalid(withCapture({ viewport }), 'CAPTURE_VIEWPORT');
});
test('capture rejects additional properties instead of silently storing them', () => {
  invalid(withCapture({ token: 'private-value' }), 'PRIVATE_FIELD');
  invalid(withCapture({ unrecognized: true }), 'CAPTURE_EXTRA');
});
test('record count limits reject excessive captures', () => {
  const captures = Array.from({ length: DRILL_LIMITS.maxCaptures + 1 }, (_, i) => capture(`c${i}`));
  invalid(document(...captures), 'DRILL_LIMIT');
});
test('collection count limits reject large control arrays', () => {
  const controls = Array.from({ length: DRILL_LIMITS.maxItems + 1 }, (_, i) => control(`c${i}`));
  invalid(withCapture({ controls }), 'CAPTURE_COLLECTION');
});
test('duplicate capture identifiers do not silently overwrite records', () => {
  invalid(document(capture('a'), capture('a')), 'DUPLICATE_CAPTURE');
});
test('document rejects unsupported versions and extra fields', () => {
  invalid({ ...document(), version: 2 }, 'DRILL_SHAPE');
  invalid({ ...document(), notes: 'extra' }, 'DRILL_EXTRA');
});
test('document rejects malformed arrays and object roots', () => {
  for (const value of [null, [], 2, {}, { version: 1, sources: [] },
    { version: 1, captures: [] }]) assert.equal(inspect(value).ok, false);
});
test('cycle and private-data checks do not disclose values in results', () => {
  const input = document();
  input.credentials = { password: 'private-value' };
  const result = inspect(input);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result.problems).includes('private-value'), false);
});
test('parse rejects malformed or overbudget JSON', () => {
  assert.ok(codes(parseDrill('{')).includes('INPUT_JSON'));
  assert.ok(codes(parseDrill('x'.repeat(DRILL_LIMITS.maxBytes + 1))).includes('INPUT_LIMIT'));
  assert.ok(codes(parseDrill(7)).includes('INPUT_LIMIT'));
});
test('parse accepts complete synthetic JSON', () => {
  const input = document();
  const result = parseDrill(JSON.stringify(input), { today: DAY });
  assert.equal(result.ok, true);
  assert.equal(result.document.captures[0].claims[0].state, 'UNKNOWN');
});
test('canonical sort does not mutate source arrays', () => {
  const input = document(capture('z'), capture('a'));
  const a = canonicalDrill(input);
  assert.equal(a.ok, true);
  assert.deepEqual(a.document.captures.map((row) => row.id), ['a', 'z']);
  assert.deepEqual(input.captures.map((row) => row.id), ['z', 'a']);
});
test('canonical sort normalizes unordered controls, assets and claims', () => {
  const input = withCapture({
    controls: [control('z'), control('a')],
    assets: [asset('z.js'), asset('a.js')],
    claims: [claim('z'), claim('a')],
  });
  const result = canonicalDrill(input);
  assert.deepEqual(result.document.captures[0].controls.map((x) => x.id), ['a', 'z']);
  assert.deepEqual(result.document.captures[0].assets.map((x) => x.path), ['a.js', 'z.js']);
  assert.deepEqual(result.document.captures[0].claims.map((x) => x.id), ['a', 'z']);
});
test('serialize fails closed when document is invalid', () => {
  const result = serializeDrill(mutate(document(), '/captures/0/claims/0/state', true));
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('serialize round trips deterministically', () => {
  const text = serializeDrill(document(), { today: DAY });
  assert.equal(text.ok, true);
  assert.ok(text.text.endsWith('\n'));
  assert.equal(parseDrill(text.text, { today: DAY }).ok, true);
  assert.equal(serializeDrill(JSON.parse(text.text), { today: DAY }).text, text.text);
});
test('core does not create files, call the network, or use a timer', () => {
  const result = inspect(document());
  assert.equal(result.ok, true);
  assert.equal(Buffer.byteLength(JSON.stringify(result.document)) > 0, true);
});
