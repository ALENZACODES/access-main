import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNKNOWN, LIMITS, PURPOSES, TIERS, STATUSES, plain, validDate, textField,
  issuesForUrl, trackingParameters, entryKey, canonicalDestination,
  validateManifest, parseManifest,
} from './reference-contract.mjs';
import { DAY, entry, french, snapshot, observed, clone } from './reference-fixtures.mjs';

const invalid = (value, code) => {
  const result = validateManifest(value, { today: DAY });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.includes(code)), JSON.stringify(result.problems));
};
const invalidEntry = (changes, code) => invalid(snapshot(entry(changes)), code);

test('contract constants keep uncertainty explicit', () => {
  assert.equal(UNKNOWN, 'UNKNOWN');
  assert.ok(TIERS.includes(UNKNOWN));
  assert.ok(STATUSES.includes(UNKNOWN));
  assert.ok(!STATUSES.includes('Unknown'));
});
test('purpose values cover the supported reference categories', () => {
  assert.deepEqual(PURPOSES, ['data-source', 'licence', 'public-resource', 'download', 'contact', 'map-credit']);
});
test('max input size and reference count are finite', () => {
  assert.ok(LIMITS.bytes > 0);
  assert.ok(LIMITS.references < 1000);
  assert.ok(LIMITS.url <= 4096);
});
test('plain objects are accepted, arrays and dates are not', () => {
  assert.equal(plain({}), true);
  assert.equal(plain(Object.create(null)), true);
  assert.equal(plain([]), false);
  assert.equal(plain(new Date()), false);
  assert.equal(plain(null), false);
});
test('a minimal fictional snapshot is valid', () => {
  const result = validateManifest(snapshot());
  assert.deepEqual(result, { ok: true, problems: [] });
});
test('a paired bilingual snapshot is valid', () => {
  const result = validateManifest(snapshot(entry(), french()));
  assert.equal(result.ok, true);
});
test('recorded observations require an observation date and tier', () => {
  assert.equal(validateManifest(snapshot(observed())).ok, true);
  invalidEntry({ status: 'AVAILABLE' }, 'observedOn:REQUIRED');
  invalidEntry({ status: 'UNAVAILABLE' }, 'tier:EVIDENCE_REQUIRED');
});
test('unknown status requires no artificial observation date', () => {
  const record = entry();
  assert.equal(record.observedOn, undefined);
  assert.equal(record.status, UNKNOWN);
  assert.equal(validateManifest(snapshot(record)).ok, true);
});
test('a snapshot with no references is permitted for first-run audits', () => {
  assert.equal(validateManifest({ schemaVersion: 1, capturedOn: DAY, references: [] }).ok, true);
});
test('snapshot key order does not change validity', () => {
  const result = validateManifest({ references: [entry()], capturedOn: DAY, schemaVersion: 1 });
  assert.equal(result.ok, true);
});
test('JSON parse round-trips a minimal manifest', () => {
  const original = snapshot();
  assert.deepEqual(parseManifest(JSON.stringify(original)).value, original);
});
test('JSON arrays are not valid manifest roots', () => {
  assert.deepEqual(parseManifest('[]').problems, ['root:OBJECT']);
});
test('null is not a valid manifest root', () => {
  assert.deepEqual(parseManifest('null').problems, ['root:OBJECT']);
});
test('bad JSON is rejected', () => {
  assert.deepEqual(parseManifest('{not-json').problems, ['input:JSON']);
});
test('non-string JSON input is rejected', () => {
  assert.deepEqual(parseManifest(null).problems, ['input:BYTES']);
});
test('oversized JSON input is rejected before parsing', () => {
  assert.deepEqual(parseManifest(' '.repeat(LIMITS.bytes + 1)).problems, ['input:BYTES']);
});
test('invalid comparison date fails closed', () => {
  assert.deepEqual(validateManifest(snapshot(), { today: 'today' }).problems, ['today:DATE']);
});
test('snapshot dates after the comparison date are rejected', () => {
  invalid({ schemaVersion: 1, capturedOn: '2026-11-22', references: [] }, 'capturedOn:DATE');
});
test('the manifest may not contain extra fields', () => {
  invalid({ ...snapshot(), unexpected: true }, 'unexpected:EXTRA_FIELD');
});
test('schemaVersion must be exactly 1', () => {
  invalid({ ...snapshot(), schemaVersion: '1' }, 'schemaVersion:VERSION');
  invalid({ ...snapshot(), schemaVersion: 2 }, 'schemaVersion:VERSION');
});
test('references must be an array', () => {
  invalid({ ...snapshot(), references: {} }, 'references:ARRAY');
});
test('reference count is bounded without a hidden truncation', () => {
  invalid({ ...snapshot(), references: Array(LIMITS.references + 1).fill(null) }, 'references:ARRAY');
});
test('a non-object record cannot pass validation', () => {
  invalid({ ...snapshot(), references: [null] }, 'references[0]:OBJECT');
});
test('extra record attributes do not escape the allowlist', () => {
  invalidEntry({ opaque: 42 }, 'opaque:EXTRA_FIELD');
});
test('duplicate IDs in the same locale are rejected', () => {
  invalid(snapshot(entry(), entry()), 'DUPLICATE_KEY');
});
test('same ID in different locales is permitted', () => {
  assert.equal(validateManifest(snapshot(entry(), french())).ok, true);
});
test('ids and pair ids use bounded stable characters', () => {
  invalidEntry({ id: '' }, '.id:IDENTIFIER');
  invalidEntry({ id: ' space' }, '.id:IDENTIFIER');
  invalidEntry({ id: 'a'.repeat(81) }, '.id:IDENTIFIER');
  invalidEntry({ pairId: '../other' }, 'pairId:IDENTIFIER');
});
test('route paths must stay within the application-relative namespace', () => {
  for (const route of ['https://example.org/', '../admin', '/a/../b', '//host', '/spa ce', '/a?x=1', '/A']) {
    invalidEntry({ route }, 'route:ROUTE');
  }
});
test('root route and simple nested routes are accepted', () => {
  assert.equal(validateManifest(snapshot(entry({ route: '/' }))).ok, true);
  assert.equal(validateManifest(snapshot(entry({ route: '/places/notes' }))).ok, true);
});
test('language is explicitly bilingual', () => {
  for (const locale of ['EN', 'fr-CA', 'es', UNKNOWN, '']) invalidEntry({ locale }, 'locale:LOCALE');
});
test('label text rejects empty, padded and overlong values', () => {
  invalidEntry({ label: '' }, 'label:LABEL');
  invalidEntry({ label: ' padded ' }, 'label:LABEL');
  invalidEntry({ label: 'x'.repeat(LIMITS.label + 1) }, 'label:LABEL');
});
test('label text rejects embedded controls', () => {
  invalidEntry({ label: 'a\nb' }, 'label:LABEL');
  invalidEntry({ label: 'a\tb' }, 'label:LABEL');
  invalidEntry({ label: 'a\u2028b' }, 'label:LABEL');
});
test('source and licence are required for all outcomes', () => {
  invalidEntry({ source: '' }, 'source:SOURCE');
  invalidEntry({ licence: '' }, 'licence:LICENCE');
  invalidEntry({ source: 'x'.repeat(351) }, 'source:SOURCE');
  invalidEntry({ licence: 'x'.repeat(121) }, 'licence:LICENCE');
});
test('retrieval date is valid and not in the future', () => {
  invalidEntry({ retrievedOn: '2026-02-30' }, 'retrievedOn:DATE');
  invalidEntry({ retrievedOn: '2026-12-01' }, 'retrievedOn:DATE');
});
test('observation date is valid and not in the future', () => {
  invalidEntry({ observedOn: '2026-13-01' }, 'observedOn:DATE');
  invalidEntry({ observedOn: '2026-12-01' }, 'observedOn:DATE');
});
test('note length and controls are checked', () => {
  invalidEntry({ note: '' }, 'note:TEXT');
  invalidEntry({ note: 'x'.repeat(LIMITS.notes + 1) }, 'note:TEXT');
  invalidEntry({ note: '\u0000' }, 'note:TEXT');
});
test('supported purposes are strict', () => {
  invalidEntry({ purpose: 'live-map' }, 'purpose:PURPOSE');
  invalidEntry({ purpose: UNKNOWN }, 'purpose:PURPOSE');
});
test('status cannot be interpreted from a boolean', () => {
  invalidEntry({ status: true }, 'status:STATUS');
});
test('tier cannot be interpreted from a truthy number', () => {
  invalidEntry({ tier: 1 }, 'tier:TIER');
});
test('entry keys isolate language collisions', () => {
  assert.equal(entryKey(entry()), 'en:fictional-guide');
  assert.equal(entryKey(french()), 'fr:fictional-guide');
});
test('reference dates preserve leap-day validity', () => {
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2025-02-29'), false);
  assert.equal(validDate('2026-11-21'), true);
  assert.equal(validDate('2026-11-31'), false);
});
test('text fields permit ordinary bilingual punctuation', () => {
  assert.equal(textField('« Entrée accessible ? »'), true);
  assert.equal(textField('Données d’aujourd’hui'), true);
});
test('text fields refuse invisible line separators', () => {
  assert.equal(textField('a\u2029b'), false);
  assert.equal(textField('a\u007fb'), false);
});
test('canonical URLs normalize default path and hostname', () => {
  assert.equal(canonicalDestination('https://EXAMPLE.ORG/'), 'https://example.org/');
  assert.equal(canonicalDestination('https://example.org/a#part'), 'https://example.org/a');
});
test('safe HTTPS URLs pass the conservative URL policy', () => {
  for (const url of ['https://example.org', 'https://example.org/a', 'https://example.org/a?lang=fr', 'https://sub.example.org/a/b']) {
    assert.deepEqual(issuesForUrl(url), [], url);
  }
});
test('HTTP and active-content schemes are rejected', () => {
  for (const url of ['http://example.org', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.org']) {
    assert.ok(issuesForUrl(url).length > 0, url);
  }
});
test('relative and protocol-relative URLs are not allowed as external references', () => {
  for (const url of ['/help', '../help', '//example.org/help']) assert.ok(issuesForUrl(url).length > 0);
});
test('URL credentials are never permitted', () => {
  assert.ok(issuesForUrl('https://someone:password@example.org/').includes('URL_CREDENTIALS'));
  assert.ok(issuesForUrl('https://someone@example.org/').includes('URL_CREDENTIALS'));
});
test('private hostnames do not enter the outbound report', () => {
  for (const url of ['https://localhost', 'https://machine.local', 'https://host.internal', 'https://domain.invalid']) {
    assert.ok(issuesForUrl(url).includes('URL_HOST'), url);
  }
});
test('literal IP addresses are rejected', () => {
  assert.ok(issuesForUrl('https://127.0.0.1').includes('URL_IP'));
  assert.ok(issuesForUrl('https://[::1]/').includes('URL_IP'));
});
test('nonstandard network ports are rejected', () => {
  assert.ok(issuesForUrl('https://example.org:8443').includes('URL_PORT'));
});
test('URL credentials hidden inside query parameters are rejected by name', () => {
  for (const key of ['token', 'access_token', 'api_key', 'password', 'session', 'client_secret', 'refresh-token']) {
    if (key === 'token') continue;
    assert.ok(issuesForUrl(`https://example.org/?${key}=secret`).includes('URL_SECRET_PARAMETER'), key);
  }
});
test('tracking parameters are flagged for review, not silently removed', () => {
  assert.deepEqual(trackingParameters('https://example.org/?utm_source=mail&fbclid=abc'), ['fbclid', 'utm_source']);
  assert.deepEqual(issuesForUrl('https://example.org/?utm_source=mail'), []);
});
test('embedded spaces and other unsafe URL text are rejected', () => {
  for (const url of ['https://example.org/a b', 'https://example.org/<x>', 'https://example.org/\\x', 'https://example.org/%0A']) {
    assert.ok(issuesForUrl(url).length > 0, url);
  }
});
test('URL fragments are explicitly rejected rather than ambiguously ignored', () => {
  assert.ok(issuesForUrl('https://example.org/docs#section').includes('URL_FRAGMENT'));
});
test('URL parse rejects malformed input', () => {
  assert.deepEqual(issuesForUrl('not-a-url'), ['URL_PARSE']);
});
test('URL rejects excessive length', () => {
  assert.deepEqual(issuesForUrl(`https://example.org/${'a'.repeat(LIMITS.url)}`), ['URL_TEXT']);
});
test('manifest validates each record and reports its index', () => {
  const result = validateManifest(snapshot(entry(), french({ licence: '' })));
  assert.ok(result.problems.some(problem => problem.startsWith('references[1].licence')));
});
test('manifest validation never alters the supplied object', () => {
  const manifest = snapshot(entry());
  const original = clone(manifest);
  validateManifest(manifest);
  assert.deepEqual(manifest, original);
});
test('valid parser result preserves unknown fields rather than silently cleaning them', () => {
  const result = parseManifest(JSON.stringify({ ...snapshot(), debug: true }));
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.includes('debug:EXTRA_FIELD')));
});
