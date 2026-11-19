import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HANDOFF_COPY, copyFor, punctuation, labelValue, htmlEscape, csvCell,
  sourceLookup, sourceDescription, formatTextHandoff, formatCsvHandoff,
  formatHtmlHandoff, formatJsonHandoff, compareTextHandoffs,
  formatGroupedText, exportAllHandoffFormats, inspectExportedHandoff,
} from './offline-handoff-export.mjs';

const source = (id = 's1') => ({ id, title: 'Synthetic provenance',
  url: `https://example.org/${id}`, licence: 'CC0-1.0',
  retrievedOn: '2026-11-19', tier: 0 });
const claim = (id = 'c1', state = 'UNKNOWN', recordId = 'r1') => ({
  id, recordId, field: 'stepFreeEntrance', state,
  label: { en: 'Synthetic entrance', fr: 'Entrée fictive' },
  sourceIds: ['s1'],
});
const event = (id, decision, claimId = 'c1') => ({
  id, decision, claimId, on: '2026-11-19', priority: 'NORMAL',
});
const packet = () => ({ version: 1, sources: [source()], claims: [claim()], events: [] });

test('both translation catalogues have the same keys', () => {
  assert.deepEqual(Object.keys(HANDOFF_COPY.en).sort(), Object.keys(HANDOFF_COPY.fr).sort());
});

test('French UNKNOWN label stays untranslated', () => {
  assert.equal(copyFor('fr').unknown, 'UNKNOWN');
  assert.equal(copyFor('en').unknown, 'UNKNOWN');
});

test('fallback locale is English rather than a guessed language', () => {
  assert.equal(copyFor('de'), HANDOFF_COPY.en);
  assert.equal(copyFor('fr'), HANDOFF_COPY.fr);
});

test('French label punctuation uses a nonbreaking space', () => {
  assert.equal(punctuation('fr'), '\u00a0:');
  assert.equal(labelValue('Source', 'A', 'fr'), 'Source\u00a0: A');
  assert.equal(labelValue('Source', 'A', 'en'), 'Source: A');
});

test('HTML encoding prevents injected markup', () => {
  assert.equal(htmlEscape('<script x="y">&\'</script>'),
    '&lt;script x=&quot;y&quot;&gt;&amp;&#39;&lt;/script&gt;');
});

test('HTML encoding preserves intended French punctuation', () => {
  assert.equal(htmlEscape('«\u202ftexte\u202f»'), '«\u202ftexte\u202f»');
});

test('CSV escapes quotes and commas', () => {
  assert.equal(csvCell('one,"two"'), '"one,""two"""');
  assert.equal(csvCell('ordinary'), '"ordinary"');
});

test('CSV neutralises formula injection characters', () => {
  for (const value of ['=1+1', '+SUM(1,2)', '-4+5', '@ref', ' =1']) {
    assert.ok(csvCell(value).includes("'"), value);
  }
  assert.ok(!csvCell('example.org').includes("'"));
});

test('source lookup preserves exact stable IDs', () => {
  const lookup = sourceLookup(packet());
  assert.equal(lookup.get('s1').licence, 'CC0-1.0');
  assert.equal(lookup.get('absent'), undefined);
});

test('source description does not invent unknown citation', () => {
  assert.equal(sourceDescription(undefined, 'fr'), 'UNKNOWN');
});

test('source description includes all provenance dimensions', () => {
  const result = sourceDescription(source(), 'en');
  assert.ok(result.includes('https://example.org/s1'));
  assert.ok(result.includes('CC0-1.0'));
  assert.ok(result.includes('2026-11-19'));
  assert.ok(result.includes('Source tier: 0'));
});

test('French source description uses U+00A0 before colons', () => {
  const result = sourceDescription(source(), 'fr');
  assert.ok(result.includes('Licence\u00a0: CC0-1.0'));
  assert.ok(result.includes('Récupéré\u00a0: 2026-11-19'));
});

test('text handoff contains explicit cautious wording', () => {
  const text = formatTextHandoff(packet());
  assert.ok(text.includes(copyFor('en').caution));
  assert.ok(text.includes('UNKNOWN'));
});

