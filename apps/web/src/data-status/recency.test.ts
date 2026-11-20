import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { buildRecency, RECENCY_COUNT, recencyAgeText, recencyNotes, recencyRows, renderRecencyHtml } from './recency';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, structureProblems } from './testkit';

const src = (id: string, days: number | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: days === null ? null : isoDayOffset(NOW, -days), tier: 0, ...over });
const one = (sources: ReturnType<typeof src>[]): DatasetRecord[] => [{ id: 'p', name: 'Places', kind: 'places', sources }];
const build = (records: DatasetRecord[], count?: number) => buildRecency(auditRegistry(records, NOW, {}), count);
const ids = (list: { sourceId: string }[]) => list.map((s) => s.sourceId);
const TWELVE = one([...Array.from({ length: 12 }, (_, i) => src(`s${String(i).padStart(2, '0')}`, i * 40)), src('none', null), src('future', -2)]);

describe('buildRecency', () => {
  it('lists the most recent first in one list and the longest ago first in the other', () => {
    const d = build(TWELVE);
    expect(ids(d.newest)).toEqual(['s00', 's01', 's02', 's03', 's04']);
    expect(ids(d.oldest)).toEqual(['s11', 's10', 's09', 's08', 's07']);
    expect(d).toMatchObject({ dated: 12, undated: 2 });
  });
  it('never puts a source in both lists: with few sources the first list is filled first', () => {
    const seven = build(one(Array.from({ length: 7 }, (_, i) => src(`s${i}`, i * 10))));
    expect(ids(seven.newest)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(ids(seven.oldest)).toEqual(['s6', 's5']);
    const three = build(one([src('a', 1), src('b', 2), src('c', 3)]));
    expect(ids(three.newest)).toEqual(['a', 'b', 'c']);
    expect(three.oldest).toEqual([]);
  });
  it('leaves out sources with no usable date, and counts them', () => {
    const d = build(one([src('a', 5), src('none', null), src('bad', 0, { retrievedAt: 'N/A' }), src('future', -9)]));
    expect(ids(d.newest)).toEqual(['a']);
    expect(d).toMatchObject({ dated: 1, undated: 3 });
  });
  it('breaks ties by dataset, then name, so the order does not depend on the order of the records', () => {
    const a = build(one([src('b', 5), src('a', 5), src('c', 5)]));
    const b = build(one([src('c', 5), src('a', 5), src('b', 5)]));
    expect(ids(a.newest)).toEqual(['a', 'b', 'c']);
    expect(ids(b.newest)).toEqual(['a', 'b', 'c']);
  });
  it('takes another count, and nothing for zero or less', () => {
    expect(ids(build(TWELVE, 2).newest)).toEqual(['s00', 's01']);
    expect(ids(build(TWELVE, 2).oldest)).toEqual(['s11', 's10']);
    expect(build(TWELVE, 0)).toMatchObject({ newest: [], oldest: [], dated: 12 });
    expect(build(TWELVE, -3).newest).toEqual([]);
  });
  it('is empty for an empty registry, and holds its promises on random ones', () => {
    expect(build([])).toEqual({ newest: [], oldest: [], dated: 0, undated: 0 });
    for (let seed = 1; seed <= 40; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const d = buildRecency(audit);
      expect(d.dated + d.undated).toBe(audit.sources.length);
      expect(d.newest.length).toBeLessThanOrEqual(RECENCY_COUNT);
      expect(new Set([...d.newest, ...d.oldest]).size, `seed ${seed}`).toBe(d.newest.length + d.oldest.length);
      expect(d.newest.length + d.oldest.length).toBe(Math.min(d.dated, 2 * RECENCY_COUNT));
      const up = d.newest.map((s) => s.ageDays ?? -1);
      const down = d.oldest.map((s) => s.ageDays ?? -1);
      expect(up).toEqual([...up].sort((x, y) => x - y));
      expect(down).toEqual([...down].sort((x, y) => y - x));
      if (d.newest.length > 0 && d.oldest.length > 0) expect(Math.max(...up)).toBeLessThanOrEqual(Math.min(...down));
    }
  });
});

describe('the words', () => {
  const d = build(TWELVE);
  it('gives the age in days, with today for none', () => {
    expect(recencyAgeText(d.newest[0]!, 'en')).toBe('Today');
    expect(recencyAgeText(d.newest[1]!, 'en')).toBe('40 days');
    expect(recencyAgeText(build(one([src('a', 1)])).newest[0]!, 'en')).toBe('1 day');
    expect(recencyAgeText(d.newest[0]!, 'fr')).toBe('Aujourd’hui');
  });
  it('gives each list as rows of text', () => {
    const rows = recencyRows(d.oldest, 'en');
    expect(rows[0]).toEqual(['Source', 'Retrieved', 'Age', 'Status']);
    expect(rows[1]).toEqual(['Places / Name s11', 'September 1, 2025', '440 days', 'May be out of date']);
    expect(rows).toHaveLength(1 + RECENCY_COUNT);
  });
  it('notes what is in neither list', () => {
    expect(recencyNotes(d, 'en')).toEqual(['2 sources have no usable retrieved date and are in neither list.']);
    expect(recencyNotes(build(one([src('a', 1), src('n', null)])), 'en')).toEqual(['Every source with a usable date is in the first list.', '1 source has no usable retrieved date and is in neither list.']);
    expect(recencyNotes(build(one([src('a', 1), src('b', 2), src('c', 3), src('d', 4), src('e', 5), src('f', 6)])), 'en')).toEqual([]);
    for (const n of [...recencyNotes(d, 'fr'), ...recencyNotes(build(one([src('a', 1), src('n', null)])), 'fr')]) expect(lintFrench(n), n).toEqual([]);
  });
});

describe('renderRecencyHtml', () => {
  it('says so when there is no source, or none with a usable date', () => {
    expect(visibleText(renderRecencyHtml(build([]), 'en'))).toContain('There are no sources to rank.');
    const undated = renderRecencyHtml(build(one([src('n', null)])), 'en');
    expect(undated).not.toContain('<table');
    expect(visibleText(undated)).toContain('No source has a usable retrieved date, so none can be ranked.');
  });
  it('has two captioned tables, or one when every dated source fits in the first', () => {
    const html = renderRecencyHtml(build(TWELVE), 'en');
    expect(html.match(/<caption>/g)).toHaveLength(2);
    expect(html).toContain('<caption>Retrieved most recently</caption>');
    expect(html).toContain('<caption>Retrieved longest ago</caption>');
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(2 * RECENCY_COUNT);
    expect(renderRecencyHtml(build(one([src('a', 1)])), 'en').match(/<caption>/g)).toHaveLength(1);
  });
  it('escapes names', () => {
    const html = renderRecencyHtml(build(one([src('a', 1, { name: '<script>1</script>' })])), 'en');
    expect(html).not.toContain('<script>');
  });
  it('passes the audits in both languages, on its own and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderRecencyHtml(build(TWELVE), locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      const page = renderDataStatusPanel({ records: TWELVE, locale, now: NOW });
      expect(page.match(/id="ds-recency-title"/g)).toHaveLength(1);
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});
