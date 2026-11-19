import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  REPORT_FORMATS, reportLanguage, reportStrings, escapeHtml, cell,
  colon, labelValue, isolateText, exportRegister, exportManifest,
} from './offline-source-register-export.mjs';
import {
  registerFingerprint, transitionSource, sourceHealth,
} from './offline-source-register.mjs';

const TODAY = '2026-11-19';
const OPTIONS = { today: TODAY };
const source = (id = 's-1', changes = {}) => ({
  id, title: { en: 'Synthetic evidence', fr: 'Preuve fictive' },
  type: 'open-data', url: 'https://example.org/public',
  licence: 'CC0-1.0', retrievedOn: TODAY,
  tier: 0, state: 'listed', history: [], ...changes,
});
const claim = (id = 'c-1', changes = {}) => ({
  id, sourceId: 's-1', recordId: 'sample-record', field: 'ramp',
  state: 'UNKNOWN', observedOn: '2026-11-18', ...changes,
});
const register = (sources = [source()], references = [claim()]) => ({
  version: 1, sources, references,
});
const exported = (format = 'text', language = 'en', value = register()) =>
  exportRegister(value, format, language, OPTIONS);
const codes = (value) => value.problems.map((item) => item.code);
const digest = (text) => 'sha256:' + createHash('sha256').update(text).digest('hex');

// Accessibility and provenance reports make no implied certification.
test('supported export formats are explicit', () => {
  assert.deepEqual(REPORT_FORMATS, ['text', 'html', 'csv', 'json']);
  assert.equal(new Set(REPORT_FORMATS).size, REPORT_FORMATS.length);
});

test('both supported locales have their own labels', () => {
  assert.equal(reportLanguage('en'), 'en');
  assert.equal(reportLanguage('fr'), 'fr');
  assert.notEqual(reportStrings('en').heading, reportStrings('fr').heading);
});

test('locale fallback is conservative when formatting helper is used directly', () => {
  assert.equal(reportLanguage('unknown'), 'en');
  assert.deepEqual(reportStrings('bad'), reportStrings('en'));
});

test('public export API rejects unsupported locale explicitly', () => {
  const result = exportRegister(register(), 'text', 'es', OPTIONS);
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
  assert.deepEqual(codes(result), ['LANGUAGE_INVALID']);
});

test('public export API rejects unknown output format', () => {
  for (const format of ['pdf', 'xml', '', null, 'javascript', 'docx']) {
    const result = exportRegister(register(), format, 'en', OPTIONS);
    assert.equal(result.ok, false, String(format));
    assert.deepEqual(codes(result), ['FORMAT_INVALID']);
  }
});

test('every requested report format returns a defined MIME type', () => {
  const formats = new Map([
    ['text', 'text/plain; charset=utf-8'],
    ['html', 'text/html; charset=utf-8'],
    ['csv', 'text/csv; charset=utf-8'],
    ['json', 'application/json; charset=utf-8'],
  ]);
  for (const [format, mime] of formats.entries()) {
    const result = exported(format);
    assert.equal(result.ok, true, format);
    assert.equal(result.mime, mime);
  }
});

test('export success carries no outstanding problems', () => {
  for (const format of REPORT_FORMATS) {
    assert.deepEqual(exported(format).problems, [], format);
  }
});

test('invalid input has no content and no MIME type', () => {
  const bad = register([source('s-1', { licence: 'unlicensed' })]);
  for (const format of REPORT_FORMATS) {
    const result = exported(format, 'fr', bad);
    assert.equal(result.ok, false);
    assert.equal(result.content, null);
    assert.equal(result.mime, null);
  }
});

test('invalid provenance is never silently removed from a report', () => {
  const bad = register([source('s-1', { url: 'http://example.org' })]);
  assert.ok(codes(exported('text', 'en', bad)).includes('SOURCE_URL'));
});

test('a missing tier cannot become a positive claim through output', () => {
  const bad = register([source('s-1', { tier: null })]);
  assert.ok(codes(exported('html', 'fr', bad)).includes('SOURCE_TIER'));
});

test('an invalid claim state fails every export', () => {
  const bad = register([source()], [claim('c-1', { state: 'maybe' })]);
  for (const format of REPORT_FORMATS) {
    assert.equal(exported(format, 'en', bad).ok, false, format);
  }
});

test('a missing source reference fails exports without inventing a source', () => {
  const bad = register([source()], [claim('c-1', { sourceId: 'not-present' })]);
  const result = exported('json', 'en', bad);
  assert.ok(codes(result).includes('SOURCE_NOT_FOUND'));
});

