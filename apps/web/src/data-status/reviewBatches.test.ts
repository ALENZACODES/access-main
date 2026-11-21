import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { NO_FILTERS, type Filters } from './filters';
import { handleDataStatus } from './http';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanCopy, scanHtml, visibleText } from './index';
import {
  BATCH_EXPORT_ACTION,
  BATCH_FILENAME,
  BATCH_SIZES,
  batchesSummary,
  batchesToMarkdown,
  batchHeading,
  batchLine,
  batchParams,
  buildBatchFile,
  buildReviewBatches,
  describeBatches,
  describeBatchesSaved,
  isBatchSize,
  orderForSessions,
  parseBatchSize,
  renderBatchControl,
  renderReviewBatchesHtml,
  type BatchSize,
} from './reviewBatches';
import { buildChecklist } from './reviewChecklist';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { parseTableView } from './tableView';
import { FakeHost, NOW, structureProblems } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const stale = (id: string, over: Record<string, unknown> = {}) => src(id, { retrievedAt: isoDayOffset(NOW, -400), ...over });
// Places: seven sources with something to do (one with three steps), two with nothing. Routes: two to do. Transit: one, with the most steps of any dataset but one.
const RECORDS: DatasetRecord[] = [
  { id: 'r', name: 'Routes', kind: 'routes', sources: [stale('r1'), src('rOk'), stale('r2')] },
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [stale('p1'), stale('p2'), src('pOk'), stale('p3'), src('pBare', { licence: null, retrievedAt: null, tier: null }), stale('p4'), stale('p5'), stale('p6'), src('pOk2')],
  },
  { id: 't', name: 'Transit', kind: 'transit', sources: [src('t1', { licence: null, tier: null })] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const build = (size: BatchSize = 5, f: Filters = NO_FILTERS) => buildReviewBatches(audit, f, 'en', size);
const ids = (d: ReturnType<typeof build>) => d.batches.map((b) => b.entries.map((e) => e.source.sourceId));

describe('the size', () => {
  it('reads 5, 10 or 20 from the address and nothing else', () => {
    for (const n of BATCH_SIZES) expect(parseBatchSize(`?batch=${n}`)).toBe(n);
    for (const q of ['', '?batch=', '?batch=none', '?batch=7', '?batch=010', '?batch=10.0', '?batch=-5', '?batch=1e1', '?size=10']) expect(parseBatchSize(q), q).toBeNull();
    expect(isBatchSize(10)).toBe(true);
    for (const bad of [0, 7, '10', null, NaN]) expect(isBatchSize(bad)).toBe(false);
  });
  it('writes itself back and is part of the table view', () => {
    expect(batchParams(null)).toEqual([]);
    expect(batchParams(undefined)).toEqual([]);
    expect(batchParams(20)).toEqual([['batch', '20']]);
    expect(parseTableView('?batch=5').batch).toBe(5);
    expect('batch' in parseTableView('?sort=tier')).toBe(false);
  });
});

describe('buildReviewBatches', () => {
  it('puts only the sources with something to do into sessions, and counts the rest', () => {
    const d = build(20);
    expect(d.listed).toBe(13);
    expect(d.sourceCount).toBe(10);
    expect(d.clear).toBe(3);
    expect(d.batches).toHaveLength(1);
    expect(d.batches[0]?.entries.map((e) => e.source.sourceId)).not.toContain('pOk');
    expect(d.taskCount).toBe(buildChecklist(audit, NO_FILTERS, 'en').taskCount);
  });
  it('cuts the work into sessions of the chosen size, the last one shorter', () => {
    const d = build(5);
    expect(d.batches.map((b) => b.entries.length)).toEqual([5, 5]);
    expect(d.batches.map((b) => b.number)).toEqual([1, 2]);
    expect(build(10).batches.map((b) => b.entries.length)).toEqual([10]);
    const three = buildReviewBatches(auditRegistry([RECORDS[0]!, RECORDS[2]!], NOW, {}), NO_FILTERS, 'en', 5);
    expect(three.batches.map((b) => b.entries.length)).toEqual([3]);
  });
  it('starts with the dataset that has the most steps and keeps each dataset together', () => {
    const order = ids(build(20))[0]!;
    expect(order.slice(0, 7).every((id) => id.startsWith('p'))).toBe(true);
    expect(order.slice(7)).toEqual(['r1', 'r2', 't1']);
    const sets = order.map((id) => id[0]);
    expect(sets.filter((s, i) => i === 0 || s !== sets[i - 1])).toHaveLength(3);
  });
  it('inside a dataset, puts the source with the most steps first and keeps the order of the list for ties', () => {
    const order = ids(build(20))[0]!;
    expect(order[0]).toBe('pBare');
    expect(order.slice(1, 7)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  });
  it('names the datasets of a session in the order they appear in it', () => {
    const d = build(5);
    expect(d.batches[0]?.datasets).toEqual(['Places']);
    expect(d.batches[1]?.datasets).toEqual(['Places', 'Routes', 'Transit']);
  });
  it('counts the steps of each session, and they add up', () => {
    const d = build(5);
    for (const b of d.batches) expect(b.taskCount).toBe(b.entries.reduce((n, e) => n + e.tasks.length, 0));
    expect(d.batches.reduce((n, b) => n + b.taskCount, 0)).toBe(d.taskCount);
  });
  it('follows the filters', () => {
    const d = build(5, { ...NO_FILTERS, kind: 'routes' });
    expect(ids(d)).toEqual([['r1', 'r2']]);
    expect(d.clear).toBe(1);
    expect(build(5, { ...NO_FILTERS, query: 'no such name' })).toMatchObject({ batches: [], sourceCount: 0, listed: 0, clear: 0 });
    expect(build(5, { ...NO_FILTERS, query: 'Ok' })).toMatchObject({ batches: [], sourceCount: 0, listed: 3, clear: 3 });
  });
  it('does not change the order it is given', () => {
    const entries = buildChecklist(audit, NO_FILTERS, 'en').entries;
    const before = entries.map((e) => e.source.sourceId);
    orderForSessions(entries);
    expect(entries.map((e) => e.source.sourceId)).toEqual(before);
    expect(orderForSessions([])).toEqual([]);
  });
  it('holds its promises on random registries, for every size', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const checklist = buildChecklist(a, NO_FILTERS, 'en');
      for (const size of BATCH_SIZES) {
        const d = buildReviewBatches(a, NO_FILTERS, 'en', size);
        const flat = d.batches.flatMap((b) => b.entries);
        expect(flat).toHaveLength(checklist.entries.length);
        expect(new Set(flat.map((e) => e.source)).size, `seed ${seed}`).toBe(flat.length);
        expect(d.sourceCount + d.clear).toBe(d.listed);
        d.batches.forEach((b, i) => {
          expect(b.entries.length).toBeGreaterThan(0);
          expect(b.entries.length).toBeLessThanOrEqual(size);
          if (i < d.batches.length - 1) expect(b.entries.length).toBe(size);
        });
        // Each dataset is one unbroken run across the sessions.
        const runs = flat.map((e) => e.source.datasetId).filter((id, i, all) => i === 0 || id !== all[i - 1]);
        expect(new Set(runs).size, `seed ${seed} size ${size}`).toBe(runs.length);
      }
    }
  });
});

