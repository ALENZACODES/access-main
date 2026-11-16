import { describe, expect, it } from 'vitest';
import { buildToc, decodeBasicEntities, renderTocHtml, MIN_TOC_ENTRIES } from './toc';
import { NOW, RECORDS, targetsBelow44 } from './testkit';
import { renderDataStatusPanel, scanHtml } from './index';

describe('table of contents', () => {
  it('collects h2 headings with ids, in order, and skips ones without an id', () => {
    const e = buildToc('<h2 id="a">One</h2><h2>No id</h2><h2 class="x" id="b"><span>Two</span></h2>');
    expect(e).toEqual([{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }]);
  });
  it('drops repeated ids', () => {
    expect(buildToc('<h2 id="a">A</h2><h2 id="a">B</h2>')).toEqual([{ id: 'a', text: 'A' }]);
  });
  it('decodes the basic entities', () => {
    expect(decodeBasicEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;')).toBe('a & b <c> "d" \'e\'');
  });
  it('keeps the narrow no-break space in French headings', () => {
    expect(buildToc('<h2 id="a">Quoi ?</h2>')[0]?.text).toBe('Quoi ?');
  });
  it('renders nothing below the minimum', () => {
    expect(renderTocHtml([], 'en')).toBe('');
    expect(renderTocHtml(Array.from({ length: MIN_TOC_ENTRIES - 1 }, (_, i) => ({ id: `i${i}`, text: 'T' })), 'en')).toBe('');
  });
  it('renders anchors to each id with large targets', () => {
    const html = renderTocHtml([{ id: 'a', text: 'A' }, { id: 'b', text: 'B & C' }, { id: 'c', text: 'C' }], 'en');
    expect(html).toContain('href="#a"');
    expect(html).toContain('B &amp; C');
    expect(html).toContain('aria-labelledby="ds-toc-title"');
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('on the live panel, every link points at a heading that exists', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      const nav = /<nav aria-labelledby="ds-toc-title"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
      const hrefs = [...nav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThanOrEqual(MIN_TOC_ENTRIES);
      for (const id of hrefs) expect(html).toContain(`id="${id}"`);
      expect(scanHtml(html)).toEqual([]);
    }
  });
});
