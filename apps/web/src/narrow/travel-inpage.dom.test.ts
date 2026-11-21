/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRAVEL_ARGS, travelInPage, type TravelFacts } from './travel-inpage.js';

/** What is read from a real DOM. Each element gets the box in its data-box attribute ("left top width height", in the window), and the window a width and a scroll. */
const original = Element.prototype.getBoundingClientRect;
const set = (target: object, key: string, value: number): void => {
  Object.defineProperty(target, key, { configurable: true, get: () => value });
};
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [left = 0, top = 0, width = 40, height = 40] = (this.getAttribute('data-box') ?? '0 0 40 40').split(' ').map(Number);
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
  set(document.documentElement, 'clientWidth', 320);
  set(window, 'scrollX', 0);
  set(window, 'scrollY', 50);
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): TravelFacts => {
  document.body.innerHTML = html;
  return travelInPage({ ...TRAVEL_ARGS, exclude });
};

describe('travelInPage', () => {
  it('gives each control its kind, its form, whether it sends, and its box on the page', () => {
    const f = read(
      '<form aria-label="Contact"><label for="n">Name</label><input id="n" data-box="10 20 200 40"><input type="checkbox" aria-label="News"><button data-box="10 100 80 44">Send</button><button type="button">Help</button></form><a href="/x">Home</a>',
    );
    expect(f.forms).toEqual(['Contact']);
    expect(f.viewportWidth).toBe(320);
    expect(f.controls.map((c) => [c.name, c.kind, c.form, c.submit])).toEqual([
      ['Name', 'field', 0, false],
      ['News', 'choice', 0, false],
      ['Send', 'button', 0, true],
      ['Help', 'button', 0, false],
      ['Home', 'link', -1, false],
    ]);
    expect(f.controls[0]).toMatchObject({ left: 10, top: 70, width: 200, height: 40 });
  });

  it('names forms by aria-label, aria-labelledby or their legend, and gives empty names to the others', () => {
    const f = read('<h2 id="h">Find a place</h2><form aria-labelledby="h"><input aria-label="Q"></form><form><fieldset><legend>Your details</legend><input aria-label="A"></fieldset></form><form><input aria-label="B"></form>');
    expect(f.forms).toEqual(['Find a place', 'Your details', '']);
    expect(f.controls.map((c) => c.form)).toEqual([0, 1, 2]);
  });

  it('counts a control tied to a form by its form attribute as part of that form', () => {
    const f = read('<form id="f"><input aria-label="In"></form><button form="f">Send</button>');
    expect(f.controls.map((c) => [c.name, c.form, c.submit])).toEqual([
      ['In', 0, false],
      ['Send', 0, true],
    ]);
  });

  it('leaves out hidden, disabled and boxless controls, the excluded part and its forms', () => {
    const f = read('<form><input hidden><input disabled><input data-box="0 0 0 0"><input aria-label="Kept"></form><div class="travel"><form><input aria-label="Panel"></form></div>', '.travel');
    expect(f.controls.map((c) => c.name)).toEqual(['Kept']);
    expect(f.forms).toEqual(['']);
  });

  it('reads no more controls than asked, says the page was cut, and moves no focus', () => {
    document.body.innerHTML = '<button>1</button><button>2</button><button>3</button>';
    const f = travelInPage({ maxControls: 2, exclude: '' });
    expect(f.controls).toHaveLength(2);
    expect(f.truncated).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });
});
