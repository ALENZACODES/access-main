import { describe, expect, it } from 'vitest';
import { EMPTY_OVERFLOW, OVERFLOW_ARGS, overflowInPage } from './overflow-inpage.js';
import { box, probe, text } from './overflow-testkit.js';
import { causesOf } from './overflow.js';

/**
 * The probe on documents whose boxes are written by hand. These tests say
 * what the probe does with a given layout. Whether a browser lays a page out
 * that way is the business of the browser test.
 */

const WORDS = 'Opening hours and how to get here.';
const kinds = (facts: ReturnType<typeof probe>): string[] => causesOf(facts.origins).map((c) => `${c.kind} ${c.id}`);

describe('a page that fits', () => {
  it('has no origin and no region, and says the page does not scroll', () => {
    const facts = probe([box('h1', {}, [text('Hours', [0, 60])]), box('p', {}, [text(WORDS, [0, 300])])]);
    expect(facts).toEqual({ pageScrolls: false, viewportPx: 320, rtl: false, examined: 2, origins: [], originCount: 0, regions: [], regionCount: 0, truncated: false });
  });

  it('does not look for origins when the page does not scroll, even if a box is drawn past the edge', () => {
    // A box past the edge with a page that does not scroll: something clips it, or it is moved back by a transform.
    const facts = probe([box('div', { at: [0, 600] })], { scrollWidth: 320 });
    expect(facts.pageScrolls).toBe(false);
    expect(facts.origins).toEqual([]);
  });

  it('allows half a pixel of rounding at the edge', () => {
    expect(probe([box('div', { at: [0, 320.4] })]).pageScrolls).toBe(false);
    expect(probe([box('div', { at: [0, 320.4] })], { scrollWidth: 321 }).origins).toEqual([]);
    expect(probe([box('div', { at: [0, 321] })]).origins).toHaveLength(1);
  });

  it('has an empty result to start from', () => {
    expect(EMPTY_OVERFLOW.origins).toEqual([]);
    expect(EMPTY_OVERFLOW.pageScrolls).toBe(false);
    expect(OVERFLOW_ARGS).toEqual({ maxElements: 3000, keep: 12 });
  });
});

describe('where overflow starts', () => {
  it('names the box that is wider than its parent, with what was measured', () => {
    const facts = probe([box('div', { id: 'card', at: [0, 600] }, [box('p', { at: [0, 600] }, [text(WORDS, [0, 590])])])]);
    expect(facts.pageScrolls).toBe(true);
    expect(facts.origins).toHaveLength(1);
    expect(facts.origins[0]).toEqual({
      id: 'div#card[0]',
      tag: 'div',
      parentId: 'body',
      overPx: 280,
      widthPx: 600,
      spacePx: 320,
      display: 'block',
      position: 'static',
      whiteSpace: 'normal',
      floated: false,
      minWidthPx: 0,
      parentFlexNoWrap: false,
      parentGridPx: null,
      replaced: false,
      tableLike: false,
      text: false,
      word: '',
      wordChars: 0,
      shifted: false,
    });
  });

  it('does not report what is wide only because its parent is', () => {
    const facts = probe([box('div', { id: 'card', at: [0, 600] }, [box('section', { at: [0, 600] }, [box('p', { at: [0, 600] }, [text(WORDS, [0, 580])]), box('p', { at: [0, 600] })])])]);
    expect(kinds(facts)).toEqual(['fixed-width div#card[0]']);
    expect(facts.originCount).toBe(1);
    expect(facts.examined).toBe(4);
  });

  it('reports a child that sticks out of a parent that is itself an origin', () => {
    const facts = probe([box('div', { id: 'outer', at: [0, 500] }, [box('div', { id: 'inner', at: [0, 700] })])]);
    expect(kinds(facts)).toEqual(['fixed-width div#outer[0]', 'fixed-width div#inner[1]']);
    expect(facts.origins[1]).toMatchObject({ parentId: 'div#outer[0]', spacePx: 500, overPx: 380 });
  });

  it('finds an origin deep in the page under parents that fit', () => {
    const facts = probe([box('main', {}, [box('section', {}, [box('div', {}, [box('div', { id: 'deep', at: [0, 480] })])])])]);
    expect(kinds(facts)).toEqual(['fixed-width div#deep[1]']);
  });

  it('takes the padding and the border of the parent out of the space', () => {
    const parent = box('section', { at: [0, 320], style: { paddingLeft: '16px', paddingRight: '16px', borderLeftWidth: '2px', borderRightWidth: '2px' } }, [box('div', { id: 'wide', at: [18, 400] })]);
    const [origin] = probe([parent]).origins;
    expect(origin?.spacePx).toBe(284);
    expect(origin?.overPx).toBe(80);
  });

  it('does not report a child that reaches the padding of its parent and no further than the page', () => {
    const parent = box('section', { at: [0, 320], style: { paddingRight: '16px' } }, [box('div', { at: [0, 318] })]);
    expect(probe([parent]).origins).toEqual([]);
  });

  it('reports the body when the body itself is too wide', () => {
    const facts = probe([box('p', { at: [0, 700] }, [text(WORDS, [0, 300])])], { bodyAt: [0, 700] });
    expect(kinds(facts)).toEqual(['fixed-width body']);
    expect(facts.origins[0]).toMatchObject({ id: 'body', parentId: '', widthPx: 700, spacePx: 320, overPx: 380 });
  });

  it('numbers elements of the same tag in document order', () => {
    const facts = probe([box('p', {}), box('p', {}), box('p', { id: 'third', at: [0, 400] }), box('div', { at: [0, 400] })]);
    expect(facts.origins.map((o) => o.id)).toEqual(['p#third[2]', 'div[0]']);
  });

  it('rounds the reach up and the width to the nearest pixel', () => {
    const [origin] = probe([box('div', { at: [0, 400.2] })]).origins;
    expect(origin?.overPx).toBe(81);
    expect(origin?.widthPx).toBe(400);
  });

  it('adds how far the page is already scrolled', () => {
    // Scrolled 100 pixels: every box, the body included, sits 100 pixels further left.
    const [origin] = probe([box('div', { at: [-100, 300] })], { scrollX: 100, scrollWidth: 400, bodyAt: [-100, 220] }).origins;
    expect(origin?.overPx).toBe(80);
  });
});