test('HTML escaping encodes every significant markup character', () => {
  assert.equal(escapeHtml(`<a title="John's &">`),
    '&lt;a title=&quot;John&#39;s &amp;&quot;&gt;');
});

test('HTML escaping never leaves raw markup from source titles', () => {
  const malicious = `<img src=x onerror='x'> & sample`;
  const result = exported('html', 'en', register([source('s-1', {
    title: { en: malicious, fr: 'Fictif' },
  })]));
  assert.equal(result.ok, true);
  assert.ok(result.content.includes('&lt;img'));
  assert.ok(!result.content.includes('<img'));
});

test('HTML escaping covers quotes and ampersands in URLs', () => {
  const result = exported('html', 'en', register([source('s-1', {
    url: 'https://example.org/data?q=one&b=two',
  })]));
  assert.ok(result.content.includes('q=one&amp;b=two'));
});

test('HTML document declares its exact language', () => {
  for (const language of ['en', 'fr']) {
    const html = exported('html', language).content;
    assert.ok(html.includes(`<html lang="${language}">`));
  }
});

test('HTML document includes one main landmark and a heading', () => {
  const html = exported('html').content;
  assert.equal((html.match(/<main>/g) ?? []).length, 1);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.ok(html.includes('</main>'));
});

test('HTML document declares charset and responsive viewport', () => {
  const html = exported('html').content;
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('name="viewport"'));
});

test('HTML table uses a caption and column headings', () => {
  const html = exported('html').content;
  assert.ok(html.includes('<caption>'));
  assert.ok(html.includes('<thead>'));
  assert.ok(html.includes('<tbody>'));
  assert.ok(html.includes('scope="col"'));
});

test('HTML table remains keyboard scrollable', () => {
  const html = exported('html').content;
  assert.ok(html.includes('role="region"'));
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(html.includes('aria-label='));
});

test('HTML review section has a heading relationship', () => {
  const html = exported('html').content;
  assert.ok(html.includes('<section aria-labelledby="review-heading">'));
  assert.ok(html.includes('<h2 id="review-heading">'));
});

test('HTML has visible keyboard focus declaration', () => {
  const html = exported('html').content;
  assert.ok(html.includes(':focus-visible'));
  assert.ok(html.includes('outline:3px solid'));
});

test('HTML does not mandate animation or scrolling motion', () => {
  const html = exported('html').content;
  assert.ok(html.includes('prefers-reduced-motion'));
});

test('HTML interactive target declaration is at least 44px', () => {
  const html = exported('html').content;
  assert.ok(html.includes('min-width:44px'));
  assert.ok(html.includes('min-height:44px'));
});

test('HTML table cells allow wrapping long source URLs', () => {
  assert.ok(exported('html').content.includes('overflow-wrap:anywhere'));
});

test('HTML avoids externally loaded fonts, scripts or map imagery', () => {
  const html = exported('html').content;
  assert.equal(/<script\b/i.test(html), false);
  assert.equal(/@import/i.test(html), false);
  assert.equal(/<img\b/i.test(html), false);
  assert.equal(/<iframe\b/i.test(html), false);
});

test('HTML contains no analytics, consent or network fetch hooks', () => {
  const html = exported('html').content;
  for (const token of ['fetch(', 'sendBeacon', 'localStorage', 'sessionStorage']) {
    assert.equal(html.includes(token), false, token);
  }
});

test('HTML reports the supplied source tier without reclassifying it', () => {
  for (const tier of [0, 1, 2, 3, 4, 'E']) {
    const html = exported('html', 'en', register([source('s-1', { tier })])).content;
    assert.ok(html.includes(`<td>${tier}</td>`));
  }
});

test('HTML displays source URL, licence and retrieval date', () => {
  const html = exported('html').content;
  for (const value of ['https://example.org/public', 'CC0-1.0', TODAY]) {
    assert.ok(html.includes(value), value);
  }
});

test('HTML does not treat the source status as a physical access finding', () => {
  const html = exported('html').content;
  assert.ok(html.includes('Review status is not a finding'));
  assert.ok(!html.includes('certified accessible'));
});

test('HTML presents a review list only for affected references', () => {
  const changed = transitionSource(register(), 's-1', 'withdraw', TODAY, OPTIONS);
  const html = exported('html', 'en', changed.register).content;
  assert.ok(html.includes('<li>s-1 | c-1 | UNKNOWN | withdrawn</li>'));
});