describe('the words', () => {
  it('heads and sums up each session', () => {
    const d = build(5);
    expect(batchHeading(d.batches[0]!, 2, 'en')).toBe('Session 1 of 2');
    expect(batchLine(d.batches[0]!, 'en')).toMatch(/^5 sources, \d+ steps\.$/);
    expect(batchLine({ number: 1, entries: d.batches[0]!.entries.slice(1, 2), taskCount: 1, datasets: [] }, 'en')).toBe('1 source, 1 step.');
    expect(batchesSummary(d, 'en')).toEqual(['2 sessions of up to 5 sources.', '3 listed sources have nothing to do and are in no session.']);
    expect(batchesSummary(build(20, { ...NO_FILTERS, kind: 'routes' }), 'en')).toEqual(['1 session of up to 20 sources.', '1 listed source has nothing to do and is in no session.']);
    expect(batchesSummary(build(5, { ...NO_FILTERS, query: 'Ok' }), 'en')).toEqual(['No listed source has anything to do, so there is no session to plan.']);
  });
  it('says what was done', () => {
    expect(describeBatches(build(5), 'en')).toBe('Review split into 2 sessions of up to 5 sources.');
    expect(describeBatches(build(10), 'en')).toBe('Review split into 1 session of up to 10 sources.');
    expect(describeBatches(null, 'en')).toBe('Review sessions removed.');
    expect(describeBatches(build(5, { ...NO_FILTERS, query: 'Ok' }), 'en')).toBe('No listed source has anything to do, so there is no session.');
    expect(describeBatchesSaved(build(5), 'en')).toBe('File saved with 2 sessions.');
    expect(describeBatchesSaved(build(10), 'en')).toBe('File saved with 1 session.');
  });
  it('is written in French with the right spacing', () => {
    const d = buildReviewBatches(audit, NO_FILTERS, 'fr', 5);
    const texts = [...batchesSummary(d, 'fr'), describeBatches(d, 'fr'), describeBatches(null, 'fr'), describeBatchesSaved(d, 'fr'), batchHeading(d.batches[0]!, 2, 'fr'), batchLine(d.batches[0]!, 'fr')];
    for (const text of texts) expect(lintFrench(text), text).toEqual([]);
    expect(batchHeading(d.batches[1]!, 2, 'fr')).toBe('Séance 2 sur 2');
  });
});

