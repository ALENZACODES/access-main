import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { SAMPLE_STATES_HTML } from './samples.js';
import { auditStates, STATE_RULES } from './states.js';

const found = (html: string): string[] => auditStates(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('disabled where it does nothing', () => {
  it.each(['a', 'div', 'span', 'li', 'label', 'img', 'p'])('fails disabled on a %s', (tag) => {
    const e = auditStates(`<${tag} disabled>Next</${tag}>`).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['disabled-no-effect', 'fail', `${tag}@L1`]]);
    expect(e[0]?.message.en).toContain(`does nothing on a ${tag}`);
    expect(e[0]?.message.fr).toContain(`aucun effet sur un ${tag}`);
  });
  it.each(['<button disabled>Go</button>', '<input disabled aria-label="Name">', '<select disabled aria-label="Town"></select>', '<textarea disabled aria-label="Note"></textarea>', '<fieldset disabled></fieldset>', '<select aria-label="T"><optgroup label="A" disabled><option disabled>x</option></optgroup></select>', '<link rel="stylesheet" href="a.css" disabled>'])(
    'passes %s',
    (html) => {
      expect(found(html)).toEqual([]);
    },
  );
  it('does not judge a custom element', () => {
    expect(found('<fancy-button disabled>Go</fancy-button>')).toEqual([]);
  });
});

describe('contradictions', () => {
  it.each([
    ['<button disabled aria-disabled="false">Go</button>', 'disabled', 'aria-disabled'],
    ['<input aria-label="Name" required aria-required="false">', 'required', 'aria-required'],
    ['<input aria-label="Name" readonly aria-readonly="false">', 'readonly', 'aria-readonly'],
    ['<div hidden aria-hidden="false">x</div>', 'hidden', 'aria-hidden'],
    ['<input type="checkbox" aria-label="Agree" role="switch" checked aria-checked="false">', 'checked', 'aria-checked'],
  ])('fails %s', (html, native, aria) => {
    const e = auditStates(html).entries.filter((x) => x.rule === 'state-conflict');
    expect(e).toHaveLength(1);
    expect(e[0]?.status).toBe('fail');
    expect(e[0]?.message.en).toContain(`the attribute ${native} and also ${aria} set to false`);
    expect(e[0]?.message.fr).toContain(`l’attribut ${native} et aussi ${aria} à false`);
  });
  it('passes when the two agree, and when only one is written', () => {
    expect(found('<button disabled aria-disabled="true">Go</button>')).toEqual([]);
    expect(found('<input aria-label="Name" required aria-required="true">')).toEqual([]);
    expect(found('<input aria-label="Name" aria-required="false">')).toEqual([]);
    expect(found('<div aria-hidden="false">x</div>')).toEqual([]);
  });
  it('reports disabled on a link once, as the attribute that does nothing', () => {
    expect(found('<a href="/x" disabled aria-disabled="false">Next</a>')).toEqual(['disabled-no-effect:fail']);
  });
});

describe('states that can be a pattern', () => {
  it('asks about a link announced as unavailable that still has its href', () => {
    expect(found('<a href="/prev" aria-disabled="true">Back</a>')).toEqual(['aria-disabled-link:unknown']);
    expect(found('<a aria-disabled="true" role="link">Back</a>')).toEqual([]);
    expect(found('<a href="/prev" aria-disabled="false">Back</a>')).toEqual([]);
  });
  it('asks about an ARIA copy of a native state', () => {
    expect(found('<input type="checkbox" aria-label="Agree" aria-checked="true">')).toEqual(['aria-repeats-native:unknown']);
    expect(found('<input type="radio" name="r" aria-label="A" aria-checked="false">')).toEqual(['aria-repeats-native:unknown']);
    const e = auditStates('<select aria-label="Town"><option aria-selected="true">Ottawa</option></select>').entries;
    expect(e.map((x) => x.rule)).toEqual(['aria-repeats-native']);
    expect(e[0]?.message.en).toContain('aria-selected');
  });
  it('does not ask when the element has a role of its own, or is a custom control', () => {
    expect(found('<input type="checkbox" role="switch" aria-label="Wi-Fi" aria-checked="true">')).toEqual([]);
    expect(found('<div role="checkbox" tabindex="0" aria-checked="true">Agree</div>')).toEqual([]);
    expect(found('<div role="option" aria-selected="true">Ottawa</div>')).toEqual([]);
  });
  it.each(['checkbox', 'radio', 'range', 'color', 'file'])('asks about readonly on an input of type %s', (type) => {
    const e = auditStates(`<input type="${type}" aria-label="x" readonly>`).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['readonly-no-effect:unknown']);
    expect(e[0]?.message.en).toContain(`input of type ${type}`);
    expect(e[0]?.message.fr).toContain(`input de type ${type}`);
  });
  it('asks about readonly on a select, and not on text fields', () => {
    expect(found('<select aria-label="Town" readonly></select>')).toEqual(['readonly-no-effect:unknown']);
    expect(found('<input type="text" aria-label="Name" readonly><input aria-label="Mail" type="email" readonly><textarea aria-label="Note" readonly></textarea>')).toEqual([]);
  });
});