describe('what is skipped', () => {
  it('skips elements that are not shown', () => {
    const facts = probe([box('div', { at: [0, 600], style: { display: 'none' } }), box('div', { at: [0, 600], style: { visibility: 'hidden' } }), box('div', { at: [0, 0], height: 0 })], { scrollWidth: 600 });
    expect(facts.origins).toEqual([]);
    expect(facts.examined).toBe(0);
  });

  it('skips scripts, styles and templates', () => {
    const facts = probe([box('script', { at: [0, 600] }), box('style', { at: [0, 600] }), box('template', { at: [0, 600] })], { scrollWidth: 600 });
    expect(facts.examined).toBe(0);
  });

  it('skips what an ancestor clips or scrolls, at any depth', () => {
    for (const overflowX of ['hidden', 'clip', 'auto', 'scroll']) {
      const clip = box('div', { at: [0, 320], style: { overflowX }, scrollWidth: 320 }, [box('div', {}, [box('div', { id: 'wide', at: [0, 600] })])]);
      const facts = probe([clip, box('div', { id: 'real', at: [0, 400] })]);
      expect(kinds(facts), overflowX).toEqual(['fixed-width div#real[3]']);
    }
  });

  it('does not treat the body as a clip', () => {
    const facts = probe([box('div', { at: [0, 400] })], { bodyStyle: { overflowX: 'hidden' } });
    expect(facts.origins).toHaveLength(1);
  });

  it('ignores a box moved off the start edge, as skip links are', () => {
    const facts = probe([box('a', { at: [-9999, -9900], style: { position: 'absolute', display: 'block' }, attrs: { href: '#main' } }), box('p', {}, [text(WORDS, [0, 300])])]);
    expect(facts.pageScrolls).toBe(false);
    expect(facts.origins).toEqual([]);
  });

  it('stops at the limit of elements and says so', () => {
    const many = Array.from({ length: 10 }, (_, i) => box('p', { id: `p${i}`, at: [0, i === 9 ? 500 : 320] }));
    const facts = probe(many, {}, { maxElements: 5, keep: 12 });
    expect(facts.truncated).toBe(true);
    expect(facts.examined).toBe(5);
    expect(facts.pageScrolls).toBe(true);
    expect(facts.origins).toEqual([]);
    expect(probe(many).truncated).toBe(false);
  });

  it('keeps a limited number of origins and counts them all', () => {
    const many = Array.from({ length: 8 }, () => box('div', { at: [0, 500] }));
    const facts = probe(many, {}, { maxElements: 3000, keep: 3 });
    expect(facts.origins).toHaveLength(3);
    expect(facts.originCount).toBe(8);
  });
});