describe('markup', () => {
  it('has one named block per session with an ordered list of its sources', () => {
    const html = renderReviewBatchesHtml(build(5), 'en');
    expect(html).toContain('data-batches="2"');
    expect(html.match(/<h4 /g)).toHaveLength(2);
    expect(html.match(/<ol>/g)).toHaveLength(2);
    expect(html.match(/<li>/g)).toHaveLength(10);
    expect(visibleText(html)).toContain('Places / Name p1 (1 step)');
    expect(visibleText(html)).toContain('Datasets: Places, Routes, Transit.');
    for (const id of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(html).toContain(`id="${id[1]}"`);
  });
  it('says so when there is nothing to plan', () => {
    const html = renderReviewBatchesHtml(build(5, { ...NO_FILTERS, query: 'Ok' }), 'en');
    expect(html).toContain('data-batches="0"');
    expect(html).not.toContain('<ol>');
    expect(visibleText(html)).toContain('there is no session to plan');
  });
  it('escapes names and writes UNKNOWN for a source with no name', () => {
    const odd = auditRegistry([{ id: 'x', name: '<b>X</b>', kind: 'places', sources: [stale('a', { name: '<script>1</script>' }), stale('b', { name: null, source: null })] }], NOW, {});
    const html = renderReviewBatchesHtml(buildReviewBatches(odd, NO_FILTERS, 'en', 5), 'en');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('Name UNKNOWN');
  });
  it('the control offers each size and selects the one in use', () => {
    const off = renderBatchControl(null, 'en');
    expect(off).toContain('<option value="none" selected>Do not split</option>');
    expect(off.match(/<option /g)).toHaveLength(1 + BATCH_SIZES.length);
    expect(renderBatchControl(10, 'en')).toContain('<option value="10" selected>Up to 10 sources</option>');
    expect(renderBatchControl(10, 'en').match(/ selected>/g)).toHaveLength(1);
  });
  it('passes the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderReviewBatchesHtml(buildReviewBatches(audit, NO_FILTERS, locale, 5), locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html.replace(/<li>.*?<\/li>/g, '')))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, live: { sort: null, limit: 50, batch: 5 } });
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      expect(structureProblems(renderBatchControl(5, locale))).toEqual([]);
    }
  });
});

