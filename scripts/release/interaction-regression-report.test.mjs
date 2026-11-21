import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reportWords, locale, colon, escapeHtml, textCell, csvCell,
  csvLine, dimension, comparisonRows, coverageRows, REPORT_COLUMNS,
  invalidReport, reportModel, textReport, csvReport, htmlReport,
  jsonReport, reportByFormat, reportCoverageTasks,
  reportHasEnglishAndFrenchHeaders,
} from './interaction-regression-report.mjs';
import { compareRegressionSnapshots } from './interaction-regression-compare.mjs';
import { analyzeCoverage } from './interaction-regression-coverage.mjs';
import { sampleSnapshot, changedSnapshot, sampleCoveragePolicy,
  copy } from './interaction-regression-fixtures.mjs';

const comparison = () => compareRegressionSnapshots(sampleSnapshot(), changedSnapshot('FAIL'));
const coverage = () => analyzeCoverage(changedSnapshot('FAIL'), sampleCoveragePolicy());

test('English and French report catalogues have exactly the same keys', () => {
  assert.deepEqual(Object.keys(reportWords('en')).sort(), Object.keys(reportWords('fr')).sort());
  assert.ok(reportHasEnglishAndFrenchHeaders());
});
test('unsupported language falls back to English without inventing translation', () => {
  assert.equal(locale('fr'), 'fr');
  assert.equal(locale('fr-CA'), 'en');
  assert.deepEqual(reportWords('es'), reportWords('en'));
});
test('report headers use review wording rather than asserting accessibility', () => {
  const en = reportWords('en');
  assert.equal(en.unknown, 'UNKNOWN');
  assert.equal(en.tier, 'Source review tier');
  assert.ok(en.caution.includes('do not establish'));
  assert.equal(reportWords('fr').unknown, 'UNKNOWN');
});
test('French spacing inserts the exact nonbreaking character before colon', () => {
  assert.equal(colon('fr'), '\u00a0:');
  assert.equal(colon('en'), ':');
  assert.ok(reportWords('fr').title.includes('’'));
});
test('HTML escaping neutralizes user-supplied markup', () => {
  assert.equal(escapeHtml('<img src="x" onerror="1">'),
    '&lt;img src=&quot;x&quot; onerror=&quot;1&quot;&gt;');
  assert.equal(escapeHtml('A&B'), 'A&amp;B');
  assert.equal(escapeHtml("'foo'"), '&#39;foo&#39;');
});
test('plain cells do not contain line controls', () => {
  assert.equal(textCell('some\tdata\nvalue'), 'some data value');
  assert.equal(textCell(null), 'UNKNOWN');
  assert.equal(textCell('a   b'), 'a b');
});
test('CSV guards spreadsheet formulas while preserving ordinary identifiers', () => {
  for (const value of ['=SUM(1,2)', '+A1', '-10', '@code']) {
    assert.ok(csvCell(value).startsWith('"\''));
  }
  assert.equal(csvCell('UNKNOWN'), '"UNKNOWN"');
  assert.equal(csvCell('https://example.org'), '"https://example.org"');
  assert.equal(csvCell('say "hello"'), '"say ""hello"""');
});
test('CSV headings are localized, not underlying protocol identifiers', () => {
  const en = csvReport(comparison(), null, 'en').split('\n')[0];
  const fr = csvReport(comparison(), null, 'fr').split('\n')[0];
  assert.ok(en.includes('"Check category"'));
  assert.ok(fr.includes('"Catégorie de contrôle"'));
  assert.ok(fr.includes('"Niveau de contrôle de la source"'));
  assert.notEqual(en, fr);
  assert.equal(csvLine(['a', 'b']), '"a","b"');
});
test('viewport rendering keeps the recorded dimensions', () => {
  assert.equal(dimension({ width: 390, height: 844 }), '390×844');
  assert.equal(dimension({ width: 768, height: 1024 }), '768×1024');
});
test('normal comparison rows preserve source attribution and outcomes', () => {
  const rows = comparisonRows(comparison());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].after, 'FAIL');
  assert.equal(rows[0].before, 'UNKNOWN');
  assert.equal(rows[0].source, 'https://example.org/synthetic-evidence');
  assert.equal(rows[0].licence, 'CC0-1.0');
});
test('coverage report rows never invent a provenance source', () => {
  const rows = coverageRows(coverage());
  assert.equal(rows.length, 6);
  assert.ok(rows.some((row) => row.check === 'UNKNOWN'));
  assert.ok(rows.every((row) => row.source === 'UNKNOWN'));
});
test('report columns have a one-to-one EN/FR header mapping', () => {
  const columns = new Set(REPORT_COLUMNS);
  assert.equal(columns.size, REPORT_COLUMNS.length);
  assert.ok(REPORT_COLUMNS.includes('source'));
  assert.ok(REPORT_COLUMNS.includes('tier'));
  assert.ok(REPORT_COLUMNS.includes('retrieved'));
});
test('invalid input has a harmless report, not an apparent empty success', () => {
  const failed = { ok: false, issues: [{ code: 'BAD_SOURCE', path: '/runs/0' }] };
  const message = invalidReport(failed, 'en');
  assert.ok(message.includes('BAD_SOURCE'));
  assert.ok(message.includes('Invalid input'));
  assert.equal(reportModel(failed).ok, false);
});
test('report model combines change counts with missing coverage', () => {
  const result = reportModel(comparison(), coverage(), 'fr');
  assert.equal(result.ok, true);
  assert.equal(result.summary.language, 'fr');
  assert.equal(result.summary.changes, 1);
  assert.equal(result.summary.coverageMissing, 5);
  assert.equal(result.summary.releaseStatus, 'UNKNOWN');
});
test('text reports retain the UNKNOWN token in both languages', () => {
  for (const language of ['en', 'fr']) {
    const text = textReport(comparison(), coverage(), language);
    assert.ok(text.includes('UNKNOWN'));
    assert.ok(text.includes('CC0-1.0'));
    assert.ok(text.includes('https://example.org/synthetic-evidence'));
  }
});
test('French text headings contain U+00A0 before colons', () => {
  const text = textReport(comparison(), null, 'fr');
  assert.ok(text.includes('Écarts consignés\u00a0:'));
  assert.ok(text.includes('Changements bloquants\u00a0:'));
});
test('HTML output has a meaningful heading, table and named landmarks', () => {
  for (const language of ['en', 'fr']) {
    const html = htmlReport(comparison(), coverage(), language);
    assert.ok(html.includes(`<html lang="${language}">`));
    assert.ok(html.includes('<main>'));
    assert.ok(html.includes('<h1>'));
    assert.ok(html.includes('scope="col"'));
    assert.ok(html.includes('<caption>'));
    assert.ok(html.includes('role="note"'));
    assert.ok(html.includes(':focus-visible'));
    assert.ok(html.includes('overflow-x:auto'));
  }
});
test('HTML escapes unsafe text from snapshot labels', () => {
  const left = sampleSnapshot();
  const right = changedSnapshot('FAIL');
  right.runs[0].checks[0].source = 'https://example.org/ok?x=1&y=2';
  const result = compareRegressionSnapshots(left, right);
  assert.equal(result.ok, true);
  const html = htmlReport(result);
  assert.ok(html.includes('&amp;'));
  assert.ok(!html.includes('x=1&y=2'));
});
test('JSON output is complete and deterministic', () => {
  const json = jsonReport(comparison(), coverage(), 'en');
  assert.equal(JSON.parse(json).ok, true);
  assert.equal(JSON.parse(json).summary.changes, 1);
  assert.equal(json, jsonReport(comparison(), coverage(), 'en'));
});
test('format dispatcher rejects unknown formats', () => {
  const result = reportByFormat(comparison(), null, { format: 'pdf' });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'FORMAT_INVALID');
});
test('format dispatcher rejects invalid comparisons', () => {
  const result = reportByFormat({ ok: false, issues: [{ code: 'BAD', path: '/' }] });
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('all advertised formats produce explicit local report bytes', () => {
  for (const format of ['text', 'csv', 'html', 'json']) {
    const result = reportByFormat(comparison(), coverage(), { format, language: 'fr' });
    assert.equal(result.ok, true, format);
    assert.ok(result.text.length > 10);
  }
});
test('missing review coverage appears in task output without false claims', () => {
  const tasks = reportCoverageTasks(coverage());
  assert.equal(tasks.length, 6);
  assert.ok(tasks.some((item) => item.action === 'Capture missing evidence'));
  assert.ok(tasks.every((item) => item.status === 'UNKNOWN' || item.status === 'FAIL'));
});
test('empty comparisons display the empty-state label', () => {
  const left = sampleSnapshot('a');
  const right = copy(left); right.releaseId = 'b';
  const output = textReport(compareRegressionSnapshots(left, right));
  // An unchanged recorded check is still visible, not a proof of readiness.
  assert.ok(output.includes('UNKNOWN'));
});
