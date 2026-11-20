import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exportSummaryText, exportIncidentHtml, exportIncidentCsv,
  exportIncidentJson, exportWorklistHtml, exportChangeText, exportBundle,
} from './offline-release-incident-export.mjs';
import { fixtureIncident, fixtureRegister, TODAY, clone } from './offline-release-incident-fixtures.mjs';
import { transitionIncident } from './offline-release-incidents.mjs';

const good = () => fixtureRegister(fixtureIncident());
const problems = (value) => value.problems.map((item) => item.code);

test('English text export includes source metadata and explicit UNKNOWN', () => {
  const result = exportSummaryText(good(), 'en');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('UNKNOWN'));
  assert.ok(result.text.includes('CC0-1.0'));
  assert.ok(result.text.includes('https://example.org/source-1'));
  assert.ok(result.text.includes('2026-11-19'));
  assert.ok(result.text.includes('Source tier: 0'));
});

test('French text export preserves NBSP before colons', () => {
  const result = exportSummaryText(good(), 'fr');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('Source\u00A0:'));
  assert.ok(result.text.includes('Licence\u00A0:'));
  assert.ok(result.text.includes('UNKNOWN'));
});

test('text export uses French title and caution without attribution claims', () => {
  const result = exportSummaryText(good(), 'fr');
  assert.ok(result.text.includes('Examen hors ligne des incidents'));
  assert.ok(result.text.includes('accessibilité réelle'));
  assert.ok(result.text.includes('Examen fictif du clavier'));
});

test('empty text report has explicit empty state', () => {
  const result = exportSummaryText(fixtureRegister(), 'en');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('No incidents recorded.'));
  assert.ok(result.text.includes('Incidents: 0'));
});

test('invalid provenance fails text export without partial output', () => {
  const bad = fixtureRegister(fixtureIncident('one', { sources: [] }));
  const result = exportSummaryText(bad, 'en');
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
  assert.ok(problems(result).includes('SOURCES_REQUIRED'));
});

test('text output is deterministic across input ordering', () => {
  const a = fixtureRegister(fixtureIncident('b'), fixtureIncident('a'));
  const b = fixtureRegister(fixtureIncident('a'), fixtureIncident('b'));
  assert.equal(exportSummaryText(a).text, exportSummaryText(b).text);
});

test('HTML exports use page language, main and heading structure', () => {
  const result = exportIncidentHtml(good(), 'en');
  assert.equal(result.ok, true);
  assert.ok(result.html.includes('<html lang="en">'));
  assert.ok(result.html.includes('<main>'));
  assert.ok(result.html.includes('<h1>'));
  assert.ok(result.html.includes('<article aria-labelledby='));
  assert.ok(result.html.includes('<h2 id='));
  assert.ok(result.html.includes('<dl>'));
});

test('French HTML sets fr language and retains UNKNOWN token', () => {
  const result = exportIncidentHtml(good(), 'fr');
  assert.equal(result.ok, true);
  assert.ok(result.html.includes('<html lang="fr">'));
  assert.ok(result.html.includes('UNKNOWN</dd>'));
  assert.ok(result.html.includes('Examen fictif du clavier'));
});

test('HTML source links remain inspectable without network requests', () => {
  const result = exportIncidentHtml(good(), 'en');
  assert.ok(result.html.includes('href="https://example.org/source-1"'));
  assert.ok(result.html.includes('<time datetime="2026-11-19">'));
  assert.ok(result.html.includes('CC0-1.0'));
});

test('HTML escapes potentially executable label characters', () => {
  const sample = fixtureIncident();
  sample.title.en = '<img src=x onerror=alert(1)>';
  sample.summary.en = 'Safety text with & and "quotes"';
  const result = exportIncidentHtml(fixtureRegister(sample));
  assert.equal(result.ok, true);
  assert.ok(result.html.includes('&lt;img'));
  assert.ok(result.html.includes('&amp;'));
  assert.ok(result.html.includes('&quot;quotes&quot;'));
  assert.equal(result.html.includes('<img'), false);
});

