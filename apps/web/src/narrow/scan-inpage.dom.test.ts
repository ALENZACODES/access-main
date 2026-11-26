/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCAN_ARGS, scanInPage, type ScanFacts } from './scan-inpage.js';

/** jsdom lays nothing out: each element gets the box in its data-box attribute ("left top width height"), or 0 0 80 44. */
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [left = 0, top = 0, width = 80, height = 44] = (this.getAttribute('data-box') ?? '0 0 80 44').split(' ').map(Number);
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): ScanFacts => {
  document.body.innerHTML = html;
  return scanInPage({ ...SCAN_ARGS, exclude });
};
const names = (f: ScanFacts): string[] => f.controls.map((c) => c.name);

describe('scanInPage', () => {
  it('gives the controls in tab order: positive tabindex first, by number, then the page order', () => {
    const f = read('<a href="/">Home</a><button tabindex="2">Second</button><input aria-label="Name"><button tabindex="1">First</button><div tabindex="0">Card</div><select aria-label="Pick"></select>');
    expect(names(f)).toEqual(['First', 'Second', 'Home', 'Name', 'Card', 'Pick']);
  });

  it('leaves out what Tab does not reach', () => {
    const f = read(
      '<button tabindex="-1">Minus one</button><a>No href</a><div role="button">Role only</div><button disabled>Off</button>' +
        '<div hidden><button>Hidden</button></div><div style="display:none"><button>None</button></div><div inert><button>Inert</button></div>' +
        '<button style="visibility:hidden">Invisible</button><button data-box="0 0 0 0">No size</button><input type="hidden" value="x">' +
        '<button>Kept</button><div role="button" tabindex="0">Role with tabindex</div><div contenteditable="true">Editable</div>',
    );
    expect(names(f)).toEqual(['Kept', 'Role with tabindex', 'Editable']);
  });

  it('tells the main action: a submit button, a button in a form, or a name such as Send', () => {
    const f = read(
      '<form><input aria-label="Email"><button>Go</button></form><button type="button">Cancel</button><input type="submit" value="Order">' + '<button>Envoyer le formulaire</button><button>Sending tips</button><a href="#">Continue</a>',
    );
    expect(f.controls.map((c) => [c.name, c.main])).toEqual([
      ['Email', false],
      ['Go', true],
      ['Cancel', false],
      ['Order', true],
      ['Envoyer le formulaire', true],
      ['Sending tips', false],
      ['Continue', true],
    ]);
  });

  it('keeps the box on the page, with the scroll added', () => {
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    const f = read('<button data-box="10 20 100 50">A</button>');
    expect(f.controls[0]).toEqual({ id: 'button[0]', name: 'A', main: false, left: 10, top: 520, width: 100, height: 50 });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('leaves out the excluded part, stops at the limit and changes nothing', () => {
    const html = '<div class="scancost"><button>Mine</button></div>' + Array.from({ length: 5 }, (_, i) => `<button>B${i}</button>`).join('');
    document.body.innerHTML = html;
    const f = scanInPage({ maxControls: 3, exclude: '.scancost' });
    expect(names(f)).toEqual(['B0', 'B1', 'B2']);
    expect(f.truncated).toBe(true);
    expect(document.body.innerHTML).toBe(html);
  });
});
