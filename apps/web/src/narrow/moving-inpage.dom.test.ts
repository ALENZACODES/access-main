/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOVING_ARGS, movingLookInPage, type MovingLook } from './moving-inpage.js';

/**
 * jsdom lays nothing out and runs no animation: each element gets the box in
 * its data-box attribute ("left top width height"), or 0 0 80 44, and the
 * tests give document.getAnimations and window.matchMedia when they need
 * them. Real animations are read in Chromium, in e2e-moving.test.ts.
 */
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [left = 0, top = 0, width = 80, height = 44] = (this.getAttribute('data-box') ?? '0 0 80 44').split(' ').map(Number);
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  delete (document as unknown as { getAnimations?: unknown }).getAnimations;
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): MovingLook => {
  document.body.innerHTML = html;
  return movingLookInPage({ ...MOVING_ARGS, exclude });
};

describe('movingLookInPage', () => {
  it('gives the controls with their boxes, counting each one among those of the same kind and name', () => {
    const f = read('<button data-box="10 20 100 50">A</button><button hidden>Hidden</button><a href="#" id="go">Go</a><button>B</button><button>A</button>');
    expect(f.controls).toEqual([
      { id: 'button[0]', name: 'A', left: 10, top: 20, width: 100, height: 50 },
      { id: 'a#go[0]', name: 'Go', left: 0, top: 0, width: 80, height: 44 },
      { id: 'button[0]', name: 'B', left: 0, top: 0, width: 80, height: 44 },
      { id: 'button[1]', name: 'A', left: 0, top: 0, width: 80, height: 44 },
    ]);
  });

  it('keeps the id of a control when another one is inserted before it', () => {
    const before = read('<button>Send</button>').controls;
    const after = read('<button>Accept cookies</button><button>Send</button>').controls;
    expect(after.find((x) => x.name === 'Send')?.id).toBe(before[0]?.id);
  });

  it('says animations and the motion setting are UNKNOWN when the browser does not give them', () => {
    const f = read('<button>A</button>');
    expect(f.animations).toBeNull();
    expect(f.reduceMotion).toBeNull();
    expect(typeof f.at).toBe('number');
  });

  it('lists running animations, endless or not, on controls or not, leaving out the excluded part', () => {
    document.body.innerHTML = '<div id="ad"><button>Buy</button></div><p id="news">News</p><div class="moving"><span id="mine">x</span></div><p id="paused">p</p>';
    const target = (id: string): Element => document.getElementById(id) as Element;
    (document as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [
      { playState: 'running', animationName: 'slide', effect: { target: target('ad'), getTiming: () => ({ iterations: Infinity }) } },
      { playState: 'running', transitionProperty: 'opacity', effect: { target: target('news'), getTiming: () => ({ iterations: 1 }) } },
      { playState: 'running', animationName: 'spin', effect: { target: target('mine'), getTiming: () => ({ iterations: Infinity }) } },
      { playState: 'paused', animationName: 'blink', effect: { target: target('paused'), getTiming: () => ({ iterations: Infinity }) } },
      { playState: 'running', animationName: 'ghost', effect: null },
    ];
    const f = movingLookInPage({ ...MOVING_ARGS, exclude: '.moving' });
    expect(f.animations).toEqual([
      { target: 'div#ad', name: 'slide', endless: true, control: true },
      { target: 'p#news', name: 'opacity', endless: false, control: false },
    ]);
  });

  it('finds buttons that may pause motion, in both languages', () => {
    const f = read('<button>Pause the slides</button><button aria-label="Arrêter l’animation">■</button><button>Buy</button><button hidden>Stop</button><input type="checkbox" aria-label="Reduce motion">');
    expect(f.pauseControls).toEqual(['Pause the slides', 'Arrêter l’animation', 'Reduce motion']);
  });

  it('matches whole words only, so a stop in another word is not a pause button', () => {
    expect(read('<button>Count the stops on this page</button><button>Display</button><button>Bus stop map</button><button>Lecture</button>').pauseControls).toEqual(['Bus stop map', 'Lecture']);
  });

  it('reads whether the device asks for less motion', () => {
    const media = (reduce: boolean | null) => (q: string) => ({ media: q, matches: reduce === null ? false : q.endsWith(': reduce)') ? reduce : !reduce });
    for (const [reduce, expected] of [
      [true, true],
      [false, false],
      [null, null],
    ] as const) {
      (window as unknown as { matchMedia: unknown }).matchMedia = media(reduce);
      expect(read('<p>x</p>').reduceMotion).toBe(expected);
    }
  });

  it('stops at the limit, leaves out the excluded part and changes nothing', () => {
    const html = '<div class="moving"><button>Mine</button></div>' + Array.from({ length: 4 }, (_, i) => `<button>B${i}</button>`).join('');
    document.body.innerHTML = html;
    const f = movingLookInPage({ maxControls: 2, exclude: '.moving' });
    expect(f.controls.map((x) => x.name)).toEqual(['B0', 'B1']);
    expect(f.truncated).toBe(true);
    expect(document.body.innerHTML).toBe(html);
  });
});
