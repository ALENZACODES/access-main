import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditFocusables, FOCUSABLE_RULES } from './focusables.js';
import { SAMPLE_FOCUSABLES_HTML } from './samples.js';

const found = (html: string): string[] => auditFocusables(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('tabindex', () => {
  it.each(['yes', 'true', '1.5', '', 'zero', '0px'])('fails tabindex="%s"', (value) => {
    const e = auditFocusables(`<div role="button" aria-label="x" tabindex="${value}">Card</div>`).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['tabindex-invalid', 'fail', 'div@L1']]);
    expect(e[0]?.message.en).toContain('not reachable with the keyboard');
  });
  it('says a native control stays in the Tab order', () => {
    const e = auditFocusables('<button tabindex="no">Go</button>').entries[0];
    expect(e?.message.en).toContain('in the Tab order whatever was meant');
    expect(e?.message.fr).toContain('reste dans l’ordre de tabulation');
  });
  it('passes whole numbers, negative ones included, with spaces around', () => {
    expect(found('<div role="button" aria-label="a" tabindex="0">a</div><h1 tabindex="-1">b</h1><div role="tab" tabindex=" 0 ">c</div>')).toEqual([]);
  });
});

describe('accesskey', () => {
  it('fails a key longer than one character and names it', () => {
    const e = auditFocusables('<button accesskey="save">Save</button>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['accesskey-long:fail']);
    expect(e[0]?.message.en).toContain('“save” never fires');
    expect(found('<button accesskey="s ctrl">Save</button>')).toEqual(['accesskey-long:fail']);
  });
  it('fails an empty key with its own words', () => {
    const e = auditFocusables('<button accesskey="">Save</button>').entries[0];
    expect(e?.rule).toBe('accesskey-long');
    expect(e?.message.en).toContain('an empty accesskey');
    expect(e?.message.fr).toContain('un accesskey vide');
  });
  it('passes one character, several separated by spaces, and one accented or symbol character', () => {
    expect(found('<button accesskey="s">a</button><button accesskey="s 1">b</button><button accesskey="é">c</button><button accesskey="/">d</button>')).toEqual([]);
  });
});

describe('autofocus', () => {
  it('fails the second autofocus and counts them', () => {
    const e = auditFocusables('<input name="a" autofocus>\n<input name="b" autofocus>\n<button autofocus>c</button>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['several-autofocus', 'fail', 'input@L2']]);
    expect(e[0]?.message.en.startsWith('3 elements on this page have autofocus.')).toBe(true);
    expect(e[0]?.message.fr.startsWith('3 éléments de cette page portent autofocus.')).toBe(true);
  });
  it('passes one autofocus, and does not count a hidden one', () => {
    expect(found('<input name="a" autofocus>')).toEqual([]);
    expect(found('<input name="a" autofocus><div hidden><input name="b" autofocus></div>')).toEqual([]);
  });
});

describe('focusable with no role', () => {
  it('asks about a plain element with tabindex 0 or more', () => {
    expect(found('<div tabindex="0">Scroll area</div>')).toEqual(['focusable-no-role:unknown']);
    expect(found('<span tabindex="0">Tip</span><li tabindex="0">Item</li><p tabindex="1">Text</p>')).toEqual(['focusable-no-role:unknown', 'focusable-no-role:unknown', 'focusable-no-role:unknown']);
  });
  it('does not ask when the element has a role, a name, or is taken out of the Tab order', () => {
    expect(found('<div tabindex="0" role="button">Go</div>')).toEqual([]);
    expect(found('<div tabindex="0" aria-label="Results">…</div><div tabindex="0" aria-labelledby="h">…</div>')).toEqual([]);
    expect(found('<div tabindex="-1">Panel</div>')).toEqual([]);
  });
  it('does not ask about native controls, headings, media, tables or custom elements', () => {
    expect(found('<button tabindex="0">a</button><a href="/x" tabindex="0">b</a><h2 tabindex="0">c</h2><video tabindex="0"></video><table tabindex="0"></table><pre tabindex="0">d</pre><my-card tabindex="0">e</my-card>')).toEqual([]);
  });
});

describe('editable regions', () => {
  it('asks about one with no name, and says when the role is missing too', () => {
    const bare = auditFocusables('<div contenteditable="true"></div>').entries;
    expect(bare.map((x) => `${x.rule}:${x.status}`)).toEqual(['editable-unnamed:unknown']);
    expect(bare[0]?.message.en).toContain('has no name and no role');
    expect(bare[0]?.message.fr).toContain('sans nom ni rôle');
    const withRole = auditFocusables('<div contenteditable role="textbox"></div>').entries[0];
    expect(withRole?.message.en).toContain('has no name. A screen reader');
  });
  it('accepts a name from aria-label, aria-labelledby, title or a label element', () => {
    expect(found('<div contenteditable="true" aria-label="Note"></div><div contenteditable="plaintext-only" title="Note"></div>')).toEqual([]);
    expect(found('<span id="l">Note</span><div contenteditable aria-labelledby="l"></div>')).toEqual([]);
    expect(found('<label for="e">Note</label><div id="e" contenteditable></div>')).toEqual([]);
  });
  it('does not ask when editing is off, or for a whole editable page', () => {
    expect(found('<div contenteditable="false">x</div>')).toEqual([]);
    expect(found('<html><body contenteditable="true"><p>x</p></body></html>')).toEqual([]);
  });
  it('does not also ask for a role on an editable region with tabindex', () => {
    expect(found('<div contenteditable="true" tabindex="0"></div>')).toEqual(['editable-unnamed:unknown']);
  });
});

describe('the result', () => {
  it('counts elements with a focus attribute, and skips hidden ones', () => {
    expect(auditFocusables('<button tabindex="0">a</button><button accesskey="s">b</button><input name="c" autofocus><div contenteditable aria-label="d"></div><p>e</p><div aria-hidden="true"><div tabindex="x">f</div></div>')).toEqual({ checked: 4, entries: [] });
  });
  it('keeps the order of the file, with the autofocus finding on its own element', () => {
    const e = auditFocusables('<input name="a" autofocus>\n<div tabindex="x" role="note">b</div>\n<input name="c" autofocus>\n<div tabindex="0">d</div>').entries;
    expect(e.map((x) => `${x.id} ${x.rule}`)).toEqual(['div@L2 tabindex-invalid', 'input@L3 several-autofocus', 'div@L4 focusable-no-role']);
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditFocusables(SAMPLE_FOCUSABLES_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...FOCUSABLE_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'focusable-no-role' || x.rule === 'editable-unnamed' ? 'unknown' : 'fail');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<div tabindex=', '<button accesskey', '<div contenteditable="', '<input autofocus autofocus>']) expect(() => auditFocusables(html)).not.toThrow();
  });
});
