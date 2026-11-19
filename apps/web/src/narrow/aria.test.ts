import { describe, expect, it } from 'vitest';
import {
  ABSTRACT_ROLES,
  ARIA_ATTRIBUTES,
  ARIA_ROLES,
  ARIA_RULES,
  auditAria,
  effectiveRole,
  implicitRole,
  isKnownRole,
  REQUIRED_PARENTS,
  REQUIRED_STATES,
  validAriaValue,
} from './aria.js';
import { noFrIssues } from './expect-fr.js';
import { parseHtml } from './htmllint.js';
import { SAMPLE_ARIA_HTML } from './samples.js';

const found = (html: string): string[] => auditAria(html).entries.map((e) => `${e.rule}:${e.status}`);
const rules = (html: string): string[] => auditAria(html).entries.flatMap((e) => (e.rule ? [e.rule] : []));
const first = (html: string) => {
  const n = parseHtml(html).nodes[0];
  if (!n) throw new Error('no node');
  return n;
};

describe('role and attribute tables', () => {
  it('hold the concrete roles and none of the abstract ones', () => {
    for (const r of ['button', 'checkbox', 'dialog', 'tab', 'tablist', 'tabpanel', 'switch', 'meter', 'searchbox', 'treegrid', 'none', 'presentation', 'generic']) {
      expect(ARIA_ROLES.has(r), r).toBe(true);
    }
    for (const r of ABSTRACT_ROLES) expect(ARIA_ROLES.has(r), r).toBe(false);
    expect(ARIA_ROLES.size).toBeGreaterThan(80);
  });
  it('accept the publishing and graphics roles by their prefix', () => {
    expect(isKnownRole('doc-chapter')).toBe(true);
    expect(isKnownRole('graphics-symbol')).toBe(true);
    expect(isKnownRole('doc-')).toBe(false);
    expect(isKnownRole('documentx')).toBe(false);
  });
  it('know every attribute the App uses, and not the usual typing mistakes', () => {
    for (const a of ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded', 'aria-controls', 'aria-current', 'aria-live', 'aria-hidden', 'aria-invalid', 'aria-pressed', 'aria-busy']) {
      expect(a in ARIA_ATTRIBUTES, a).toBe(true);
    }
    for (const a of ['aria-labeledby', 'aria-role', 'aria-description-by', 'aria-visible']) expect(a in ARIA_ATTRIBUTES, a).toBe(false);
  });
  it('only name known roles and attributes in the required tables', () => {
    for (const [role, attrs] of Object.entries(REQUIRED_STATES)) {
      expect(ARIA_ROLES.has(role), role).toBe(true);
      for (const a of attrs) expect(a in ARIA_ATTRIBUTES, a).toBe(true);
    }
    for (const [role, parents] of Object.entries(REQUIRED_PARENTS)) {
      expect(ARIA_ROLES.has(role), role).toBe(true);
      for (const p of parents) expect(ARIA_ROLES.has(p), p).toBe(true);
    }
  });
});

describe('validAriaValue', () => {
  it.each([
    ['aria-hidden', 'true'], ['aria-hidden', 'FALSE'], ['aria-expanded', 'undefined'], ['aria-pressed', 'mixed'], ['aria-checked', ' true '],
    ['aria-current', 'page'], ['aria-current', 'step'], ['aria-live', 'polite'], ['aria-haspopup', 'dialog'], ['aria-invalid', 'spelling'],
    ['aria-level', '2'], ['aria-setsize', '-1'], ['aria-rowspan', '0'], ['aria-valuenow', '12.5'], ['aria-valuemin', '-3'], ['aria-valuenow', '.5'],
    ['aria-relevant', 'additions text'], ['aria-label', 'anything at all'], ['aria-expanded', ''], ['aria-sort', 'ascending'],
  ])('%s="%s" is allowed', (name, value) => {
    expect(validAriaValue(name, value)).toBe(true);
  });
  it.each([
    ['aria-hidden', 'yes'], ['aria-hidden', '1'], ['aria-expanded', 'open'], ['aria-pressed', 'on'], ['aria-checked', 'checked'],
    ['aria-current', 'current'], ['aria-live', 'rude'], ['aria-haspopup', 'popup'], ['aria-invalid', 'invalid'],
    ['aria-level', '0'], ['aria-level', 'two'], ['aria-level', '1.5'], ['aria-setsize', '-2'], ['aria-valuenow', 'half'], ['aria-valuenow', '1,5'],
    ['aria-relevant', 'additions everything'], ['aria-sort', 'up'], ['aria-modal', 'undefined'],
  ])('%s="%s" is not allowed', (name, value) => {
    expect(validAriaValue(name, value)).toBe(false);
  });
  it('does not judge an attribute it does not know', () => {
    expect(validAriaValue('aria-nope', 'whatever')).toBe(true);
  });
});

