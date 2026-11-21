import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import {
  REPORT_FORMATS, REPORT_LIMIT, reportCopy, escapeHtml, safeCell, csvRow,
  modelFor, textReport, csvReport, htmlReport, jsonReport, exportReport,
} from './assistive-trace-report.mjs';
import { TODAY, source, journey, trace, clone } from './assistive-trace-fixtures.mjs';

const options = { today: TODAY };
const exportFile = (value, format, language = 'en') => exportReport(value, format, language, options);
const unknown = () => { const value = trace(); value.journeys[0].steps[0].events[1].state = 'UNKNOWN'; return value; };

test('supported formats are exactly text HTML CSV and JSON', () => {
  assert.deepEqual(REPORT_FORMATS, ['text', 'html', 'csv', 'json']);
  assert.ok(REPORT_LIMIT < 50_000_000);
});
test('both catalogues contain identical named labels', () => {
  assert.deepEqual(Object.keys(reportCopy('en')).sort(), Object.keys(reportCopy('fr')).sort());
});
test('unknown language selection falls back to English', () => {
  assert.deepEqual(reportCopy('de'), reportCopy('en'));
  assert.deepEqual(reportCopy(undefined), reportCopy('en'));
});
test('both catalogues use literal UNKNOWN token', () => {
  assert.equal(reportCopy('en').unknown, 'UNKNOWN');
  assert.equal(reportCopy('fr').unknown, 'UNKNOWN');
});
test('French titles preserve curly apostrophes', () => {
  const texts = Object.values(reportCopy('fr'));
  assert.ok(texts.some((text) => text.includes('’')));
  assert.equal(texts.some((text) => /\b(?:l|d|qu)'(?=\p{L})/iu.test(text)), false);
});
test('report headings avoid unsupported positive assurance', () => {
  assert.equal(Object.values(reportCopy('en')).some((value) => /guarantee|partnership|real.time/i.test(value)), false);
});
test('escaping HTML covers angle brackets, quotes and ampersands', () => {
  assert.equal(escapeHtml('<div a="b">&\'x\'</div>'), '&lt;div a=&quot;b&quot;&gt;&amp;&#39;x&#39;&lt;/div&gt;');
});
test('HTML escaping converts numbers and missing values safely', () => {
  assert.equal(escapeHtml(5), '5');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
test('CSV cells double embedded quotes', () => {
  assert.equal(safeCell('say "hello"'), '"say ""hello"""');
});
test('CSV cells neutralize formula-leading equals sign', () => {
  assert.equal(safeCell('=SUM(1,2)'), '"\'=SUM(1,2)"');
});
test('CSV cells neutralize leading plus, minus and at symbols', () => {
  for (const value of ['+1+1', '-1+1', '@SUM(A1)', ' =1']) assert.ok(safeCell(value).startsWith('"\''), value);
});
test('CSV cells flatten line breaks to keep stable rows', () => {
  assert.equal(safeCell('a\nb\rc\td'), '"a b c d"');
});
test('CSV rows have predictable order', () => {
  assert.equal(csvRow(['en', 'offline', 'UNKNOWN']), '"en","offline","UNKNOWN"');
});
test('report model includes stable release fingerprint', () => {
  const result = modelFor(trace(), options);
  assert.equal(result.ok, true);
  assert.match(result.model.fingerprint, /^[a-f0-9]{64}$/);
});
test('report model has 30 coverage cells', () => {
  const result = modelFor(trace(), options);
  assert.equal(result.model.cells.length, 30);
});
test('report model has 29 missing review tasks', () => {
  const result = modelFor(trace(), options);
  assert.equal(result.model.tasks.length, 29);
});
test('report model carries source licence and retrieval date', () => {
  const result = modelFor(trace(), options);
  assert.equal(result.model.sources[0].licence, 'CC0-1.0');
  assert.equal(result.model.sources[0].retrievedOn, '2026-11-19');
  assert.equal(result.model.sources[0].tier, 0);
});
test('source entries are sorted by source id', () => {
  const input = trace(); input.sources.push(source('z', { url: 'https://example.org/second' }));
  input.sources.reverse();
  const model = modelFor(input, options).model;
  assert.deepEqual(model.sources.map((entry) => entry.id), ['source-a', 'z']);
});
test('invalid source never results in an export model', () => {
  const data = trace(); data.sources[0].url = 'javascript:alert(1)';
  const result = modelFor(data, options);
  assert.equal(result.ok, false);
  assert.equal(result.model, null);
});
test('text report explains why captured results are limited', () => {
  const content = textReport(trace(), 'en', options);
  assert.ok(content.includes(reportCopy('en').caution));
});
test('French text report contains full nonbreaking space before colons', () => {
  const content = textReport(trace(), 'fr', options);
  assert.ok(content.includes('Source\u00A0:'));
  assert.ok(content.includes('Résultat consigné\u00A0:'));
});
test('English text report uses conventional colon', () => {
  const content = textReport(trace(), 'en', options);
  assert.ok(content.includes('Source:'));
  assert.ok(content.includes('Recorded outcome:'));
});
test('French text report preserves UNKNOWN state', () => {
  const content = textReport(unknown(), 'fr', options);
  assert.ok(content.includes('UNKNOWN'));
});
test('text report includes all source attributes', () => {
  const content = textReport(trace(), 'en', options);
  assert.ok(content.includes('https://example.org/synthetic'));
  assert.ok(content.includes('CC0-1.0'));
  assert.ok(content.includes('2026-11-19'));
  assert.ok(content.includes('Source review tier: 0'));
});
test('invalid text report shows issue codes without private values', () => {
  const input = trace(); input.token = 'sensitive-value';
  const content = textReport(input, 'en', options);
  assert.ok(content.includes('PRIVATE_KEY'));
  assert.equal(content.includes('sensitive-value'), false);
});
test('text report shows missing evidence worklist', () => {
  const content = textReport(trace(), 'en', options);
  assert.ok(content.includes('Human review worklist: 29'));
});
test('text output ends with newline for text-file usability', () => {
  assert.ok(textReport(trace(), 'en', options).endsWith('\n'));
});
test('CSV output begins with UTF-8 BOM for spreadsheet import', () => {
  assert.ok(csvReport(trace(), 'en', options).startsWith('\uFEFF'));
});
test('CSV headers are localized in French', () => {
  const content = csvReport(trace(), 'fr', options);
  assert.ok(content.includes('"Langue","État de connexion","Canal d’interaction"'));
});
test('CSV headers are localized in English', () => {
  const content = csvReport(trace(), 'en', options);
  assert.ok(content.includes('"Language","Connection state","Interaction channel"'));
});
test('CSV output has heading plus thirty rows', () => {
  const content = csvReport(trace(), 'en', options);
  assert.equal(content.trimEnd().split('\r\n').length, 31);
});
test('CSV output explicitly contains UNKNOWN cells', () => {
  assert.ok(csvReport(trace(), 'fr', options).includes('"UNKNOWN"'));
});
test('CSV output never introduces a new positive status', () => {
  const content = csvReport(trace(), 'en', options);
  assert.equal(content.includes('"YES"'), false);
});
test('invalid CSV returns null rather than partial rows', () => {
  const data = trace(); delete data.sources[0].licence;
  assert.equal(csvReport(data, 'en', options), null);
});
test('HTML report declares language and viewport', () => {
  const content = htmlReport(trace(), 'fr', options);
  assert.ok(content.includes('<html lang="fr">'));
  assert.ok(content.includes('name="viewport"'));
});
test('HTML report contains one main landmark', () => {
  const content = htmlReport(trace(), 'en', options);
  assert.equal((content.match(/<main>/g) ?? []).length, 1);
});
test('HTML report contains accessible header cell scope', () => {
  const content = htmlReport(trace(), 'en', options);
  assert.ok(content.includes('scope="col"'));
  assert.ok(content.includes('scope="row"'));
});
test('HTML report displays cautious explanatory text', () => {
  const content = htmlReport(trace(), 'fr', options);
  assert.ok(content.includes(reportCopy('fr').caution));
});
test('HTML report includes keyboard-visible focus style', () => {
  const content = htmlReport(trace(), 'en', options);
  assert.ok(content.includes(':focus-visible'));
});
test('HTML report maintains minimum 44px interactive dimensions', () => {
  const content = htmlReport(trace(), 'en', options);
  assert.ok(content.includes('min-height:44px'));
  assert.ok(content.includes('min-width:44px'));
});
test('HTML source links have noreferrer and noopener', () => {
  const content = htmlReport(trace(), 'en', options);
  assert.ok(content.includes('rel="noopener noreferrer"'));
});
test('HTML report has localized caption and column text', () => {
  const content = htmlReport(trace(), 'fr', options);
  assert.ok(content.includes(reportCopy('fr').worklist));
  assert.ok(content.includes(reportCopy('fr').count));
});
test('HTML report never includes script tags or inline event handlers', () => {
  const content = htmlReport(trace(), 'en', options);
  assert.equal(/<script\b/i.test(content), false);
  assert.equal(/\sonclick=/i.test(content), false);
});
test('invalid HTML returns null instead of a misleading page', () => {
  const data = trace(); data.recordedOn = 'tomorrow';
  assert.equal(htmlReport(data, 'en', options), null);
});
test('JSON report includes coverage and source metadata', () => {
  const parsed = JSON.parse(jsonReport(trace(), options));
  assert.equal(parsed.cells.length, 30);
  assert.equal(parsed.sources[0].licence, 'CC0-1.0');
});
test('JSON report serializes UNKNOWN without changing case', () => {
  assert.ok(jsonReport(unknown(), options).includes('"UNKNOWN"'));
});
test('JSON report never embeds unrelated user fields', () => {
  const original = trace(); original.token = 'sensitive-value';
  assert.equal(jsonReport(original, options), null);
});
test('JSON report order is stable across source and journey order', () => {
  const a = trace(journey('z'), journey('a'));
  a.sources.push(source('z', { url: 'https://example.org/second' }));
  const b = clone(a); b.journeys.reverse(); b.sources.reverse();
  assert.equal(jsonReport(a, options), jsonReport(b, options));
});
test('export wrapper accepts exactly the documented formats', () => {
  for (const format of REPORT_FORMATS) assert.equal(exportFile(trace(), format).ok, true, format);
});
test('export wrapper refuses unsupported format', () => {
  const result = exportFile(trace(), 'pdf');
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].code, 'FORMAT_INVALID');
});
test('export wrapper refuses incomplete source evidence', () => {
  const data = trace(); delete data.sources[0].url;
  assert.equal(exportFile(data, 'text').ok, false);
});
test('export wrapper counts UTF-8 bytes independently of character count', () => {
  const content = exportFile(trace(), 'text', 'fr').content;
  assert.ok(Buffer.byteLength(content, 'utf8') > content.length);
});
test('export outputs remain deterministic across repeated calls', () => {
  for (const format of REPORT_FORMATS) {
    assert.equal(exportFile(trace(), format).content, exportFile(trace(), format).content);
  }
});
