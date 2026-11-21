import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptanceReportRows, renderAcceptanceReport, renderAcceptanceDelta,
  supportedAcceptanceFormats, localizedAcceptanceWords, compareAcceptanceReport,
} from './offline-acceptance-report.mjs';
import { compareAcceptanceLedgers } from './offline-acceptance-delta.mjs';
import { ledger, route, check, provenance, TODAY } from './offline-acceptance-fixtures.mjs';

const sample = (state = 'UNKNOWN') => ledger({ routes: [route({ checks: [check({ state })] })] });
const next = (state = 'FAIL') => sample(state);
const report = (format = 'text', language = 'en', value = sample(), options) =>
  renderAcceptanceReport(value, format, language, options);
const delta = () => compareAcceptanceLedgers(sample(), next());
const failureCodes = (result) => result.problems.map((issue) => issue.code);

test('supported report formats are explicit and stable', () => {
  assert.deepEqual(supportedAcceptanceFormats(), ['csv', 'html', 'json', 'text']);
});

test('English and French vocabularies retain exact UNKNOWN token', () => {
  assert.equal(localizedAcceptanceWords('en').unknown, 'UNKNOWN');
  assert.equal(localizedAcceptanceWords('fr').unknown, 'UNKNOWN');
});

test('translation vocabularies include provenance headings', () => {
  for (const lang of ['en', 'fr']) {
    const words = localizedAcceptanceWords(lang);
    for (const label of ['source', 'licence', 'retrieved', 'tier', 'digest']) {
      assert.equal(typeof words[label], 'string');
      assert.ok(words[label].length > 0);
    }
  }
});

test('report row extraction preserves UNKNOWN and the complete source metadata', () => {
  const result = acceptanceReportRows(sample());
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].state, 'UNKNOWN');
  assert.equal(result.rows[0].source, 'https://example.org/release-evidence');
  assert.equal(result.rows[0].licence, 'CC0-1.0');
  assert.equal(result.rows[0].retrieved, TODAY);
});

test('report rows are sorted by route and check IDs', () => {
  const value = ledger({ routes: [
    route({ id: 'z', path: '/z', checks: [check({ id: 'b' }), check({ id: 'a' })] }),
    route({ id: 'a', path: '/a' }),
  ] });
  const rows = acceptanceReportRows(value).rows;
  assert.deepEqual(rows.map((row) => [row.routeId, row.checkId]),
    [['a', 'keyboard-check'], ['z', 'a'], ['z', 'b']]);
});

test('English report carries a visible caution', () => {
  const value = report();
  assert.equal(value.ok, true);
  assert.ok(value.text.includes('not an accessibility certification'));
});

test('French report carries a visible caution', () => {
  const value = report('text', 'fr');
  assert.equal(value.ok, true);
  assert.ok(value.text.includes('ne constituent pas une certification'));
});

test('text reports show UNKNOWN without translated substitute', () => {
  for (const language of ['en', 'fr']) {
    const value = report('text', language);
    assert.ok(value.text.includes('UNKNOWN'));
    assert.equal(value.ok, true);
  }
});

test('French text report uses NBSP before colon', () => {
  const value = report('text', 'fr');
  assert.ok(value.text.includes('Source\u00A0:'));
  assert.ok(value.text.includes('UNKNOWN\u00A0:'));
});

test('French report does not use ordinary spaces before colon', () => {
  const value = report('text', 'fr');
  const noLinks = value.text.replace(/https:\/\/\S+/g, 'URL');
  assert.equal(/(?<!\u00A0):/u.test(noLinks), false);
});

test('plain text includes a review counter rather than claiming a pass', () => {
  const value = report('text', 'en');
  assert.ok(value.text.includes('Human review required'));
  assert.ok(value.text.includes('Missing test'));
});

test('plain text prints each required source dimension', () => {
  const value = report('text', 'en');
  for (const term of ['Source:', 'Licence:', 'Retrieved:', 'Source review tier:', 'Test run:', 'Artifact SHA-256:']) {
    assert.ok(value.text.includes(term), term);
  }
});

test('report includes individual test identity', () => {
  const value = report('text', 'en');
  assert.ok(value.text.includes('/example'));
  assert.ok(value.text.includes('Keyboard navigation'));
  assert.ok(value.text.includes('run-1'));
});

