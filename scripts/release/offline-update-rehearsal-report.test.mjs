import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORT_FORMATS, REPORT_WORDS, locale, copy, colon, escapeHtml,
  safeCell, csvRow, reportRows, exportModel, textReport, csvReport,
  htmlReport, jsonReport, changeReport, renderReport,
  localizedHeaders, statesAreStable,
} from './offline-update-rehearsal-report.mjs';
import { TODAY, document, session, event, provenance, asset, pair } from './offline-update-rehearsal-fixtures.mjs';
const options = { today: TODAY };
const csv = (value, language = 'en') => csvReport(value, language, options);
const html = (value, language = 'en') => htmlReport(value, language, options);
const text = (value, language = 'en') => textReport(value, language, options);
const json = value => JSON.parse(jsonReport(value, options));

test('all report formats are unique and documented', () => {
  assert.deepEqual(REPORT_FORMATS, ['text', 'html', 'csv', 'json']);
  assert.equal(new Set(REPORT_FORMATS).size, REPORT_FORMATS.length);
});
test('English and French copy contain the same keys', () => {
  assert.deepEqual(Object.keys(REPORT_WORDS.en).sort(), Object.keys(REPORT_WORDS.fr).sort());
});
test('UNKNOWN remains the same uppercase token in both languages', () => {
  assert.equal(copy('en').unknown, 'UNKNOWN');
  assert.equal(copy('fr').unknown, 'UNKNOWN');
  assert.equal(statesAreStable(), true);
});
test('unsupported locales fall back to English', () => {
  assert.equal(locale('other'), 'en');
  assert.deepEqual(copy('other'), copy('en'));
});
test('French output retains a curly apostrophe in display copy', () => {
  assert.ok(Object.values(copy('fr')).some(value => value.includes('’')));
});
test('French colons are preceded by a real NBSP at runtime', () => {
  assert.equal(colon('fr'), '\u00A0:');
  assert.equal(colon('en'), ':');
});
test('HTML escaping neutralizes markup and attribute delimiters', () => {
  assert.equal(escapeHtml('<script>x & "y"</script>'), '&lt;script&gt;x &amp; &quot;y&quot;&lt;/script&gt;');
  assert.equal(escapeHtml("'quoted'"), '&#39;quoted&#39;');
});
test('HTML escaping handles numbers and missing values', () => {
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(null), '');
});
test('CSV cells escape embedded quote characters', () => {
  assert.equal(safeCell('say "hello"'), '"say ""hello"""');
});
test('CSV cells neutralize leading spreadsheet operators', () => {
  for (const value of ['=SUM(A1)', '+1+2', '-1+2', '@NOW()']) assert.ok(safeCell(value).startsWith('"\''), value);
});
test('CSV cells neutralize formula operators after leading spaces', () => {
  assert.ok(safeCell('  =1+2').startsWith('"\''));
});
test('CSV cells flatten line endings and tabs', () => {
  assert.equal(safeCell('one\ntwo\rthree\tfour'), '"one two three four"');
});
test('CSV keeps the UNKNOWN token unchanged', () => {
  assert.equal(safeCell('UNKNOWN'), '"UNKNOWN"');
});
test('CSV row respects the order of supplied cells', () => {
  assert.equal(csvRow(['a', 'b', 'c']), '"a","b","c"');
});
test('reported rows include source provenance on each session', () => {
  const result = reportRows(document(), options);
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].source, 'https://example.org/synthetic');
  assert.equal(result.rows[0].licence, 'CC0-1.0');
  assert.equal(result.rows[0].retrievedOn, TODAY);
  assert.equal(result.rows[0].tier, 0);
});
test('reported row outcome is UNKNOWN when evidence is missing', () => {
  assert.equal(reportRows(document()).rows[0].state, 'UNKNOWN');
});
test('invalid input produces no displayed rows', () => {
  const result = reportRows({ version: 2 }, options);
  assert.equal(result.ok, false);
  assert.deepEqual(result.rows, []);
});
test('model contains all missing phase coverage combinations', () => {
  const model = exportModel(document()).model;
  assert.equal(model.coverage.length, 32);
  assert.ok(model.coverage.some(x => x.locale === 'fr' && x.state === 'UNKNOWN'));
});
test('model findings contain paths and codes, not input values', () => {
  const model = exportModel(document()).model;
  assert.ok(model.findings.length > 0);
  assert.ok(model.findings.every(x => typeof x.code === 'string' && typeof x.path === 'string'));
});
test('model includes a fingerprint for administrative comparison', () => {
  assert.match(exportModel(document()).model.fingerprint, /^[a-f0-9]{64}$/);
});
test('English text report states its evidence limitation', () => {
  assert.ok(text(document()).includes(copy('en').caution));
  assert.ok(text(document()).includes(copy('en').note));
});
test('French text report states its evidence limitation', () => {
  assert.ok(text(document(), 'fr').includes(copy('fr').caution));
  assert.ok(text(document(), 'fr').includes(copy('fr').note));
});
test('French text report labels use NBSP before colon', () => {
  const content = text(document(), 'fr');
  assert.ok(content.includes('Source\u00A0:'));
  assert.ok(content.includes('Séances\u00A0:'));
});
test('English and French text reports retain uppercase UNKNOWN', () => {
  assert.ok(text(document()).includes('UNKNOWN'));
  assert.ok(text(document(), 'fr').includes('UNKNOWN'));
});
test('text report never silently omits missing coverage rows', () => {
  assert.ok(text(document()).includes(copy('en').missing));
});
test('text output ends with a newline for command-line readability', () => {
  assert.ok(text(document()).endsWith('\n'));
});
test('localized CSV headers are not raw data keys', () => {
  assert.ok(localizedHeaders('fr').includes('Consulté le'));
  assert.ok(localizedHeaders('fr').includes('Niveau de contrôle de la source'));
  assert.notDeepEqual(localizedHeaders('fr'), localizedHeaders('en'));
});
test('CSV includes localized headers and exactly one record', () => {
  const output = csv(document(), 'fr');
  assert.ok(output.startsWith('"Identifiant"'));
  assert.equal(output.trim().split('\r\n').length, 2);
});
test('CSV explicitly carries complete source metadata', () => {
  const output = csv(document());
  assert.ok(output.includes('https://example.org/synthetic'));
  assert.ok(output.includes('CC0-1.0'));
  assert.ok(output.includes(TODAY));
});
test('HTML includes one main landmark and named sections', () => {
  const output = html(document());
  assert.ok(output.includes('<main>'));
  assert.ok(output.includes('aria-labelledby="summary"'));
  assert.ok(output.includes('<th scope="col">'));
});
test('HTML includes a language tag matching the selected locale', () => {
  assert.ok(html(document(), 'fr').includes('<html lang="fr">'));
  assert.ok(html(document(), 'en').includes('<html lang="en">'));
});
test('HTML includes table captions and an overflow wrapper', () => {
  const output = html(document());
  assert.ok(output.includes('<caption>'));
  assert.ok(output.includes('class="scroll"'));
});
test('HTML declares visible focus and minimum touch targets', () => {
  const output = html(document());
  assert.ok(output.includes('focus-visible'));
  assert.ok(output.includes('min-width:44px;min-height:44px'));
});
test('HTML displays UNKNOWN coverage without claiming a pass', () => {
  const output = html(document(), 'fr');
  assert.ok(output.includes('UNKNOWN'));
  assert.ok(output.includes(copy('fr').missing));
});
test('HTML escapes sourced labels when rendered as values', () => {
  const model = document({ sessions: [session('a<script>', { events: [event()] })] });
  const result = html(model);
  assert.ok(!result.includes('a<script>'));
  assert.ok(result.includes('<main>'));
});
test('invalid HTML report exposes only a safe generic failure', () => {
  const output = html({ version: 0 });
  assert.ok(output.includes('role="alert"'));
  assert.ok(!output.includes('undefined'));
});
test('JSON export has structurally explicit summary and coverage', () => {
  const model = json(document());
  assert.equal(model.version, 1);
  assert.ok(Array.isArray(model.rows));
  assert.ok(Array.isArray(model.coverage));
});
test('JSON export is deterministic for the same data', () => {
  assert.equal(jsonReport(document()), jsonReport(document()));
});
test('JSON export never adds unsupported medical fields', () => {
  const model = json(document());
  assert.ok(!Object.hasOwn(model, 'diagnosis'));
});
test('change report describes a changed outcome', () => {
  const after = document({ sessions: [session('session-one', { outcome: 'FAIL' })] });
  const result = changeReport(document(), after);
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('session-outcome'));
});
test('French change report uses localized headings', () => {
  const after = document({ assets: [asset('shell', { state: 'FAIL' })] });
  const result = changeReport(document(), after, 'fr');
  assert.ok(result.text.includes(copy('fr').changes));
});
test('identical change report explicitly says there are no recorded changes', () => {
  assert.ok(changeReport(document(), document()).text.includes(copy('en').unchanged));
});
test('invalid change input has no report output', () => {
  const result = changeReport(document(), {});
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('format routing produces all four declared formats', () => {
  for (const format of REPORT_FORMATS) {
    const result = renderReport(document(), format, 'fr', options);
    assert.equal(result.ok, true, format);
    assert.ok(result.bytes > 0);
  }
});
test('unknown output format is rejected instead of guessed', () => {
  const result = renderReport(document(), 'doc');
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('rendering invalid data refuses a seemingly complete report', () => {
  const result = renderReport({});
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('report rendering does not modify supplied records', () => {
  const input = document();
  const original = JSON.stringify(input);
  for (const format of REPORT_FORMATS) renderReport(input, format);
  assert.equal(JSON.stringify(input), original);
});
test('report with two sessions has two rows in the report model', () => {
  const data = document({ sessions: [session('a'), session('b', { events: [event('b')] })] });
  assert.equal(reportRows(data).rows.length, 2);
});
test('report exposes event digest without copying notes into JSON output', () => {
  const data = document({ sessions: [session('session-one', { events: [event('e', { note: pair('Private local test description', 'Description fictive') })] })] });
  const exported = jsonReport(data);
  assert.ok(!exported.includes('Private local test description'));
  assert.ok(JSON.parse(exported).rows[0].digest);
});
test('source changes remain visible in comparison text', () => {
  const after = document({ sessions: [session('session-one', { provenance: provenance({ source: 'https://example.net/change' }) })] });
  assert.ok(changeReport(document(), after).text.includes('session-source'));
});