describe('effectiveRole and implicitRole', () => {
  it('takes the first role the browser knows', () => {
    expect(effectiveRole('button')).toBe('button');
    expect(effectiveRole('  SWITCH checkbox ')).toBe('switch');
    expect(effectiveRole('fancybutton button')).toBe('button');
    expect(effectiveRole('fancybutton')).toBeNull();
    expect(effectiveRole('')).toBeNull();
  });
  it('knows what an element already is', () => {
    expect(implicitRole(first('<button>x</button>'))).toBe('button');
    expect(implicitRole(first('<a href="/x">x</a>'))).toBe('link');
    expect(implicitRole(first('<a>x</a>'))).toBeNull();
    expect(implicitRole(first('<nav></nav>'))).toBe('navigation');
    expect(implicitRole(first('<h3>x</h3>'))).toBe('heading');
    expect(implicitRole(first('<input type="checkbox">'))).toBe('checkbox');
    expect(implicitRole(first('<input type="submit">'))).toBe('button');
    expect(implicitRole(first('<input type="text">'))).toBeNull();
    expect(implicitRole(first('<ul></ul>'))).toBeNull();
    expect(implicitRole(first('<div></div>'))).toBeNull();
  });
});

describe('roles', () => {
  it('fails a role that does not exist and names it', () => {
    const e = auditAria('<div role="buton" tabindex="0">Save</div>').entries;
    expect(e.map((x) => [x.rule, x.status])).toEqual([['unknown-role', 'fail']]);
    expect(e[0]?.message.en).toContain('“buton”');
    expect(e[0]?.message.fr).toContain('«\u202Fbuton\u202F»');
    expect(e[0]?.id).toBe('div@L1');
  });
  it('lets a fallback list pass when one role is known', () => {
    expect(found('<div role="doc-noteref link"><a href="#n1" id="x">1</a></div>')).toEqual([]);
    expect(found('<span role="newthing note">x</span>')).toEqual([]);
  });
  it('fails an abstract role', () => {
    expect(found('<div role="widget">x</div>')).toEqual(['abstract-role:fail']);
    expect(found('<div role="landmark">x</div>')).toEqual(['abstract-role:fail']);
  });
  it('ignores an empty role attribute and upper case', () => {
    expect(found('<div role="">x</div>')).toEqual([]);
    expect(found('<div ROLE="ALERT">x</div>')).toEqual([]);
  });
});

describe('attributes and values', () => {
  it('fails a misspelled attribute, once per element, naming each', () => {
    const e = auditAria('<button aria-labeledby="t" aria-role="x">Go</button>').entries;
    expect(e.map((x) => x.rule)).toEqual(['unknown-attribute']);
    expect(e[0]?.message.en).toContain('aria-labeledby and aria-role are not ARIA attributes');
    expect(e[0]?.message.fr).toContain('aria-labeledby et aria-role ne sont pas des attributs ARIA');
  });
  it('fails a value outside the list and says what is allowed', () => {
    const e = auditAria('<button aria-pressed="yes">Mute</button>').entries;
    expect(e.map((x) => [x.rule, x.status])).toEqual([['bad-value', 'fail']]);
    expect(e[0]?.message.en).toContain('true, false, mixed or undefined');
    expect(e[0]?.message.fr).toContain('true, false, mixed ou undefined');
  });
  it('reports each bad value on one element', () => {
    expect(rules('<div role="slider" aria-valuenow="half" aria-orientation="up" tabindex="0"></div>')).toEqual(['bad-value', 'bad-value']);
  });
  it('accepts the values React writes', () => {
    expect(found('<button aria-expanded="false" aria-haspopup="menu" aria-pressed="true" aria-disabled="false">x</button>')).toEqual([]);
    expect(found('<a href="/a" aria-current="page">Home</a><p aria-live="polite" aria-atomic="true">x</p>')).toEqual([]);
  });
  it('fails a body hidden from screen readers', () => {
    expect(found('<html><body aria-hidden="true"><p>x</p></body></html>')).toEqual(['hidden-body:fail']);
    expect(found('<html><body aria-hidden="false"><p>x</p></body></html>')).toEqual([]);
  });
});

describe('required states', () => {
  it.each([
    ['checkbox', 'aria-checked'], ['radio', 'aria-checked'], ['switch', 'aria-checked'], ['combobox', 'aria-expanded'],
    ['slider', 'aria-valuenow'], ['heading', 'aria-level'], ['meter', 'aria-valuenow'],
  ])('role %s needs %s', (role, attribute) => {
    const e = auditAria(`<div role="${role}" tabindex="0">x</div>`).entries.filter((x) => x.rule === 'missing-required');
    expect(e).toHaveLength(1);
    expect(e[0]?.status).toBe('fail');
    expect(e[0]?.message.en).toContain(attribute);
    expect(rules(`<div role="${role}" tabindex="0" ${attribute}="${attribute === 'aria-checked' || attribute === 'aria-expanded' ? 'false' : '2'}">x</div>`)).not.toContain('missing-required');
  });
  it('names both when two are missing', () => {
    const e = auditAria('<div role="scrollbar"></div>').entries[0];
    expect(e?.message.en).toContain('aria-controls and aria-valuenow');
    expect(e?.message.fr).toContain('aria-controls et aria-valuenow');
  });
  it('does not ask a native control for a state it already has', () => {
    expect(rules('<input type="checkbox" role="switch" aria-label="Wi-Fi">')).not.toContain('missing-required');
    expect(rules('<input type="range" role="slider" aria-label="Volume">')).not.toContain('missing-required');
    expect(rules('<h2 role="heading">x</h2>')).not.toContain('missing-required');
    expect(rules('<input role="combobox" aria-label="Town">')).not.toContain('missing-required');
  });
});