test('empty report does not invent results', () => {
  const value = report('text', 'en', ledger({ routes: [] }));
  assert.equal(value.ok, true);
  assert.ok(value.text.includes('Total checks: 0'));
  assert.ok(!value.text.includes('Keyboard navigation'));
});

test('HTML begins with a complete document and language', () => {
  for (const language of ['en', 'fr']) {
    const value = report('html', language);
    assert.ok(value.text.startsWith('<!doctype html>'));
    assert.ok(value.text.includes(`<html lang="${language}">`));
    assert.ok(value.text.includes('<main id="main" tabindex="-1">'));
  }
});

test('HTML provides a skip link and a meaningful main heading', () => {
  const value = report('html', 'en');
  assert.ok(value.text.includes('href="#main"'));
  assert.ok(value.text.includes('<h1>Offline release acceptance review</h1>'));
});

test('HTML provides a table caption, headers and a horizontal scroll region', () => {
  const value = report('html', 'en');
  assert.ok(value.text.includes('<caption>'));
  assert.ok(value.text.includes('scope="col"'));
  assert.ok(value.text.includes('headers="col-0"'));
  assert.ok(value.text.includes('overflow-x:auto'));
});

test('HTML provides visible keyboard focus and minimum link targets', () => {
  const value = report('html', 'en');
  assert.ok(value.text.includes('a:focus-visible'));
  assert.ok(value.text.includes('min-height:44px'));
  assert.ok(value.text.includes('min-width:44px'));
});

test('HTML labels the scrollable region in each language', () => {
  assert.ok(report('html', 'en').text.includes('aria-label="Checks table"'));
  assert.ok(report('html', 'fr').text.includes('aria-label="Tableau des contrôles"'));
});

test('HTML content is escaped instead of interpreted', () => {
  const value = ledger({ routes: [route({ label: {
    en: '<strong>& content', fr: 'Contenu & exemple',
  } })] });
  const result = report('html', 'en', value);
  assert.ok(result.text.includes('&lt;strong&gt;&amp; content'));
  assert.ok(!result.text.includes('<strong>& content'));
});

test('HTML source URL is rendered as text rather than an active remote request', () => {
  const value = report('html', 'en');
  assert.ok(value.text.includes('https://example.org/release-evidence'));
  assert.equal(value.text.includes('<script'), false);
});

test('HTML does not load external fonts or stylesheets', () => {
  const value = report('html', 'en');
  assert.equal(/<link[^>]+href=/i.test(value.text), false);
  assert.equal(/@import|<iframe|<object|<script/i.test(value.text), false);
});

test('CSV has a UTF-8 BOM and CRLF line separators', () => {
  const value = report('csv', 'en');
  assert.ok(value.text.startsWith('\uFEFF'));
  assert.ok(value.text.includes('\r\n'));
  assert.ok(value.text.endsWith('\r\n'));
});

test('CSV quotes every cell to preserve delimiters', () => {
  const value = report('csv', 'en');
  assert.ok(value.text.includes('"Recorded result"'));
  assert.ok(value.text.includes('"UNKNOWN"'));
});

test('CSV neutralises formula-leading user-provided labels', () => {
  const value = ledger({ routes: [route({ checks: [check({ label: { en: '=SUM(A1:A2)', fr: 'Texte' } })] })] });
  const result = report('csv', 'en', value);
  assert.ok(result.text.includes("'=SUM(A1:A2)"));
});

test('CSV escapes embedded quotation marks', () => {
  const value = ledger({ routes: [route({ label: { en: 'Quoted "Example"', fr: 'Exemple cité' } })] });
  const result = report('csv', 'en', value);
  assert.ok(result.text.includes('""Example""'));
});

test('JSON exports are parseable and preserve UNKNOWN', () => {
  const value = report('json', 'en');
  const parsed = JSON.parse(value.text);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.rows[0].state, 'UNKNOWN');
  assert.equal(parsed.summary.states.UNKNOWN, 1);
});

test('JSON carries source name, licence, date, tier and digest', () => {
  const parsed = JSON.parse(report('json').text);
  const row = parsed.rows[0];
  for (const key of ['source', 'licence', 'retrieved', 'tier', 'run', 'digest']) {
    assert.ok(Object.hasOwn(row, key), key);
  }
});