test('HTML keeps UNKNOWN on the review list even after withdrawal', () => {
  const changed = transitionSource(register(), 's-1', 'withdraw', TODAY, OPTIONS);
  const output = exported('html', 'fr', changed.register);
  assert.equal(output.ok, true);
  assert.ok(output.content.includes('UNKNOWN'));
});

test('CSV exports use CRLF record separators', () => {
  const output = exported('csv').content;
  assert.ok(output.includes('\r\n'));
  assert.ok(output.endsWith('\r\n'));
  assert.equal(/(?<!\r)\n/u.test(output), false);
});

test('CSV cells quote commas, double quotes and newlines', () => {
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('a"b'), '"a""b"');
  assert.equal(cell('a\nb'), '"a b"');
});

test('CSV exports neutralize spreadsheet formula prefixes', () => {
  for (const value of ['=SUM(1)', '+1', '-2', '@HYPERLINK', ' =cmd']) {
    assert.ok(cell(value).startsWith('"\''), value);
  }
});

test('ordinary CSV cells are not prefixed with unnecessary apostrophes', () => {
  for (const value of ['record-one', 'UNKNOWN', 'Source', '2026-11-19']) {
    assert.equal(cell(value), `"${value}"`);
  }
});

test('CSV output includes essential provenance columns', () => {
  const csv = exported('csv').content;
  assert.ok(csv.includes('Licence'));
  assert.ok(csv.includes('Retrieved'));
  assert.ok(csv.includes('Source tier'));
  assert.ok(csv.includes('Source status'));
});

test('French CSV uses French headers without changing protocol values', () => {
  const csv = exported('csv', 'fr').content;
  assert.ok(csv.includes('Répertorié') === false);
  assert.ok(csv.includes('Consulté'));
  assert.ok(csv.includes('"listed"'));
});

test('CSV sorting is deterministic across source order', () => {
  const a = register([source('z'), source('a')], []);
  const b = register([source('a'), source('z')], []);
  assert.equal(exported('csv', 'en', a).content, exported('csv', 'en', b).content);
});

test('CSV cell sanitization does not echo line breaks', () => {
  const item = source('s-1', { title: { en: 'A\nB', fr: 'Exemple' } });
  const output = exported('csv', 'en', register([item]));
  assert.equal(output.ok, true);
  assert.ok(output.content.includes('"A B"'));
});

test('French text export places U+00A0 before colons', () => {
  const text = exported('text', 'fr').content;
  assert.ok(text.includes('Sources\u00A0: 1'));
  assert.ok(text.includes('Consulté\u00A0: 2026-11-19'));
});

test('English text export uses ordinary colon spacing', () => {
  const text = exported('text', 'en').content;
  assert.ok(text.includes('Sources: 1'));
  assert.ok(!text.includes('Sources\u00A0:'));
});

test('report helpers isolate line breaks in imported content', () => {
  assert.equal(isolateText('one\ntwo\rthree\tfour'), 'one two three four');
});

test('locale-aware colon helper preserves French behavior', () => {
  assert.equal(colon('en'), ':');
  assert.equal(colon('fr'), '\u00A0:');
  assert.equal(labelValue('Source', 'one', 'fr'), 'Source\u00A0: one');
});

test('source title can contain typographically correct French punctuation', () => {
  const fr = '«\u202FSource\u202F»\u00A0: oui\u202F!';
  const result = exported('text', 'fr', register([source('s-1', {
    title: { en: 'Sample source', fr },
  })]));
  assert.equal(result.ok, true);
  assert.ok(result.content.includes(fr));
});

test('text report always discloses the status caveat', () => {
  for (const locale of ['en', 'fr']) {
    const text = exported('text', locale).content;
    assert.ok(text.includes(reportStrings(locale).note));
  }
});

test('text report never translates the UNKNOWN protocol token', () => {
  const text = exported('text', 'fr',
    transitionSource(register(), 's-1', 'withdraw', TODAY, OPTIONS).register).content;
  assert.ok(text.includes('UNKNOWN'));
  assert.equal(text.includes('Inconnu'), false);
});

test('text export is deterministic across repeated calls', () => {
  assert.equal(exported('text').content, exported('text').content);
});

test('JSON exports contain the full validated register and summary', () => {
  const payload = JSON.parse(exported('json').content);
  assert.equal(payload.version, 1);
  assert.equal(payload.kind, 'offline-source-register-review');
  assert.equal(payload.register.sources.length, 1);
  assert.equal(payload.summary.claims.UNKNOWN, 1);
});

