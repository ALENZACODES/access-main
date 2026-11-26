/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HIT_ARGS, hitInPage, type HitFacts } from './hit-inpage.js';

/**
 * jsdom lays nothing out and has no elementFromPoint: each element gets the
 * box in its data-box attribute ("left top width height"), or 0 0 100 50, and
 * the test answers elementFromPoint by the element marked data-top whose box
 * holds the point, or else the deepest element whose box does. Real layering
 * is read in Chromium, in e2e-hit.test.ts.
 */
const original = Element.prototype.getBoundingClientRect;
const box = (e: Element): [number, number, number, number] => {
  const [l = 0, t = 0, w = 100, h = 50] = (e.getAttribute('data-box') ?? '0 0 100 50').split(' ').map(Number);
  return [l, t, w, h];
};
const holds = (e: Element, x: number, y: number): boolean => {
  const [l, t, w, h] = box(e);
  return x >= l && x <= l + w && y >= t && y <= t + h;
};
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function rect(this: Element): DOMRect {
    const [left, top, width, height] = box(this);
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
  Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
  (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = (x, y) => {
    const tops = [...document.querySelectorAll('[data-top]')].filter((e) => holds(e, x, y));
    if (tops.length > 0) return tops[tops.length - 1] ?? null;
    const all = [...document.body.querySelectorAll('*')].filter((e) => holds(e, x, y));
    return all[all.length - 1] ?? document.body;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): HitFacts => {
  document.body.innerHTML = html;
  return hitInPage({ ...HIT_ARGS, scroll: false, exclude });
};

describe('hitInPage', () => {
  it('finds a control every point reaches, and one a banner covers fully', () => {
    const f = read('<button data-box="0 0 100 50">Clear</button><button data-box="0 500 100 50">Send</button><div id="bar" class="cookie bar" data-top data-box="0 480 400 120">We use cookies</div>');
    expect(f.controls).toEqual([
      { id: 'button[0]', name: 'Clear', reached: 5, cover: null },
      { id: 'button[1]', name: 'Send', reached: 0, cover: { what: 'div#bar.cookie', name: 'We use cookies', pinned: false, invisible: false } },
    ]);
    expect(f.offScreen).toBe(0);
  });

  it('counts the points a partial cover leaves, and says a cover with nothing to show is invisible', () => {
    const f = read('<button data-box="0 0 100 50">Menu</button><div data-top data-box="0 0 50 50"></div>');
    // The cover takes the middle point (x = 50) and the two on the left.
    expect(f.controls[0]?.reached).toBe(2);
    expect(f.controls[0]?.cover?.invisible).toBe(true);
    expect(f.controls[0]?.cover?.what).toBe('div');
  });

  it('counts what is inside the control, or its label, as reaching it', () => {
    const f = read('<button data-box="0 0 100 50"><span data-top data-box="0 0 100 50">Go</span></button><input id="c" type="checkbox" data-box="0 100 20 20"><label for="c" data-top data-box="0 100 200 20">Accept</label>');
    expect(f.controls.map((x) => [x.name, x.reached])).toEqual([
      ['Go', 5],
      ['Accept', 5],
    ]);
  });

  it('without scrolling, counts controls off the screen without testing them, and leaves out what cannot be pressed', () => {
    const f = read('<button data-box="0 700 100 50">Below</button><button data-box="-10 0 100 50">Left</button><button hidden>H</button><button disabled>D</button><button data-box="0 0 0 0">Z</button><button>In</button>');
    expect(f.controls.map((x) => x.name)).toEqual(['In']);
    expect(f.offScreen).toBe(2);
  });

  it('says a cover stuck to the screen is pinned', () => {
    const f = read('<button data-box="0 500 100 50">Send</button><nav style="position:fixed" data-top data-box="0 480 400 120"><span>Menu bar</span></nav>');
    expect(f.controls[0]?.cover?.pinned).toBe(true);
  });

  it('leaves out the excluded part, stops at the limit and changes nothing', () => {
    const html = '<div class="hittest"><button>Mine</button></div>' + Array.from({ length: 4 }, (_, i) => `<button data-box="0 ${i * 60} 100 50">B${i}</button>`).join('');
    document.body.innerHTML = html;
    const f = hitInPage({ maxControls: 2, scroll: false, exclude: '.hittest' });
    expect(f.controls.map((x) => x.name)).toEqual(['B0', 'B1']);
    expect(f.truncated).toBe(true);
    expect(document.body.innerHTML).toBe(html);
  });
});

describe('scrolling to each control', () => {
  /** A page that scrolls: a box is moved up by the scroll, and scrollTo moves it. */
  let scrollY = 0;
  const calls: number[] = [];
  beforeEach(() => {
    scrollY = 120;
    calls.length = 0;
    Object.defineProperty(window, 'scrollX', { get: () => 0, configurable: true });
    Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
    window.scrollTo = ((o: ScrollToOptions) => {
      scrollY = Math.max(0, o.top ?? 0);
      calls.push(scrollY);
    }) as typeof window.scrollTo;
    Element.prototype.getBoundingClientRect = function rect(this: Element): DOMRect {
      const [left, top, width, height] = box(this);
      const y = top - scrollY;
      return { x: left, y, left, top: y, width, height, right: left + width, bottom: y + height, toJSON: () => ({}) } as DOMRect;
    };
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = (x, y) => {
      const all = [...document.body.querySelectorAll('*')].filter((e) => {
        const r = e.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
      return all[all.length - 1] ?? document.body;
    };
  });

  it('brings a control below the screen to the middle, tests it, and puts the scroll back', () => {
    document.body.innerHTML = '<button data-box="0 150 100 50">Near</button><button data-box="0 2000 100 50">Far</button><button data-box="200 0 100 900">Too tall</button>';
    const f = hitInPage(HIT_ARGS);
    expect(f.controls.map((x) => [x.name, x.reached])).toEqual([
      ['Near', 5],
      ['Far', 5],
    ]);
    expect(f.offScreen).toBe(1);
    // To the middle of the screen for "Far" (2000 - (600 - 50) / 2 = 1725), a try for "Too tall", then back to 120.
    expect(calls[0]).toBe(1725);
    expect(calls.at(-1)).toBe(120);
    expect(scrollY).toBe(120);
  });

  it('does not scroll at all when every control is already on the screen', () => {
    document.body.innerHTML = '<button data-box="0 150 100 50">Near</button>';
    hitInPage(HIT_ARGS);
    expect(calls).toEqual([]);
  });
});
