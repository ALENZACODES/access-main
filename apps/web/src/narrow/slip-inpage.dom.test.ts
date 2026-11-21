/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SLIP_ARGS, slipInPage, type SlipFacts } from './slip-inpage.js';

/** What is read from a real DOM. Each element gets the box in its data-box attribute ("left top width height", in the window), and the window a scroll. */
const original = Element.prototype.getBoundingClientRect;
const set = (target: object, key: string, value: number): void => {
  Object.defineProperty(target, key, { configurable: true, get: () => value });
};
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [left = 0, top = 0, width = 44, height = 44] = (this.getAttribute('data-box') ?? '0 0 44 44').split(' ').map(Number);
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
  set(window, 'scrollX', 0);
  set(window, 'scrollY', 100);
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): SlipFacts => {
  document.body.innerHTML = html;
  return slipInPage({ ...SLIP_ARGS, exclude });
};

describe('slipInPage', () => {
  it('gives each control its name and its box on the page, with the scroll added', () => {
    const f = read('<button data-box="10 20 44 44">Save</button><button aria-label="Delete place" data-box="58 20 30 30">×</button><input type="submit" value="Send" data-box="0 -50 80 44">');
    expect(f.controls).toEqual([
      { id: 'button[0]', name: 'Save', left: 10, top: 120, width: 44, height: 44 },
      { id: 'button[1]', name: 'Delete place', left: 58, top: 120, width: 30, height: 30 },
      { id: 'input[0]', name: 'Send', left: 0, top: 50, width: 80, height: 44 },
    ]);
  });

  it('names a field by its label, and a control by aria-labelledby, title or alt', () => {
    const f = read('<label for="q">Town</label><input id="q"><span id="l">Clear all</span><button aria-labelledby="l">x</button><a href="/s" title="Sign out"></a>');
    expect(f.controls.map((c) => c.name)).toEqual(['Town', 'Clear all', 'Sign out']);
  });

  it('leaves out hidden, disabled, inert and boxless controls, and the excluded part', () => {
    const f = read('<button hidden>A</button><button disabled>B</button><div inert><button>C</button></div><button data-box="0 0 0 0">D</button><div class="slip"><button>E</button></div><button>Kept</button>', '.slip');
    expect(f.controls.map((c) => c.name)).toEqual(['Kept']);
  });

  it('reads no more controls than asked, says the page was cut, and moves no focus', () => {
    document.body.innerHTML = '<button>1</button><button>2</button><button>3</button>';
    const f = slipInPage({ maxControls: 2, exclude: '' });
    expect(f.controls).toHaveLength(2);
    expect(f.truncated).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });
});