describe('the facts of an origin', () => {
  it('reads display, position, white-space and float', () => {
    const [o] = probe([box('div', { at: [0, 400], style: { display: 'inline-block', position: 'relative', whiteSpace: 'nowrap', cssFloat: 'left' } })]).origins;
    expect(o).toMatchObject({ display: 'inline-block', position: 'relative', whiteSpace: 'nowrap', floated: true });
  });

  it('reads a min-width in pixels, and no other kind of value', () => {
    expect(probe([box('div', { at: [0, 500], style: { minWidth: '500px' } })]).origins[0]?.minWidthPx).toBe(500);
    for (const minWidth of ['auto', '0px', '50%', 'min-content', '']) expect(probe([box('div', { at: [0, 500], style: { minWidth } })]).origins[0]?.minWidthPx, minWidth).toBe(0);
  });

  it('marks images, video, frames and drawings as replaced', () => {
    for (const tag of ['img', 'video', 'canvas', 'svg', 'iframe', 'object', 'embed']) {
      expect(probe([box(tag, { at: [0, 800], style: { display: 'inline' } })]).origins[0]?.replaced, tag).toBe(true);
    }
    expect(probe([box('div', { at: [0, 800] })]).origins[0]?.replaced).toBe(false);
  });

  it('marks a table by its tag or by its display', () => {
    expect(probe([box('table', { at: [0, 700], style: { display: 'table' } })]).origins[0]?.tableLike).toBe(true);
    expect(probe([box('div', { at: [0, 700], style: { display: 'table' } })]).origins[0]?.tableLike).toBe(true);
    expect(probe([box('div', { at: [0, 700], style: { display: 'inline-table' } })]).origins[0]?.tableLike).toBe(true);
    expect(probe([box('div', { at: [0, 700] })]).origins[0]?.tableLike).toBe(false);
  });

  it('says a box is shifted when it fits its space and still sticks out', () => {
    expect(probe([box('div', { at: [120, 440] })]).origins[0]).toMatchObject({ shifted: true, widthPx: 320, overPx: 120 });
    expect(probe([box('div', { at: [0, 440] })]).origins[0]?.shifted).toBe(false);
  });

  it('says when the parent is a row that cannot wrap', () => {
    const row = (style: Record<string, string>) => box('div', { id: 'row', style }, [box('a', { at: [0, 200], style: { display: 'block' } }), box('a', { at: [200, 400], style: { display: 'block' } })]);
    expect(probe([row({ display: 'flex' })]).origins[0]).toMatchObject({ id: 'a[1]', parentId: 'div#row[0]', parentFlexNoWrap: true });
    expect(probe([row({ display: 'inline-flex' })]).origins[0]?.parentFlexNoWrap).toBe(true);
    expect(probe([row({ display: 'flex', flexWrap: 'wrap' })]).origins[0]?.parentFlexNoWrap).toBe(false);
    expect(probe([row({ display: 'flex', flexDirection: 'column' })]).origins[0]?.parentFlexNoWrap).toBe(false);
    expect(probe([row({ display: 'flex', flexDirection: 'column-reverse' })]).origins[0]?.parentFlexNoWrap).toBe(false);
    expect(probe([row({ display: 'flex', flexDirection: 'row-reverse' })]).origins[0]?.parentFlexNoWrap).toBe(true);
    expect(probe([row({ display: 'block' })]).origins[0]?.parentFlexNoWrap).toBe(false);
  });

  it('adds up the columns and the gaps of a parent grid with tracks in pixels', () => {
    const grid = (style: Record<string, string>) => box('div', { id: 'grid', style: { display: 'grid', ...style } }, [box('p', { at: [0, 200] }), box('p', { at: [210, 410] }), box('p', { at: [420, 620] })]);
    expect(probe([grid({ gridTemplateColumns: '200px 200px 200px', columnGap: '10px' })]).origins[0]?.parentGridPx).toBe(620);
    expect(probe([grid({ gridTemplateColumns: '200px 200px 200px' })]).origins[0]?.parentGridPx).toBe(600);
    expect(probe([grid({ gridTemplateColumns: '150.5px 150.5px' })]).origins[0]?.parentGridPx).toBe(301);
    expect(probe([grid({ gridTemplateColumns: 'none' })]).origins[0]?.parentGridPx).toBeNull();
    expect(probe([grid({ gridTemplateColumns: '1fr 200px' })]).origins[0]?.parentGridPx).toBeNull();
    expect(probe([grid({ display: 'inline-grid', gridTemplateColumns: '400px' })]).origins[0]?.parentGridPx).toBe(400);
    expect(probe([grid({ display: 'block', gridTemplateColumns: '400px 400px' })]).origins[0]?.parentGridPx).toBeNull();
  });
});

