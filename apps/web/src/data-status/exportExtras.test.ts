import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExportFiles } from './exportFiles';
import { buildChecksumFile, buildMarkdownFile, EXTRA_EXPORT_IDS, extraLabel } from './exportExtras';
import { lintFrench } from './i18n';
import { parseManifestText, verifyManifest } from './manifest';
import { auditRegistry } from './datasetRegistry';
import { buildMarkdownReport } from './markdownReport';
import { NOW, RECORDS } from './testkit';

afterEach(() => vi.unstubAllGlobals());

describe('labels', () => {
  it('names both files in both languages', () => {
    expect(EXTRA_EXPORT_IDS).toEqual(['markdown', 'checksums']);
    expect(extraLabel('markdown', 'en')).toBe('Download the audit report (Markdown)');
    expect(extraLabel('checksums', 'en')).toBe('Download the checksum list (text)');
    expect(extraLabel('markdown', 'fr')).toBe('Télécharger le rapport d’audit (Markdown)');
    expect(extraLabel('checksums', 'fr')).toBe('Télécharger la liste des sommes de contrôle (texte)');
  });
  it('passes the French typography check', () => {
    for (const id of EXTRA_EXPORT_IDS) expect(lintFrench(extraLabel(id, 'fr'))).toEqual([]);
  });
});

describe('buildMarkdownFile', () => {
  it('is the audit report for the same records, with a Markdown name and type', () => {
    const f = buildMarkdownFile(RECORDS, 'en', NOW);
    expect(f.id).toBe('markdown');
    expect(f.filename).toBe('data-status.md');
    expect(f.mime).toBe('text/markdown;charset=utf-8');
    expect(f.text).toBe(buildMarkdownReport(auditRegistry(RECORDS, NOW), NOW, 'en'));
  });
  it('follows the language and the thresholds it is given', () => {
    const fr = buildMarkdownFile(RECORDS, 'fr', NOW);
    expect(fr.text.startsWith('# État des données\n')).toBe(true);
    expect(fr.label).toBe(extraLabel('markdown', 'fr'));
    const tight = buildMarkdownFile(RECORDS, 'en', NOW, { places: 5 });
    expect(tight.text).toContain('| Sources possibly out of date | 2 |');
    expect(buildMarkdownFile(RECORDS, 'en', NOW).text).toContain('| Sources possibly out of date | 1 |');
  });
  it('is a valid empty report for no records', () => {
    expect(buildMarkdownFile([], 'en', NOW).text).toContain('There are no sources.');
  });
});

describe('buildChecksumFile', () => {
  const files = buildExportFiles(RECORDS, 'en', NOW);
  it('lists every file with a checksum that verifies against the files', async () => {
    const f = await buildChecksumFile(files, 'en');
    expect(f?.filename).toBe('checksums.txt');
    expect(f?.mime).toBe('text/plain;charset=utf-8');
    const parsed = parseManifestText(f?.text ?? '');
    expect(parsed.ok).toBe(true);
    const entries = parsed.ok ? parsed.entries : [];
    expect(entries).toHaveLength(files.length);
    const verified = await verifyManifest({ entries: entries.map((e) => ({ ...e, bytes: 0 })) }, files);
    expect(verified?.ok).toBe(true);
  });
  it('differs when a file differs', async () => {
    const a = await buildChecksumFile(files, 'en');
    const b = await buildChecksumFile(files.map((x, i) => (i === 0 ? { ...x, text: `${x.text}!` } : x)), 'en');
    expect(a?.text).not.toBe(b?.text);
  });
  it('is null when the browser has no Web Crypto', async () => {
    vi.stubGlobal('crypto', {});
    expect(await buildChecksumFile(files, 'en')).toBeNull();
  });
  it('is null for an unsafe file name', async () => {
    expect(await buildChecksumFile([{ filename: '../x', text: '' }], 'en')).toBeNull();
  });
});
