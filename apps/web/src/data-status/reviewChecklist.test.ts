import { describe, expect, it } from 'vitest';
import { containsForbiddenOrg } from '../../../../packages/shared/test/forbiddenOrg.ts';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS, type Filters } from './filters';
import { lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanCopy } from './index';
import {
  buildChecklist,
  buildChecklistFile,
  CHECKLIST_CSV_COLUMNS,
  CHECKLIST_FORMATS,
  CHECKLIST_SOON_DAYS,
  checklistAction,
  checklistFormatFromAction,
  checklistLabel,
  checklistRows,
  checklistToCsv,
  checklistToMarkdown,
  describeChecklistSaved,
  markdownLine,
  tasksFor,
} from './reviewChecklist';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS } from './testkit';

// Places are reviewed 180 days after retrieval.
const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('ok'),
      src('soon', { retrievedAt: isoDayOffset(NOW, -170) }),
      src('old', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary', tier: 'E' }),
      src('notier', { tier: null }),
      src('bare', { source: null, licence: null, retrievedAt: null, tier: null }),
    ],
  },
];
const audit = auditRegistry(MIXED, NOW, {});
const byId = (id: string) => {
  const s = audit.sources.find((x) => x.sourceId === id);
  if (!s) throw new Error(id);
  return s;
};
const kinds = (id: string) => tasksFor(byId(id), audit, 'en').map((t) => t.code ?? t.kind);

describe('tasksFor', () => {
  it('gives no step to a complete source that is not due soon', () => {
    expect(tasksFor(byId('ok'), audit, 'en')).toEqual([]);
  });
  it('gives one step for each finding, most urgent first', () => {
    expect(kinds('old')).toEqual(['licence-unrecognised', 'stale']);
  });
  it('adds a step for a tier that is not recorded', () => {
    expect(kinds('notier')).toEqual(['tier']);
    expect(tasksFor(byId('notier'), audit, 'en')[0]).toMatchObject({ kind: 'tier', code: null, title: 'Tier not recorded' });
  });
  it('adds a step when the review date is close and has not passed', () => {
    expect(kinds('soon')).toEqual(['soon']);
    expect(tasksFor(byId('soon'), audit, 'en')[0]?.title).toBe(`Review date within ${CHECKLIST_SOON_DAYS} days`);
    expect(kinds('old')).not.toContain('soon');
  });
  it('puts findings first, then the tier, then the date', () => {
    expect(kinds('bare')).toEqual(['missing-source', 'missing-licence', 'missing-date', 'tier']);
  });
  it('every step has a title and a full-sentence instruction in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const s of audit.sources) {
        for (const task of tasksFor(s, audit, locale)) {
          expect(task.title.length).toBeGreaterThan(3);
          expect(task.step.endsWith('.')).toBe(true);
          if (locale === 'fr') expect(lintFrench(`${task.title} ${task.step}`)).toEqual([]);
        }
      }
    }
  });
});

