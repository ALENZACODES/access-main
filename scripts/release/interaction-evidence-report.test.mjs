import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, escapeHtml, csvCell, display, localPunctuation, serialized, reportText, reportCsv, reportHtml, render } from './interaction-evidence-report.mjs';
import { analyze } from './interaction-evidence-analysis.mjs';
import { compare } from './interaction-evidence-delta.mjs';
import { UNKNOWN } from './interaction-evidence-contract.mjs';
import { DATE, HASH, check, route, snapshot, paired, measured } from './interaction-evidence-fixtures.mjs';
const out = (format = 'html', language = 'en', data = snapshot(), before = null) => render(data, { format, language, before, today: DATE });
const report = data => analyze(data, { today: DATE }).value;
const delta = (a, b) => compare(a, b, { today: DATE }).value;

test('both languages have independent report copy', () => {
  assert.ok(WORDS.en.title);
  assert.ok(WORDS.fr.title);
  assert.notEqual(WORDS.en.title, WORDS.fr.title);
});
test('French copy never replaces UNKNOWN with a localized approximation', () => {
  assert.match(WORDS.fr.warning, /UNKNOWN/);
  assert.doesNotMatch(WORDS.fr.warning, /Inconnu/i);
});
test('HTML escaping protects ampersands before other characters', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('>'), '&gt;');
});
test('HTML escaping protects double and single quotes', () => {
  assert.equal(escapeHtml(`"'`), '&quot;&#39;');
});
test('HTML escaping handles null and undefined as empty', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
test('CSV escapes embedded double quotes', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
});
test('CSV leaves safe values unchanged within quotes', () => {
  assert.equal(csvCell('fictional source'), '"fictional source"');
});
test('CSV guards a leading formula equals sign', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
});
test('CSV guards a leading plus sign', () => {
  assert.equal(csvCell('+SUM(1,2)'), '"\'+SUM(1,2)"');
});
test('CSV guards a leading negative sign', () => {
  assert.equal(csvCell('-cmd'), '"\'-cmd"');
});
test('CSV guards a leading at-sign', () => {
  assert.equal(csvCell('@SUM(1,2)'), '"\'@SUM(1,2)"');
});
test('CSV guards a leading tab', () => {
  assert.equal(csvCell('\t=1+1'), '"\'\t=1+1"');
});
test('CSV guards a leading carriage return', () => {
  assert.equal(csvCell('\r=1+1'), '"\'\r=1+1"');
});
test('CSV does not execute formulas in quoted source content', () => {
  const data = snapshot(route({ checks: [check({ source: '=HYPERLINK("https://example.test")' })] }));
  const csv = out('csv', 'en', data).text;
  assert.match(csv, /"'=HYPERLINK/);
});
test('CSV headers specify every provenance field', () => {
  const first = out('csv').text.split('\n')[0];
  for (const key of ['source', 'licence', 'retrievedOn', 'verificationTier']) assert.ok(first.includes(key));
});
test('CSV displays UNKNOWN instead of lowercase unknown', () => {
  const value = out('csv').text;
  assert.match(value, /"UNKNOWN"/);
  assert.doesNotMatch(value, /"unknown"/);
});
test('CSV includes one row per observation', () => {
  const value = out('csv', 'en', paired()).text.trim().split('\n');
  assert.equal(value.length, 3);
});
test('CSV emits only a header for empty evidence', () => {
  const value = out('csv', 'en', { schemaVersion: 1, capturedOn: DATE, routes: [] }).text;
  assert.equal(value.trim().split('\n').length, 1);
});
test('display uses uppercase token for null values', () => {
  assert.equal(display(null), UNKNOWN);
  assert.equal(display(undefined), UNKNOWN);
});
test('display preserves explicit zero without turning it into UNKNOWN', () => {
  assert.equal(display(0), '0');
});
test('display preserves false values for measured booleans', () => {
  assert.equal(display(false), 'false');
});
test('French punctuation uses U+00A0 before colons', () => {
  assert.equal(localPunctuation('fr').colon, '\u00a0:');
});
test('French punctuation uses U+202F before semicolons', () => {
  assert.equal(localPunctuation('fr').semicolon, '\u202f; ');
});
test('English punctuation does not add nonbreaking spaces', () => {
  assert.deepEqual(localPunctuation('en'), { colon: ':', semicolon: '; ' });
});
test('JSON report contains full source and licence', () => {
  const result = JSON.parse(out('json').text);
  assert.equal(result.observations[0].source, check().source);
  assert.equal(result.observations[0].licence, 'CC0-1.0');
});
test('JSON report contains retrieval date and verification tier', () => {
  const result = JSON.parse(out('json').text);
  assert.equal(result.observations[0].retrievedOn, DATE);
  assert.equal(result.observations[0].verificationTier, UNKNOWN);
});
test('JSON report explicitly names its language', () => {
  assert.equal(JSON.parse(out('json', 'fr').text).language, 'fr');
});
test('JSON report contains review flags, never an accessibility certificate', () => {
  const data = JSON.parse(out('json').text);
  assert.ok(Array.isArray(data.reviews));
  assert.ok(!Object.hasOwn(data, 'accessibilityCertified'));
});
test('JSON report contains a truthful caution', () => {
  assert.match(JSON.parse(out('json').text).caution, /UNKNOWN/);
});
test('JSON report can include snapshot comparison', () => {
  const data = snapshot(route({ checks: [measured()] }));
  const result = JSON.parse(out('json', 'en', data, snapshot()).text);
  assert.equal(result.comparison.counts.changed, 0);
  assert.equal(result.comparison.counts.added, 1);
});
test('JSON report contains null comparison without baseline', () => {
  assert.equal(JSON.parse(out('json').text).comparison, null);
});
test('JSON report ends with a newline', () => {
  assert.ok(out('json').text.endsWith('\n'));
});
test('text report includes record date', () => {
  assert.match(out('text').text, /2026-11-21/);
});
test('text report includes original evidence source', () => {
  assert.ok(out('text').text.includes(check().source));
});
test('text report includes original licence', () => {
  assert.match(out('text').text, /CC0-1.0/);
});
test('text report includes retrieved date', () => {
  assert.match(out('text').text, /Retrieved on: 2026-11-21/);
});
test('text report includes UNKNOWN as an explicit result', () => {
  assert.match(out('text').text, /Recorded result: UNKNOWN/);
});
test('French text report has no regular space before generated colon', () => {
  const value = out('text', 'fr').text;
  assert.match(value, /Date de saisie\u00a0: /);
});
test('French text report uses narrow no-break spaces before generated semicolons', () => {
  const value = out('text', 'fr').text;
  assert.match(value, /\u202f; /);
});
test('French text report contains original source without rewriting it', () => {
  const value = out('text', 'fr').text;
  assert.ok(value.includes(check().source));
});
test('English text report includes no-comparison notice', () => {
  assert.match(out('text').text, /No earlier snapshot supplied/);
});
test('French text report includes no-comparison notice', () => {
  assert.match(out('text', 'fr').text, /Aucun état précédent/);
});
test('comparison text includes changed record identity', () => {
  const base = snapshot();
  const next = snapshot(route({ checks: [check({ source: 'New fictional source' })] }));
  assert.match(out('text', 'en', next, base).text, /en\|\/fictional\|fictional-button/);
});
test('comparison text includes changed field names', () => {
  const base = snapshot();
  const next = snapshot(route({ checks: [check({ source: 'New fictional source' })] }));
  assert.match(out('text', 'en', next, base).text, /source/);
});
test('English HTML has correct document language', () => {
  assert.match(out('html', 'en').text, /<html lang="en">/);
});
test('French HTML has correct document language', () => {
  assert.match(out('html', 'fr').text, /<html lang="fr">/);
});
test('HTML has a useful viewport and charset', () => {
  const html = out('html').text;
  assert.match(html, /charset="utf-8"/);
  assert.match(html, /name="viewport"/);
});
test('HTML includes a main landmark and h1', () => {
  const html = out('html').text;
  assert.match(html, /<main id="main">/);
  assert.match(html, /<h1>/);
});
test('HTML includes skip to main with visible focus', () => {
  const html = out('html').text;
  assert.match(html, /href="#main"/);
  assert.match(html, /:focus-visible/);
});
test('HTML skip control has minimum 44 pixel target', () => {
  const html = out('html').text;
  assert.match(html, /min-width:44px/);
  assert.match(html, /min-height:44px/);
});
test('HTML includes data summary with explicit outcome counts', () => {
  const html = out('html').text;
  assert.match(html, /id="summary"/);
  assert.match(html, /<dt>PASS<\/dt>/);
  assert.match(html, /<dt>FAIL<\/dt>/);
});
test('HTML includes source, licence and retrieval date', () => {
  const html = out('html').text;
  assert.match(html, /CC0-1.0/);
  assert.match(html, /2026-11-21/);
});
test('HTML escapes hostile user-supplied source', () => {
  const data = snapshot(route({ checks: [check({ source: '<script>alert(1)</script>' })] }));
  const html = out('html', 'en', data).text;
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
test('HTML escapes hostile user-supplied identifiers', () => {
  const data = snapshot(route({ checks: [check({ note: '<img src=x>' })] }));
  const html = out('html', 'en', data).text;
  assert.doesNotMatch(html, /<img src=x>/);
});
test('HTML does not emit executable scripts or network assets', () => {
  const html = out('html').text;
  assert.doesNotMatch(html, /<script|<iframe|<link rel="stylesheet"/);
});
test('HTML includes clear note that UNKNOWN is not conformance', () => {
  assert.match(out('html').text, /UNKNOWN remains UNKNOWN/);
});
test('HTML includes a review section', () => {
  assert.match(out('html').text, /id="flags"/);
});
test('HTML includes review item codes and IDs', () => {
  const html = out('html').text;
  assert.match(html, /UNKNOWN_RESULT/);
  assert.match(html, /fictional-button/);
});
test('HTML with no observations uses a grounded empty state', () => {
  const data = { schemaVersion: 1, capturedOn: DATE, routes: [] };
  assert.match(out('html', 'en', data).text, /None recorded/);
});
test('HTML has a comparison section with a baseline', () => {
  const html = out('html', 'en', snapshot(), snapshot()).text;
  assert.match(html, /id="changes"/);
});
test('HTML comparison with no changes shows empty-state wording', () => {
  const html = out('html', 'en', snapshot(), snapshot()).text;
  assert.match(html, /None recorded/);
});
test('HTML without a baseline states it clearly', () => {
  assert.match(out('html').text, /No earlier snapshot supplied/);
});
test('French HTML retains original measured source text unchanged', () => {
  const value = out('html', 'fr').text;
  assert.ok(value.includes(check().source));
});
test('HTML renders an opaque digest as no accessibility fact', () => {
  const data = snapshot(route({ checks: [check({ digest: HASH })] }));
  const text = out('html', 'en', data).text;
  assert.doesNotMatch(text, /certified|guaranteed accessible/i);
});
test('unsupported format is rejected', () => {
  assert.equal(out('pdf').ok, false);
});
test('unsupported locale is rejected', () => {
  assert.equal(out('text', 'de').ok, false);
});
test('invalid snapshot is rejected instead of printing', () => {
  const result = out('html', 'en', { schemaVersion: 4 });
  assert.equal(result.ok, false);
  assert.equal(result.text, undefined);
});
test('invalid baseline is rejected', () => {
  const result = out('html', 'en', snapshot(), { schemaVersion: 4 });
  assert.equal(result.ok, false);
});
test('serialized payload contains no raw undefined values', () => {
  const value = serialized(report(snapshot()), null, 'en', DATE);
  assert.equal(JSON.stringify(value).includes('undefined'), false);
});
test('raw summary object is not mutated by serialization', () => {
  const raw = report(snapshot());
  const before = structuredClone(raw);
  serialized(raw, null, 'en', DATE);
  assert.deepEqual(raw, before);
});
test('raw report remains usable after CSV conversion', () => {
  const raw = report(snapshot());
  const before = structuredClone(raw);
  reportCsv(raw);
  assert.deepEqual(raw, before);
});
test('text renderer retains generated warnings for both locales', () => {
  for (const lang of ['en', 'fr']) assert.match(reportText(report(snapshot()), null, lang, DATE), /UNKNOWN/);
});
test('HTML renderer rejects implicit network behavior', () => {
  const value = reportHtml(report(snapshot()), null, 'en', DATE);
  assert.doesNotMatch(value, /fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
});
test('text renderer can include a deterministic diff', () => {
  const previous = snapshot();
  const current = snapshot(route({ checks: [check({ source: 'Updated sample source' })] }));
  assert.match(reportText(report(current), delta(previous, current), 'en', DATE), /Updated sample source/);
});
