/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TYPING_ARGS, pageTypingOf, typingRawInPage, type TypingRaw } from './typing-inpage.js';

/** Each element gets the size in its data-size attribute ("width height"); 100 × 44 when it has none. */
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const [width = 100, height = 44] = (this.getAttribute('data-size') ?? '100 44').split(' ').map(Number);
    return { x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): TypingRaw => {
  document.body.innerHTML = html;
  return typingRawInPage({ ...TYPING_ARGS, exclude });
};

describe('typingRawInPage', () => {
  it('counts the text fields a person can type in', () => {
    const raw = read(
      '<input><input type="email"><input type="TEL"><input type="search"><input type="password"><input type="number"><input type="url"><textarea></textarea><div contenteditable="true"></div><div role="textbox"></div>',
    );
    expect(raw.fields).toBe(10);
  });

  it('leaves out fields that take no typing, and fields a person cannot use or see', () => {
    const raw = read(
      '<input type="checkbox"><input type="radio"><input type="submit"><input type="date"><input type="hidden"><input type="range">' +
        '<input disabled><input readonly><textarea readonly></textarea>' +
        '<div style="display:none"><input></div><div hidden><input></div><div inert><input></div><input style="visibility:hidden">' +
        '<input data-size="0 44"><input data-size="100 0">' +
        '<input>',
    );
    expect(raw.fields).toBe(1);
  });

  it('leaves out the part it is told to, in the count and in the text', () => {
    const raw = read('<section class="typing"><input><input><p>Session expires after 2 minutes.</p></section><input><p>Hello.</p>', '.typing');
    expect(raw.fields).toBe(1);
    expect(raw.sentences).toEqual(['Hello.']);
  });

  it('gives the text in sentences, without scripts, styles or templates, and changes nothing', () => {
    const html = '<p>First one. Second one!  Third\n one?</p><script>var a = "Session expires in 5 minutes."</script><style>p{}</style><template><p>Timed out after 1 min.</p></template><p>Last</p>';
    const raw = read(html);
    expect(raw.sentences).toEqual(['First one.', 'Second one!', 'Third', 'one?', 'Last']);
    expect(document.body.innerHTML).toBe(html);
  });
});

describe('pageTypingOf', () => {
  it('finds a limit the page states, and keeps the sentence', () => {
    const page = pageTypingOf(read('<form><label>Name <input></label><label>Email <input type="email"></label></form><p>For your safety, your session will expire after 10 minutes of inactivity.</p>'));
    expect(page).toEqual({ fields: 2, limitMinutes: 10, limitText: 'For your safety, your session will expire after 10 minutes of inactivity.' });
  });

  it('finds one in French', () => {
    expect(pageTypingOf(read('<p>Vous serez déconnecté après 15 minutes d’inactivité.</p><input>')).limitMinutes).toBe(15);
  });

  it('has no limit when none is stated', () => {
    expect(pageTypingOf(read('<input><p>The walk takes 20 minutes.</p>'))).toEqual({ fields: 1, limitMinutes: null, limitText: '' });
  });
});
