import { describe, expect, it } from 'vitest';
import { mountDataStatusPanel, plainTables, renderDataStatusPanel } from './index';
import { FakeHost, NOW, RECORDS, structureProblems } from './testkit';

const base = { records: RECORDS, locale: 'en' as const, now: NOW };

describe('plainTables', () => {
  it('replaces every focusable scroll region with a wrapper that wraps text', () => {
    const scrolling = renderDataStatusPanel(base);
    expect(scrolling).toContain('class="ds-scroll" role="region" tabindex="0"');
    const plain = renderDataStatusPanel({ ...base, plainTables: true });
    expect(plain).not.toContain('class="ds-scroll"');
    expect(plain).not.toMatch(/tabindex=/);
    expect(plain).toContain('class="ds-wrap" style="overflow-wrap:anywhere"');
  });

  it('keeps every table, caption and cell', () => {
    const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
    const a = renderDataStatusPanel(base);
    const b = renderDataStatusPanel({ ...base, plainTables: true });
    for (const re of [/<table>/g, /<caption>/g, /<tr>/g, /<td>/g, /<th /g]) expect(count(b, re)).toBe(count(a, re));
    expect(structureProblems(b)).toEqual([]);
  });

  it('is off by default and leaves other markup alone', () => {
    expect(plainTables('<p>x</p>')).toBe('<p>x</p>');
    expect(renderDataStatusPanel(base)).toBe(renderDataStatusPanel({ ...base, plainTables: false }));
  });

  it('applies after a filter change too, so typing never brings the scroll regions back', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, plainTables: true });
    expect(host.innerHTML).not.toMatch(/tabindex=/);
    host.fire('change', { target: { getAttribute: (n: string) => (n === 'data-filter' ? 'state' : null), value: 'stale' } });
    expect(host.innerHTML).not.toMatch(/tabindex=/);
  });
});
