/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZONE_ARGS, ZONE_SELECTOR, zonesInPage, type ZoneFacts } from './zones-inpage.js';

/**
 * The controls and their places read from a real DOM. jsdom lays nothing
 * out, so each element is given the box written in its data-box attribute
 * ("left top width height"), and the window its size and scroll here.
 */

const original = Element.prototype.getBoundingClientRect;
const set = (target: object, key: string, value: number): void => {
  Object.defineProperty(target, key, { configurable: true, get: () => value });
};
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [left = 0, top = 0, width = 50, height = 20] = (this.getAttribute('data-box') ?? '0 0 50 20').split(' ').map(Number);
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
  set(document.documentElement, 'clientWidth', 320);
  set(document.documentElement, 'clientHeight', 640);
  set(document.documentElement, 'scrollHeight', 2000);
  set(window, 'scrollY', 300);
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): ZoneFacts => {
  document.body.innerHTML = html;
  return zonesInPage({ ...ZONE_ARGS, exclude });
};

describe('zonesInPage', () => {
  it('gives the window size, the scroll now and how far the page can scroll', () => {
    const f = read('<button>Go</button>');
    expect([f.viewportWidth, f.viewportHeight, f.scrollY, f.maxScrollY, f.offPage, f.truncated]).toEqual([320, 640, 300, 1360, 0, false]);
  });

  it('reads links, buttons, fields, summaries and elements with a role or a tabindex, with their boxes', () => {
    const f = read(
      '<a href="/a" data-box="10 20 100 44">Link</a><button data-box="0 100 44 44">B</button><label for="t">Town</label><input id="t" data-box="0 200 200 44">' +
        '<details><summary>More</summary></details><div role="button" tabindex="0">Role</div><span tabindex="0">Span</span><select aria-label="Pick"><option>A</option></select><textarea title="Notes"></textarea>',
    );
    expect(f.controls.map((c) => c.name)).toEqual(['Link', 'B', 'Town', 'More', 'Role', 'Span', 'Pick', 'Notes']);
    expect(f.controls[0]).toEqual({ id: 'a[0]', name: 'Link', left: 10, top: 20, width: 100, height: 44, pinned: false });
  });

  it('leaves out what a person cannot press: hidden, disabled, inert, display none, no box, tabindex -1 and a link with no href', () => {
    const f = read(
      '<input type="hidden"><button disabled>Off</button><div inert><button>Inert</button></div><div style="display:none"><a href="/x">Gone</a></div>' +
        '<button style="visibility:hidden">Unseen</button><button data-box="0 0 0 0">No box</button><span tabindex="-1">Minus</span><a>No href</a><button>Kept</button>',
    );
    expect(f.controls.map((c) => c.name)).toEqual(['Kept']);
  });

  it('says a control stays in place when it or something around it is fixed or sticky', () => {
    const f = read('<header style="position:fixed"><div><button>In fixed</button></div></header><nav style="position:sticky"><a href="/s">In sticky</a></nav><button style="position:fixed">Fixed</button><button>Scrolls</button>');
    expect(f.controls.map((c) => [c.name, c.pinned])).toEqual([
      ['In fixed', true],
      ['In sticky', true],
      ['Fixed', true],
      ['Scrolls', false],
    ]);
  });

  it('leaves out controls placed above or left of the page, where no scroll brings them, and counts them', () => {
    // The window is scrolled by 300, so a box at -350 is 50 pixels above the page, and one at -100 is on it.
    const f = read('<a href="#main" data-box="0 -350 100 40">Skip</a><a href="/l" data-box="-200 10 100 40">Left</a><a href="/on" data-box="0 -100 100 40">On the page</a><button style="position:fixed" data-box="0 -60 44 44">Fixed above</button>');
    expect(f.controls.map((c) => c.name)).toEqual(['On the page']);
    expect(f.offPage).toBe(3);
  });

  it('names a control the way the reach count does, and gives the value of an input button', () => {
    const f = read('<span id="a">Send</span><span id="b">now</span><button aria-labelledby="a b">x</button><input placeholder="Search"><input type="submit" value="Save">');
    expect(f.controls.map((c) => c.name)).toEqual(['Send now', 'Search', 'Save']);
  });

  it('gives each control an id made of its tag, its id and its number among controls of that tag', () => {
    const f = read('<button id="go">Go</button><button disabled>Off</button><button>Again</button>');
    expect(f.controls.map((c) => c.id)).toEqual(['button#go[0]', 'button[2]']);
  });

  it('leaves out the part of the page given to exclude', () => {
    expect(read('<a href="/1">Page</a><div class="zones"><button>Panel</button></div>', '.zones').controls.map((c) => c.name)).toEqual(['Page']);
  });

  it('reads no more controls than asked, and says the page was cut', () => {
    document.body.innerHTML = '<a href="/1">One</a><a href="/2">Two</a><a href="/3">Three</a>';
    const f = zonesInPage({ maxControls: 2, exclude: '', selector: ZONE_SELECTOR });
    expect(f.controls.map((c) => c.name)).toEqual(['One', 'Two']);
    expect(f.truncated).toBe(true);
  });

  it('gives no window size when the browser gives none', () => {
    set(document.documentElement, 'clientWidth', 0);
    set(document.documentElement, 'clientHeight', 0);
    set(window, 'innerWidth', 0);
    set(window, 'innerHeight', 0);
    const f = read('<button>Go</button>');
    expect([f.viewportWidth, f.viewportHeight]).toEqual([null, null]);
  });

  it('moves no focus and does not scroll', () => {
    read('<a href="/1">One</a>');
    expect(document.activeElement).toBe(document.body);
    expect(window.scrollY).toBe(300);
  });
});
