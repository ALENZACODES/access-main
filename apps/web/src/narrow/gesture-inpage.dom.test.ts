/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GESTURE_ARGS, gestureInPage, type GestureFacts } from './gesture-inpage.js';

/**
 * What is read from a real DOM. jsdom lays nothing out, so each element gets
 * the size in its data-size attribute ("width height"), or 200 × 200. jsdom
 * knows neither touch-action nor scroll-snap-type: those two are read in
 * Chromium, in e2e-gestures.test.ts.
 */
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [width = 200, height = 200] = (this.getAttribute('data-size') ?? '200 200').split(' ').map(Number);
    return { x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): GestureFacts => {
  document.body.innerHTML = html;
  return gestureInPage({ ...GESTURE_ARGS, exclude });
};

describe('gestureInPage', () => {
  it('finds a slider, with plus and minus buttons or a number field next to it as other ways', () => {
    const f = read(
      '<div><label for="v">Volume</label><input id="v" type="range"><button>−</button><button>+</button></div>' +
        '<div><span id="z">Zoom</span><div role="slider" aria-labelledby="z" tabindex="0"></div><input type="number" aria-label="Zoom level"></div>' +
        '<div><div role="slider" aria-label="Year"></div></div>',
    );
    expect(f.items).toEqual([
      { id: 'input#v[0]', kind: 'slider', name: 'Volume', alternatives: ['−', '+'], keyboard: true },
      { id: 'div[0]', kind: 'slider', name: 'Zoom', alternatives: ['Zoom level'], keyboard: true },
      { id: 'div[1]', kind: 'slider', name: 'Year', alternatives: [], keyboard: false },
    ]);
  });

  it('finds items to drag, with move buttons as other ways, and not the parts inside one', () => {
    const f = read(
      '<ul><li draggable="true">Stop 1 <button>Move up</button><button>Move down</button><span draggable="true">grip</span></li>' + '<li aria-grabbed="false" tabindex="0">Stop 2</li></ul><p><button>Sign up</button></p>',
    );
    expect(f.items.map((i) => [i.kind, i.name, i.alternatives, i.keyboard])).toEqual([
      ['draggable', 'Stop 1 Move upMove downgrip', ['Move up', 'Move down'], false],
      ['draggable', 'Stop 2', ['Move up', 'Move down'], true],
    ]);
  });

  it('finds a carousel by its role description, in both languages, with previous, next and tabs', () => {
    const f = read(
      '<section aria-roledescription="carousel" aria-label="Photos"><button>Previous</button><div role="tab">1</div><button>Next</button></section>' +
        '<section aria-roledescription="carrousel" aria-label="Lieux"></section><section aria-roledescription="slide">x</section>',
    );
    expect(f.items.map((i) => [i.kind, i.name, i.alternatives])).toEqual([
      ['carousel', 'Photos', ['Previous', '1', 'Next']],
      ['carousel', 'Lieux', []],
    ]);
  });

  it('finds a large canvas or application with zoom buttons, and leaves out small ones', () => {
    const f = read(
      '<div><canvas aria-label="Map"></canvas><button aria-label="Zoom in">+</button><button>Sign in</button></div>' + '<canvas data-size="40 40"></canvas><div role="application" aria-label="Drawing" data-size="300 99"></div>',
    );
    expect(f.items).toEqual([{ id: 'canvas[0]', kind: 'canvas', name: 'Map', alternatives: ['Zoom in'], keyboard: false }]);
  });

  it('leaves out what is hidden, disabled, of no size or in the excluded part', () => {
    const f = read(
      '<input type="range" disabled><div hidden><input type="range"></div><div style="display:none"><canvas></canvas></div><div inert><div draggable="true">x</div></div>' +
        '<input type="range" style="visibility:hidden"><div draggable="true" data-size="0 10">y</div>' +
        '<div class="gest"><input type="range" aria-label="Mine"></div><input type="range" aria-label="Page">',
      '.gest',
    );
    expect(f.items.map((i) => i.name)).toEqual(['Page']);
  });

  it('does not count a hidden or disabled button as another way, and names a button with no name UNKNOWN', () => {
    const f = read('<div><input type="range" aria-label="A"><button hidden>+</button><button disabled>−</button></div><div><div role="slider" aria-label="B"></div><input type="number"></div>');
    expect(f.items.map((i) => i.alternatives)).toEqual([[], ['UNKNOWN']]);
  });

  it('stops at the limit and says so', () => {
    document.body.innerHTML = Array.from({ length: 5 }, (_, i) => `<p><input type="range" aria-label="R${i}"></p>`).join('');
    const f = gestureInPage({ maxItems: 3, exclude: '' });
    expect(f.items).toHaveLength(3);
    expect(f.truncated).toBe(true);
  });

  it('changes nothing in the page', () => {
    const html = '<div><input type="range" aria-label="V"><button>+</button></div><div draggable="true">x</div>';
    read(html);
    expect(document.body.innerHTML).toBe(html);
  });
});

describe('where other ways are looked for', () => {
  it('looks two levels around a control, but not across the main part of the page', () => {
    const f = read('<main><button>+</button><div><div><input type="range" aria-label="Near"></div><button>−</button></div><input type="range" aria-label="Far"></main>');
    expect(f.items.map((i) => [i.name, i.alternatives])).toEqual([
      ['Near', ['−']],
      ['Far', []],
    ]);
  });
});
