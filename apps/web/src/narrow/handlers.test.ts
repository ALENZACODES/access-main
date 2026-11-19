import { describe, expect, it } from 'vitest';
import { auditHandlers, HANDLER_RULES, isFocusable, isNativeControl } from './handlers.js';
import { parseHtml } from './htmllint.js';
import { noFrIssues } from './expect-fr.js';

const rules = (html: string): string[] => auditHandlers(html).entries.map((e) => `${e.rule}`);
const first = (html: string) => parseHtml(html).nodes[0]!;

describe('isFocusable and isNativeControl', () => {
  it.each([
    ['<button>x</button>', true, true],
    ['<a href="/x">x</a>', true, true],
    ['<a>x</a>', false, false],
    ['<input type="text">', true, true],
    ['<input type="hidden">', false, false],
    ['<select></select>', true, true],
    ['<div></div>', false, false],
    ['<div tabindex="0"></div>', true, false],
    ['<div tabindex="-1"></div>', false, false],
    ['<div tabindex="3"></div>', true, false],
    ['<div tabindex=""></div>', false, false],
    ['<summary>x</summary>', true, true],
  ])('%s is focusable %s and native %s', (html, focusable, native) => {
    expect(isFocusable(first(html))).toBe(focusable);
    expect(isNativeControl(first(html))).toBe(native);
  });
  it('does not call a disabled control focusable', () => {
    expect(isFocusable(first('<button disabled>x</button>'))).toBe(false);
  });
  it('still counts a disabled element with tabindex 0 as focusable, as a browser does not', () => {
    expect(isFocusable(first('<div tabindex="0" disabled></div>'))).toBe(true);
  });
});

describe('click handlers', () => {
  it('finds nothing on native controls, with or without a handler', () => {
    expect(rules('<button onclick="go()">Go</button><a href="/x" onclick="go()">Go</a><input onclick="go()">')).toEqual([]);
  });
  it('flags a click on an element the keyboard cannot reach', () => {
    expect(rules('<div onclick="go()">Go</div>')).toEqual(['click-not-focusable']);
    expect(rules('<span onmouseup="go()">Go</span>')).toEqual(['click-not-focusable']);
    expect(rules('<li onpointerup="go()">Go</li>')).toEqual(['click-not-focusable']);
  });
  it('flags a link with no href as not focusable', () => {
    expect(rules('<a onclick="go()">Go</a>')).toEqual(['click-not-focusable']);
  });
  it('asks about a focusable element with no key handler, and names its role', () => {
    const r = auditHandlers('<div role="button" tabindex="0" onclick="go()">Go</div>');
    expect(r.entries.map((e) => e.rule)).toEqual(['click-no-key']);
    expect(r.entries[0]?.message.en).toContain('(role button)');
    expect(r.entries[0]?.message.fr).toContain('(rôle button)');
  });
  it('leaves a focusable element with a key handler alone', () => {
    expect(rules('<div tabindex="0" onclick="go()" onkeydown="k()">Go</div>')).toEqual([]);
    expect(rules('<div tabindex="0" onclick="go()" onkeyup="k()">Go</div>')).toEqual([]);
    expect(rules('<div tabindex="0" onclick="go()" onkeypress="k()">Go</div>')).toEqual([]);
  });
  it('does not name a role that is not an interactive one', () => {
    const r = auditHandlers('<div role="region" tabindex="0" onclick="go()">Go</div>');
    expect(r.entries[0]?.message.en).not.toContain('(role');
  });
  it('reports the id and line of the element', () => {
    const r = auditHandlers('<p>one</p>\n<div id="card" onclick="go()">Go</div>');
    expect(r.entries[0]?.id).toBe('div#card@L2');
  });
  it('ignores handlers in script and style text', () => {
    expect(rules('<script>el.onclick = () => 1;</script><style>div{}</style>')).toEqual([]);
  });
});

describe('pointer handlers', () => {
  it.each(['onmousedown', 'onpointerdown', 'ontouchstart'])('flags %s on a button', (h) => {
    expect(rules(`<button ${h}="go()">Go</button>`)).toEqual(['down-event']);
  });
  it('leaves a down handler on a text field alone', () => {
    expect(rules('<input onmousedown="sel()"><textarea ontouchstart="a()"></textarea><select onpointerdown="s()"></select>')).toEqual([]);
  });
  it.each(['onmouseover', 'onmouseenter', 'onmouseout', 'onmouseleave'])('flags %s with no focus handler', (h) => {
    expect(rules(`<div ${h}="show()">Menu</div>`)).toEqual(['hover-only']);
  });
  it.each(['onfocus', 'onfocusin', 'onblur', 'onfocusout'])('leaves a hover handler with %s alone', (f) => {
    expect(rules(`<a href="/m" onmouseover="show()" ${f}="show()">Menu</a>`)).toEqual([]);
  });
  it('flags a double click', () => {
    expect(rules('<div tabindex="0" ondblclick="open()">Open</div>')).toEqual(['double-click']);
  });
  it('can report several rules for one element, in a fixed order', () => {
    expect(rules('<div onclick="a()" onmousedown="b()" onmouseover="c()" ondblclick="d()">x</div>')).toEqual(['click-not-focusable', 'down-event', 'hover-only', 'double-click']);
  });
});

describe('title-extra', () => {
  it('asks when a title has three or more words the text does not', () => {
    const r = auditHandlers('<span title="Opens the clinic booking form in a new window">Book</span>');
    expect(r.entries.map((e) => e.rule)).toEqual(['title-extra']);
    expect(r.entries[0]?.message.en).toContain('Opens the clinic booking form in a new');
  });
  it('leaves a title that repeats the text, or adds only a word or two', () => {
    expect(rules('<span title="Book now">Book now</span>')).toEqual([]);
    expect(rules('<span title="Book an appointment">Book</span>')).toEqual([]);
  });
  it('leaves elements where a title is not extra information', () => {
    expect(rules('<abbr title="Occupational therapist from the clinic team">OT</abbr>')).toEqual([]);
    expect(rules('<iframe title="Map of the three nearest clinics today">x</iframe>')).toEqual([]);
    expect(rules('<td title="Open the long description of this cell now">x</td>')).toEqual([]);
  });
  it('leaves an element with no text of its own', () => {
    expect(rules('<div title="Opens the clinic booking form in a new window"></div>')).toEqual([]);
  });
  it('compares words without caring about case or punctuation', () => {
    expect(rules('<span title="Book, NOW, please">Book now, please</span>')).toEqual([]);
  });
});

describe('auditHandlers: shape', () => {
  it('counts only the elements that carry a handler or a title', () => {
    const r = auditHandlers('<p>a</p><button onclick="x()">b</button><div onclick="x()">c</div><span>d</span>');
    expect(r.checked).toBe(2);
  });
  it('finds nothing in plain markup', () => {
    expect(auditHandlers('<main><h1>Hours</h1><p>Open daily.</p><a href="/x">More</a></main>')).toEqual({ checked: 0, entries: [] });
  });
  it('has a rule for every message and clean French in each', () => {
    const html =
      '<div onclick="a()">a</div><div tabindex="0" onclick="a()">b</div><button onmousedown="a()">c</button>' +
      '<div onmouseover="a()">d</div><div tabindex="0" ondblclick="a()">e</div><span title="Opens the booking form in a new window">f</span>';
    const es = auditHandlers(html).entries;
    expect(new Set(es.map((e) => e.rule))).toEqual(new Set(HANDLER_RULES));
    for (const e of es) {
      expect(e.check).toBe('handlers');
      expect(e.status).toBe('unknown');
    }
    noFrIssues(es);
  });
});
