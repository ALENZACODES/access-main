import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reportCopy, escapeHtml, csvCell, csvRow, reportModel,
  textReport, csvReport, htmlReport, jsonReport, reportByFormat,
} from './offline-drill-report.mjs';
import { capture, claim, document, source, pair } from './offline-drill-fixtures.mjs';

const optional = { today: '2026-11-19' };
const text = (value, language = 'en') => textReport(value, language, optional);
const html = (value, language = 'en') => htmlReport(value, language, optional);
const csv = (value, language = 'en') => csvReport(value, language, optional);
const json = (value) => JSON.parse(jsonReport(value, optional));

test('EN and FR copy have all the same keys', () => {
  assert.deepEqual(Object.keys(reportCopy('en')).sort(), Object.keys(reportCopy('fr')).sort());
});
test('unspecified locale selects English safely', () => {
  assert.deepEqual(reportCopy('zz'), reportCopy('en'));
  assert.deepEqual(reportCopy(null), reportCopy('en'));
});
test('French copy uses curly apostrophes', () => {
  const values = Object.values(reportCopy('fr'));
  assert.ok(values.some((value) => value.includes('’')));
  assert.ok(values.every((value) => !/\b(?:l|d|c|qu)'(?=\p{L})/iu.test(value)));
});
test('literal values escaped before inclusion in HTML', () => {
  assert.equal(escapeHtml('<a href="x">hello & world</a>'),
    '&lt;a href=&quot;x&quot;&gt;hello &amp; world&lt;/a&gt;');
  assert.equal(escapeHtml("'quoted'"), '&#39;quoted&#39;');
  assert.equal(escapeHtml(7), '7');
});
test('CSV escapes embedded quotes', () => {
  assert.equal(csvCell('say "hello"'), '"say ""hello"""');
});
test('CSV escapes spreadsheet formula leading signs', () => {
  for (const raw of ['=SUM(1,2)', '+1+2', '-1+2', '@SUM(A1)']) {
    assert.equal(csvCell(raw).startsWith('"\''), true, raw);
  }
});
test('CSV does not change ordinary values or source URLs', () => {
  assert.equal(csvCell('https://example.org/synthetic'), '"https://example.org/synthetic"');
  assert.equal(csvCell('UNKNOWN'), '"UNKNOWN"');
  assert.equal(csvCell(null), '""');
});
test('CSV line break escaping keeps a record in one row', () => {
  assert.equal(csvCell('line\none'), '"line one"');
  assert.equal(csvCell('line\rone'), '"line one"');
  assert.equal(csvRow(['a', 'b']), '"a","b"');
});
test('report model has exact count with fictional baseline', () => {
  const result = reportModel(document(), optional);
  assert.equal(result.ok, true);
  assert.equal(result.model.summary.total, 1);
  assert.equal(result.model.summary.blocks, 0);
  assert.equal(result.model.findings[0].code, 'CLAIM_UNKNOWN');
});
test('report model preserves source, licence, date, and tier', () => {
  const result = reportModel(document(), optional);
  const p = result.model.provenance[0];
  assert.equal(p.source, 'https://example.org/synthetic');
  assert.equal(p.licence, 'CC0-1.0');
  assert.equal(p.retrievedOn, '2026-11-19');
  assert.equal(p.tier, 0);
});
test('invalid data report model must not show a normal summary', () => {
  const bad = document();
  bad.captures[0].controls[0].keyboard = true;
  const result = reportModel(bad, optional);
  assert.equal(result.ok, false);
  assert.equal(result.model.summary, null);
  assert.deepEqual(result.model.rows, []);
});
test('text report includes warning even without findings', () => {
  const value = { version: 1, sources: [], captures: [] };
  const output = text(value);
  assert.ok(output.includes(reportCopy('en').warning));
  assert.ok(output.includes(reportCopy('en').noData));
  assert.ok(output.endsWith('\n'));
});
test('French text report includes UNKNOWN rather than translated claim state', () => {
  const output = text(document(), 'fr');
  assert.ok(output.includes('UNKNOWN'));
  assert.ok(!output.includes('Unknown claims'));
});
test('French text report has NBSP before each authored label colon', () => {
  const output = text(document(), 'fr');
  for (const label of ['Total', 'Blocages', 'Éléments à examiner',
    'Résumé de l’exercice', 'Source', 'Licence', 'Consulté', 'Niveau de contrôle']) {
    assert.ok(output.includes(`${label}\u00A0:`), label);
  }
});
test('text report includes a complete source audit trail', () => {
  const output = text(document());
  for (const value of ['CC0-1.0', 'https://example.org/synthetic', '2026-11-19', 'Source review tier']) {
    assert.ok(output.includes(value), value);
  }
});
test('text report contains explicit gate states', () => {
  const output = text(document());
  assert.ok(output.includes('KEYBOARD_REACHABLE | PASS'));
  assert.ok(output.includes('TARGET_SIZE | PASS'));
  assert.ok(output.includes('UNKNOWN_PRESERVED | PASS'));
});
test('text report includes a blocking issue without a positive status', () => {
  const output = text(document(capture('x', { shell: 'FAIL' })));
  assert.ok(output.includes('OFFLINE_SHELL_FAIL'));
  assert.ok(output.includes('Drill summary: FAIL'));
});
test('text report rejects invalid input without exposing raw personal values', () => {
  const input = document();
  input.accessToken = 'please-do-not-print';
  const output = text(input);
  assert.ok(output.includes('PRIVATE_FIELD'));
  assert.equal(output.includes('please-do-not-print'), false);
});
test('CSV contains BOM, CRLF rows and explicit headers', () => {
  const output = csv(document());
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(output.endsWith('\r\n'));
  assert.ok(output.includes('"Capture","Route","Language"'));
});
test('CSV export uses French headings when requested', () => {
  const output = csv(document(), 'fr');
  assert.ok(output.includes('"Parcours"'));
  assert.ok(output.includes('"Niveau de contrôle"'));
});
test('CSV preserves complete source details for UNKNOWN claim', () => {
  const output = csv(document());
  assert.ok(output.includes('"UNKNOWN"'));
  assert.ok(output.includes('"CC0-1.0"'));
  assert.ok(output.includes('"2026-11-19"'));
});
test('CSV has a safe fallback for invalid input', () => {
  const input = document();
  input.sources[0].provenance.licence = 'private';
  const output = csv(input);
  assert.ok(output.includes('"INPUT"'));
  assert.ok(output.includes('"SOURCE_LICENCE"'));
});
test('CSV formula-leading source is never exported without escaping', () => {
  const output = csvRow(['=HYPERLINK("https://bad", "x")', '+1']);
  assert.ok(output.includes("\"'=HYPERLINK"));
  assert.ok(output.includes("\"'+1\""));
});
test('HTML has proper language, title, main and responsive viewport', () => {
  for (const locale of ['en', 'fr']) {
    const output = html(document(), locale);
    assert.ok(output.includes(`<html lang="${locale}">`));
    assert.ok(output.includes('<title>'));
    assert.ok(output.includes('<main>'));
    assert.ok(output.includes('name="viewport"'));
  }
});
test('HTML tables include explicit column header scopes and captions', () => {
  const output = html(document());
  assert.ok(output.includes('<th scope="col">'));
  assert.ok(output.includes('<caption>'));
  assert.ok(output.includes('aria-labelledby="drill-checks"'));
});
test('HTML contains visible focus styles and overflow controls', () => {
  const output = html(document());
  assert.ok(output.includes('focus-visible'));
  assert.ok(output.includes('overflow-x:auto'));
  assert.ok(output.includes('prefers-reduced-motion'));
});
test('HTML escaping prevents markup from leaked source values', () => {
  const input = document();
  input.sources[0].title = pair('<img src=x>', 'Exemple');
  const output = html(input);
  assert.ok(!output.includes('<img src=x>'));
});
test('HTML metadata cannot contain unsafe markup from a supplied path', () => {
  const input = document();
  input.captures[0].route = '/%3Cscript%3E';
  const output = html(input);
  assert.ok(!output.includes('<script>'));
});
test('HTML invalid input renders issue codes and not private values', () => {
  const input = document();
  input.sources[0].personName = 'private-name';
  const output = html(input);
  assert.ok(output.includes('PRIVATE_FIELD'));
  assert.ok(!output.includes('private-name'));
});
test('HTML report explicitly disclaims physical-world inference', () => {
  const output = html(document());
  assert.ok(output.includes('does not establish accessibility'));
});
test('HTML French warnings use natural curly apostrophes', () => {
  const output = html(document(), 'fr');
  assert.ok(output.includes('l’accessibilité'));
  assert.ok(output.includes('d’interpréter'));
});
test('HTML empty document remains readable and informative', () => {
  const output = html({ version: 1, sources: [], captures: [] });
  assert.ok(output.includes('<main>'));
  assert.ok(output.includes('0 |'));
});
test('JSON export includes normalized result without hidden input payloads', () => {
  const output = json(document());
  assert.equal(output.version, 1);
  assert.equal(output.ok, true);
  assert.deepEqual(output.inputFingerprint, ['capture-a']);
  assert.ok(!JSON.stringify(output).includes('token'));
});
test('JSON export records UNKNOWN as a distinct status', () => {
  const input = document(capture('x', { shell: 'UNKNOWN' }));
  const output = json(input);
  assert.equal(output.model.summary.status, 'UNKNOWN');
  assert.equal(output.model.summary.fail, 0);
});
test('JSON fails closed and does not include original private values', () => {
  const input = document();
  input.sessionCookie = 'opaque-secret';
  const output = json(input);
  assert.equal(output.ok, false);
  assert.equal(JSON.stringify(output).includes('opaque-secret'), false);
});
test('JSON export stable across capture ordering', () => {
  const a = json(document(capture('a'), capture('z')));
  const b = json(document(capture('z'), capture('a')));
  assert.deepEqual(a.model, b.model);
});
test('generic format dispatch returns each requested output', () => {
  const input = document();
  for (const format of ['text', 'csv', 'html', 'json']) {
    assert.equal(typeof reportByFormat(input, format, 'en', optional), 'string');
  }
});
test('unknown report format returns null rather than unexpected HTML', () => {
  assert.equal(reportByFormat(document(), 'pdf'), null);
  assert.equal(reportByFormat(document(), ''), null);
});
test('reports do not include remote scripts, analytics or dynamic requests', () => {
  const output = html(document());
  assert.ok(!/<script\b/iu.test(output));
  assert.ok(!/\bfetch\s*\(/iu.test(output));
  assert.ok(!/\biframe\b/iu.test(output));
});
test('reports preserve source review status separately from capture state', () => {
  const input = { version: 1, sources: [source()], captures: [capture('a', {
    network: 'UNKNOWN', claims: [claim('x', { state: 'UNKNOWN' })],
  })] };
  const result = reportModel(input);
  assert.equal(result.model.summary.status, 'UNKNOWN');
  assert.equal(result.model.provenance[0].tier, 0);
});