test('HTML escaped title remains keyboard-readable plain text', () => {
  const sample = fixtureIncident();
  sample.title.en = '<Review & test>';
  const report = exportIncidentHtml(fixtureRegister(sample));
  assert.ok(report.html.includes('&lt;Review &amp; test&gt;'));
});

test('HTML empty report still contains accessible primary heading', () => {
  const report = exportIncidentHtml(fixtureRegister());
  assert.equal(report.ok, true);
  assert.ok(report.html.includes('<h1>'));
  assert.ok(report.html.includes('No incidents recorded.'));
});

test('HTML rejects private fields rather than reproducing their values', () => {
  const source = fixtureIncident();
  source.email = 'private-value@example.org';
  const result = exportIncidentHtml(fixtureRegister(source));
  assert.equal(result.ok, false);
  assert.equal(result.html, null);
  assert.equal(JSON.stringify(result).includes('private-value'), false);
});

test('CSV includes metadata and explicit claim state', () => {
  const result = exportIncidentCsv(good(), 'en');
  assert.equal(result.ok, true);
  assert.ok(result.csv.includes('"claimState"'));
  assert.ok(result.csv.includes('"UNKNOWN"'));
  assert.ok(result.csv.includes('"CC0-1.0"'));
  assert.ok(result.csv.includes('"2026-11-19"'));
  assert.ok(result.csv.includes('"0"'));
});

test('CSV uses CRLF between records', () => {
  const result = exportIncidentCsv(good());
  assert.ok(result.csv.includes('\r\n'));
  assert.ok(result.csv.endsWith('\r\n'));
});

test('CSV neutralizes spreadsheet-formula prefixes', () => {
  const source = fixtureIncident();
  source.title.en = '=1+2';
  const result = exportIncidentCsv(fixtureRegister(source));
  assert.equal(result.ok, true);
  assert.ok(result.csv.includes('"\'=1+2"'));
  assert.equal(result.csv.includes('"=1+2"'), false);
});

test('CSV neutralizes plus, minus and at-sign prefixes', () => {
  for (const label of ['+SUM(1)', '-SUM(1)', '@SUM(1)']) {
    const source = fixtureIncident();
    source.title.en = label;
    const result = exportIncidentCsv(fixtureRegister(source));
    assert.equal(result.ok, true);
    assert.ok(result.csv.includes(`"'${label}"`));
  }
});

test('CSV doubles embedded quotes and strips line breaks from cell text', () => {
  const sample = fixtureIncident();
  sample.title.en = 'Synthetic "test"';
  const result = exportIncidentCsv(fixtureRegister(sample));
  assert.equal(result.ok, true);
  assert.ok(result.csv.includes('"Synthetic ""test"""'));
});

test('CSV preserves French title translation', () => {
  const result = exportIncidentCsv(good(), 'fr');
  assert.ok(result.csv.includes('"Examen fictif du clavier"'));
});

test('CSV is sorted independently of caller input order', () => {
  const a = fixtureRegister(fixtureIncident('z'), fixtureIncident('a'));
  const b = fixtureRegister(fixtureIncident('a'), fixtureIncident('z'));
  assert.equal(exportIncidentCsv(a).csv, exportIncidentCsv(b).csv);
});

test('JSON parses with explicit report version and UNKNOWN', () => {
  const result = exportIncidentJson(good());
  assert.equal(result.ok, true);
  const document = JSON.parse(result.json);
  assert.equal(document.format, 'offline-release-incident-report-1');
  assert.equal(document.items[0].claimState, 'UNKNOWN');
  assert.equal(document.summary.claimState, 'UNKNOWN');
});

test('JSON keeps all four provenance dimensions', () => {
  const result = exportIncidentJson(good());
  const source = JSON.parse(result.json).items[0].sources[0];
  assert.equal(source.source, 'https://example.org/source-1');
  assert.equal(source.licence, 'CC0-1.0');
  assert.equal(source.retrievedOn, TODAY);
  assert.equal(source.tier, 0);
});

test('JSON contains no unrelated workflow or personal profile fields', () => {
  const result = exportIncidentJson(good());
  const document = JSON.parse(result.json);
  assert.equal(Object.hasOwn(document.items[0], 'history'), false);
  assert.equal(Object.hasOwn(document.items[0], 'password'), false);
});

