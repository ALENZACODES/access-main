/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { HOVER_ARGS, hoverInPage, type HoverFacts } from './hover-inpage.js';

/**
 * What is read from real style sheets in jsdom. Sheets from another origin,
 * and the device's hover setting, are read in Chromium, in e2e-hover.test.ts.
 */
afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

const read = (css: string, html: string, exclude = ''): HoverFacts => {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = html;
  return hoverInPage({ ...HOVER_ARGS, exclude });
};

describe('hoverInPage', () => {
  it('finds a menu shown on hover only, with the controls it hides', () => {
    const f = read('nav ul ul{display:none} nav li:hover > ul{display:block}', '<nav><ul><li>Travel<ul><li><a href="/bus">Bus</a></li><li><a href="/train">Train</a></li></ul></li></ul></nav>');
    expect(f.rules).toEqual([{ selector: 'nav li:hover > ul', reveals: ['display'], twin: false, hiddenNow: 1, controlsHidden: 1, controlNames: ['Bus', 'Train'] }]);
    expect([f.sheetsRead, f.sheetsUnread, f.truncated]).toEqual([1, 0, false]);
  });

  it('sees a focus rule in the same place, in the same list or another rule', () => {
    const same = read('.m .s{display:none} .m:hover .s, .m:focus-within .s{display:block}', '<div class="m"><div class="s">x</div></div>');
    expect(same.rules.map((r) => [r.selector, r.twin])).toEqual([['.m:hover .s', true]]);
    const apart = read('.m .s{display:none} .m:hover .s{display:block} .m:focus-within  .s{display:block}', '<div class="m"><div class="s">x</div></div>');
    expect(apart.rules[0]?.twin).toBe(true);
  });

  it('counts content hidden by visibility or opacity, not only display', () => {
    const f = read('.tip{visibility:hidden} .host:hover .tip{visibility:visible} .note{opacity:0} .host:hover .note{opacity:1}', '<div class="host"><span class="tip">Tip</span><span class="note">Note</span></div>');
    expect(f.rules.map((r) => [r.selector, r.reveals, r.hiddenNow, r.controlsHidden])).toEqual([
      ['.host:hover .tip', ['visibility'], 1, 0],
      ['.host:hover .note', ['opacity'], 1, 0],
    ]);
  });

  it('leaves out hover rules that only change a colour, hide, or are for what is not hovered', () => {
    const f = read('a:hover{color:red;text-decoration:underline} .x:hover .y{display:none} .p:not(:hover) .q{display:block}', '<a href="#">a</a><div class="x"><span class="y">y</span></div>');
    expect(f.rules).toEqual([]);
  });

  it('opens @media rules and keeps a rule that hides nothing right now', () => {
    const f = read('@media (min-width: 1px) { .card:hover .more{transform:scale(1.1)} }', '<div class="card"><span class="more">More</span></div>');
    expect(f.rules).toEqual([{ selector: '.card:hover .more', reveals: ['transform'], twin: false, hiddenNow: 0, controlsHidden: 0, controlNames: [] }]);
  });

  it('leaves out the excluded part: its sheets and its elements', () => {
    document.head.innerHTML = '<style>.a .b{display:none} .a:hover .b{display:block}</style>';
    document.body.innerHTML = '<div class="hoveronly"><style>.c:hover .d{display:block}</style><div class="a"><span class="b">mine</span></div></div><div class="a"><span class="b">page</span></div>';
    const f = hoverInPage({ ...HOVER_ARGS, exclude: '.hoveronly' });
    expect(f.rules.map((r) => [r.selector, r.hiddenNow])).toEqual([['.a:hover .b', 1]]);
    expect(f.sheetsRead).toBe(1);
  });

  it('copes with a selector the browser cannot query, stops at the limit and changes nothing', () => {
    const css = Array.from({ length: 4 }, (_, i) => `.h${i}:hover .t{display:block}`).join(' ');
    document.head.innerHTML = `<style>${css}</style>`;
    document.body.innerHTML = '<p>x</p>';
    const before = document.documentElement.outerHTML;
    const f = hoverInPage({ maxRules: 2, exclude: '' });
    expect(f.rules).toHaveLength(2);
    expect(f.truncated).toBe(true);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('reads whether the device can hover', () => {
    for (const [hover, expected] of [
      ['hover', true],
      ['none', false],
      [null, null],
    ] as const) {
      (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ matches: hover !== null && q === `(hover: ${hover})` });
      expect(read('', '<p>x</p>').deviceHover).toBe(expected);
    }
  });
});
