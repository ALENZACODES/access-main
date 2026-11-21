/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TWICE_ARGS, twiceInPage, type TwiceFacts } from './twice-inpage.js';

/** jsdom lays nothing out: each element gets the size in its data-size attribute ("width height"), or 120 × 44. */
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [width = 120, height = 44] = (this.getAttribute('data-size') ?? '120 44').split(' ').map(Number);
    return { x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): TwiceFacts => {
  document.body.innerHTML = html;
  return twiceInPage({ ...TWICE_ARGS, exclude });
};

describe('twiceInPage', () => {
  it('gives each field with its label, type, token, form and group', () => {
    const f = read(
      '<form><fieldset><legend>You</legend><label>Email <input type="email" autocomplete="Email"></label><label for="c">Confirm email</label><input id="c" type="EMAIL" autocomplete="off"></fieldset></form>' +
        '<form><textarea aria-label="Note"></textarea><select aria-labelledby="l"></select><span id="l">Province</span></form><input aria-label="Search" autocomplete="on">',
    );
    expect(f.fields).toEqual([
      { id: 'input[0]', label: 'Email', type: 'email', token: 'email', form: 0, group: 'You' },
      { id: 'input#c[1]', label: 'Confirm email', type: 'email', token: '', form: 0, group: 'You' },
      { id: 'textarea[0]', label: 'Note', type: 'textarea', token: '', form: 1, group: '' },
      { id: 'select[0]', label: 'Province', type: 'select', token: '', form: 1, group: '' },
      { id: 'input[2]', label: 'Search', type: 'text', token: '', form: -1, group: '' },
    ]);
    expect(f.truncated).toBe(false);
  });

  it('keeps the tokens of a section in one line', () => {
    expect(read('<input aria-label="Street" autocomplete="shipping   street-address">').fields[0]?.token).toBe('shipping street-address');
  });

  it('leaves out fields that take no answer, and fields a person cannot use or see', () => {
    const f = read(
      '<input type="hidden"><input type="submit"><input type="checkbox" aria-label="c"><input type="radio" aria-label="r"><input type="file" aria-label="f"><input disabled aria-label="d">' +
        '<div hidden><input aria-label="h"></div><div style="display:none"><input aria-label="n"></div><input style="visibility:hidden" aria-label="v"><input data-size="0 0" aria-label="z"><input aria-label="Kept">',
    );
    expect(f.fields.map((x) => x.label)).toEqual(['Kept']);
  });

  it('finds the boxes that may reuse an answer, in both languages', () => {
    const f = read('<label><input type="checkbox"> Same as shipping address</label><label><input type="checkbox"> Même adresse que la livraison</label><button>Use my previous address</button><label><input type="checkbox"> Send me news</label>');
    expect(f.sameAs).toEqual(['Same as shipping address', 'Même adresse que la livraison', 'Use my previous address']);
  });

  it('falls back to the placeholder or the name for a label', () => {
    expect(read('<input placeholder="Postal code"><input name="city">').fields.map((x) => x.label)).toEqual(['Postal code', 'city']);
  });

  it('leaves out the excluded part, stops at the limit and changes nothing', () => {
    const html = '<div class="twice"><input aria-label="Mine"></div>' + Array.from({ length: 4 }, (_, i) => `<input aria-label="F${i}">`).join('');
    document.body.innerHTML = html;
    const f = twiceInPage({ maxFields: 2, exclude: '.twice' });
    expect(f.fields.map((x) => x.label)).toEqual(['F0', 'F1']);
    expect(f.truncated).toBe(true);
    expect(document.body.innerHTML).toBe(html);
  });
});