test('French text handoff retains literal uppercase UNKNOWN', () => {
  const text = formatTextHandoff(packet(), 'fr');
  assert.ok(text.includes('UNKNOWN\u00a0: 1'));
  assert.ok(!text.includes('Déclarations inconnues'));
});

test('text rendering does not mutate input records', () => {
  const input = packet();
  const before = JSON.stringify(input);
  formatTextHandoff(input);
  assert.equal(JSON.stringify(input), before);
});

test('text formatting includes each field and record ID', () => {
  const input = packet();
  input.claims.push({ ...claim('c2', 'NO', 'r2'), field: 'elevator' });
  const output = formatTextHandoff(input);
  assert.ok(output.includes('r2'));
  assert.ok(output.includes('elevator'));
});

test('invalid state does not produce a publishable text report', () => {
  const input = packet();
  input.claims[0].state = 'CERTIFIED';
  assert.equal(formatTextHandoff(input), null);
});

test('invalid source licence prevents text export', () => {
  const input = packet();
  input.sources[0].licence = 'All rights reserved';
  assert.equal(formatTextHandoff(input), null);
});

test('CSV begins with escaped column headers', () => {
  const csv = formatCsvHandoff(packet());
  assert.ok(csv.startsWith('"Record","Field","State"'));
});

test('CSV rows terminate with CRLF for spreadsheet readers', () => {
  const csv = formatCsvHandoff(packet());
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('\r\n'));
});

test('CSV preserves literal UNKNOWN', () => {
  const csv = formatCsvHandoff(packet(), 'fr');
  assert.ok(csv.includes('"UNKNOWN"'));
});

test('CSV contains all cited provenance fields', () => {
  const csv = formatCsvHandoff(packet());
  assert.ok(csv.includes('"https://example.org/s1"'));
  assert.ok(csv.includes('"CC0-1.0"'));
  assert.ok(csv.includes('"2026-11-19"'));
});

test('CSV cannot silently export invalid records', () => {
  const input = packet();
  input.claims[0].sourceIds = ['missing'];
  assert.equal(formatCsvHandoff(input), null);
});

test('HTML export declares the chosen language', () => {
  assert.ok(formatHtmlHandoff(packet(), 'fr').includes('<html lang="fr">'));
  assert.ok(formatHtmlHandoff(packet(), 'en').includes('<html lang="en">'));
});

test('HTML document contains one main landmark', () => {
  const html = formatHtmlHandoff(packet());
  assert.equal((html.match(/<main\b/gu) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/gu) ?? []).length, 1);
});

test('HTML table headers use semantic scope', () => {
  const html = formatHtmlHandoff(packet());
  assert.ok(html.includes('scope="col"'));
  assert.ok(html.includes('scope="row"'));
});

test('HTML supports keyboard focus and visible outlines', () => {
  const html = formatHtmlHandoff(packet());
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(html.includes(':focus-visible'));
  assert.ok(html.includes('outline:3px solid'));
});

test('HTML uses a mobile viewport', () => {
  const html = formatHtmlHandoff(packet());
  assert.ok(html.includes('width=device-width, initial-scale=1'));
});

test('HTML carries non-endorsement caution near title', () => {
  const html = formatHtmlHandoff(packet());
  assert.ok(html.includes(copyFor('en').caution));
  assert.ok(html.indexOf(copyFor('en').caution) < html.indexOf('<table>'));
});

test('HTML avoids loading remote scripts and images', () => {
  const html = formatHtmlHandoff(packet());
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<iframe'));
});

test('HTML links are not fabricated from evidence citations', () => {
  const html = formatHtmlHandoff(packet());
  assert.ok(!html.includes('<a href='));
  assert.ok(html.includes('https://example.org/s1'));
});

test('HTML empty-state table has correct colspan', () => {
  const data = { version: 1, sources: [], claims: [], events: [] };
  const html = formatHtmlHandoff(data);
  assert.ok(html.includes('colspan="6"'));
  assert.ok(html.includes(copyFor('en').empty));
});

test('HTML does not accept an invalid privacy field', () => {
  const input = packet();
  input.claims[0].email = 'private@example.org';
  assert.equal(formatHtmlHandoff(input), null);
});