test('JSON representation sorts items deterministically', () => {
  const a = fixtureRegister(fixtureIncident('b'), fixtureIncident('a'));
  const b = fixtureRegister(fixtureIncident('a'), fixtureIncident('b'));
  assert.equal(exportIncidentJson(a).json, exportIncidentJson(b).json);
});

test('worklist HTML contains heading, note and list', () => {
  const result = exportWorklistHtml(good());
  assert.equal(result.ok, true);
  assert.ok(result.html.includes('aria-labelledby="review-worklist"'));
  assert.ok(result.html.includes('<h2 id="review-worklist">'));
  assert.ok(result.html.includes('<ul>'));
  assert.ok(result.html.includes('UNKNOWN'));
});

test('worklist HTML excludes resolved records', () => {
  const initial = good();
  const triaged = transitionIncident(initial, 'incident-1', 'triage', TODAY, ['source-1']).register;
  const resolved = transitionIncident(triaged, 'incident-1', 'resolve', TODAY, ['source-1']).register;
  const result = exportWorklistHtml(resolved);
  assert.equal(result.ok, true);
  assert.equal(result.html.includes('Synthetic keyboard review'), false);
  assert.ok(result.html.includes('<ul></ul>'));
});

test('worklist HTML switches language without copying English title', () => {
  const report = exportWorklistHtml(good(), 'fr');
  assert.ok(report.html.includes('lang="fr"'));
  assert.ok(report.html.includes('Examen fictif du clavier'));
  assert.equal(report.html.includes('Synthetic keyboard review'), false);
});

test('change report lists added and removed incidents', () => {
  const first = fixtureRegister(fixtureIncident('one'));
  const second = fixtureRegister(fixtureIncident('two'));
  const result = exportChangeText(first, second);
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('removed'));
  assert.ok(result.text.includes('added'));
  assert.ok(result.text.includes('UNKNOWN'));
});

test('French change report uses escaped NBSP before summary colon', () => {
  const result = exportChangeText(fixtureRegister(), good(), 'fr');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('Modifications\u00A0:'));
});

test('no-change report states no recorded changes when input has zero records', () => {
  const result = exportChangeText(fixtureRegister(), fixtureRegister());
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('No recorded changes.'));
});

test('invalid comparison cannot return partial report', () => {
  const later = clone(good());
  later.incidents[0].claimState = 'YES';
  const result = exportChangeText(good(), later);
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});

test('bundle includes four separate deterministic exports', () => {
  const result = exportBundle(good());
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.files).sort(), [
    'incident-review.csv', 'incident-review.html',
    'incident-review.json', 'incident-review.txt',
  ]);
  assert.ok(result.files['incident-review.html'].startsWith('<!doctype html>'));
  assert.ok(result.files['incident-review.json'].startsWith('{'));
});

test('bundle rejects invalid source and returns no files', () => {
  const invalid = fixtureRegister(fixtureIncident('x', { sourceRefs: [] }));
  const result = exportBundle(invalid);
  assert.equal(result.ok, false);
  assert.equal(result.files, null);
});

test('bundle does not change input objects', () => {
  const original = good();
  const before = clone(original);
  exportBundle(original, 'fr');
  assert.deepEqual(original, before);
});

test('bundle retains UNKNOWN in each format', () => {
  const result = exportBundle(good(), 'fr');
  for (const [name, content] of Object.entries(result.files)) {
    assert.ok(content.includes('UNKNOWN'), name);
  }
});

test('French HTML uses NBSP before colons and narrow spaces before semicolons', () => {
  const result = exportIncidentHtml(good(), 'fr');
  assert.equal(result.ok, true);
  assert.ok(result.html.includes('Source\u00A0:'));
  assert.ok(result.html.includes('Licence\u00A0:'));
  assert.ok(result.html.includes('Consulté\u00A0:'));
  assert.ok(result.html.includes('\u202F;'));
  assert.equal(result.html.includes('Source:'), false);
});
