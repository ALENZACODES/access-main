import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
 COPY, locale, colon, escapeHtml, cleanCell, csvCell, csvRow, rows,
 textReport, csvReport, htmlReport, jsonReport, deltaReport, render,
} from './input-continuity-report.mjs';
import { analyze } from './input-continuity-analysis.mjs';
import { TODAY, session, document, complete, clone } from './input-continuity-fixtures.mjs';

const en = { language: 'en', today: TODAY };
const fr = { language: 'fr', today: TODAY };
const example = () => document(complete());
const output = (format, value = example(), language = 'en') => render(value, { format, language, today: TODAY });

test('both language packs have identical message keys', () => {
 assert.deepEqual(Object.keys(COPY.en).sort(), Object.keys(COPY.fr).sort());
});
test('English report title is a readable description', () => {
 assert.equal(locale('en').title, 'Input continuity evidence review');
});
test('French report title uses a natural expression', () => {
 assert.ok(locale('fr').title.includes('continuité'));
});
test('unsupported language falls back to English copy', () => {
 assert.equal(locale('es'), COPY.en);
});
test('French colon uses U+00A0 while English uses standard punctuation', () => {
 assert.equal(colon('fr'), '\u00a0:');
 assert.equal(colon('en'), ':');
});
test('French caution makes no unsupported success claim', () => {
 assert.ok(locale('fr').caution.includes('non observée'));
});
test('both reports describe mandatory human review', () => {
 assert.ok(locale('en').warning.includes('Human review'));
 assert.ok(locale('fr').warning.includes('examen humain'));
});
test('HTML escaping handles ampersands', () => {
 assert.equal(escapeHtml('a&b'), 'a&amp;b');
});
test('HTML escaping handles every markup delimiter', () => {
 assert.equal(escapeHtml('<script>"\'&'), '&lt;script&gt;&quot;&#39;&amp;');
});
test('HTML escaping accepts null and undefined without throwing', () => {
 assert.equal(escapeHtml(null), '');
 assert.equal(escapeHtml(undefined), '');
});
test('CSV cleaning removes all line-break and tab cells', () => {
 assert.equal(cleanCell('a\nb\rc\td'), 'a b c d');
});
test('CSV quoting doubles inner quotation marks', () => {
 assert.equal(csvCell('A"B'), '"A""B"');
});
test('CSV quoting protects formulas beginning with equals sign', () => {
 assert.equal(csvCell('=1+1'), '"\'=1+1"');
});
test('CSV quoting protects spreadsheet function prefixes', () => {
 for (const value of ['+SUM(1)', '-2', '@formula', ' =cmd']) assert.ok(csvCell(value).includes("'"));
});
test('CSV quoting does not prepend apostrophe to ordinary text', () => {
 assert.equal(csvCell('Source'), '"Source"');
});
test('CSV rows preserve a stable number of columns', () => {
 assert.equal(csvRow(['a', 'b', 'c']), '"a","b","c"');
});
test('empty array yields an empty CSV row', () => {
 assert.equal(csvRow([]), '');
});
test('rule rows preserve the session identity for each check', () => {
 const data = rows(analyze(example(), { today: TODAY }));
 assert.ok(data.length >= 8);
 assert.ok(data.every(x => x.session === 'complete'));
});
test('rule rows include immutable provenance fields', () => {
 const data = rows(analyze(example(), { today: TODAY }));
 assert.ok(data.every(x => x.licence === 'CC0-1.0'));
 assert.ok(data.every(x => x.retrieved === TODAY));
});
test('rule rows never replace UNKNOWN with PASS', () => {
 const data = rows(analyze(document(), { today: TODAY }));
 assert.ok(data.some(x => x.state === 'UNKNOWN'));
});
test('English text report includes an accurate title and caution', () => {
 const result = textReport(example(), en);
 assert.equal(result.ok, true);
 assert.ok(result.text.startsWith(COPY.en.title));
 assert.ok(result.text.includes(COPY.en.caution));
});
test('French text report includes a natural title and caution', () => {
 const result = textReport(example(), fr);
 assert.equal(result.ok, true);
 assert.ok(result.text.includes(COPY.fr.title));
 assert.ok(result.text.includes(COPY.fr.caution));
});
test('French text uses a no-break space for report counters', () => {
 const result = textReport(example(), fr);
 assert.ok(result.text.includes(`Séance\u00a0: 1`));
 assert.ok(result.text.includes(`${COPY.fr.gaps}\u00a0:`));
});
test('French rule labels never use ordinary colon spacing', () => {
 const result = textReport(example(), fr);
 assert.ok(!result.text.includes('Source :'));
 assert.ok(result.text.includes('Source\u00a0:'));
});
test('English text uses normal colon formatting', () => {
 assert.ok(textReport(example(), en).text.includes('Session: 1'));
});
test('text report includes source attribution for every recorded rule', () => {
 const text = textReport(example(), en).text;
 assert.ok(text.includes('https://example.org/public-notes'));
});
test('empty report remains explicit about absent records', () => {
 const result = textReport({ version: 1, sessions: [] }, en);
 assert.ok(result.text.includes(COPY.en.empty));
});
test('unknown evidence appears unchanged in text reports', () => {
 assert.ok(textReport(document(), en).text.includes('UNKNOWN'));
});
test('invalid input cannot produce a text export', () => {
 const result = textReport(document(session('invalid', { outcome: 'YES' })), en);
 assert.equal(result.ok, false);
 assert.equal(result.text, null);
});
test('CSV export provides a stable header', () => {
 const lines = csvReport(example(), en).text.split('\n');
 assert.ok(lines[0].startsWith('"Session","Task"'));
});
test('French CSV labels come from French translations', () => {
 const first = csvReport(example(), fr).text.split('\n')[0];
 assert.ok(first.startsWith('"Séance","Tâche"'));
});
test('CSV includes source and licence columns', () => {
 const first = csvReport(example(), en).text.split('\n')[0];
 assert.ok(first.includes('"Source"'));
 assert.ok(first.includes('"Licence"'));
});
test('CSV provides a separate row for every rule', () => {
 const result = csvReport(example(), en);
 assert.equal(result.text.trimEnd().split('\n').length, 9);
});
test('CSV export preserves UNKNOWN literally', () => {
 assert.ok(csvReport(document(), en).text.includes('"UNKNOWN"'));
});
test('CSV input is never mutated by serialization', () => {
 const value = example(), original = clone(value);
 csvReport(value, en);
 assert.deepEqual(value, original);
});
test('HTML document declares its language', () => {
 assert.ok(htmlReport(example(), fr).text.includes('<html lang="fr">'));
 assert.ok(htmlReport(example(), en).text.includes('<html lang="en">'));
});
test('HTML document includes main landmark and heading', () => {
 const text = htmlReport(example(), en).text;
 assert.ok(text.includes('<main>'));
 assert.ok(text.includes('<h1>'));
});
test('HTML table has a caption and column scope', () => {
 const text = htmlReport(example(), en).text;
 assert.ok(text.includes('<caption>'));
 assert.ok(text.includes('<th scope="col">'));
});
test('HTML includes UTF-8 and responsive metadata', () => {
 const text = htmlReport(example(), en).text;
 assert.ok(text.includes('charset="utf-8"'));
 assert.ok(text.includes('name="viewport"'));
});
test('HTML serializes recorded UNKNOWN rather than substituting PASS', () => {
 const text = htmlReport(document(), en).text;
 assert.ok(text.includes('<td>UNKNOWN</td>'));
});
test('HTML cell values are encoded against tag injection', () => {
 const doc = document(complete('safe'));
 doc.sessions[0].label = '<script>alert(1)</script>';
 const result = htmlReport(doc, en);
 assert.equal(result.ok, true);
 assert.ok(!result.text.includes('<script>'));
});
test('HTML uses a real table even when no sessions exist', () => {
 assert.ok(htmlReport({ version: 1, sessions: [] }, en).text.includes('<table>'));
});
test('JSON report is machine-readable with summary and review', () => {
 const result = jsonReport(example(), en);
 const parsed = JSON.parse(result.text);
 assert.equal(parsed.version, 1);
 assert.ok(parsed.result.summary);
 assert.ok(parsed.review.tasks);
});
test('JSON report surfaces missing French captures', () => {
 const parsed = JSON.parse(jsonReport(example(), en).text);
 assert.ok(parsed.coverage.missing.some(x => x.language === 'fr' && x.state === 'UNKNOWN'));
});
test('JSON report does not expose private values', () => {
 const source = document(session('invalid', { accessToken: 'a-secret' }));
 const result = jsonReport(source, en);
 assert.equal(result.ok, false);
 assert.equal(result.text, null);
});
test('every report starts with a successful status for safe fixture', () => {
 for (const format of ['text', 'csv', 'html', 'json']) {
  assert.equal(output(format).ok, true, format);
 }
});
test('invalid report format produces explicit error', () => {
 const result = output('pdf');
 assert.equal(result.ok, false);
 assert.equal(result.issues[0].code, 'FORMAT');
});
test('report text remains within the 8MB safety ceiling', () => {
 for (const format of ['text', 'csv', 'html', 'json']) {
  assert.ok(Buffer.byteLength(output(format).text) < 8_000_000);
 }
});
test('delta export lists change count', () => {
 const result = deltaReport(document(), example(), { ...en, format: 'text' });
 assert.equal(result.ok, true);
 assert.ok(result.text.includes('Changes:'));
});
test('French delta text labels include a no-break space', () => {
 const result = deltaReport(document(), example(), { ...fr, format: 'text' });
 assert.ok(result.text.includes('Changements\u00a0:'));
});
test('delta CSV uses safely escaped cells', () => {
 const result = deltaReport(document(), example(), { ...en, format: 'csv' });
 assert.ok(result.text.startsWith('"Changes"'));
 assert.ok(result.text.includes('"session-added"'));
});
test('delta HTML is a complete accessible document', () => {
 const result = deltaReport(document(), example(), { ...en, format: 'html' });
 assert.ok(result.text.includes('<main>'));
 assert.ok(result.text.includes('<h1>'));
});
test('delta JSON includes a deterministic digest', () => {
 const result = JSON.parse(deltaReport(document(), example(), { ...en, format: 'json' }).text);
 assert.match(result.summary.digest, /^[a-f0-9]{64}$/u);
});
test('delta export is deterministic across repeated runs', () => {
 const a = deltaReport(document(), example(), { ...en, format: 'json' });
 const b = deltaReport(document(), example(), { ...en, format: 'json' });
 assert.deepEqual(a, b);
});
test('invalid before-state prevents all delta exports', () => {
 const invalid = document(session('bad', { provenance: null }));
 for (const format of ['text', 'csv', 'html', 'json']) {
  assert.equal(deltaReport(invalid, example(), { ...en, format }).ok, false);
 }
});
test('render passes a supplied before-state into delta comparison', () => {
 const result = render(example(), { ...en, before: document(), format: 'text' });
 assert.ok(result.text.startsWith('Changes:'));
});
test('report never makes a personal suitability decision', () => {
 const text = textReport(example(), en).text.toLowerCase();
 assert.ok(!text.includes('eligible'));
 assert.ok(!text.includes('medically suitable'));
});