describe('the file', () => {
  it('has a heading per session, a box per source and a box per step', () => {
    const d = build(5);
    const md = batchesToMarkdown(d, NOW, 'en');
    expect(md.startsWith('# Review sessions\n')).toBe(true);
    expect(md.match(/^## /gm)).toHaveLength(2);
    expect(md).toContain('## Session 2 of 2');
    expect(md.match(/^- \[ \] /gm)).toHaveLength(d.sourceCount);
    expect(md.match(/^ {2}- \[ \] /gm)).toHaveLength(d.taskCount);
    expect(md).toContain('2 sessions of up to 5 sources.');
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
    expect(md).toBe(batchesToMarkdown(d, NOW, 'en'));
  });
  it('says so when there is nothing to plan, and escapes what Markdown would act on', () => {
    const none = batchesToMarkdown(build(5, { ...NO_FILTERS, query: 'Ok' }), NOW, 'en');
    expect(none).toContain('there is no session to plan');
    expect(none).not.toContain('## ');
    const odd = auditRegistry([{ id: 'x', name: 'A | B', kind: 'places', sources: [stale('a', { name: '*star*\nline' })] }], NOW, {});
    expect(batchesToMarkdown(buildReviewBatches(odd, NO_FILTERS, 'en', 5), NOW, 'en')).toContain('- [ ] A \\| B / \\*star\\* line');
  });
  it('passes the copy check in both languages and names its file', () => {
    for (const locale of ['en', 'fr'] as const) {
      const file = buildBatchFile(buildReviewBatches(audit, NO_FILTERS, locale, 5), NOW, locale);
      expect(file).toMatchObject({ filename: BATCH_FILENAME, mime: 'text/markdown;charset=utf-8' });
      expect(scanCopy(file.text)).toEqual([]);
    }
  });
  it('the server sends it for the size and filters in the address, and with ten when no size is given', async () => {
    const ctx = { getRecords: () => RECORDS, now: () => NOW };
    const res = await handleDataStatus({ method: 'GET', url: '/en/data-status/review-sessions.md?batch=5&kind=places', headers: {} }, ctx);
    expect(res?.status).toBe(200);
    expect(res?.headers['content-disposition']).toBe(`attachment; filename="${BATCH_FILENAME}"`);
    expect(res?.body).toBe(batchesToMarkdown(build(5, { ...NO_FILTERS, kind: 'places' }), NOW, 'en'));
    const plain = await handleDataStatus({ method: 'GET', url: '/fr/data-status/review-sessions.md', headers: {} }, ctx);
    expect(plain?.body).toBe(batchesToMarkdown(buildReviewBatches(audit, NO_FILTERS, 'fr', 10), NOW, 'fr'));
  });
});

describe('in the panel', () => {
  const mount = (initialBatch?: BatchSize) => {
    const host = new FakeHost();
    const changes: string[] = [];
    const files: { text: string; filename: string; mime: string }[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (v) => changes.push(v), onExportFile: (f) => files.push(f), ...(initialBatch ? { initialBatch } : {}) });
    return { host, panel, changes, files };
  };
  it('shows no sessions until a size is chosen', () => {
    const { host, panel } = mount();
    expect(panel.getBatch()).toBeNull();
    expect(host.innerHTML).not.toContain('data-batches=');
    expect(host.innerHTML).toContain('id="ds-f-batch"');
  });
  it('splits the review when a size is chosen, says so and puts it in the address', () => {
    const { host, panel, changes } = mount();
    host.filter('change', 'batch', '5');
    expect(panel.getBatch()).toBe(5);
    expect(host.region.innerHTML).toContain('data-batches="2"');
    expect(host.announce.innerHTML).toContain('Review split into 2 sessions of up to 5 sources.');
    expect(changes.at(-1)).toBe('?batch=5');
    host.filter('change', 'batch', 'none');
    expect(panel.getBatch()).toBeNull();
    expect(host.region.innerHTML).not.toContain('data-batches=');
    expect(host.announce.innerHTML).toContain('Review sessions removed.');
    expect(changes.at(-1)).toBe('');
  });
  it('treats a size it does not offer as no split', () => {
    const { host, panel } = mount(10);
    host.filter('change', 'batch', '7');
    expect(panel.getBatch()).toBeNull();
  });
  it('follows the filters and saves the sessions as a file', () => {
    const { host, files } = mount(5);
    host.filter('change', 'kind', 'routes');
    expect(host.region.innerHTML).toContain('data-batches="1"');
    host.click(BATCH_EXPORT_ACTION);
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe(BATCH_FILENAME);
    expect(files[0]?.text).toBe(batchesToMarkdown(build(5, { ...NO_FILTERS, kind: 'routes' }), NOW, 'en'));
    expect(host.announce.innerHTML).toContain('File saved with 1 session.');
  });
  it('saves nothing when the review is not split, and offers no file when there is no session', () => {
    const { host, files } = mount();
    host.click(BATCH_EXPORT_ACTION);
    expect(files).toEqual([]);
    const empty = mount(5);
    empty.host.filter('input', 'query', 'Ok');
    expect(empty.host.region.innerHTML).toContain('data-batches="0"');
    expect(empty.host.region.innerHTML).not.toContain(`data-action="${BATCH_EXPORT_ACTION}"`);
  });
  it('the static page shows the sessions from the address and links to the file', async () => {
    const ctx = { getRecords: () => RECORDS, now: () => NOW };
    for (const locale of ['en', 'fr'] as const) {
      const page = (await handleDataStatus({ method: 'GET', url: `/${locale}/data-status?batch=5&kind=places`, headers: {} }, ctx))!;
      expect(page.body).toContain('data-batches="2"');
      expect(page.body).not.toContain(`data-action="${BATCH_EXPORT_ACTION}"`);
      expect(page.body).toMatch(new RegExp(`href="/${locale}/data-status/${BATCH_FILENAME.replace('.', '\\.')}\\?[^"]*batch=5`));
      expect(page.body).toContain('<option value="5" selected>');
      expect(scanHtml(page.body)).toEqual([]);
      expect(describeProblems(auditHtml(page.body))).toEqual([]);
    }
  });
});