describe('buildChecklist', () => {
  it('lists the sources with something to do and counts the rest', () => {
    const c = buildChecklist(audit, NO_FILTERS, 'en');
    expect(c.entries.map((e) => e.source.sourceId).sort()).toEqual(['bare', 'notier', 'old', 'soon']);
    expect(c).toMatchObject({ listed: 5, clear: 1, taskCount: 8 });
  });
  it('covers only what the filters list', () => {
    const c = buildChecklist(audit, { ...NO_FILTERS, tier: 'unknown' }, 'en');
    expect(c.entries.map((e) => e.source.sourceId).sort()).toEqual(['bare', 'notier']);
    expect(c).toMatchObject({ listed: 2, clear: 0 });
    expect(buildChecklist(audit, { ...NO_FILTERS, query: 'name ok' }, 'en')).toMatchObject({ entries: [], listed: 1, clear: 1, taskCount: 0 });
  });
  it('follows the order of the list', () => {
    const asc = buildChecklist(audit, NO_FILTERS, 'en', { key: 'source', dir: 'asc' }).entries.map((e) => e.source.sourceId);
    const desc = buildChecklist(audit, NO_FILTERS, 'en', { key: 'source', dir: 'desc' }).entries.map((e) => e.source.sourceId);
    expect(desc).toEqual([...asc].reverse());
  });
  it('adds up on random registries, and never includes a source with nothing to do', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const filters of [NO_FILTERS, { ...NO_FILTERS, state: 'stale' } as Filters]) {
        const c = buildChecklist(a, filters, 'en');
        expect(c.listed).toBe(applyFilters(a.sources, filters).length);
        expect(c.entries.length + c.clear).toBe(c.listed);
        expect(c.taskCount).toBe(c.entries.reduce((n, e) => n + e.tasks.length, 0));
        for (const e of c.entries) expect(e.tasks.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Markdown', () => {
  const md = (filters: Filters = NO_FILTERS, locale: 'en' | 'fr' = 'en') => checklistToMarkdown(buildChecklist(audit, filters, locale), filters, NOW, locale);

  it('starts with the title, the date, the filters and the scope', () => {
    const lines = md().split('\n');
    expect(lines[0]).toBe('# Review checklist');
    expect(lines[2]).toMatch(/^As of .*2026\.$/);
    expect(lines[3]).toBe('Filters: none. Every source is listed.');
    expect(lines[4]).toBe('4 sources to review, out of 5 listed.');
    expect(lines[5]).toBe('1 listed source has nothing to do and is left out.');
  });
  it('names the filters in force', () => {
    expect(md({ ...NO_FILTERS, tier: 'unknown', licence: 'open' })).toContain('Filters: Tier: Unknown; Licence type: Open licence.');
  });
  it('has a heading, the status, the review date and a tick-box line for each step', () => {
    const text = md();
    expect(text).toContain('## Places / Name old');
    expect(text).toContain('- Status: May be out of date');
    expect(text).toMatch(/- Review date: .* \(220 days ago\)/);
    expect(text).toContain('- [ ] Licence not on the reference list. ');
    expect(text.match(/^- \[ \] /gm)).toHaveLength(8);
    expect(text.match(/^## /gm)).toHaveLength(4);
  });
  it('says so when nothing listed has anything to do', () => {
    const text = md({ ...NO_FILTERS, query: 'name ok' });
    expect(text).toContain('None of the listed sources has anything to do.');
    expect(text).not.toContain('## ');
    expect(text).not.toContain('left out');
  });
  it('ends with the note and a line feed', () => {
    expect(md().endsWith('_This checklist restates the audit. It does not change any record._\n')).toBe(true);
  });
  it('does not let a name from the data start markup or a new heading', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: 'Evil\n# Top', kind: 'places', sources: [src('x', { name: '[click](javascript:1)', tier: null })] }];
    const a = auditRegistry(records, NOW, {});
    const text = checklistToMarkdown(buildChecklist(a, NO_FILTERS, 'en'), NO_FILTERS, NOW, 'en');
    expect(text).not.toMatch(/^# Top/m);
    expect(text).not.toMatch(/\]\(javascript/);
    expect(text.match(/^# /gm)).toHaveLength(1);
  });
  it('keeps a search word from the filters from starting markup, and keeps French spacing', () => {
    expect(markdownLine('a *b* [c](d) `e` <f> # g')).toBe('a \\*b\\* \\[c\\]\\(d\\) \\`e\\` \\<f\\> \\# g');
    expect(markdownLine('one\ntwo\t three')).toBe('one two three');
    expect(markdownLine('État\u00A0: x\u202F; y')).toBe('État\u00A0: x\u202F; y');
    const text = md({ ...NO_FILTERS, query: '*bold*' });
    expect(text).toContain('Name contains “\\*bold\\*”');
  });
  it('is written in French and passes the typography and wording checks', () => {
    const text = md(NO_FILTERS, 'fr');
    expect(text.startsWith('# Liste de contrôle de révision\n')).toBe(true);
    expect(text).toContain('- État : Possiblement périmé');
    expect(lintFrench(text.replace(/\\/g, ''))).toEqual([]);
    for (const t of [text, md()]) {
      expect(scanCopy(t)).toEqual([]);
      expect(containsForbiddenOrg(t)).toBe(false);
    }
  });
});

describe('CSV', () => {
  const c = buildChecklist(audit, NO_FILTERS, 'en');
  it('has a header and one row for each step, all the same width', () => {
    const rows = checklistRows(c, 'en');
    expect(rows[0]).toEqual(['Dataset', 'Record', 'Task', 'Step', 'Status', 'Review date (YYYY-MM-DD)']);
    expect(rows).toHaveLength(1 + c.taskCount);
    for (const r of rows) expect(r).toHaveLength(CHECKLIST_CSV_COLUMNS.length);
  });
  it('writes the review date as a day, or Unknown when nothing is scheduled', () => {
    const rows = checklistRows(c, 'en');
    expect(rows.find((r) => r[1] === 'Name soon')?.[5]).toBe(isoDayOffset(NOW, 10));
    expect(rows.find((r) => r[1] === 'Name bare')?.[5]).toBe('UNKNOWN');
    for (const r of rows) for (const cell of r) expect(cell).not.toBe('');
  });
  it('uses French headings in French, and starts with a byte-order mark by default', () => {
    expect(checklistRows(buildChecklist(audit, NO_FILTERS, 'fr'), 'fr')[0]?.[2]).toBe('Tâche');
    expect(checklistToCsv(c, 'en').charCodeAt(0)).toBe(0xfeff);
    expect(checklistToCsv(c, 'en', false).startsWith('Dataset,Record,Task')).toBe(true);
  });
  it('guards a name a spreadsheet would run as a formula', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: '=1+1', kind: 'places', sources: [src('x', { tier: null })] }];
    const a = auditRegistry(records, NOW, {});
    expect(checklistToCsv(buildChecklist(a, NO_FILTERS, 'en'), 'en', false)).toContain("'=1+1");
  });
});

describe('files and actions', () => {
  it('maps formats to actions and back, and rejects anything else', () => {
    expect([...CHECKLIST_FORMATS]).toEqual(['md', 'csv']);
    for (const f of CHECKLIST_FORMATS) expect(checklistFormatFromAction(checklistAction(f))).toBe(f);
    for (const a of ['export-checklist', 'export-checklist-pdf', 'export-csv', '', null, undefined]) expect(checklistFormatFromAction(a)).toBeNull();
  });
  it('names each download in both languages', () => {
    expect(checklistLabel('md', 'en')).toBe('Download a review checklist for the listed sources (Markdown)');
    expect(checklistLabel('csv', 'fr')).toBe('Télécharger une liste de contrôle de révision pour les sources de la liste (CSV)');
  });
  it('builds a file for each format', () => {
    const c = buildChecklist(audit, NO_FILTERS, 'en');
    expect(buildChecklistFile(c, 'md', NO_FILTERS, NOW, 'en')).toMatchObject({ filename: 'review-checklist.md', mime: 'text/markdown;charset=utf-8' });
    const csv = buildChecklistFile(c, 'csv', NO_FILTERS, NOW, 'en');
    expect(csv).toMatchObject({ filename: 'review-checklist.csv', mime: 'text/csv;charset=utf-8' });
    expect(csv.text).toBe(checklistToCsv(c, 'en'));
  });
  it('says how many steps were saved, or that there were none', () => {
    expect(describeChecklistSaved(buildChecklist(audit, NO_FILTERS, 'en'), 'en')).toBe('Checklist saved with 8 steps.');
    expect(describeChecklistSaved(buildChecklist(audit, { ...NO_FILTERS, query: 'name soon' }, 'en'), 'en')).toBe('Checklist saved with 1 step.');
    expect(describeChecklistSaved(buildChecklist(audit, { ...NO_FILTERS, query: 'name ok' }, 'en'), 'en')).toBe('Checklist saved. None of the listed sources has anything to do.');
  });
});

describe('checklist on the panel', () => {
  const mount = () => {
    const host = new FakeHost();
    const files: { text: string; filename: string; mime: string }[] = [];
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onExportFile: (f) => files.push(f) });
    return { host, files };
  };
  it('offers both downloads in the live panel and neither in the static view', () => {
    const live = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    for (const f of CHECKLIST_FORMATS) expect(live).toContain(`data-action="${checklistAction(f)}"`);
    const page = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, staticView: { action: '/x', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
    expect(page).not.toContain('export-checklist');
  });
  it('hands over the Markdown file for what is listed, with the filters named, and says how many steps', () => {
    const { host, files } = mount();
    host.filter('change', 'tier', 'unknown');
    host.click(checklistAction('md'));
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe('review-checklist.md');
    expect(files[0]?.text).toContain('Filters: Tier: Unknown.');
    expect(files[0]?.text.match(/^## /gm)).toHaveLength(2);
    expect(host.announce.innerHTML).toBe('Checklist saved with 5 steps.');
  });
  it('hands over the CSV file in the order of the list', () => {
    const { host, files } = mount();
    host.filter('change', 'sort', 'source:desc');
    host.click(checklistAction('csv'));
    const names = (files[0]?.text ?? '').split('\r\n').slice(1).filter((l) => l !== '').map((l) => l.split(',')[1]);
    expect(names[0]).toBe('Name soon');
    expect(names.at(-1)).toBe('Name bare');
  });
  it('does nothing when the page takes no files', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW });
    expect(() => host.click(checklistAction('md'))).not.toThrow();
    expect(host.announce.innerHTML).toBe('');
  });
});
