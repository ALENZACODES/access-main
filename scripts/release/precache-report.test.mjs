import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRECACHE_FORMATS, PRECACHE_REPORT_MAX_BYTES, reportWords,
  htmlEscape, csvCell, colon, assetReportRows, textReport, csvReport,
  htmlReport, jsonReport, renderReport, changeReport,
} from './precache-report.mjs';

const SHA = 'a'.repeat(64);
const base = (id = 'item', changes = {}) => ({
  id, path: `${id}.json`, kind: 'data', group: 'offline-pack', locale: 'neutral',
  state: 'UNKNOWN', bytes: 6, sha256: SHA,
  source: 'https://example.org/source', licence: 'CC0-1.0',
  retrievedOn: '2026-11-19', tier: 0, dependsOn: [],
  label: { en: 'Synthetic asset', fr: 'Fichier fictif' }, ...changes,
});
const manifest = (...assets) => ({ version: 1, releaseId: 'sample', retrievedOn: '2026-11-19', assets });
const failures = result => result.errors.map(item => item.code);

test('reports have four supported formats', () => {
  assert.deepEqual(PRECACHE_FORMATS, ['text', 'html', 'csv', 'json']);
});
test('report byte ceiling is bounded', () => {
  assert.ok(PRECACHE_REPORT_MAX_BYTES <= 8_000_000);
});
test('English title describes review, not a field inspection', () => {
  assert.equal(reportWords('en').title, 'Offline release asset review');
});
test('French title describes offline asset review', () => {
  assert.equal(reportWords('fr').title, 'Examen des fichiers de publication hors ligne');
});
test('French unknown label is the literal UNKNOWN token', () => {
  assert.equal(reportWords('fr').unknown, 'UNKNOWN');
});
test('both languages have equivalent column keys', () => {
  assert.deepEqual(Object.keys(reportWords('en')), Object.keys(reportWords('fr')));
});
test('French source tier is expressed as source review', () => {
  assert.equal(reportWords('fr').tier, 'Niveau de contrôle des sources');
});
test('English source tier uses neutral review language', () => {
  assert.equal(reportWords('en').tier, 'Source review tier');
});
test('French colon has required nonbreaking space', () => {
  assert.equal(colon('fr'), '\u00A0:');
});
test('English colon has no prefix', () => {
  assert.equal(colon('en'), ':');
});
test('HTML escapes ampersands', () => {
  assert.equal(htmlEscape('a&b'), 'a&amp;b');
});
test('HTML escapes less-than and greater-than', () => {
  assert.equal(htmlEscape('<img>'), '&lt;img&gt;');
});
test('HTML escapes apostrophes and quotes', () => {
  assert.equal(htmlEscape(`a'b"c`), 'a&#39;b&quot;c');
});
test('HTML escapes null input without inserting null', () => {
  assert.equal(htmlEscape(null), '');
});
test('CSV doubles internal quotes', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
});
test('CSV guards equals-leading formula', () => {
  assert.equal(csvCell('=2+2'), '"\'=2+2"');
});
test('CSV guards plus-leading formula', () => {
  assert.equal(csvCell('+SUM(A1)'), '"\'+SUM(A1)"');
});
test('CSV guards minus-leading formula', () => {
  assert.equal(csvCell('-2+3'), '"\'-2+3"');
});
test('CSV guards at-leading formula', () => {
  assert.equal(csvCell('@cmd'), '"\'@cmd"');
});
test('CSV guards leading spaces followed by formula', () => {
  assert.equal(csvCell('  =2'), '"\'  =2"');
});
test('CSV strips multiline content from cells', () => {
  assert.equal(csvCell('line\nother\rrow'), '"line other row"');
});
test('CSV does not modify ordinary letters', () => {
  assert.equal(csvCell('UNKNOWN'), '"UNKNOWN"');
});
test('CSV preserves Unicode text', () => {
  assert.equal(csvCell('Fichier fictif'), '"Fichier fictif"');
});