test('JSON output has deterministic SHA-256 fingerprint', () => {
  const parsed = JSON.parse(report('json').text);
  assert.match(parsed.fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test('all report formats reject invalid ledger inputs', () => {
  const invalid = ledger({ routes: [route({ checks: [check({ state: 'certified' })] })] });
  for (const format of supportedAcceptanceFormats()) {
    const value = report(format, 'en', invalid);
    assert.equal(value.ok, false);
    assert.equal(value.text, null);
  }
});

test('invalid formats are refused without fallback', () => {
  for (const format of ['pdf', 'xml', '', null]) {
    const value = report(format, 'en');
    assert.ok(failureCodes(value).includes('FORMAT_INVALID'));
  }
});

test('unsupported languages are refused rather than silently translated', () => {
  for (const language of ['de', 'en-CA', '', null]) {
    const value = report('text', language);
    assert.ok(failureCodes(value).includes('LANG_INVALID'));
  }
});

test('record provenance is not inferred for an invalid record', () => {
  const invalid = ledger({ routes: [route({ checks: [check({ evidence: provenance({ source: null }) })] })] });
  const result = report('json', 'en', invalid);
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});

test('output reports byte length of emitted UTF-8 text', () => {
  for (const format of supportedAcceptanceFormats()) {
    const value = report(format, 'fr');
    assert.equal(value.bytes, Buffer.byteLength(value.text, 'utf8'));
  }
});

test('format output is deterministic across repeated executions', () => {
  for (const format of supportedAcceptanceFormats()) {
    assert.equal(report(format, 'fr').text, report(format, 'fr').text);
  }
});

test('format output does not mutate submitted data', () => {
  const value = sample();
  const original = JSON.stringify(value);
  for (const format of supportedAcceptanceFormats()) report(format, 'en', value);
  assert.equal(JSON.stringify(value), original);
});

test('delta text retains UNKNOWN and human caution', () => {
  const value = renderAcceptanceDelta(delta(), 'text', 'en');
  assert.equal(value.ok, true);
  assert.ok(value.text.includes('not an accessibility certification'));
});

test('delta French text has a localised heading', () => {
  const value = renderAcceptanceDelta(delta(), 'text', 'fr');
  assert.ok(value.text.includes('Changements de publication'));
});

test('delta JSON is intentionally minimal and does not expose evidence URLs', () => {
  const value = renderAcceptanceDelta(delta(), 'json', 'en');
  const parsed = JSON.parse(value.text);
  assert.equal(parsed.changes[0].kind, 'unknown-transition');
  assert.equal(value.text.includes('https://example.org'), false);
});

test('delta CSV uses quoted and spreadsheet-safe columns', () => {
  const value = renderAcceptanceDelta(delta(), 'csv', 'en');
  assert.ok(value.text.startsWith('\uFEFF'));
  assert.ok(value.text.includes('"unknown-transition"'));
});

test('delta HTML retains table semantics and language tag', () => {
  const value = renderAcceptanceDelta(delta(), 'html', 'fr');
  assert.ok(value.text.includes('<html lang="fr">'));
  assert.ok(value.text.includes('<th scope="row">'));
  assert.ok(value.text.includes('<caption>'));
});

test('delta with no changes says so in both languages', () => {
  for (const lang of ['en', 'fr']) {
    const value = compareAcceptanceReport(sample(), sample(), 'text', lang);
    assert.ok(value.text.includes(lang === 'en' ? 'No recorded changes' : 'Aucun changement consigné'));
  }
});

test('invalid delta has no report', () => {
  const value = renderAcceptanceDelta({ ok: false }, 'text');
  assert.equal(value.ok, false);
  assert.equal(value.text, null);
});

test('comparison wrapper propagates malformed snapshot errors', () => {
  const invalid = ledger({ routes: [route({ checks: [check({ state: true })] })] });
  const result = compareAcceptanceReport(invalid, sample(), 'json');
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});

test('French wording retains curly apostrophes', () => {
  const result = report('text', 'fr');
  assert.ok(result.text.includes('d’accessibilité'));
});

test('report summary never equates recorded PASS with physical accessibility', () => {
  const result = report('text', 'en', sample('PASS'));
  assert.ok(result.text.includes('No physical accessibility facts are established'));
});

test('empty CSV retains only the header and no fictional row', () => {
  const value = report('csv', 'en', ledger({ routes: [] }));
  assert.equal(value.text.split('\r\n').filter(Boolean).length, 1);
});

test('empty HTML uses an empty table body without invented claims', () => {
  const value = report('html', 'en', ledger({ routes: [] }));
  assert.ok(value.text.includes('<tbody></tbody>'));
});
