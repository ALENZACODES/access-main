import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  downloadableSuffix, safeDownloadName, resolveDownload, inspectDownloadAnchors,
  inspectExportManifest, parseCsv, inspectCsv,
} from './download-audit.mjs';

const files = new Set(['en/index.html', 'en/places.csv', 'fr/places.csv',
  'downloads/guide.pdf', 'exports/map.geojson', 'exports/notes.txt']);
const has = (issues, code) => assert.ok(issues.some((item) => item.code === code),
  `Expected ${code}, got: ${issues.map((item) => item.code).join(', ')}`);
const exported = (overrides = {}) => ({
  filename: 'places.csv', path: '../en/places.csv', mime: 'text/csv',
  labels: { en: 'Places', fr: 'Lieux' }, source: 'Local demonstration',
  licence: 'CC0-1.0', date: '2026-11-15', ...overrides,
});

describe('download paths', () => {
  it('reads extensions ignoring URL fragments', () => assert.equal(downloadableSuffix('places.csv?x=1#row'), '.csv'));
  it('lowercases extensions', () => assert.equal(downloadableSuffix('A.PDF'), '.pdf'));
  it('accepts a shipped file', () => assert.deepEqual(resolveDownload('en/index.html', 'places.csv', files), { kind: 'local', path: 'en/places.csv' }));
  it('accepts a parent-relative file', () => assert.deepEqual(resolveDownload('en/index.html', '../downloads/guide.pdf', files), { kind: 'local', path: 'downloads/guide.pdf' }));
  it('rejects a path escape', () => assert.equal(resolveDownload('en/index.html', '../../private.csv', files).kind, 'escape'));
  it('rejects a missing file', () => assert.equal(resolveDownload('en/index.html', 'none.csv', files).kind, 'missing'));
  it('rejects a remote file', () => assert.equal(resolveDownload('en/index.html', 'https://example.org/file.csv', files).kind, 'remote'));
  it('rejects a protocol-relative file', () => assert.equal(resolveDownload('en/index.html', '//example.org/file.csv', files).kind, 'remote'));
  it('rejects an absolute path', () => assert.equal(resolveDownload('en/index.html', '/places.csv', files).kind, 'absolute'));
  it('rejects invalid percent encoding', () => assert.equal(resolveDownload('en/index.html', '%XX.csv', files).kind, 'invalid'));
  it('rejects a null byte', () => assert.equal(resolveDownload('en/index.html', 'x%00.csv', files).kind, 'invalid'));
  it('recognizes generated downloads', () => assert.equal(resolveDownload('en/index.html', 'blob:abcdef', files).kind, 'runtime'));
  it('recognizes fragments', () => assert.equal(resolveDownload('en/index.html', '#table', files).kind, 'fragment'));
  it('recognizes blank paths', () => assert.equal(resolveDownload('en/index.html', '', files).kind, 'empty'));
});

describe('download filenames', () => {
  for (const name of ['places.csv', 'Guide FR.pdf', 'carte (1).geojson', 'notes_2026.txt', 'Éléments.csv']) {
    it(`accepts ${name}`, () => assert.equal(safeDownloadName(name), true));
  }
  for (const name of ['', '..', '../file.csv', 'a/b.csv', 'a\\b.csv', 'hello\n.csv',
    'private.csv', '.env', '.env.production', 'token.csv', 'secrets.json',
    'file.exe', 'file.sh', 'file.cmd', 'file.apk', 'file;rm.csv', 'report..csv']) {
    it(`rejects unsafe name ${JSON.stringify(name)}`, () => assert.equal(safeDownloadName(name), false));
  }
  it('rejects non-string filename', () => assert.equal(safeDownloadName(null), false));
});

