import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { FILE_CHECK_IDS, fileCheckName, fileCheckResult, fileChecksSummary, fileCheckWhat, renderFileChecksHtml, runFileChecks, type FileCheck, type FileChecks } from './fileChecks';
import { FILE_GUIDE } from './fileGuide';
import { applyFilters, NO_FILTERS, type Filters } from './filters';
import { handleDataStatus } from './http';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { buildChecklist } from './reviewChecklist';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, structureProblems } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url: `https://example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a'),
      src('b', { tier: 'E', retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }),
      src('bare', { name: null, source: null, url: null, licence: null, retrievedAt: null, tier: null }),
      src('odd', { name: 'Pipes | and, "quotes"\nnew line\n- [ ] not a box' }),
      src('soon', { retrievedAt: isoDayOffset(NOW, -175) }),
    ],
  },
  { id: 'r', name: 'Dataset: Routes', kind: 'routes', sources: [src('c', { retrievedAt: isoDayOffset(NOW, -300) }), src('d')] },
];
const run = (records: DatasetRecord[], f: Filters = NO_FILTERS, locale: 'en' | 'fr' = 'en') => runFileChecks(records, auditRegistry(records, NOW, {}), f, NOW, locale);
const byId = (d: FileChecks, id: (typeof FILE_CHECK_IDS)[number]) => d.checks.find((c) => c.id === id)!;

describe('runFileChecks', () => {
  it('runs every check, in the fixed order', () => {
    expect(run(RECORDS).checks.map((c) => c.id)).toEqual([...FILE_CHECK_IDS]);
  });
  it('every file agrees with the list, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const d = run(RECORDS, NO_FILTERS, locale);
      expect(d.checks.filter((c) => !c.ok), locale).toEqual([]);
      expect(d).toMatchObject({ ok: true, failed: 0 });
    }
  });
  it('expects what the list gives: sources, steps, sources with something to do, records', () => {
    const audit = auditRegistry(RECORDS, NOW, {});
    const checklist = buildChecklist(audit, NO_FILTERS, 'en');
    const d = run(RECORDS);
    expect(byId(d, 'sourcesCsv').expected).toBe(7);
    expect(byId(d, 'listedJson').expected).toBe(7);
    expect(byId(d, 'listedMd').found).toBe(7);
    expect(byId(d, 'listedTxt').found).toBe(7);
    expect(byId(d, 'checklistCsv').expected).toBe(checklist.taskCount);
    expect(byId(d, 'checklistMd').found).toBe(checklist.taskCount);
    expect(byId(d, 'sessionSources').expected).toBe(checklist.entries.length);
    expect(byId(d, 'sessionSteps').found).toBe(checklist.taskCount);
    expect(byId(d, 'counts').found).toBe(7);
    expect(byId(d, 'facts').expected).toBe(7);
    expect(checklist.taskCount).toBeGreaterThan(checklist.entries.length);
  });
  it('is not fooled by names that look like table lines, tick boxes or CSV cells', () => {
    const tricky: DatasetRecord[] = [
      { id: 'x', name: '| A | B |', kind: 'places', sources: [src('a', { name: '- [ ] box', retrievedAt: isoDayOffset(NOW, -400) }), src('b', { name: '| pipe |\n| second |' }), src('c', { name: 'Dataset: x', licence: 'a,b\r\n"c"' })] },
    ];
    for (const locale of ['en', 'fr'] as const) expect(run(tricky, NO_FILTERS, locale).checks.filter((c) => !c.ok), locale).toEqual([]);
  });
  it('follows the filters it is given; the record facts always cover every record', () => {
    const f: Filters = { ...NO_FILTERS, kind: 'routes' };
    const d = run(RECORDS, f);
    expect(d.ok).toBe(true);
    expect(byId(d, 'sourcesCsv').expected).toBe(2);
    expect(byId(d, 'counts').expected).toBe(2);
    expect(byId(d, 'facts').expected).toBe(7);
    const none = run(RECORDS, { ...NO_FILTERS, query: 'no such name' });
    expect(none.ok).toBe(true);
    expect(none.checks.filter((c) => c.id !== 'facts').every((c) => c.expected === 0 && c.found === 0)).toBe(true);
  });
  it('agrees for an empty registry', () => {
    const d = run([]);
    expect(d.ok).toBe(true);
    expect(d.checks.every((c) => c.expected === 0 && c.found === 0)).toBe(true);
  });
  it('agrees on random registries, with and without filters, in both languages', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const records = randomRegistry(seed, NOW);
      const audit = auditRegistry(records, NOW, {});
      for (const f of [NO_FILTERS, { ...NO_FILTERS, onlyIssues: true }, { ...NO_FILTERS, state: 'unknown' as const }]) {
        const d = runFileChecks(records, audit, f, NOW, seed % 2 === 0 ? 'en' : 'fr');
        expect(d.checks.filter((c) => !c.ok), `seed ${seed} ${JSON.stringify(f)}`).toEqual([]);
        expect(byId(d, 'sourcesCsv').expected).toBe(applyFilters(audit.sources, f).length);
      }
    }
  });
});

describe('the words', () => {
  const ok: FileCheck = { id: 'listedMd', expected: 3, found: 3, ok: true };
  const off: FileCheck = { id: 'listedMd', expected: 3, found: 2, ok: false };
  const unreadable: FileCheck = { id: 'listedJson', expected: 3, found: -1, ok: false };
  it('names each file as the guide to the files does', () => {
    const names = FILE_GUIDE.map((e) => e.filename);
    for (const id of FILE_CHECK_IDS) expect(names, id).toContain(fileCheckName(id, 'en'));
    for (const id of FILE_CHECK_IDS) expect(fileCheckName(id, 'fr')).toBe(fileCheckName(id, 'en'));
  });
  it('says what is counted, differently for each check', () => {
    for (const locale of ['en', 'fr'] as const) expect(new Set(FILE_CHECK_IDS.map((id) => fileCheckWhat(id, locale))).size).toBe(FILE_CHECK_IDS.length);
    for (const id of FILE_CHECK_IDS) expect(lintFrench(fileCheckWhat(id, 'fr')), id).toEqual([]);
  });
  it('gives one of three results', () => {
    expect(fileCheckResult(ok, 'en')).toBe('Agrees');
    expect(fileCheckResult(off, 'en')).toBe('Does not agree');
    expect(fileCheckResult(unreadable, 'en')).toBe('Could not be read back');
    expect(fileCheckResult(off, 'fr')).toBe('Ne concorde pas');
  });
  it('sums up', () => {
    expect(fileChecksSummary(run(RECORDS), 'en')).toBe(`All ${FILE_CHECK_IDS.length} files agree with the list.`);
    expect(fileChecksSummary({ checks: [ok, off], ok: false, failed: 1 }, 'en')).toBe('1 file does not agree with the list.');
    expect(fileChecksSummary({ checks: [off, unreadable], ok: false, failed: 2 }, 'en')).toBe('2 files do not agree with the list.');
    for (const d of [run(RECORDS), { checks: [off], ok: false, failed: 1 }, { checks: [off, unreadable], ok: false, failed: 2 }]) expect(lintFrench(fileChecksSummary(d, 'fr'))).toEqual([]);
  });
});

describe('renderFileChecksHtml', () => {
  it('has a row per check with what the list says and what the file holds', () => {
    const html = renderFileChecksHtml(run(RECORDS), 'en');
    expect(html).toContain('data-file-checks="0"');
    expect(html.match(/<tr data-check="/g)).toHaveLength(FILE_CHECK_IDS.length);
    expect(html.match(/data-ok="true"/g)).toHaveLength(FILE_CHECK_IDS.length);
    expect(html).toContain('<tr data-check="sourcesCsv" data-ok="true"><th scope="row"><code>data-sources.csv</code></th><td>Rows, one per source</td><td>7</td><td>7</td><td>Agrees</td></tr>');
    expect(html).not.toContain('<strong>');
  });
  it('makes a file that does not agree stand out in words, not only in weight', () => {
    const d: FileChecks = { checks: [{ id: 'listedMd', expected: 3, found: 2, ok: false }, { id: 'listedJson', expected: 3, found: -1, ok: false }, { id: 'facts', expected: 3, found: 3, ok: true }], ok: false, failed: 2 };
    const html = renderFileChecksHtml(d, 'en');
    expect(html).toContain('data-file-checks="2"');
    expect(html).toContain('<td>3</td><td>2</td><td><strong>Does not agree</strong></td>');
    expect(html).toContain('<td>3</td><td></td><td><strong>Could not be read back</strong></td>');
    expect(visibleText(html)).toContain('2 files do not agree with the list.');
    expect(structureProblems(html)).toEqual([]);
  });
  it('passes the audits in both languages, on its own, in the panel and on the page the server sends', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderFileChecksHtml(run(RECORDS, NO_FILTERS, locale), locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html.replace(/<code>.*?<\/code>/g, '')))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, filters: { ...NO_FILTERS, kind: 'routes' } });
      // The section always checks the files for every record, whatever the list is filtered to.
      expect(page).toContain(html);
      expect(page.match(/id="ds-filecheck-title"/g)).toHaveLength(1);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      const res = await handleDataStatus({ method: 'GET', url: `/${locale}/data-status?state=stale`, headers: {} }, { getRecords: () => RECORDS, now: () => NOW });
      expect(res!.body).toContain(html);
    }
  });
});