test('row projection has all required provenance fields', () => {
  const result = assetReportRows(manifest(base()));
  assert.equal(result.ok, true);
  const row = result.rows[0];
  assert.equal(row.source, 'https://example.org/source');
  assert.equal(row.licence, 'CC0-1.0');
  assert.equal(row.retrievedOn, '2026-11-19');
  assert.equal(row.tier, 0);
});
test('row projection keeps UNKNOWN without assuming a YES', () => {
  const result = assetReportRows(manifest(base()));
  assert.equal(result.rows[0].state, 'UNKNOWN');
});
test('row projection sorts by stable identifier', () => {
  const result = assetReportRows(manifest(base('z'), base('a')));
  assert.deepEqual(result.rows.map(item => item.id), ['a', 'z']);
});
test('French row projection uses French label', () => {
  const result = assetReportRows(manifest(base()), 'fr');
  assert.equal(result.rows[0].label, 'Fichier fictif');
});
test('English row projection uses English label', () => {
  const result = assetReportRows(manifest(base()), 'en');
  assert.equal(result.rows[0].label, 'Synthetic asset');
});
test('invalid manifest does not return partial rows', () => {
  const result = assetReportRows(manifest({ ...base(), source: '' }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.rows, []);
});

test('text report presents the source for each item', () => {
  const result = textReport(manifest(base()));
  assert.equal(result.ok, true);
  assert.ok(result.content.includes('Source: https://example.org/source'));
});
test('text report contains source tier metadata', () => {
  const result = textReport(manifest(base()));
  assert.ok(result.content.includes('Source review tier: 0'));
});
test('French text report uses nonbreaking colon', () => {
  const result = textReport(manifest(base()), 'fr');
  assert.ok(result.content.includes('Source\u00A0: https://example.org/source'));
});
test('French text report does not use English title', () => {
  const result = textReport(manifest(base()), 'fr');
  assert.ok(!result.content.startsWith(reportWords('en').title));
});
test('English text report keeps stated caution', () => {
  const result = textReport(manifest(base()));
  assert.ok(result.content.includes(reportWords('en').caution));
});
test('French text report keeps stated caution', () => {
  const result = textReport(manifest(base()), 'fr');
  assert.ok(result.content.includes(reportWords('fr').caution));
});
test('empty text report has no invented records', () => {
  const result = textReport(manifest());
  assert.ok(result.content.includes('No records.'));
});

test('English CSV begins with English localized headers', () => {
  const report = csvReport(manifest(base()), 'en');
  assert.equal(report.ok, true);
  assert.ok(report.content.startsWith('"Asset","File path","Cache group","Language"'));
});
test('French CSV begins with French localized headers', () => {
  const report = csvReport(manifest(base()), 'fr');
  assert.ok(report.content.startsWith('"Fichier","Chemin du fichier","Groupe du cache","Langue"'));
});
test('French CSV contains French tier header', () => {
  const report = csvReport(manifest(base()), 'fr');
  assert.ok(report.content.split('\r\n')[0].includes('Niveau de contrôle des sources'));
});
test('CSV rows end with CRLF', () => {
  const report = csvReport(manifest(base()));
  assert.ok(report.content.endsWith('\r\n'));
});
test('French CSV row carries localized label', () => {
  const report = csvReport(manifest(base()), 'fr');
  assert.ok(report.content.includes('"Fichier fictif"'));
});
test('English CSV row carries original source citation', () => {
  const report = csvReport(manifest(base()));
  assert.ok(report.content.includes('"https://example.org/source"'));
});
test('CSV neutralizes a formula-like identifier', () => {
  const report = csvReport(manifest(base('a', { label: { en: '=SUM(1)', fr: 'Fichier fictif' } })));
  assert.ok(report.content.includes('"\'=SUM(1)"'));
});
test('invalid CSV report fails closed', () => {
  const report = csvReport(manifest({ ...base(), licence: '' }));
  assert.equal(report.ok, false);
  assert.equal(report.content, null);
});

test('English HTML has the lang attribute', () => {
  const report = htmlReport(manifest(base()), 'en');
  assert.ok(report.content.includes('<html lang="en">'));
});
test('French HTML has the lang attribute', () => {
  const report = htmlReport(manifest(base()), 'fr');
  assert.ok(report.content.includes('<html lang="fr">'));
});
test('HTML includes main landmark', () => {
  const report = htmlReport(manifest(base()));
  assert.ok(report.content.includes('<main>'));
  assert.ok(report.content.includes('</main>'));
});
test('HTML includes table caption and scope of headers', () => {
  const report = htmlReport(manifest(base()));
  assert.ok(report.content.includes('<caption>'));
  assert.ok(report.content.includes('<th scope="col">'));
});
test('HTML has viewport declaration', () => {
  const report = htmlReport(manifest(base()));
  assert.ok(report.content.includes('name="viewport"'));
});
test('HTML has UTF-8 encoding', () => {
  const report = htmlReport(manifest(base()));
  assert.ok(report.content.includes('charset="utf-8"'));
});
test('HTML encodes user-supplied ampersands in labels', () => {
  const changed = base('a', { label: { en: 'A & B', fr: 'A et B' } });
  const report = htmlReport(manifest(changed));
  assert.ok(report.content.includes('A &amp; B'));
});
test('HTML encodes user-supplied tags rather than rendering them', () => {
  const changed = base('a', { label: { en: '<script>x</script>', fr: 'Fichier fictif' } });
  const report = htmlReport(manifest(changed));
  assert.ok(report.content.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!report.content.includes('<script>x</script>'));
});
test('French HTML uses translated column headings', () => {
  const report = htmlReport(manifest(base()), 'fr');
  assert.ok(report.content.includes('Chemin du fichier'));
  assert.ok(report.content.includes('Niveau de contrôle des sources'));
});
test('HTML preserves UNKNOWN as text', () => {
  const report = htmlReport(manifest(base()), 'fr');
  assert.ok(report.content.includes('UNKNOWN'));
});
test('empty HTML explicitly states there are no records', () => {
  const report = htmlReport(manifest(), 'fr');
  assert.ok(report.content.includes('Aucune donnée.'));
});

test('JSON export includes source and licence', () => {
  const report = jsonReport(manifest(base()));
  const output = JSON.parse(report.content);
  assert.equal(output.rows[0].source, 'https://example.org/source');
  assert.equal(output.rows[0].licence, 'CC0-1.0');
});
test('JSON export carries UNKNOWN token', () => {
  const report = jsonReport(manifest(base()));
  assert.equal(JSON.parse(report.content).state, 'UNKNOWN');
});
test('JSON export carries language code', () => {
  const report = jsonReport(manifest(base()), 'fr');
  assert.equal(JSON.parse(report.content).language, 'fr');
});
test('JSON export preserves stable release ID', () => {
  const report = jsonReport(manifest(base()));
  assert.equal(JSON.parse(report.content).releaseId, 'sample');
});
test('JSON export retains explicit disclaimer', () => {
  const report = jsonReport(manifest(base()), 'fr');
  assert.equal(JSON.parse(report.content).disclaimer, reportWords('fr').caution);
});

test('render selector chooses CSV', () => {
  assert.ok(renderReport(manifest(base()), { format: 'csv' }).content.startsWith('"Asset"'));
});
test('render selector chooses HTML', () => {
  assert.ok(renderReport(manifest(base()), { format: 'html' }).content.startsWith('<!doctype html>'));
});
test('render selector chooses JSON', () => {
  assert.equal(JSON.parse(renderReport(manifest(base()), { format: 'json' }).content).state, 'UNKNOWN');
});
test('render selector chooses text by default', () => {
  assert.ok(renderReport(manifest(base())).content.startsWith('Offline release asset review'));
});
test('invalid report format is refused', () => {
  const result = renderReport(manifest(base()), { format: 'pdf' });
  assert.equal(result.ok, false);
  assert.ok(failures(result).includes('REPORT_FORMAT'));
});
test('invalid language is refused', () => {
  const result = renderReport(manifest(base()), { lang: 'es' });
  assert.equal(result.ok, false);
  assert.ok(failures(result).includes('REPORT_LOCALE'));
});

test('text delta retains UNKNOWN marker', () => {
  const report = changeReport(manifest(base()), manifest(base('a', { state: 'MISSING' })));
  assert.ok(report.content.includes('UNKNOWN'));
});
test('French text delta has French caution', () => {
  const report = changeReport(manifest(base()), manifest(base('a', { state: 'MISSING' })), { lang: 'fr' });
  assert.ok(report.content.includes(reportWords('fr').caution));
});
test('CSV delta has English column names', () => {
  const report = changeReport(manifest(), manifest(base()), { format: 'csv' });
  assert.ok(report.content.startsWith('"Asset","Change","Earlier record","Later record"'));
});
test('CSV delta has French column names', () => {
  const report = changeReport(manifest(), manifest(base()), { format: 'csv', lang: 'fr' });
  assert.ok(report.content.startsWith('"Fichier","Changement","Donnée antérieure","Donnée récente"'));
});
test('HTML delta includes a main landmark', () => {
  const report = changeReport(manifest(), manifest(base()), { format: 'html' });
  assert.ok(report.content.includes('<main>'));
});
test('French HTML delta sets lang=fr', () => {
  const report = changeReport(manifest(), manifest(base()), { format: 'html', lang: 'fr' });
  assert.ok(report.content.includes('lang="fr"'));
});
test('JSON delta can be parsed', () => {
  const report = changeReport(manifest(), manifest(base()), { format: 'json' });
  assert.equal(JSON.parse(report.content).changes[0].kind, 'added');
});
test('JSON delta preserves UNKNOWN', () => {
  const report = changeReport(manifest(), manifest(base()), { format: 'json', lang: 'fr' });
  assert.equal(JSON.parse(report.content).state, 'UNKNOWN');
});
test('invalid before manifest stops delta export', () => {
  const result = changeReport(manifest({ ...base(), tier: 'UNKNOWN' }), manifest(base()));
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
});
test('invalid after manifest stops delta export', () => {
  const result = changeReport(manifest(base()), manifest({ ...base(), source: '' }));
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
});
test('unsupported delta format is refused', () => {
  const report = changeReport(manifest(), manifest(base()), { format: 'xml' });
  assert.equal(report.ok, false);
});
test('rendered reports do not mutate input manifests', () => {
  const input = manifest(base());
  const snapshot = JSON.stringify(input);
  for (const format of PRECACHE_FORMATS) renderReport(input, { format, lang: 'fr' });
  assert.equal(JSON.stringify(input), snapshot);
});
test('all formats are deterministic across repeated calls', () => {
  const input = manifest(base());
  for (const format of PRECACHE_FORMATS) {
    assert.equal(renderReport(input, { format, lang: 'fr' }).content,
      renderReport(input, { format, lang: 'fr' }).content);
  }
});
