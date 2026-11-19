import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';
import { buildRouteAudit, makeReport, renderHtml, renderText } from './report.js';
import { t } from './types.js';

/**
 * French copy of this module names the status with the token UNKNOWN, the
 * same as English, and never with a translated word. This test reads the
 * source files, so a new message cannot bring the word back unnoticed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WORD = /inconnu/i;

/**
 * Lines that may hold the word because they are data, not copy: the
 * spellings a data file might use where it should say "unknown", which the
 * provenance check has to recognise in order to refuse them.
 */
const DATA_LINES: readonly { readonly file: string; readonly includes: string }[] = [
  { file: 'provenance.ts', includes: 'const UNKNOWN_SPELLINGS = new Set(' },
  { file: 'provenance.test.ts', includes: 'rejects %j as a spelling of unknown' },
  { file: 'fr-wording.test.ts', includes: '' },
  { file: 'cli-extras.test.ts', includes: 'without the banned French word' },
  { file: 'plan-cli.test.ts', includes: 'not.toMatch(' },
];

describe('French wording of the status', () => {
  const files = readdirSync(HERE).filter((f) => /\.(ts|mjs|md)$/.test(f));

  it('reads the source files of the module', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('report.ts');
  });

  it('never uses a translated word for UNKNOWN in copy', () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(join(HERE, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!WORD.test(line)) return;
        if (DATA_LINES.some((d) => d.file === file && line.includes(d.includes))) return;
        hits.push(`${file}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('keeps every exception pointing at a real line', () => {
    for (const d of DATA_LINES.filter((x) => x.includes !== '')) {
      const text = readFileSync(join(HERE, d.file), 'utf8');
      expect(text.split('\n').some((line) => line.includes(d.includes)), d.file).toBe(true);
    }
  });

  it('prints UNKNOWN in the French text, HTML and Markdown reports', () => {
    const report = makeReport(
      [buildRouteAudit('/', 320, { contrast: { checked: 2, entries: [{ check: 'contrast', id: 'h1[0]', status: 'unknown', message: t('The backdrop is an image.', 'L’arrière-plan est une image.'), rule: 'image' }] } })],
      new Date('2026-11-19T10:00:00Z'),
    );
    for (const out of [renderText(report, 'fr'), renderHtml(report, 'fr'), renderMarkdown(report, 'fr')]) {
      expect(out).toContain('UNKNOWN');
      expect(out).not.toMatch(WORD);
    }
  });
});
