/** End-to-end release invocation: new gate failures must reject shipped bytes. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deepAudit, deepMain } from './deep-audit.mjs';

const baseHtml = (extra = '') => `<!doctype html><html lang="en"><head><title>The App</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>The App</h1>${extra}</main></body></html>`;
async function withBuild(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'access-release-round5-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const path = join(dir, name);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, contents, 'utf8');
    }
    return await run(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const failure = async (files, code) => withBuild(files, async (dir) => {
  const report = await deepAudit(dir);
  assert.ok(report.issues.some((issue) => issue.code === code),
    `Expected ${code}: ${JSON.stringify(report.issues)}`);
  const output = [];
  const exit = await deepMain(['--dir', dir], {
    error: (value) => output.push(String(value)), log: (value) => output.push(String(value)),
  });
  assert.equal(exit, 1);
  assert.ok(output.some((line) => line.includes(code)));
});

describe('release command wiring for the additional gate family', () => {
  it('rejects shipped SVG scripts', async () => failure({
    'index.html': baseHtml(),
    'icon.svg': '<svg><title>Icon</title><script>alert(1)</script></svg>',
  }, 'SVG_ACTIVE_ELEMENT'));
  it('rejects shipped external SVG images', async () => failure({
    'index.html': baseHtml(),
    'icon.svg': '<svg><title>Icon</title><image href="https://example.org/a.png"/></svg>',
  }, 'SVG_EXTERNAL_REFERENCE'));
  it('rejects unnamed SVG', async () => failure({
    'index.html': baseHtml(),
    'icon.svg': '<svg><path/></svg>',
  }, 'SVG_ACCESSIBLE_NAME'));
  it('rejects inline SVG event handlers', async () => failure({
    'index.html': baseHtml('<svg><title>Icon</title><path onclick="run()"/></svg>'),
  }, 'SVG_EVENT_HANDLER'));
  it('rejects missing table headers', async () => failure({
    'index.html': baseHtml('<table><caption>Places</caption><tr><td>A</td></tr></table>'),
  }, 'TABLE_HEADERS'));
  it('rejects broken headers references', async () => failure({
    'index.html': baseHtml('<table><caption>Places</caption><tr><th>A</th><td headers="none">B</td></tr></table>'),
  }, 'TABLE_HEADER_REFERENCE'));
  it('rejects empty table names', async () => failure({
    'index.html': baseHtml('<table><tr><th>Name</th></tr></table>'),
  }, 'TABLE_NAME'));
  it('rejects download targets outside the build', async () => failure({
    'index.html': baseHtml('<a href="missing.csv" download>Save</a>'),
  }, 'DOWNLOAD_TARGET'));
  it('rejects remote exports', async () => failure({
    'index.html': baseHtml('<a href="https://example.org/a.pdf" download>Save</a>'),
  }, 'DOWNLOAD_TARGET'));
  it('rejects spreadsheet formulas in shipped CSV', async () => failure({
    'index.html': baseHtml(), 'places.csv': 'name,status\nA,=1+2',
  }, 'DOWNLOAD_CSV_FORMULA'));
  it('rejects malformed CSV', async () => failure({
    'index.html': baseHtml(), 'places.csv': 'name\n"unterminated',
  }, 'DOWNLOAD_CSV_PARSE'));
  it('rejects incomplete bilingual export catalogue', async () => failure({
    'index.html': baseHtml(),
    'exports/catalogue.json': JSON.stringify({ exports: [{ filename: 'places.csv', mime: 'text/csv' }] }),
  }, 'DOWNLOAD_LOCALE'));
  it('rejects incomplete export provenance', async () => failure({
    'index.html': baseHtml(),
    'exports/catalogue.json': JSON.stringify({ exports: [{
      filename: 'places.csv', mime: 'text/csv', labels: { en: 'Places', fr: 'Lieux' },
      source: '', licence: '', date: '',
    }] }),
  }, 'DOWNLOAD_SOURCE'));
  it('rejects invalid exported map coordinates', async () => failure({
    'index.html': baseHtml(),
    'map.geojson': JSON.stringify({ type: 'Point', coordinates: [250, 42] }),
  }, 'GEO_COORDINATES'));
  it('rejects repeated map feature ids', async () => failure({
    'index.html': baseHtml(),
    'map.geojson': JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', id: 'a', geometry: null, properties: {} },
      { type: 'Feature', id: 'a', geometry: null, properties: {} },
    ] }),
  }, 'GEO_DUPLICATE_ID'));
  it('rejects unsourced YES claims in a map export', async () => failure({
    'index.html': baseHtml(),
    'map.geojson': JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: null, properties: { stepFreeEntrance: 'YES' } },
    ] }),
  }, 'GEO_SOURCE'));
  it('rejects an uncaptioned released video', async () => failure({
    'index.html': baseHtml('<video controls title="Demo" src="clip.mp4"></video>'),
    'clip.mp4': 'fixture',
  }, 'MEDIA_CAPTIONS'));
  it('rejects autoplay audio in released markup', async () => failure({
    'index.html': baseHtml('<audio controls autoplay src="audio.mp3"></audio>'),
    'audio.mp3': 'fixture',
  }, 'MEDIA_AUTOPLAY'));
  it('rejects malformed WebVTT release captions', async () => failure({
    'index.html': baseHtml(), 'en.vtt': 'not a caption file',
  }, 'MEDIA_VTT_HEADER'));
  it('allows valid document links through new checks', async () => withBuild({
    'index.html': baseHtml('<a href="places.csv" download="places.csv">Save</a>'),
    'places.csv': 'name,status\nA,UNKNOWN',
  }, async (dir) => {
    const issues = (await deepAudit(dir)).issues;
    assert.equal(issues.some((issue) => issue.code.startsWith('DOWNLOAD_') ||
      issue.code.startsWith('SVG_') || issue.code.startsWith('TABLE_')), false);
  }));
});