describe('text that runs past its own block', () => {
  const url = 'https://example.org/a/very/long/address/with/no/space/in/it';

  it('reports the block, the longest run with no space, and how far the text reaches', () => {
    const facts = probe([box('p', { id: 'link' }, [text(`See ${url} for more.`, [0, 520])])]);
    expect(kinds(facts)).toEqual(['long-word p#link[0]']);
    expect(facts.origins[0]).toMatchObject({ text: true, word: `${url.slice(0, 39)}…`, wordChars: url.length, overPx: 200, widthPx: 320, spacePx: 320, shifted: false });
  });

  it('keeps a word of forty characters or fewer whole', () => {
    const word = 'x'.repeat(40);
    expect(probe([box('p', {}, [text(word, [0, 500])])]).origins[0]).toMatchObject({ word, wordChars: 40 });
  });

  it('gives the text of inline children to their block, and does not report the inline boxes', () => {
    const facts = probe([box('p', { id: 'para' }, [text('See ', [0, 30]), box('a', { at: [30, 560], attrs: { href: '/x' } }, [box('strong', { at: [30, 560] }, [text(url, [30, 560])])]), text(' for more.', [0, 80])])]);
    expect(kinds(facts)).toEqual(['long-word p#para[0]']);
    expect(facts.origins[0]?.wordChars).toBe(url.length);
    expect(facts.originCount).toBe(1);
  });

  it('calls it text that may not wrap when white-space says so, and preformatted for pre', () => {
    expect(kinds(probe([box('p', { id: 'line', style: { whiteSpace: 'nowrap' } }, [text(WORDS.repeat(3), [0, 800])])]))).toEqual(['nowrap p#line[0]']);
    expect(kinds(probe([box('pre', { id: 'code', style: { whiteSpace: 'pre' } }, [text('const a = b;', [0, 700])])]))).toEqual(['preformatted pre#code[0]']);
    expect(kinds(probe([box('div', { style: { whiteSpace: 'pre' } }, [text('a   b', [0, 700])])]))).toEqual(['preformatted div[0]']);
  });

  it('does not report text that stays inside a block that is itself wide', () => {
    const facts = probe([box('div', { id: 'card', at: [0, 600] }, [box('p', { at: [0, 600] }, [text(WORDS.repeat(3), [0, 590])])])]);
    expect(kinds(facts)).toEqual(['fixed-width div#card[0]']);
  });

  it('does not report text of a block that clips or scrolls its own overflow', () => {
    for (const overflowX of ['hidden', 'auto', 'scroll', 'clip']) {
      const facts = probe([box('p', { style: { overflowX }, scrollWidth: 320 }, [text(url, [0, 520])]), box('div', { at: [0, 400] })]);
      expect(kinds(facts), overflowX).toEqual(['fixed-width div[0]']);
    }
  });

  it('ignores text made of spaces only, and text with no box', () => {
    const facts = probe([box('p', {}, [text('   \n ', [0, 900]), text('word', [0, 0])]), box('div', { at: [0, 400] })]);
    expect(kinds(facts)).toEqual(['fixed-width div[0]']);
  });

  it('measures the space of a text origin inside its own padding', () => {
    const [o] = probe([box('p', { style: { paddingLeft: '16px', paddingRight: '16px' } }, [text(url, [16, 520])])]).origins;
    expect(o?.spacePx).toBe(288);
  });

  it('reports a block once, however many of its runs stick out', () => {
    const facts = probe([box('p', {}, [text('first-long-word-here', [0, 400]), box('span', { at: [0, 600] }, [text('a-second-and-longer-word-here', [0, 600])])])]);
    expect(facts.originCount).toBe(1);
    expect(facts.origins[0]).toMatchObject({ word: 'a-second-and-longer-word-here', overPx: 280 });
  });

  it('looks at a child block in its own turn, not as part of its parent', () => {
    const facts = probe([box('div', {}, [text('short', [0, 40]), box('p', { id: 'inner' }, [text(url, [0, 520])])])]);
    expect(kinds(facts)).toEqual(['long-word p#inner[0]']);
  });

  it('finds no text origin in a browser with no ranges, and still finds boxes', () => {
    const facts = probe([box('p', {}, [text(url, [0, 520])]), box('div', { at: [0, 400] })], { noRange: true });
    expect(kinds(facts)).toEqual(['fixed-width div[0]']);
  });
});