describe('HTML export links', () => {
  it('accepts a local CSV download', () => assert.deepEqual(inspectDownloadAnchors('<a href="places.csv" download="places.csv">Export</a>', 'en/index.html', files), []));
  it('accepts a local PDF download', () => assert.deepEqual(inspectDownloadAnchors('<a href="../downloads/guide.pdf" download>Guide</a>', 'en/index.html', files), []));
  it('accepts a named blob export', () => assert.deepEqual(inspectDownloadAnchors('<a href="blob:123" download="places.csv">Export</a>', 'en/index.html', files), []));
  it('rejects an unnamed blob export', () => has(inspectDownloadAnchors('<a href="blob:123" download>Export</a>', 'en/index.html', files), 'DOWNLOAD_RUNTIME_NAME'));
  it('rejects remote downloads', () => has(inspectDownloadAnchors('<a href="https://example.org/a.pdf" download>Download</a>', 'en/index.html', files), 'DOWNLOAD_TARGET'));
  it('rejects path traversal', () => has(inspectDownloadAnchors('<a href="../../private.csv" download>Download</a>', 'en/index.html', files), 'DOWNLOAD_TARGET'));
  it('rejects unshipped documents', () => has(inspectDownloadAnchors('<a href="missing.pdf" download>Download</a>', 'en/index.html', files), 'DOWNLOAD_TARGET'));
  it('rejects unsupported extensions', () => has(inspectDownloadAnchors('<a href="index.html" download="index.exe">Download</a>', 'en/index.html', files), 'DOWNLOAD_NAME'));
  it('rejects mismatched extension', () => has(inspectDownloadAnchors('<a href="places.csv" download="places.pdf">Download</a>', 'en/index.html', files), 'DOWNLOAD_EXTENSION'));
  it('rejects unsafe filename', () => has(inspectDownloadAnchors('<a href="places.csv" download="../places.csv">Download</a>', 'en/index.html', files), 'DOWNLOAD_NAME'));
  it('ignores ordinary navigation links', () => assert.deepEqual(inspectDownloadAnchors('<a href="https://example.org">More</a>', 'en/index.html', files), []));
  it('ignores elements without download', () => assert.deepEqual(inspectDownloadAnchors('<button>Save</button>', 'en/index.html', files), []));
});