describe('required parents', () => {
  it('fails a tab outside a tab list and passes one inside', () => {
    expect(found('<div role="tab" tabindex="0">Hours</div>')).toEqual(['missing-parent:fail']);
    expect(found('<div role="tablist"><div><button role="tab">Hours</button></div></div>')).toEqual([]);
  });
  it('accepts the parent an HTML element gives', () => {
    expect(found('<ul><li role="listitem">a</li></ul>')).toEqual([]);
    expect(found('<table><tr><td role="cell">a</td></tr></table>')).toEqual([]);
    expect(found('<table role="table"><tbody role="rowgroup"><tr role="row"><td>a</td></tr></tbody></table>')).toEqual([]);
  });
  it('fails an option, a menu item and a row with no container', () => {
    expect(found('<div role="option" aria-selected="false">a</div>')).toEqual(['missing-parent:fail']);
    expect(found('<div role="menuitem" tabindex="-1">a</div>')).toEqual(['missing-parent:fail']);
    expect(found('<div role="row"><div role="cell">a</div></div>')).toEqual(['missing-parent:fail']);
  });
  it('only asks when the page uses aria-owns, which can supply the parent', () => {
    const e = auditAria('<div role="tablist" aria-owns="t1"></div><div role="tab" id="t1" tabindex="0">Hours</div>').entries;
    expect(e.map((x) => [x.rule, x.status])).toEqual([['missing-parent', 'unknown']]);
    expect(e[0]?.message.en).toContain('aria-owns');
  });
});

describe('prompts to look', () => {
  it('asks about a role the element already has', () => {
    expect(found('<button role="button">Go</button>')).toEqual(['redundant-role:unknown']);
    expect(found('<nav role="navigation" aria-label="Main"></nav>')).toEqual(['redundant-role:unknown']);
    expect(found('<main role="main"></main>')).toEqual(['redundant-role:unknown']);
  });
  it('leaves role=list on a list and table roles on a table alone, which restore semantics CSS can drop', () => {
    expect(found('<ul role="list"><li>a</li></ul>')).toEqual([]);
    expect(found('<table role="table"><tr role="row"><td role="cell">a</td></tr></table>')).toEqual([]);
  });
  it('asks about a presentation role on something focusable', () => {
    expect(found('<a href="/x" role="presentation">x</a>')).toEqual(['presentation-focusable:unknown']);
    expect(found('<div role="none" tabindex="0">x</div>')).toEqual(['presentation-focusable:unknown']);
    expect(found('<img role="presentation" src="a.png" alt="">')).toEqual([]);
    expect(found('<div role="none" tabindex="-1">x</div>')).toEqual([]);
  });
  it('asks about a name on a plain div or span', () => {
    expect(found('<div aria-label="Filters">x</div>')).toEqual(['name-on-generic:unknown']);
    expect(found('<span aria-labelledby="t">x</span>')).toEqual(['name-on-generic:unknown']);
    expect(found('<div role="group" aria-label="Filters">x</div>')).toEqual([]);
    expect(found('<section aria-label="Filters">x</section>')).toEqual([]);
    expect(found('<div aria-label="">x</div>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts only elements that carry a role or an aria attribute', () => {
    expect(auditAria('<main><p>a</p><p>b</p><button aria-pressed="false">x</button><div role="note">n</div></main>').checked).toBe(2);
    expect(auditAria('<p>nothing</p>')).toEqual({ checked: 0, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditAria('<div role="nope">a</div>\n<p>b</p>\n<div aria-foo="1">c</div>\n<button role="button">d</button>').entries;
    expect(e.map((x) => x.id)).toEqual(['div@L1', 'div@L3', 'button@L4']);
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditAria(SAMPLE_ARIA_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...ARIA_RULES].sort());
    noFrIssues(e);
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<div role=', '<div role="tab"', '<<>>', '<div aria-hidden>', '<div role>x</div>']) expect(() => auditAria(html)).not.toThrow();
  });
  it('finds nothing in ordinary good markup', () => {
    const good =
      '<header><nav aria-label="Main"><a href="/" aria-current="page">Home</a></nav></header><main><h1>Hours</h1>' +
      '<button type="button" aria-expanded="false" aria-controls="more">More</button><div id="more" hidden>x</div>' +
      '<div role="tablist" aria-label="Days"><button role="tab" aria-selected="true">Mon</button><button role="tab" aria-selected="false">Tue</button></div>' +
      '<p role="status" aria-live="polite"></p><div role="progressbar" aria-valuenow="20" aria-valuemin="0" aria-valuemax="100" aria-label="Loading"></div></main>';
    expect(found(good)).toEqual([]);
  });
});
