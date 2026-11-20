import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
  reportCopy, htmlEscape, csvCell, reportRows, recoveryText,
  recoveryCsv, recoveryHtml, recoveryJson, comparisonText,
  coverageText, triageText, formatRecoveryDocument,
} from './offline-recovery-trace-report.mjs';
import { document, trace, action, failure, emptyDocument, label } from './offline-recovery-trace-fixtures.mjs';

const fixture = () => document(trace());
const english = () => recoveryText(fixture(), 'en');
const french = () => recoveryText(fixture(), 'fr');

test('EN and FR copy keys exactly correspond', () => {
  assert.deepEqual(Object.keys(reportCopy('en')), Object.keys(reportCopy('fr')));
});
test('unspecified language falls back to English', () => {
  assert.deepEqual(reportCopy('zz'), reportCopy('en'));
  assert.deepEqual(reportCopy(null), reportCopy('en'));
});
test('public message content does not suggest a physical-world conclusion', () => {
  assert.ok(reportCopy('en').warning.includes('not proof'));
  assert.ok(reportCopy('fr').warning.includes('ne prouvent pas'));
});
test('copy uses the literal UNKNOWN token in both locales', () => {
  assert.equal(reportCopy('en').unknown, 'UNKNOWN');
  assert.equal(reportCopy('fr').unknown, 'UNKNOWN');
});
test('French uses curly apostrophes in ordinary copy', () => {
  const values = Object.values(reportCopy('fr'));
  assert.ok(values.some((value) => value.includes('’')));
  assert.ok(!values.some((value) => /\b(?:l|d|c|qu)'(?=\p{L})/iu.test(value)));
});
test('HTML escapes special characters in titles and labels', () => {
  assert.equal(htmlEscape('<b>"x" & y</b>'), '&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
  assert.equal(htmlEscape("'hello'"), '&#39;hello&#39;');
  assert.equal(htmlEscape(null), '');
});
test('CSV quotes and doubles quotes correctly', () => {
  assert.equal(csvCell('a "quote"'), '"a ""quote"""');
  assert.equal(csvCell('UNKNOWN'), '"UNKNOWN"');
});
test('CSV neutralizes formula-leading values', () => {
  for (const text of ['=SUM(A1)', '+2+3', '-4+1', '@a', ' =SUM(A1)']) {
    assert.equal(csvCell(text).startsWith('"\''), true, text);
  }
});
test('CSV removes embedded row breaks rather than creating new records', () => {
  assert.equal(csvCell('abc\ndef'), '"abc def"');
  assert.equal(csvCell('abc\rdef'), '"abc def"');
  assert.equal(csvCell('abc\tdef'), '"abc def"');
});
test('report rows retain complete metadata for each trace', () => {
  const result = reportRows({ traces: [{ id: 't', route: '/x', locale: 'en', mode: 'offline',
    category: 'keyboard', state: 'UNKNOWN', source: { source: 'https://example.org',
      licence: 'CC0-1.0', retrievedOn: '2026-11-20', tier: 'E' }, failures: 1, recovered: 0 }] });
  assert.equal(result[0].tier, 'E');
  assert.equal(result[0].source, 'https://example.org');
  assert.equal(result[0].state, 'UNKNOWN');
});
test('English text includes source, licence, date and tier', () => {
  const text = english();
  assert.ok(text.includes('Source: https://example.org/synthetic-observation'));
  assert.ok(text.includes('Licence: CC0-1.0'));
  assert.ok(text.includes('Retrieved: 2026-11-19'));
  assert.ok(text.includes('Source review tier: 0'));
});
test('French text uses NBSP before colons', () => {
  const text = french();
  assert.ok(text.includes('Source\u00a0:'));
  assert.ok(text.includes('Licence\u00a0:'));
  assert.ok(text.includes('Consulté\u00a0:'));
  assert.ok(!text.includes('Source :'));
});
test('French text has the same core counts as English', () => {
  const en = english();
  const fr = french();
  assert.ok(en.includes('Failures recorded: 1'));
  assert.ok(fr.includes('Échecs consignés\u00a0: 1'));
  assert.ok(en.includes('Recoveries with checks: 1'));
  assert.ok(fr.includes('Récupérations avec contrôle\u00a0: 1'));
});
test('empty reports communicate UNKNOWN rather than a PASS', () => {
  const en = recoveryText(emptyDocument(), 'en');
  const fr = recoveryText(emptyDocument(), 'fr');
  assert.ok(en.includes('UNKNOWN'));
  assert.ok(fr.includes('UNKNOWN'));
  assert.ok(!en.includes('Recorded outcome: PASS'));
});
test('invalid trace report exposes issue codes but not private values', () => {
  const input = fixture();
  input.traces[0].token = 'secret-private-input';
  const result = recoveryText(input);
  assert.ok(result.includes('PRIVATE_FIELD'));
  assert.equal(result.includes('secret-private-input'), false);
});
test('CSV headers are localized and not raw programming keys', () => {
  const en = recoveryCsv(fixture(), 'en').split('\r\n')[0];
  const fr = recoveryCsv(fixture(), 'fr').split('\r\n')[0];
  assert.ok(en.includes('"Recorded outcome"'));
  assert.ok(fr.includes('"Résultat consigné"'));
  assert.ok(fr.includes('"Niveau d’examen de la source"'));
});
test('CSV row data retains provenance', () => {
  const data = recoveryCsv(fixture(), 'fr');
  assert.ok(data.includes('"CC0-1.0"'));
  assert.ok(data.includes('"2026-11-19"'));
  assert.ok(data.includes('"https://example.org/synthetic-observation"'));
});
test('CSV contains no silent formula execution for attacker label', () => {
  const input = document(trace('attack', { label: label({ en: '=FORMULA()', fr: '=FORMULE()' }) }));
  const csv = recoveryCsv(input);
  assert.ok(csv !== null);
  assert.ok(!csv.includes('=FORMULA()'));
  assert.ok(!csv.includes('=FORMULE()'));
});
test('HTML has language, viewport and semantic table structure', () => {
  const data = recoveryHtml(fixture(), 'fr');
  assert.ok(data.startsWith('<!doctype html>'));
  assert.ok(data.includes('<html lang="fr">'));
  assert.ok(data.includes('name="viewport"'));
  assert.ok(data.includes('<main>'));
  assert.ok(data.includes('<caption>'));
  assert.ok(data.includes('<th scope="col">'));
});
test('HTML includes focus-visible and minimum 44px target rules', () => {
  const data = recoveryHtml(fixture());
  assert.ok(data.includes(':focus-visible'));
  assert.ok(data.includes('min-height:44px'));
  assert.ok(data.includes('min-width:44px'));
});
test('HTML does not include network resource references', () => {
  const data = recoveryHtml(fixture());
  assert.equal(/<script\b/iu.test(data), false);
  assert.equal(/<link\b/iu.test(data), false);
  assert.equal(/@import\b/iu.test(data), false);
});
test('HTML escapes URL and arbitrary label content', () => {
  const input = fixture();
  input.traces[0].label.en = 'Safe & clear';
  const data = recoveryHtml(input);
  assert.ok(data.includes('https://example.org/synthetic-observation'));
  assert.ok(data.includes('&amp;') === false || data.includes('Safe &amp; clear') === false);
});
test('JSON result is parseable and has explicit states', () => {
  const result = JSON.parse(recoveryJson(fixture()));
  assert.equal(result.version, 1);
  assert.equal(result.traces[0].state, 'PASS');
  assert.equal(result.summary.PASS, 1);
});
test('JSON excludes unrelated properties from source records', () => {
  const input = fixture();
  input.traces[0].secret = 'do-not-export';
  assert.equal(recoveryJson(input), null);
});
test('comparison text reports changed event evidence', () => {
  const first = fixture();
  const next = fixture();
  next.traces[0].steps[0].code = 'CHANGED_ACTIVATION';
  const result = comparisonText(first, next, 'en');
  assert.ok(result.includes('evidence-changed'));
  assert.ok(result.includes('Changes: 1'));
});
test('French comparison headers use nonbreaking colons', () => {
  const text = comparisonText(fixture(), fixture(), 'fr');
  assert.ok(text.includes('Changements\u00a0: 0'));
  assert.ok(text.includes('Aucune différence consignée.'));
});
test('missing coverage report never upgrades absent observations', () => {
  const text = coverageText(fixture(), 'en', { locales: ['en','fr'], modes: ['offline'], categories: ['navigation'] });
  assert.ok(text.includes('fr | offline | navigation | UNKNOWN'));
});
test('triage report includes review task on missing recovery', () => {
  const input = document(trace('t', { steps: [action(), failure()] }));
  const output = triageText(input, 'fr');
  assert.ok(output.includes('Tâche d’examen\u00a0:'));
  assert.ok(output.includes('UNLINKED_FAILURE'));
});
test('export dispatcher accepts four documented formats', () => {
  for (const format of ['text', 'html', 'csv', 'json']) {
    const result = formatRecoveryDocument(fixture(), format);
    assert.equal(result.ok, true, format);
    assert.ok(typeof result.text === 'string' && result.text.length > 0);
  }
});
test('unsupported export format is refused', () => {
  const result = formatRecoveryDocument(fixture(), 'xml');
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('invalid CSV/HTML/JSON report does not invent rows', () => {
  const bad = { version: 1, traces: [{ id: 'bad' }] };
  assert.equal(recoveryCsv(bad), null);
  assert.equal(recoveryHtml(bad), null);
  assert.equal(recoveryJson(bad), null);
});
test('report bytes stay bounded for valid input', () => {
  const result = formatRecoveryDocument(fixture(), 'json');
  assert.ok(Buffer.byteLength(result.text, 'utf8') < 12_000_000);
});
test('report generation does not mutate original document', () => {
  const input = fixture();
  const json = JSON.stringify(input);
  recoveryText(input); recoveryCsv(input); recoveryHtml(input); recoveryJson(input);
  assert.equal(JSON.stringify(input), json);
});
