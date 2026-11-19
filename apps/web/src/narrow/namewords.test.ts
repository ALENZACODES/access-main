import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { parseHtml } from './htmllint.js';
import { announcedRole, auditNameWords, MAX_NAME_CHARS, MAX_PLACEHOLDER_CHARS, NAME_WORD_RULES } from './namewords.js';
import { SAMPLE_NAME_WORDS_HTML } from './samples.js';

const found = (html: string): string[] => auditNameWords(html).entries.map((e) => `${e.rule}:${e.status}`);
const first = (html: string) => {
  const n = parseHtml(html).nodes[0];
  if (!n) throw new Error('no node');
  return n;
};

describe('announcedRole', () => {
  it('knows what is announced as a button or a link', () => {
    expect(announcedRole(first('<button>x</button>'))).toBe('button');
    expect(announcedRole(first('<summary>x</summary>'))).toBe('button');
    expect(announcedRole(first('<input type="submit" value="x">'))).toBe('button');
    expect(announcedRole(first('<div role="button">x</div>'))).toBe('button');
    expect(announcedRole(first('<a href="/x">x</a>'))).toBe('link');
    expect(announcedRole(first('<span role="link">x</span>'))).toBe('link');
  });
  it('returns null for everything else, and lets a role override the element', () => {
    expect(announcedRole(first('<a>x</a>'))).toBeNull();
    expect(announcedRole(first('<div>x</div>'))).toBeNull();
    expect(announcedRole(first('<input type="text">'))).toBeNull();
    expect(announcedRole(first('<button role="tab">x</button>'))).toBeNull();
    expect(announcedRole(first('<a href="/x" role="button">x</a>'))).toBe('button');
  });
});

describe('alt where it does nothing', () => {
  it.each(['div', 'span', 'a', 'button', 'svg', 'video', 'p'])('fails alt on a %s', (tag) => {
    const e = auditNameWords(`<${tag} alt="Ramp">Ramp</${tag}>`).entries.filter((x) => x.rule === 'alt-no-effect');
    expect(e).toHaveLength(1);
    expect(e[0]?.status).toBe('fail');
    expect(e[0]?.message.en).toContain('(“Ramp”)');
  });
  it('leaves the words out when the alt is empty', () => {
    expect(auditNameWords('<div alt="">x</div>').entries[0]?.message.en).toContain('has an alt attribute. Alt only works');
  });
  it('passes the elements that take alt, and custom elements', () => {
    expect(found('<img src="a.png" alt="Ramp"><map name="m"><area href="/a" alt="A"></map><input type="image" src="s.png" alt="Send"><fancy-img alt="x"></fancy-img>')).toEqual([]);
  });
  it('fails alt on an input that is not an image', () => {
    expect(found('<input type="text" alt="Name">')).toEqual(['alt-no-effect:fail']);
  });
});

describe('a name that says its role', () => {
  it('asks about a button or a link whose name includes the role word, in either language', () => {
    expect(found('<button aria-label="Close button">x</button>')).toEqual(['name-says-role:unknown']);
    expect(found('<button>Bouton Envoyer</button>')).toEqual(['name-says-role:unknown']);
    expect(found('<a href="/map">Map link</a>')).toEqual(['name-says-role:unknown']);
    expect(found('<a href="/carte">Lien vers la carte</a>')).toEqual(['name-says-role:unknown']);
    expect(found('<input type="submit" value="Submit button">')).toEqual(['name-says-role:unknown']);
  });
  it('uses the right word in French', () => {
    expect(auditNameWords('<button>Save button</button>').entries[0]?.message.fr).toContain('le mot qui désigne un bouton');
    expect(auditNameWords('<a href="/x">Home link</a>').entries[0]?.message.fr).toContain('le mot qui désigne un lien');
  });
  it('does not ask when the word is the whole name, is part of another word, or names the other role', () => {
    expect(found('<button>Button</button>')).toEqual([]);
    expect(found('<button>Unbutton</button><a href="/x">Linked accounts</a><a href="/y">Blink settings</a>')).toEqual([]);
    expect(found('<button>Copy link</button><a href="/b">Button styles</a>')).toEqual([]);
  });
  it('does not ask about elements with no such role', () => {
    expect(found('<p>Press the button</p><div aria-label="Button group" role="group">x</div>')).toEqual([]);
  });
});

describe('aria-label', () => {
  it(`asks about a name over ${MAX_NAME_CHARS} characters and gives its length`, () => {
    const long = 'a'.repeat(MAX_NAME_CHARS + 1);
    const e = auditNameWords(`<button aria-label="${long}">x</button>`).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['name-too-long:unknown']);
    expect(e[0]?.message.en).toContain(`${MAX_NAME_CHARS + 1} characters long`);
    expect(found(`<button aria-label="${'a'.repeat(MAX_NAME_CHARS)}">x</button>`)).toEqual([]);
  });
  it('asks about a label that repeats the visible text, whatever the case and spacing', () => {
    expect(found('<button aria-label="Save">Save</button>')).toEqual(['label-repeats-text:unknown']);
    expect(found('<a href="/m" aria-label="open  the map">Open the Map</a>')).toEqual(['label-repeats-text:unknown']);
    expect(found('<button aria-label="Save the form">Save</button>')).toEqual([]);
    expect(found('<button aria-label="Close">×</button>')).toEqual([]);
  });
  it('asks about an empty aria-label', () => {
    const e = auditNameWords('<input name="q" aria-label="">').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['aria-label-blank', 'unknown', 'input@L1']]);
    expect(found('<button aria-label="   ">Go</button>')).toEqual(['aria-label-blank:unknown']);
  });
});

describe('placeholder', () => {
  it(`asks about a placeholder over ${MAX_PLACEHOLDER_CHARS} characters`, () => {
    const e = auditNameWords(`<input aria-label="Note" placeholder="${'x'.repeat(MAX_PLACEHOLDER_CHARS + 1)}">`).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['placeholder-long:unknown']);
    expect(e[0]?.message.fr).toContain(`${MAX_PLACEHOLDER_CHARS + 1} caractères`);
  });
  it('passes a short example', () => {
    expect(found('<input aria-label="Postal code" placeholder="K1A 0B1"><textarea aria-label="Note" placeholder="Optional"></textarea>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts elements with a naming attribute or a button or link role, and skips hidden ones', () => {
    expect(auditNameWords('<button>Go</button><a href="/x">X</a><input aria-label="Q"><p>text</p><div hidden><button aria-label="">x</button></div>')).toEqual({ checked: 3, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditNameWords('<div alt="a">a</div>\n<button>Save button</button>\n<input aria-label="">').entries;
    expect(e.map((x) => x.id)).toEqual(['div@L1', 'button@L2', 'input@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only the alt rule', () => {
    const e = auditNameWords(SAMPLE_NAME_WORDS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...NAME_WORD_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'alt-no-effect' ? 'fail' : 'unknown');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<div alt=', '<button aria-label', '<input placeholder="', '<a href>']) expect(() => auditNameWords(html)).not.toThrow();
  });
});
