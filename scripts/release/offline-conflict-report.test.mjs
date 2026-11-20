import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORT_FORMATS, reportCopy, escapeHtml, normalText, csvCell, csvRow,
  modelForReport, textReport, csvReport, htmlReport, jsonReport,
  reportByFormat, deltaTextReport, statusSummary,
} from './offline-conflict-report.mjs';
import { DAY, record, register, sample, opposed, sharedSource } from './offline-conflict-fixtures.mjs';
const options = { today: DAY };
const text = (data, lang = 'en') => textReport(data, lang, options);
const csv = (data, lang = 'en') => csvReport(data, lang, options);
const html = (data, lang = 'en') => htmlReport(data, lang, options);
const json = data => jsonReport(data, options);

test('published report formats are stable and distinct', () => {
  assert.deepEqual(REPORT_FORMATS, ['text', 'csv', 'html', 'json']);
  assert.equal(new Set(REPORT_FORMATS).size, REPORT_FORMATS.length);
});
test('English and French have the same copy keys', () => {
  assert.deepEqual(Object.keys(reportCopy('en')), Object.keys(reportCopy('fr')));
});
test('unsupported locale defaults to English', () => {
  assert.deepEqual(reportCopy('zz'), reportCopy('en'));
});
test('missing locale defaults to English', () => {
  assert.deepEqual(reportCopy(null), reportCopy('en'));
});
test('both languages use literal UNKNOWN token', () => {
  assert.equal(reportCopy('en').outcome, 'UNKNOWN');
  assert.equal(reportCopy('fr').outcome, 'UNKNOWN');
});
test('all French display labels have curly apostrophes where needed', () => {
  assert.ok(Object.values(reportCopy('fr')).some(x => x.includes('’')));
  assert.ok(Object.values(reportCopy('fr')).every(x => !/\b(?:l|d|c|j|qu)'(?=\p{L})/iu.test(x)));
});
test('HTML escaping covers markup and attributes', () => {
  assert.equal(escapeHtml('<script x="a">&</script>'),
    '&lt;script x=&quot;a&quot;&gt;&amp;&lt;/script&gt;');
});
test('HTML escaping protects straight quotes', () => {
  assert.equal(escapeHtml("O'Neil"), 'O&#39;Neil');
});
test('HTML escaping accepts numbers and null safely', () => {
  assert.equal(escapeHtml(14), '14');
  assert.equal(escapeHtml(null), '');
});
test('line-ending control characters do not survive text normalization', () => {
  assert.equal(normalText('a\nb\tc\rd'), 'a b c d');
});
test('ordinary text is preserved without extra whitespace', () => {
  assert.equal(normalText('  Example  '), 'Example');
});
test('CSV quotes are doubled inside quoted cells', () => {
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
});
test('CSV formula prefixes are neutralized', () => {
  for (const input of ['=SUM(1,2)', '+1', '-9', '@A1']) assert.ok(csvCell(input).startsWith('"\''));
});
test('CSV formula-looking values after whitespace are neutralized', () => {
  assert.ok(csvCell(' =SUM(1,2)').startsWith('"\''));
});
test('CSV does not rewrite ordinary safe URLs', () => {
  assert.equal(csvCell('https://example.org/x'), '"https://example.org/x"');
});
test('CSV row uses field-safe commas', () => {
  assert.equal(csvRow(['a,b', 'c']), '"a,b","c"');
});
test('invalid input fails without a rendered model', () => {
  const output = modelForReport(register(record('a', { licence: null })));
  assert.equal(output.ok, false);
  assert.deepEqual(output.rows, []);
});
test('a single UNKNOWN claim is reported for review, not approval', () => {
  const output = modelForReport(sample());
  assert.equal(output.ok, true);
  assert.equal(output.rows[0].outcome, 'UNKNOWN');
});
test('opposing records yield both source-backed rows', () => {
  const output = modelForReport(opposed());
  assert.ok(output.rows.some(x => x.record === 'yes'));
  assert.ok(output.rows.some(x => x.record === 'no'));
});
test('source, licence and date are present in every report row', () => {
  const output = modelForReport(sharedSource());
  assert.ok(output.rows.every(x => x.source && x.licence && x.retrieved));
});
test('row ordering is stable regardless of input order', () => {
  const base = sharedSource();
  const reverse = register(...[...base.records].reverse());
  assert.deepEqual(modelForReport(base).rows, modelForReport(reverse).rows);
});
test('English text report has the warning and UNKNOWN', () => {
  const output = text(sample());
  assert.equal(output.ok, true);
  assert.ok(output.text.includes(reportCopy('en').warning));
  assert.ok(output.text.includes('UNKNOWN'));
});
test('French text report contains no translated replacement for UNKNOWN', () => {
  const output = text(sample(), 'fr');
  assert.ok(output.text.includes('UNKNOWN'));
  assert.ok(!output.text.includes('Inconnu'));
});
test('French text report places NBSP before labels ending in a colon', () => {
  const output = text(sample(), 'fr');
  assert.ok(output.text.includes('Fiche\u00a0:'));
  assert.ok(output.text.includes('Source\u00a0:'));
});
test('French text report retains source review tier', () => {
  const output = text(sample(), 'fr');
  assert.ok(output.text.includes(`${reportCopy('fr').tier}\u00a0:`));
});
test('English text report uses ordinary colon', () => {
  const output = text(sample());
  assert.ok(output.text.includes('Record:'));
});
test('empty review plan retains caution rather than a fake pass', () => {
  const output = text(register(record('a', { state: 'YES' })));
  assert.ok(output.text.includes(reportCopy('en').none));
});
test('CSV headers are localized to English', () => {
  const output = csv(sample());
  assert.ok(output.text.startsWith('"Record","Subject","Attribute"'));
});
test('CSV headers are localized to French', () => {
  const output = csv(sample(), 'fr');
  assert.ok(output.text.startsWith('"Fiche","Sujet","Attribut"'));
});
test('CSV report has one header and one row per record/reason pair', () => {
  const report = modelForReport(sample());
  const output = csv(sample());
  assert.equal(output.text.trim().split('\r\n').length, report.rows.length + 1);
});
test('CSV output uses CRLF rows', () => {
  assert.ok(csv(sample()).text.includes('\r\n'));
});
test('CSV fields use UNKNOWN as outcome', () => {
  assert.ok(csv(sample(), 'fr').text.includes('"UNKNOWN"'));
});
test('HTML output declares English language', () => {
  assert.ok(html(sample()).text.includes('<html lang="en">'));
});
test('HTML output declares French language', () => {
  assert.ok(html(sample(), 'fr').text.includes('<html lang="fr">'));
});
test('HTML report has a single main landmark', () => {
  const content = html(sample()).text;
  assert.equal((content.match(/<main>/gu) ?? []).length, 1);
});
test('HTML table has scoped column headers', () => {
  const content = html(sample()).text;
  assert.ok(content.includes('<th scope="col">'));
});
test('HTML table supplies a caption', () => {
  assert.ok(html(sample()).text.includes('<caption>'));
});
test('HTML report includes a responsive viewport', () => {
  assert.ok(html(sample()).text.includes('name="viewport"'));
});
test('HTML report supports visible focus', () => {
  assert.ok(html(sample()).text.includes(':focus-visible'));
});
test('HTML report does not make network requests', () => {
  const content = html(sample()).text;
  assert.ok(!content.includes('<script src='));
  assert.ok(!content.includes('<link rel="stylesheet" href='));
});
test('HTML output escapes ampersands in submitted URLs', () => {
  const data = register(record('a', { source: 'https://example.org?a=1&b=2' }));
  assert.ok(html(data).text.includes('&amp;'));
});
test('HTML headings use the selected language', () => {
  assert.ok(html(sample(), 'fr').text.includes(reportCopy('fr').title));
});
test('HTML result does not include private notes', () => {
  const content = html(sample()).text;
  assert.ok(!content.includes('Local synthetic record'));
});
test('JSON report parses as an object with a fixed version', () => {
  const output = JSON.parse(json(sample()).text);
  assert.equal(output.version, 1);
});
test('JSON report has no copied original notes', () => {
  assert.ok(!json(sample()).text.includes('Local synthetic record'));
});
test('JSON report includes summary and rows', () => {
  const data = JSON.parse(json(sample()).text);
  assert.ok(data.summary);
  assert.ok(Array.isArray(data.rows));
});
test('all report formats reject a bad source record', () => {
  const data = register(record('a', { source: null }));
  for (const format of REPORT_FORMATS) assert.equal(reportByFormat(data, format).ok, false, format);
});
test('an unsupported report format fails explicitly', () => {
  const output = reportByFormat(sample(), 'pdf');
  assert.equal(output.ok, false);
  assert.equal(output.problems[0].code, 'FORMAT');
});
test('report output remains deterministic', () => {
  const a = json(sharedSource());
  const b = json(sharedSource());
  assert.equal(a.text, b.text);
});
test('delta report includes the count of recorded changes', () => {
  const output = deltaTextReport(sample(), register(record('r1', { state: 'YES' })));
  assert.ok(output.text.includes('Recorded changes: 1'));
});
test('French delta report localizes change header', () => {
  const output = deltaTextReport(sample(), register(record('r1', { state: 'YES' })), 'fr');
  assert.ok(output.text.includes('Changements consignés\u00a0: 1'));
});
test('delta report changes never become final accessibility determinations', () => {
  const output = deltaTextReport(sample(), register(record('r1', { state: 'YES' })));
  assert.ok(output.text.includes('UNKNOWN'));
});
test('invalid delta input fails without content', () => {
  const output = deltaTextReport(sample(), register(record('r1', { source: null })));
  assert.equal(output.text, null);
});
test('summary function reports record and conflict counts', () => {
  const output = statusSummary(sharedSource());
  assert.equal(output.ok, true);
  assert.equal(output.totalRecords, 2);
  assert.ok(output.conflicts >= 1);
});
test('invalid status summary never returns a count', () => {
  const output = statusSummary(register(record('r1', { licence: null })));
  assert.equal(output.ok, false);
  assert.equal(output.totalRecords, undefined);
});