test('JSON export includes exact source fingerprint', () => {
  const payload = JSON.parse(exported('json').content);
  assert.equal(payload.fingerprint, registerFingerprint(register(), OPTIONS).fingerprint);
});

test('JSON report never adds an inferred confirmation field', () => {
  const payload = JSON.parse(exported('json').content);
  assert.equal(Object.hasOwn(payload, 'certified'), false);
  assert.equal(payload.register.references[0].state, 'UNKNOWN');
});

test('JSON report carries no timestamps beyond explicitly supplied provenance', () => {
  const payload = JSON.parse(exported('json').content);
  assert.equal(Object.hasOwn(payload, 'generatedAt'), false);
  assert.equal(Object.hasOwn(payload, 'now'), false);
});

test('JSON output is deterministic across input ordering', () => {
  const left = register([source('z'), source('a')], []);
  const right = register([source('a'), source('z')], []);
  assert.equal(exported('json', 'en', left).content, exported('json', 'en', right).content);
});

test('JSON summary separates source lifecycle from accessibility claims', () => {
  const input = transitionSource(register(), 's-1', 'retire', TODAY, OPTIONS).register;
  const payload = JSON.parse(exported('json', 'fr', input).content);
  assert.equal(payload.summary.status.retired, 1);
  assert.equal(payload.summary.claims.UNKNOWN, 1);
  assert.equal(payload.summary.claims.YES, 0);
});

test('export manifest includes seven distinct local reports', () => {
  const manifest = exportManifest(register(), OPTIONS);
  assert.equal(manifest.ok, true);
  assert.equal(manifest.manifest.reports.length, 7);
  assert.equal(new Set(manifest.manifest.reports.map((item) => `${item.format}:${item.language}`)).size, 7);
});

test('manifest source fingerprint matches the actual register', () => {
  const manifest = exportManifest(register(), OPTIONS).manifest;
  assert.equal(manifest.sourceFingerprint, registerFingerprint(register(), OPTIONS).fingerprint);
});

test('every manifest digest matches generated bytes', () => {
  const manifest = exportManifest(register(), OPTIONS).manifest;
  for (const item of manifest.reports) {
    const output = exported(item.format, item.language);
    assert.equal(digest(output.content), item.digest);
    assert.equal(Buffer.byteLength(output.content), item.bytes);
  }
});

test('manifest never uses a network request to get a digest', () => {
  const first = exportManifest(register(), OPTIONS);
  const second = exportManifest(register(), OPTIONS);
  assert.deepEqual(first, second);
});

test('manifest does not include duplicated JSON by locale', () => {
  const manifest = exportManifest(register(), OPTIONS).manifest;
  assert.deepEqual(manifest.reports.filter((item) => item.format === 'json')
    .map((item) => item.language), ['en']);
});

test('manifest propagates source validation failures without reports', () => {
  const invalid = register([source('s-1', { licence: 'private' })]);
  const result = exportManifest(invalid, OPTIONS);
  assert.equal(result.ok, false);
  assert.equal(result.manifest, null);
  assert.ok(codes(result).includes('SOURCE_LICENCE'));
});

test('an empty register can be exported without fake sample data', () => {
  const input = register([], []);
  for (const format of REPORT_FORMATS) {
    const output = exported(format, 'en', input);
    assert.equal(output.ok, true, format);
    assert.ok(output.content.length > 0);
  }
  assert.deepEqual(sourceHealth(input, OPTIONS).summary.claims, { YES: 0, NO: 0, UNKNOWN: 0 });
});

test('no export mutates its input', () => {
  const input = register();
  const before = JSON.stringify(input);
  for (const format of REPORT_FORMATS) exportRegister(input, format, 'fr', OPTIONS);
  exportManifest(input, OPTIONS);
  assert.equal(JSON.stringify(input), before);
});

test('source description cannot be used to evade privacy filtering', () => {
  const input = register([source('s-1', { password: 'private-value' })]);
  const output = exported('json', 'en', input);
  assert.equal(output.ok, false);
  assert.ok(!JSON.stringify(output).includes('private-value'));
});

test('human review leaves UNKNOWN unresolved in every format', () => {
  const input = transitionSource(register(), 's-1', 'request-review', TODAY, OPTIONS).register;
  for (const format of REPORT_FORMATS) {
    const result = exported(format, 'en', input);
    assert.equal(result.ok, true, format);
  }
  assert.equal(sourceHealth(input, OPTIONS).summary.claims.UNKNOWN, 1);
});