test('JSON export includes summary and original source references', () => {
  const output = JSON.parse(formatJsonHandoff(packet()));
  assert.equal(output.reviewItems.length, 1);
  assert.deepEqual(output.reviewItems[0].sourceIds, ['s1']);
  assert.equal(output.summary.states.UNKNOWN, 1);
});

test('JSON report includes no arbitrary source record payload', () => {
  const input = packet();
  input.sources[0].title = 'Synthetic citation only';
  const output = formatJsonHandoff(input);
  assert.ok(!output.includes('Synthetic citation only'));
});

test('JSON output is stable across identical runs', () => {
  assert.equal(formatJsonHandoff(packet()), formatJsonHandoff(packet()));
});

test('JSON export returns null when claim references are missing', () => {
  const input = packet();
  input.claims[0].sourceIds = ['missing'];
  assert.equal(formatJsonHandoff(input), null);
});

test('comparison of identical packets reports zero changes', () => {
  const result = compareTextHandoffs(packet(), packet());
  assert.ok(result.includes('Changes: 0'));
  assert.ok(result.includes(copyFor('en').noChanges));
});

test('comparison reports a state change without approving it', () => {
  const earlier = packet();
  const later = packet();
  later.claims[0].state = 'NO';
  const output = compareTextHandoffs(earlier, later);
  assert.ok(output.includes('STATE_CHANGED'));
  assert.ok(output.includes('UNKNOWN'));
});

test('French comparison uses nonbreaking colon spaces', () => {
  const output = compareTextHandoffs(packet(), packet(), 'fr');
  assert.ok(output.includes('Modifications\u00a0: 0'));
});

test('invalid comparison cannot produce a misleading report', () => {
  const after = packet();
  after.sources[0].tier = 'UNKNOWN';
  assert.equal(compareTextHandoffs(packet(), after), null);
});

test('grouped text lists record and claim without converting state', () => {
  const output = formatGroupedText(packet());
  assert.ok(output.includes('Record: r1'));
  assert.ok(output.includes('stepFreeEntrance: UNKNOWN'));
});

test('French grouped text uses a nonbreaking separator', () => {
  const output = formatGroupedText(packet(), 'fr');
  assert.ok(output.includes('Fiche\u00a0: r1'));
  assert.ok(output.includes('stepFreeEntrance\u00a0: UNKNOWN'));
});

test('grouped text rejects unsupported source metadata', () => {
  const input = packet();
  input.sources[0].url = 'http://example.org';
  assert.equal(formatGroupedText(input), null);
});

test('all exports have a stable count of seven files', () => {
  const result = exportAllHandoffFormats(packet());
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.files).length, 7);
});

test('all exports include both languages and machine-readable format', () => {
  const files = exportAllHandoffFormats(packet()).files;
  for (const file of ['handoff.en.txt', 'handoff.fr.txt', 'handoff.en.csv',
    'handoff.fr.csv', 'handoff.en.html', 'handoff.fr.html', 'handoff.json']) {
    assert.equal(typeof files[file], 'string');
  }
});

test('invalid bulk exports return no partial files', () => {
  const input = packet();
  input.events.push(event('e1', 'REVIEWED', 'absent'));
  const result = exportAllHandoffFormats(input);
  assert.equal(result.ok, false);
  assert.equal(result.files, null);
});

test('JSON import plus exports remains an offline pure operation', () => {
  const result = inspectExportedHandoff(JSON.stringify(packet()));
  assert.equal(result.ok, true);
  assert.ok(result.rendered['handoff.fr.txt'].includes('UNKNOWN'));
});

test('invalid JSON import does not produce any rendered output', () => {
  const result = inspectExportedHandoff('{invalid');
  assert.equal(result.ok, false);
  assert.equal(result.rendered, null);
});

test('export ignores no raw data leaks from unrequested keys', () => {
  const input = packet();
  input.claims[0].privateNotes = 'Not a permitted export column';
  const files = exportAllHandoffFormats(input).files;
  for (const output of Object.values(files)) {
    assert.ok(!output.includes('Not a permitted export column'));
  }
});