describe('structured export inventories', () => {
  it('accepts complete bilingual export metadata', () => assert.deepEqual(inspectExportManifest({ exports: [exported()] }, 'exports/catalogue.json', files), []));
  it('accepts absent exports field', () => assert.deepEqual(inspectExportManifest({ settings: {} }, 'exports/catalogue.json', files), []));
  it('rejects non-array exports', () => has(inspectExportManifest({ exports: {} }, 'exports/catalogue.json', files), 'DOWNLOAD_MANIFEST_SHAPE'));
  it('rejects a non-object entry', () => has(inspectExportManifest({ exports: [null] }, 'exports/catalogue.json', files), 'DOWNLOAD_ENTRY'));
  it('rejects missing filename', () => has(inspectExportManifest({ exports: [exported({ filename: '' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_MANIFEST_NAME'));
  it('rejects duplicate filenames', () => has(inspectExportManifest({ exports: [exported(), exported()] }, 'exports/catalogue.json', files), 'DOWNLOAD_DUPLICATE'));
  it('rejects unsupported file format', () => has(inspectExportManifest({ exports: [exported({ filename: 'installer.exe' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_MANIFEST_NAME'));
  it('rejects mismatched MIME', () => has(inspectExportManifest({ exports: [exported({ mime: 'application/pdf' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_MIME'));
  it('rejects missing English translation', () => has(inspectExportManifest({ exports: [exported({ labels: { en: '', fr: 'Lieux' } })] }, 'exports/catalogue.json', files), 'DOWNLOAD_LOCALE'));
  it('rejects missing French translation', () => has(inspectExportManifest({ exports: [exported({ labels: { en: 'Places' } })] }, 'exports/catalogue.json', files), 'DOWNLOAD_LOCALE'));
  it('rejects absent source', () => has(inspectExportManifest({ exports: [exported({ source: '' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_SOURCE'));
  it('rejects absent licence', () => has(inspectExportManifest({ exports: [exported({ licence: '' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_LICENCE'));
  it('rejects absent date', () => has(inspectExportManifest({ exports: [exported({ date: '' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_DATE'));
  it('rejects closed export licence', () => has(inspectExportManifest({ exports: [exported({ licence: 'All rights reserved' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_LICENCE'));
  it('rejects impossible publication date', () => has(inspectExportManifest({ exports: [exported({ date: '2026-02-30' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_DATE'));
  it('rejects unshipped reference', () => has(inspectExportManifest({ exports: [exported({ path: 'missing.csv' })] }, 'exports/catalogue.json', files), 'DOWNLOAD_MANIFEST_TARGET'));
  it('supports no entries', () => assert.deepEqual(inspectExportManifest({ exports: [] }, 'exports/catalogue.json', files), []));
});

describe('CSV parser', () => {
  it('handles plain rows', () => assert.deepEqual(parseCsv('name,status\nA,UNKNOWN'), [['name', 'status'], ['A', 'UNKNOWN']]));
  it('handles CRLF', () => assert.deepEqual(parseCsv('name\r\nA\r\n'), [['name'], ['A']]));
  it('handles quoted commas', () => assert.deepEqual(parseCsv('name\n"A, B"'), [['name'], ['A, B']]));
  it('handles doubled quotes', () => assert.deepEqual(parseCsv('name\n"A ""quote"""'), [['name'], ['A "quote"']]));
  it('handles quoted newlines', () => assert.deepEqual(parseCsv('name\n"A\nB"'), [['name'], ['A\nB']]));
  it('handles a BOM', () => assert.deepEqual(parseCsv('\uFEFFname\nA'), [['name'], ['A']]));
  it('handles trailing comma', () => assert.deepEqual(parseCsv('a,b,'), [['a', 'b', '']]));
  it('rejects an unclosed quote', () => assert.throws(() => parseCsv('a\n"b'), SyntaxError));
  it('rejects content after a closing quote', () => assert.throws(() => parseCsv('"a"x'), SyntaxError));
  it('rejects quotes in unquoted fields', () => assert.throws(() => parseCsv('a"b'), SyntaxError));
  it('rejects non-text input', () => assert.throws(() => parseCsv(null), TypeError));
});

describe('CSV safety', () => {
  it('accepts a simple CSV', () => assert.deepEqual(inspectCsv('name,status\nLibrary,UNKNOWN'), []));
  it('accepts quoted commas', () => assert.deepEqual(inspectCsv('name,status\n"Library, West",UNKNOWN'), []));
  it('accepts negative numeric measurements', () => assert.deepEqual(inspectCsv('value\n-2.5'), []));
  it('rejects empty CSV', () => has(inspectCsv(''), 'DOWNLOAD_CSV_EMPTY'));
  it('rejects empty headers', () => has(inspectCsv(',status\nA,UNKNOWN'), 'DOWNLOAD_CSV_HEADER'));
  it('rejects duplicated headers', () => has(inspectCsv('name,name\nA,B'), 'DOWNLOAD_CSV_DUPLICATE'));
  it('rejects inconsistent widths', () => has(inspectCsv('name,status\nA'), 'DOWNLOAD_CSV_COLUMNS'));
  for (const formula of ['=1+1', '+SUM(1)', '@NOW()', '-cmd', '\t=1+2', '\r=1+2']) {
    it(`rejects formula-like content ${JSON.stringify(formula)}`, () => has(inspectCsv(`name\n"${formula}"`), 'DOWNLOAD_CSV_FORMULA'));
  }
  it('rejects a malformed CSV', () => has(inspectCsv('name\n"unterminated'), 'DOWNLOAD_CSV_PARSE'));
  it('reports the actual file', () => assert.equal(inspectCsv('name\n=1+1', 'en/places.csv')[0].file, 'en/places.csv'));
});