describe('regions that scroll sideways', () => {
  const region = (children: Parameters<typeof box>[2], spec: Parameters<typeof box>[1] = {}) => box('div', { id: 'scroller', style: { overflowX: 'auto' }, scrollWidth: 600, clientWidth: 320, ...spec }, children);

  it('reports a region whose content is wider than it, on a page that does not scroll', () => {
    const facts = probe([region([box('table', { at: [0, 600], style: { display: 'table' } })])], { scrollWidth: 320 });
    expect(facts.pageScrolls).toBe(false);
    expect(facts.regions).toEqual([{ id: 'div#scroller[0]', tag: 'div', contentPx: 600, spacePx: 320, table: true, pre: false, media: false, textBlock: false, role: '', keyboard: false }]);
    expect(facts.regionCount).toBe(1);
  });

  it('takes overflow-x auto and scroll as regions, and nothing else', () => {
    for (const [overflowX, n] of [['auto', 1], ['scroll', 1], ['hidden', 0], ['clip', 0], ['visible', 0]] as const) {
      expect(probe([region([], { style: { overflowX } })], { scrollWidth: 320 }).regionCount, overflowX).toBe(n);
    }
  });

  it('does not report a region whose content fits, within a pixel', () => {
    expect(probe([region([], { scrollWidth: 320 })]).regions).toEqual([]);
    expect(probe([region([], { scrollWidth: 321 })]).regions).toEqual([]);
    expect(probe([region([], { scrollWidth: 322 })], { scrollWidth: 320 }).regions).toHaveLength(1);
  });

  it('says what the region holds', () => {
    const one = (child: ReturnType<typeof box>) => probe([region([child])], { scrollWidth: 320 }).regions[0];
    expect(one(box('pre', { at: [0, 600] }))).toMatchObject({ pre: true, table: false, media: false });
    expect(one(box('p', {}, [box('code', { at: [0, 600] })]))).toMatchObject({ pre: true });
    expect(one(box('img', { at: [0, 600] }))).toMatchObject({ media: true });
    expect(one(box('div', { at: [0, 600], attrs: { role: 'img' } }))).toMatchObject({ media: true });
    expect(one(box('div', { at: [0, 600], attrs: { role: 'grid' } }))).toMatchObject({ table: true });
    expect(one(box('div', { at: [0, 600] }))).toMatchObject({ table: false, pre: false, media: false, textBlock: false });
  });

  it('counts a scrolling pre or table as holding itself', () => {
    const pre = box('pre', { id: 'block', style: { overflowX: 'auto' }, scrollWidth: 700, clientWidth: 320 }, [text('const a = b;', [0, 700])]);
    expect(probe([pre], { scrollWidth: 320 }).regions[0]).toMatchObject({ id: 'pre#block[0]', pre: true, tag: 'pre' });
  });

  it('sees running text that is wider than the region', () => {
    const wide = probe([region([box('p', { at: [0, 600] }, [text(WORDS.repeat(4), [0, 590])])])], { scrollWidth: 320 }).regions[0];
    expect(wide?.textBlock).toBe(true);
    const unwrapped = probe([region([box('li', { at: [0, 320], scrollWidth: 600, clientWidth: 320 })])], { scrollWidth: 320 }).regions[0];
    expect(unwrapped?.textBlock).toBe(true);
    const fits = probe([region([box('p', { at: [0, 320] }), box('img', { at: [0, 600] })])], { scrollWidth: 320 }).regions[0];
    expect(fits?.textBlock).toBe(false);
  });

  it('does not count text inside a table or a pre as running text', () => {
    const facts = probe([region([box('table', { at: [0, 600], style: { display: 'table' } }, [box('p', { at: [0, 600] })]), box('pre', { at: [0, 600] }, [box('p', { at: [0, 600] })])])], { scrollWidth: 320 });
    expect(facts.regions[0]).toMatchObject({ textBlock: false, table: true, pre: true });
  });

  it('says whether the region can be reached with the keyboard', () => {
    const r = (spec: Parameters<typeof box>[1], children: Parameters<typeof box>[2] = []) => probe([region(children, spec)], { scrollWidth: 320 }).regions[0]?.keyboard;
    expect(r({})).toBe(false);
    expect(r({ attrs: { tabindex: '0' } })).toBe(true);
    expect(r({ attrs: { tabindex: '-1' } })).toBe(false);
    expect(r({}, [box('a', { attrs: { href: '/x' } })])).toBe(true);
    expect(r({}, [box('a', {})])).toBe(false);
    expect(r({}, [box('button', {})])).toBe(true);
    expect(r({}, [box('div', { attrs: { tabindex: '0' } })])).toBe(true);
    expect(r({}, [box('div', { attrs: { tabindex: '-1' } })])).toBe(false);
  });

  it('reads the role of the region, in lower case', () => {
    expect(probe([region([], { attrs: { role: 'Region' } })], { scrollWidth: 320 }).regions[0]?.role).toBe('region');
  });

  it('keeps a limited number of regions and counts them all', () => {
    const many = Array.from({ length: 5 }, () => region([]));
    const facts = probe(many, { scrollWidth: 320 }, { maxElements: 3000, keep: 2 });
    expect(facts.regions).toHaveLength(2);
    expect(facts.regionCount).toBe(5);
  });

  it('reports a region and an origin on the same page, and nothing inside the region as an origin', () => {
    const facts = probe([region([box('table', { at: [0, 600], style: { display: 'table' } })]), box('div', { id: 'real', at: [0, 420] })]);
    expect(facts.regions.map((r) => r.id)).toEqual(['div#scroller[0]']);
    expect(kinds(facts)).toEqual(['fixed-width div#real[1]']);
  });
});

