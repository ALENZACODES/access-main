/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCROLL_ARGS, scrollInPage, type ScrollFacts } from './scroll-inpage.js';

/**
 * What is read from a real DOM. jsdom lays nothing out, so each element is
 * given the box written in its data-box attribute ("left top width height",
 * in the window as scrolled now), and the window its size and scroll here.
 */

const original = Element.prototype.getBoundingClientRect;
const set = (target: object, key: string, value: number): void => {
  Object.defineProperty(target, key, { configurable: true, get: () => value });
};
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [left = 0, top = 0, width = 100, height = 20] = (this.getAttribute('data-box') ?? '0 0 100 20').split(' ').map(Number);
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
  set(document.documentElement, 'clientWidth', 320);
  set(document.documentElement, 'clientHeight', 640);
  set(document.documentElement, 'scrollHeight', 4000);
  set(window, 'scrollY', 200);
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): ScrollFacts => {
  document.body.innerHTML = html;
  return scrollInPage({ ...SCROLL_ARGS, exclude });
};

describe('scrollInPage', () => {
  it('gives the window, the page height, and each heading with its level and place on the page', () => {
    const f = read('<h1 data-box="0 -150 300 40">Title</h1><main><h2 data-box="0 600 300 30">Hours</h2><div role="heading" aria-level="4" data-box="0 900 300 20">Notes</div></main>');
    expect([f.viewportWidth, f.viewportHeight, f.pageHeight]).toEqual([320, 640, 4000]);
    expect(f.headings).toEqual([
      { level: 1, text: 'Title', top: 50, inMain: false },
      { level: 2, text: 'Hours', top: 800, inMain: true },
      { level: 4, text: 'Notes', top: 1100, inMain: true },
    ]);
  });

  it('leaves out hidden headings and the excluded part of the page', () => {
    const f = read('<h2 hidden>Hidden</h2><div style="display:none"><h2>Gone</h2></div><h2 data-box="0 0 0 0">No box</h2><div class="panel"><h2>Panel</h2></div><h2>Kept</h2>', '.panel');
    expect(f.headings.map((h) => h.text)).toEqual(['Kept']);
  });

  it('finds the buttons that send a form, and not other buttons', () => {
    const f = read(
      '<form><input aria-label="Town"><button data-box="0 1000 80 44">Send</button><button type="button">Help</button><input type="submit" value="Go" data-box="0 1100 80 44"><button type="submit" disabled>Off</button></form><button>Outside a form</button>',
    );
    expect(f.submits).toEqual([
      { name: 'Send', top: 1200 },
      { name: 'Go', top: 1300 },
    ]);
  });

  it('gives the last control of the page by its place, not by its order in the markup', () => {
    const f = read('<a href="/b" data-box="0 2000 80 20">Bottom</a><a href="/t" data-box="0 10 80 20">Top</a><button disabled data-box="0 3000 80 20">Off</button>');
    expect(f.lastControl).toEqual({ name: 'Bottom', top: 2200 });
    expect(read('<p>No control</p>').lastControl).toBeNull();
  });

  it('counts links back to the top: to # or #top, or to a place near the top from far down', () => {
    const f = read('<div id="start" data-box="0 -200 10 10"></div><a href="#">Top</a><a href="#top">Top</a><a href="#start" data-box="0 1500 80 20">Start</a><a href="#start" data-box="0 100 80 20">Near</a><a href="#nowhere" data-box="0 1500 80 20">Broken</a>');
    expect(f.toTop).toBe(3);
  });

  it('gives the height that wide fixed or sticky bars cover at the top and at the bottom', () => {
    const f = read(
      '<header style="position:fixed" data-box="0 0 320 64">Bar</header><nav style="position:sticky" data-box="0 0 320 80">Nav</nav><div style="position:fixed" data-box="0 540 320 100">Bottom bar</div><div style="position:fixed" data-box="0 300 60 60">Small</div>',
    );
    expect([f.coveredTop, f.coveredBottom]).toEqual([80, 100]);
  });

  it('moves no focus and does not scroll', () => {
    read('<a href="/1">One</a>');
    expect(document.activeElement).toBe(document.body);
    expect(window.scrollY).toBe(200);
  });
});