describe('tabindex -1 on a control', () => {
  it('asks when a native control is taken out of the Tab order', () => {
    expect(found('<button type="button" tabindex="-1">Close</button>')).toEqual(['tabindex-removed:unknown']);
    expect(found('<a href="/x" tabindex="-1">More</a>')).toEqual(['tabindex-removed:unknown']);
    expect(found('<input aria-label="Name" tabindex="-1">')).toEqual(['tabindex-removed:unknown']);
  });
  it('does not ask inside a widget that moves focus with the arrow keys', () => {
    expect(found('<div role="tablist"><button role="tab" tabindex="0">One</button><button role="tab" tabindex="-1">Two</button></div>')).toEqual([]);
    expect(found('<div role="toolbar"><button tabindex="-1">Bold</button></div>')).toEqual([]);
    expect(found('<ul role="menu"><li role="none"><a href="/a" role="menuitem" tabindex="-1">A</a></li></ul>')).toEqual([]);
    expect(found('<div role="radiogroup"><button role="radio" aria-checked="false" tabindex="-1">A</button></div>')).toEqual([]);
  });
  it('does not ask for a disabled or hidden control, a plain element, or other tabindex values', () => {
    expect(found('<button disabled tabindex="-1">Go</button>')).toEqual([]);
    expect(found('<div hidden><button tabindex="-1">Go</button></div>')).toEqual([]);
    expect(found('<div aria-hidden="true"><a href="/x" tabindex="-1">More</a></div>')).toEqual([]);
    expect(found('<h1 tabindex="-1">Hours</h1><main tabindex="-1"></main>')).toEqual([]);
    expect(found('<button tabindex="0">Go</button>')).toEqual([]);
  });
});

describe('a control state on something that is not a control', () => {
  it('asks and names the states', () => {
    const e = auditStates('<div aria-expanded="true" aria-haspopup="menu">More</div>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['state-not-control:unknown']);
    expect(e[0]?.message.en).toContain('aria-expanded, aria-haspopup');
    expect(found('<li aria-expanded="false">Hours</li>')).toEqual([]);
    expect(found('<span aria-pressed="true">Mute</span>')).toEqual(['state-not-control:unknown']);
  });
  it('does not ask for a real control, an element with a role, a focusable element or details', () => {
    expect(found('<button aria-expanded="true">More</button>')).toEqual([]);
    expect(found('<div role="button" tabindex="0" aria-pressed="true">Mute</div>')).toEqual([]);
    expect(found('<div tabindex="0" aria-expanded="true">More</div>')).toEqual([]);
    expect(found('<li role="treeitem" aria-expanded="true">Docs</li>')).toEqual([]);
    expect(found('<details aria-expanded="true"><summary>More</summary></details>')).toEqual([]);
    expect(found('<my-menu aria-expanded="true"></my-menu>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts only elements that carry a state', () => {
    expect(auditStates('<p>a</p><button>b</button><input aria-label="c" required><div tabindex="0">d</div>').checked).toBe(2);
    expect(auditStates('<p>nothing</p>')).toEqual({ checked: 0, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditStates('<span aria-pressed="true">a</span>\n<a disabled>b</a>\n<button tabindex="-1">c</button>').entries;
    expect(e.map((x) => x.id)).toEqual(['span@L1', 'a@L2', 'button@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditStates(SAMPLE_STATES_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...STATE_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'disabled-no-effect' || x.rule === 'state-conflict' ? 'fail' : 'unknown');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<a disabled', '<input readonly=', '<div aria-expanded>', '<button tabindex="x">']) expect(() => auditStates(html)).not.toThrow();
  });
});
