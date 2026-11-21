import { describe, expect, it } from 'vitest';
import { mountNarrowPanel, renderPanel, type PanelRoot } from './panel.js';
import { makeReport } from './report.js';

class Root implements PanelRoot {
  innerHTML = '';
  attrs: Record<string, string> = {};
  private handler: ((e: { target: unknown }) => void) | null = null;
  setAttribute(n: string, v: string): void {
    this.attrs[n] = v;
  }
  addEventListener(_type: 'click', h: (e: { target: unknown }) => void): void {
    this.handler = h;
  }
  click(action: string): void {
    this.handler?.({ target: { getAttribute: (n: string) => (n === 'data-action' ? action : null) } });
  }
}

const empty = (): ReturnType<typeof makeReport> => makeReport([], new Date('2026-11-16T12:00:00Z'));
const h1s = (html: string): number => (html.match(/<h1[ >]/g) ?? []).length;

describe('panel heading', () => {
  it('has one h1 by default, in each language and in every state', () => {
    for (const lang of ['en', 'fr'] as const) {
      expect(h1s(renderPanel(lang, { kind: 'idle' }))).toBe(1);
      expect(h1s(renderPanel(lang, { kind: 'running' }))).toBe(1);
      expect(h1s(renderPanel(lang, { kind: 'error', message: 'x' }))).toBe(1);
      expect(h1s(renderPanel(lang, { kind: 'done', report: empty() }))).toBe(1);
    }
  });
  it('leaves the h1 out when the host renders it, and keeps the rest', () => {
    const html = renderPanel('en', { kind: 'idle' }, '', false);
    expect(h1s(html)).toBe(0);
    expect(html).toContain('data-action="run"');
    expect(html).toContain('Checks this page at its current width.');
  });
  it('mounts without an h1 when heading is false, and with one otherwise', () => {
    const a = new Root();
    mountNarrowPanel({ root: a, lang: 'en', heading: false });
    expect(h1s(a.innerHTML)).toBe(0);
    const b = new Root();
    mountNarrowPanel({ root: b, lang: 'en' });
    expect(h1s(b.innerHTML)).toBe(1);
  });
  it('reports a language switch and still has no h1 after it', () => {
    const seen: string[] = [];
    const root = new Root();
    mountNarrowPanel({ root, lang: 'en', heading: false, onLang: (l) => seen.push(l) });
    root.click('lang-fr');
    expect(seen).toEqual(['fr']);
    expect(root.attrs['lang']).toBe('fr');
    expect(h1s(root.innerHTML)).toBe(0);
    root.click('lang-en');
    expect(seen).toEqual(['fr', 'en']);
  });
  it('does not call onLang for other actions', () => {
    const seen: string[] = [];
    const root = new Root();
    mountNarrowPanel({ root, lang: 'en', run: () => empty(), onLang: (l) => seen.push(l) });
    root.click('run');
    expect(seen).toEqual([]);
  });
});
