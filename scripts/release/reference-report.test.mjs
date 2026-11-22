import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORDS, escapeHtml, csvCell, rowsForReport, reportCsv, reportText,
  reportHtml, renderReport,
} from './reference-report.mjs';
import { reviewReferences } from './reference-review.mjs';
import { compareReferenceSets } from './reference-delta.mjs';
import { DAY, entry, french, observed, pair, snapshot } from './reference-fixtures.mjs';

const review = (manifest = pair()) => {
  const result = reviewReferences(manifest, { today: DAY });
  assert.equal(result.ok, true);
  return result.value;
};
const delta = (before = snapshot(entry()), after = snapshot(observed())) => {
  const result = compareReferenceSets(before, after, { today: DAY });
  assert.equal(result.ok, true);
  return result.value;
};

test('copy objects have independent English and French titles', () => {
  assert.notEqual(WORDS.en.title, WORDS.fr.title);
  assert.ok(WORDS.en.title.length > 3);
  assert.ok(WORDS.fr.title.length > 3);
});
test('both languages visibly disclose that destinations were not opened', () => {
  assert.match(WORDS.en.intro, /not opened/i);
  assert.match(WORDS.fr.intro, /n’ont pas été ouvertes/u);
});
test('French copy preserves the exact UNKNOWN token', () => {
  assert.equal(WORDS.fr.unknown, 'UNKNOWN');
  assert.doesNotMatch(WORDS.fr.unknown, /inconnu/iu);
});
test('English copy preserves the exact UNKNOWN token', () => {
  assert.equal(WORDS.en.unknown, 'UNKNOWN');
});
test('French copy uses typographic apostrophes', () => {
  assert.match(WORDS.fr.intro, /n’ont/u);
  assert.doesNotMatch(WORDS.fr.intro, /n'ont/u);
});
test('French copy uses narrow space before semicolon', () => {
  assert.ok(WORDS.fr.none.includes('\u202f;'));
});
test('HTML escape protects ampersands first', () => {
  assert.equal(escapeHtml('&'), '&amp;');
});
test('HTML escape protects less-than and greater-than', () => {
  assert.equal(escapeHtml('<>'), '&lt;&gt;');
});
test('HTML escape protects both quote types', () => {
  assert.equal(escapeHtml('"\''), '&quot;&#39;');
});
test('HTML escape treats missing values as empty', () => {
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(null), '');
});
test('HTML escape does not double-expand ordinary words', () => {
  assert.equal(escapeHtml('Fictional guidance'), 'Fictional guidance');
});
test('CSV cells quote every field', () => {
  assert.equal(csvCell('normal'), '"normal"');
});
test('CSV cells escape embedded quote characters', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
});
test('CSV formula equals sign gets a text prefix', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
});
test('CSV formula plus sign gets a text prefix', () => {
  assert.equal(csvCell('+SUM(A1:A2)'), '"\'+SUM(A1:A2)"');
});
test('CSV formula minus sign gets a text prefix', () => {
  assert.equal(csvCell('-cmd'), '"\'-cmd"');
});
test('CSV formula at-sign gets a text prefix', () => {
  assert.equal(csvCell('@SUM(1)'), '"\'@SUM(1)"');
});
test('CSV formula preceded by a tab gets a text prefix', () => {
  assert.equal(csvCell('\t=1+1'), '"\'\t=1+1"');
});
test('CSV formula preceded by a newline gets a text prefix', () => {
  assert.equal(csvCell('\n=1+1'), '"\'\n=1+1"');
});
test('CSV ordinary hyphens inside text are not modified', () => {
  assert.equal(csvCell('open-source'), '"open-source"');
});
test('report rows start with a stable header', () => {
  assert.deepEqual(rowsForReport(review())[0], ['reference', 'code', 'severity', 'category', 'detail']);
});
test('each finding produces one output CSV row', () => {
  const report = review();
  assert.equal(rowsForReport(report).length, report.findings.length + 1);
});
test('delta changes are included in CSV output when requested', () => {
  const d = delta();
  const rows = rowsForReport(review(), d);
  assert.ok(rows.some(row => row[1] === 'CHANGE_MODIFIED'));
});
test('CSV uses RFC-style CRLF row boundaries', () => {
  assert.ok(reportCsv(review()).endsWith('\r\n'));
  assert.ok(reportCsv(review()).includes('\r\n'));
});
test('CSV contains no raw object placeholders', () => {
  assert.doesNotMatch(reportCsv(review()), /\[object Object\]/u);
});
test('CSV displays the recorded priority and category', () => {
  const output = reportCsv(review());
  assert.match(output, /"review"/u);
  assert.match(output, /"uncertain"/u);
});
test('CSV protects malicious provenance display text', () => {
  const report = review(snapshot(entry({ id: 'formula', source: '=HYPERLINK(1)' })));
  assert.ok(reportCsv(report).includes('STATUS_UNKNOWN'));
  assert.doesNotMatch(reportCsv(report), /HYPERLINK\(/u);
});
test('English text report starts with its title', () => {
  assert.ok(reportText(review()).startsWith(WORDS.en.title));
});
test('French text report starts with its translated title', () => {
  assert.ok(reportText(review(), { language: 'fr' }).startsWith(WORDS.fr.title));
});
test('text report displays review date and count', () => {
  const output = reportText(review());
  assert.ok(output.includes(DAY));
  assert.ok(output.includes(`${WORDS.en.count}: 2`));
});
test('text report displays route language counts', () => {
  const output = reportText(review());
  assert.ok(output.includes('/help'));
  assert.ok(output.includes('English: 1'));
  assert.ok(output.includes('French: 1'));
});
test('text report keeps UNKNOWN exactly in French', () => {
  assert.ok(reportText(review(), { language: 'fr' }).includes('UNKNOWN'));
});
test('text report includes status uncertainty as a finding', () => {
  assert.ok(reportText(review()).includes('STATUS_UNKNOWN'));
});
test('text report without findings discloses uninspected destinations', () => {
  const output = reportText(review(snapshot(observed({ pairId: undefined }))));
  assert.ok(output.includes(WORDS.en.none));
});
test('text report includes a before/after header when supplied a delta', () => {
  const output = reportText(review(), { delta: delta() });
  assert.ok(output.includes(WORDS.en.before));
  assert.ok(output.includes(WORDS.en.after));
});
test('French text delta includes French section label', () => {
  const output = reportText(review(), { language: 'fr', delta: delta() });
  assert.ok(output.includes(WORDS.fr.changes));
});
test('text reports always end with a newline', () => {
  assert.ok(reportText(review()).endsWith('\n'));
});
test('invalid language is rejected for text reports', () => {
  assert.throws(() => reportText(review(), { language: 'de' }), /LANGUAGE/);
});
test('HTML declares document language for EN', () => {
  assert.match(reportHtml(review()), /<html lang="en">/u);
});
test('HTML declares document language for FR', () => {
  assert.match(reportHtml(review(), { language: 'fr' }), /<html lang="fr">/u);
});
test('HTML includes a viewport meta tag', () => {
  assert.match(reportHtml(review()), /name="viewport"/u);
});
test('HTML includes a main landmark', () => {
  assert.match(reportHtml(review()), /<main>/u);
});
test('HTML includes an accessible skip link', () => {
  assert.match(reportHtml(review()), /href="#findings"/u);
});
test('HTML includes an explicit visible focus declaration', () => {
  assert.match(reportHtml(review()), /:focus-visible\{outline:/u);
});
test('HTML includes a caption for tabular route summary', () => {
  assert.match(reportHtml(review()), /<table><caption>/u);
});
test('HTML table column headers declare scope', () => {
  assert.match(reportHtml(review()), /<th scope="col">/u);
});
test('HTML table route names declare row scope', () => {
  assert.match(reportHtml(review()), /<th scope="row">/u);
});
test('HTML includes a findings section heading', () => {
  assert.match(reportHtml(review()), /aria-labelledby="findings-title"/u);
});
test('HTML escapes route names rather than interpolating raw markup', () => {
  const report = review();
  report.routes[0].path = '<img src=x onerror=alert(1)>';
  const output = reportHtml(report);
  assert.ok(output.includes('&lt;img'));
  assert.doesNotMatch(output, /<img /u);
});
test('HTML escapes source-supplied detail text', () => {
  const report = review();
  report.findings[0].detail = '<script>evil()</script>';
  const output = reportHtml(report);
  assert.doesNotMatch(output, /<script>/u);
  assert.ok(output.includes('&lt;script&gt;'));
});
test('HTML displays translated disclosure in French', () => {
  const output = reportHtml(review(), { language: 'fr' });
  assert.ok(output.includes(WORDS.fr.intro));
});
test('HTML includes a delta section only when requested', () => {
  assert.ok(!reportHtml(review()).includes('aria-labelledby="changes"'));
  assert.ok(reportHtml(review(), { delta: delta() }).includes('aria-labelledby="changes"'));
});
test('HTML with no findings renders a prose empty state', () => {
  const output = reportHtml(review(snapshot(observed({ pairId: undefined }))));
  assert.ok(output.includes(WORDS.en.none));
});
test('HTML rejects unsupported languages', () => {
  assert.throws(() => reportHtml(review(), { language: 'xx' }), /LANGUAGE/);
});
test('renderer dispatches all four supported formats', () => {
  for (const format of ['text', 'csv', 'html', 'json']) {
    assert.equal(typeof renderReport(review(), { format }), 'string');
  }
});
test('renderer rejects unsupported format', () => {
  assert.throws(() => renderReport(review(), { format: 'xml' }), /FORMAT/);
});
test('renderer rejects unsupported language', () => {
  assert.throws(() => renderReport(review(), { language: 'es' }), /LANGUAGE/);
});
test('JSON export round trips report and delta', () => {
  const source = review();
  const changes = delta();
  const value = JSON.parse(renderReport(source, { format: 'json', delta: changes }));
  assert.deepEqual(value.report, source);
  assert.deepEqual(value.delta, changes);
});
test('JSON export uses null for absent delta', () => {
  const output = JSON.parse(renderReport(review(), { format: 'json' }));
  assert.equal(output.delta, null);
});
test('JSON export ends with newline', () => {
  assert.ok(renderReport(review(), { format: 'json' }).endsWith('\n'));
});
test('all report formats contain the exact language-independent UNKNOWN token', () => {
  const value = review();
  for (const format of ['text', 'html', 'csv', 'json']) {
    assert.ok(renderReport(value, { format, language: 'fr' }).includes('UNKNOWN'), format);
  }
});
test('rendering does not mutate report findings', () => {
  const value = review();
  const before = JSON.stringify(value);
  renderReport(value, { format: 'html', language: 'fr', delta: delta() });
  assert.equal(JSON.stringify(value), before);
});
