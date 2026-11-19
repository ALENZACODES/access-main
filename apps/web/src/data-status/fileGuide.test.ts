import { describe, expect, it } from 'vitest';
import { parseCsv } from './consistency';
import type { DatasetRecord } from './datasetRegistry';
import { buildExportFiles } from './exportFiles';
import { buildFactsFile, buildMarkdownFile, buildSummaryFile, buildTablesFile } from './exportExtras';
import { FILE_GUIDE, FILE_IDS, FILE_SCOPES, fileDisplayName, fileGuideEntry, fileGuideFor, fileGuideRows, fileHolds, fileScopeText, renderFileGuideHtml } from './fileGuide';
import { handleDataStatus, matchRoute } from './http';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { isoDayOffset } from './round7Kit';
import { FakeHost, NOW, structureProblems } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url: `https://example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: [src('a'), src('b', { retrievedAt: isoDayOffset(NOW, -400), tier: 'E' }), src('c', { licence: null, tier: null, retrievedAt: null }), src('e', { retrievedAt: isoDayOffset(NOW, -500), tier: 2 })] },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('d')] },
];
const ctx = { getRecords: () => RECORDS, now: () => NOW };
const get = (url: string) => handleDataStatus({ method: 'GET', url, headers: {} }, ctx);

describe('the list itself', () => {
  it('has one entry per id, each with somewhere to get it', () => {
    expect(FILE_GUIDE.map((e) => e.id)).toEqual([...FILE_IDS]);
    for (const e of FILE_GUIDE) {
      expect(e.action !== null || e.route !== null, e.id).toBe(true);
      expect(FILE_SCOPES).toContain(e.scope);
      expect(fileGuideEntry(e.id)).toBe(e);
    }
  });
  it('has no two entries with the same name, button or address', () => {
    for (const pick of [(e: (typeof FILE_GUIDE)[number]) => fileDisplayName(e), (e: (typeof FILE_GUIDE)[number]) => e.action, (e: (typeof FILE_GUIDE)[number]) => e.route]) {
      const values = FILE_GUIDE.map(pick).filter((v) => v !== null);
      expect(new Set(values).size).toBe(values.length);
    }
  });
  it('splits by surface', () => {
    expect(fileGuideFor('live').every((e) => e.action !== null)).toBe(true);
    expect(fileGuideFor('static').every((e) => e.route !== null)).toBe(true);
    expect(fileGuideFor('live').length + fileGuideFor('static').length).toBeGreaterThan(FILE_GUIDE.length);
  });
  it('names a file by its saved name, or by its address when it opens in the browser', () => {
    expect(fileDisplayName(fileGuideEntry('sources'))).toBe('data-sources.csv');
    expect(fileDisplayName(fileGuideEntry('completeness'))).toBe('completeness.json');
  });
  it('describes every file and every scope in both languages, each differently', () => {
    for (const locale of ['en', 'fr'] as const) {
      expect(new Set(FILE_IDS.map((id) => fileHolds(id, locale))).size).toBe(FILE_IDS.length);
      expect(new Set(FILE_SCOPES.map((s) => fileScopeText(s, locale))).size).toBe(FILE_SCOPES.length);
    }
    for (const id of FILE_IDS) expect(lintFrench(fileHolds(id, 'fr')), id).toEqual([]);
    for (const s of FILE_SCOPES) expect(lintFrench(fileScopeText(s, 'fr')), s).toEqual([]);
  });
});

describe('against the live panel', () => {
  const host = new FakeHost();
  const files: { text: string; filename: string; mime: string }[] = [];
  const csvs: { csv: string; filename: string }[] = [];
  mountDataStatusPanel(host, {
    getRecords: () => RECORDS,
    getLocale: () => 'en',
    now: () => NOW,
    onExportFile: (f) => files.push(f),
    onExport: (csv, filename) => csvs.push({ csv, filename }),
    initialPivot: { rows: 'tier', cols: 'state' },
    initialBatch: 5,
  });
  const buttons = [...new Set([...host.innerHTML.matchAll(/data-action="(export-[a-z-]+)"/g)].map((m) => m[1] ?? ''))];

  it('lists every download button the panel draws, and no button the panel does not draw', () => {
    expect([...buttons].sort()).toEqual(
      fileGuideFor('live')
        .map((e) => e.action ?? '')
        .sort(),
    );
  });
  it('gives each file the name the guide says', async () => {
    for (const e of fileGuideFor('live')) {
      if (e.action === 'export-checksums') continue;
      files.length = 0;
      csvs.length = 0;
      host.click(e.action ?? '');
      const got = files[0]?.filename ?? csvs[0]?.filename;
      expect(got, e.id).toBe(e.filename);
    }
    // The checksum list is made asynchronously from the five main files.
    const main = buildExportFiles(RECORDS, 'en', NOW).map((f) => f.filename);
    expect(main).toHaveLength(5);
    for (const id of ['sources', 'credits', 'summaryJson', 'calendar', 'catalogue'] as const) expect(main).toContain(fileGuideEntry(id).filename);
  });
  it('agrees with the builders on the names of the files that cover every source', () => {
    expect(buildMarkdownFile(RECORDS, 'en', NOW).filename).toBe(fileGuideEntry('report').filename);
    expect(buildTablesFile(RECORDS, 'en', NOW).filename).toBe(fileGuideEntry('tables').filename);
    expect(buildFactsFile(RECORDS, 'en', NOW).filename).toBe(fileGuideEntry('facts').filename);
    expect(buildSummaryFile(RECORDS, 'en', NOW).filename).toBe(fileGuideEntry('textSummary').filename);
  });
  it('shows the guide for the live panel, with a row for each of its files', () => {
    const page = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(page).toContain(renderFileGuideHtml('live', 'en'));
    expect(page).toContain(`data-file-guide="${fileGuideFor('live').length}"`);
    expect(page).not.toContain('<code>credits.txt</code>');
  });
});

describe('against the server', () => {
  it('answers every address in the guide, in both languages', async () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const e of fileGuideFor('static')) {
        const res = await get(`/${locale}/data-status${e.route}`);
        expect(res?.status, `${locale} ${e.route}`).toBe(200);
        expect(matchRoute(`/${locale}/data-status${e.route}`)?.kind).not.toBe('html');
      }
    }
  });
  it('sends each file under the name the guide gives, where the server names it at all', async () => {
    for (const e of fileGuideFor('static')) {
      const res = await get(`/en/data-status${e.route}`);
      const named = /filename="([^"]+)"/.exec(res?.headers['content-disposition'] ?? '')?.[1];
      // A file the server sends without a name opens in the browser: the guide may still give
      // the name the live panel saves it under.
      if (named !== undefined) expect(named, e.id).toBe(e.filename === 'data-status-summary.txt' ? named : e.filename);
      if (e.filename === null) expect(named, e.id).toBeUndefined();
    }
  });
  it('sends the format the guide says', async () => {
    const types: Record<string, RegExp> = { CSV: /^text\/csv/, JSON: /^application\/json/, 'JSON-LD': /^application\/ld\+json/, Markdown: /^text\/markdown/, text: /^text\/plain/, iCalendar: /^text\/calendar/ };
    for (const e of fileGuideFor('static')) {
      const res = await get(`/en/data-status${e.route}`);
      expect(res?.headers['content-type'], e.id).toMatch(types[e.format]!);
    }
  });
  it('has no address that the guide leaves out', async () => {
    const page = await get('/en/data-status?pv=tier&batch=5');
    const linked = [...new Set([...page!.body.matchAll(/href="\/en\/data-status(\/[a-z-]+\.[a-z]+)/g)].map((m) => m[1] ?? ''))];
    expect(linked.length).toBeGreaterThan(10);
    const known = fileGuideFor('static').map((e) => e.route);
    for (const route of linked) expect(known, route).toContain(route);
  });
  it('what a file follows is what the guide says: a filter changes it only when it should', async () => {
    for (const e of fileGuideFor('static')) {
      const plain = await get(`/en/data-status${e.route}`);
      const filtered = await get(`/en/data-status${e.route}?state=stale`);
      const follows = e.scope !== 'all';
      expect(plain?.body !== filtered?.body, `${e.id} (${e.scope})`).toBe(follows);
    }
  });
  it('the order of the list changes only the files said to follow it', async () => {
    for (const e of fileGuideFor('static')) {
      const up = await get(`/en/data-status${e.route}?sort=tier`);
      const down = await get(`/en/data-status${e.route}?sort=tier&dir=desc`);
      const follows = e.scope === 'order' || e.scope === 'columns' || e.scope === 'sessions';
      expect(up?.body !== down?.body, `${e.id} (${e.scope})`).toBe(follows);
    }
  });
  it('the extra columns change only the files said to follow them', async () => {
    for (const e of fileGuideFor('static')) {
      const without = await get(`/en/data-status${e.route}`);
      const withCols = await get(`/en/data-status${e.route}?cols=kind,age`);
      expect(without?.body !== withCols?.body, `${e.id} (${e.scope})`).toBe(e.scope === 'columns');
    }
  });
  it('shows the guide for the server page, with a row for each address', async () => {
    const page = await get('/fr/data-status');
    expect(page!.body).toContain(renderFileGuideHtml('static', 'fr'));
    expect(page!.body).toContain('<code>credits.txt</code>');
    expect(page!.body).not.toContain('<code>checksums.txt</code>');
  });
});

describe('the section', () => {
  it('has a row per file with its name, format, contents and scope', () => {
    const rows = fileGuideRows('live', 'en');
    expect(rows[0]).toEqual(['File', 'Format', 'What it holds', 'What it follows']);
    expect(rows).toHaveLength(1 + fileGuideFor('live').length);
    expect(rows[1]).toEqual(['data-sources.csv', 'CSV', fileHolds('sources', 'en'), 'The filters of the list']);
    for (const r of rows) expect(r.every((c) => c.trim() !== '')).toBe(true);
    const html = renderFileGuideHtml('live', 'en');
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(rows.length - 1);
    expect(html.match(/<caption>/g)).toHaveLength(1);
  });
  it('marks the files that open in the browser, on the server page only', () => {
    expect(renderFileGuideHtml('static', 'en').match(/\(Opens in the browser\)/g)).toHaveLength(2);
    expect(renderFileGuideHtml('live', 'en')).not.toContain('Opens in the browser');
  });
  it('says how many files there are and how a missing fact is written', () => {
    const text = visibleText(renderFileGuideHtml('live', 'en'));
    expect(text).toContain(`${fileGuideFor('live').length} files.`);
    expect(text).toContain('written UNKNOWN');
  });
  it('passes the audits in both languages, on both surfaces and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const surface of ['live', 'static'] as const) {
        const html = renderFileGuideHtml(surface, locale);
        expect(scanHtml(html), `${locale} ${surface}`).toEqual([]);
        expect(structureProblems(html), `${locale} ${surface}`).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html.replace(/<code>.*?<\/code>/g, ''))), surface).toEqual([]);
      }
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      expect(page.match(/id="ds-files-title"/g)).toHaveLength(1);
      expect(page).toContain('<option value="ds-files-title">');
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
  it('the rows read back from CSV as written', () => {
    const rows = fileGuideRows('static', 'fr');
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    expect(parseCsv(csv)).toEqual(rows);
  });
});
