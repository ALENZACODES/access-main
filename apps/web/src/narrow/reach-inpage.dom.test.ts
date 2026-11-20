/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REACH_ARGS, reachInPage, type ReachFacts } from './reach-inpage.js';

/**
 * The tab order worked out from a real DOM. jsdom lays nothing out, so every
 * element is given a box here, except those marked data-nobox.
 */

const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const none = this.hasAttribute('data-nobox');
    return { x: 0, y: 0, top: 0, left: 0, right: none ? 0 : 50, bottom: none ? 0 : 20, width: none ? 0 : 50, height: none ? 0 : 20, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): ReachFacts => {
  document.body.innerHTML = html;
  return reachInPage({ ...REACH_ARGS, exclude });
};
const names = (f: ReachFacts): string[] => f.stops.map((s) => s.name);

describe('reachInPage', () => {
  it('goes through links, buttons and fields in document order, with their names', () => {
    const f = read('<a href="/a">First</a><button type="button">Second</button><label for="q">Your town</label><input id="q"><textarea aria-label="Notes"></textarea><select title="Size"><option>S</option></select>');
    expect(names(f)).toEqual(['First', 'Second', 'Your town', 'Notes', 'S']);
    expect(f.stops.map((s) => s.tag)).toEqual(['a', 'button', 'input', 'textarea', 'select']);
    expect([f.invisible, f.positive, f.truncated]).toEqual([0, 0, false]);
  });

  it('skips what cannot take focus by Tab: no href, disabled, tabindex -1, hidden inputs, hidden, inert and display none', () => {
    const f = read(
      '<a>No href</a><button disabled>Off</button><button tabindex="-1">Minus</button><input type="hidden" value="x">' +
        '<button style="visibility:hidden">Unseen</button><div style="display:none"><button>Gone</button></div><div inert><a href="/i">Inert</a></div><button>Kept</button>',
    );
    expect(names(f)).toEqual(['Kept']);
  });

  it('puts a positive tabindex first, in increasing order, and counts it', () => {
    const f = read('<a href="/1">One</a><button tabindex="2">Two</button><span tabindex="0">Span</span><button tabindex="1">Three</button>');
    expect(names(f)).toEqual(['Three', 'Two', 'One', 'Span']);
    expect(f.positive).toBe(2);
  });

  it('keeps a control with no size among the stops, since it takes a press, and counts it apart', () => {
    const f = read('<a href="/1" data-nobox>Hidden link</a><a href="/2">Shown</a>');
    expect(names(f)).toEqual(['Hidden link', 'Shown']);
    expect(f.invisible).toBe(1);
  });

  it('keeps one stop for a group of radio buttons: the checked one, or else the first', () => {
    const none = read('<input type="radio" name="g" aria-label="A"><input type="radio" name="g" aria-label="B"><button>After</button>');
    expect(names(none)).toEqual(['A', 'After']);
    const checked = read('<input type="radio" name="g" aria-label="A"><input type="radio" name="g" aria-label="B" checked><input type="radio" name="h" aria-label="C">');
    expect(names(checked)).toEqual(['B', 'C']);
  });

  it('shows only the summary of a closed details element, and all of an open one', () => {
    expect(names(read('<details><summary>More</summary><a href="/x">Inside</a></details>'))).toEqual(['More']);
    expect(names(read('<details open><summary>More</summary><a href="/x">Inside</a></details>'))).toEqual(['More', 'Inside']);
  });

  it('names each stop by the innermost landmark around it', () => {
    const f = read(
      '<header><a href="/h">Home</a></header><nav aria-label="Main menu"><a href="/n">Menu</a></nav><main><article><header><a href="/ah">In article</a></header></article>' +
        '<section aria-label="Filters"><button>Filter</button></section><section><button>Plain section</button></section><form aria-label="Find"><input aria-label="Query"></form>' +
        '<div role="search"><button>Search</button></div></main><aside><a href="/s">Side</a></aside><footer><a href="/f">Contact</a></footer><button>Outside</button>',
    );
    expect(f.stops.map((s) => [s.name, s.landmark])).toEqual([
      ['Home', 'banner'],
      ['Menu', 'navigation'],
      ['In article', 'main'],
      ['Filter', 'region'],
      ['Plain section', 'main'],
      ['Query', 'form'],
      ['Search', 'search'],
      ['Side', 'complementary'],
      ['Contact', 'contentinfo'],
      ['Outside', 'none'],
    ]);
  });

  it('takes the name from aria-labelledby, the label, the text, then title, placeholder or alt, and shortens it', () => {
    const long = 'word '.repeat(20);
    const f = read(
      `<span id="l1">Label</span><span id="l2">by id</span><button aria-labelledby="l1 l2">x</button><input placeholder="Type here"><a href="/i"><img alt="Logo" src="data:,"></a><button>${long}</button><button></button>`,
    );
    const got = names(f);
    expect(got.slice(0, 2)).toEqual(['Label by id', 'Type here']);
    // An image link has no text, so the name falls to the attributes of the link itself; the alt of the image is not read.
    expect(got[2]).toBe('');
    expect(got[3]).toHaveLength(60);
    expect(got[3]?.endsWith('…')).toBe(true);
    expect(got[4]).toBe('');
  });

  it('gives each stop an id made of its tag, its id and its number among elements of that tag', () => {
    const f = read('<div><button id="go">Go</button><button>Again</button></div>');
    expect(f.stops.map((s) => s.id)).toEqual(['button#go[0]', 'button[1]']);
  });

  it('finds where a same-page link leads: the first stop at or after the place, and whether it is main', () => {
    const f = read('<a href="#content">Skip</a><nav><a href="/1">One</a><a href="/2">Two</a></nav><main id="content"><a href="/3">Three</a></main><a href="#nowhere">Broken</a><a href="#top">Top</a>');
    const skip = f.stops[0];
    expect(skip).toMatchObject({ jumpTo: 3, jumpsToMain: true, jumpLands: false });
    expect(f.stops[4]).toMatchObject({ name: 'Broken', jumpTo: null, jumpsToMain: false });
    expect(f.stops[1]).toMatchObject({ jumpTo: null });
  });

  it('says the link lands on the place when the place can take focus itself', () => {
    const f = read('<a href="#q">To the field</a><a href="/1">One</a><input id="q" aria-label="Field"><a href="/2">After</a>');
    expect(f.stops[0]).toMatchObject({ jumpTo: 2, jumpLands: true, jumpsToMain: false });
  });

  it('leaves out the part of the page given to exclude, and nothing else', () => {
    const f = read('<a href="/1">Page</a><div class="reach"><button>Panel</button></div><a href="/2">More page</a>', '.reach');
    expect(names(f)).toEqual(['Page', 'More page']);
  });

  it('reads no more elements than asked, and says the page was cut', () => {
    document.body.innerHTML = '<a href="/1">One</a><a href="/2">Two</a><a href="/3">Three</a>';
    const f = reachInPage({ maxElements: 2, exclude: '' });
    expect(names(f)).toEqual(['One', 'Two']);
    expect(f.truncated).toBe(true);
  });

  it('moves no focus', () => {
    read('<a href="/1">One</a><button>Two</button>');
    expect(document.activeElement).toBe(document.body);
  });
});