describe('a page written right to left', () => {
  it('says so, from the body or from the root', () => {
    expect(probe([box('p', {})], { dir: 'rtl' }).rtl).toBe(true);
    expect(probe([box('p', {})]).rtl).toBe(false);
    expect(probe([box('p', {})], { bodyStyle: { direction: 'rtl' } }).rtl).toBe(true);
  });

  it('measures overflow past the left edge', () => {
    const facts = probe([box('div', { id: 'card', at: [-280, 320] })], { dir: 'rtl' });
    expect(facts.pageScrolls).toBe(true);
    expect(facts.origins[0]).toMatchObject({ id: 'div#card[0]', overPx: 280, widthPx: 600, spacePx: 320, shifted: false });
  });

  it('ignores a box moved off the right edge', () => {
    const facts = probe([box('a', { at: [9000, 9100], style: { position: 'absolute', display: 'block' } })], { dir: 'rtl', scrollWidth: 320 });
    expect(facts.origins).toEqual([]);
  });

  it('measures text past the left edge of its block', () => {
    const facts = probe([box('p', {}, [text('a-long-word-with-no-break-in-it', [-150, 320])])], { dir: 'rtl' });
    expect(facts.origins[0]).toMatchObject({ text: true, overPx: 150 });
  });

  it('takes the left padding of the parent out of the space', () => {
    const parent = box('section', { at: [0, 320], style: { paddingLeft: '20px' } }, [box('div', { id: 'w', at: [-100, 320] })]);
    const [o] = probe([parent], { dir: 'rtl' }).origins;
    expect(o).toMatchObject({ spacePx: 300, overPx: 100 });
  });
});

describe('the function itself', () => {
  it('can be sent to a browser: it reads nothing from outside its own body but its argument and the page', () => {
    const source = overflowInPage.toString();
    expect(source).not.toMatch(/\bOVERFLOW_ARGS\b|\bEMPTY_OVERFLOW\b|\bimport\b|\brequire\(/);
    expect(source).toContain('globalThis');
  });

  it('changes nothing on the page: it sets no attribute, style or scroll position', () => {
    const source = overflowInPage.toString();
    expect(source).not.toMatch(/setAttribute|removeAttribute|\.style\.|scrollTo|scrollLeft\s*=|innerHTML|appendChild|remove\(\)|classList/);
  });

  it('puts the globals back after a probe in these tests', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const before = g['document'];
    probe([box('p', {})]);
    expect(g['document']).toBe(before);
  });
});
