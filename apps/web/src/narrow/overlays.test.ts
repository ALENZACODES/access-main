import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditOverlays, OVERLAY_RULES, POPOVER_VALUES } from './overlays.js';
import { SAMPLE_OVERLAYS_HTML } from './samples.js';

const found = (html: string): string[] => auditOverlays(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('popover targets', () => {
  it('fails a button whose popover is not on the page', () => {
    const e = auditOverlays('<button popovertarget="menu9">Menu</button>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['popovertarget-missing', 'fail', 'button@L1']]);
    expect(e[0]?.message.en).toContain('“menu9”');
    expect(e[0]?.message.fr).toContain('«\u202Fmenu9\u202F»');
  });
  it('fails a button that names an element with no popover attribute', () => {
    const e = auditOverlays('<button popovertarget="panel">Panel</button><div id="panel">x</div>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['popovertarget-not-popover:fail']);
    expect(e[0]?.message.en).toContain('that div has no popover attribute');
  });
  it('passes a button with a real popover, in either order', () => {
    expect(found('<button popovertarget="m">Menu</button><div id="m" popover>x</div>')).toEqual([]);
    expect(found('<div id="m" popover="manual">x</div><input type="button" value="Menu" popovertarget="m" popovertargetaction="toggle">')).toEqual([]);
  });
  it('ignores an empty popovertarget', () => {
    expect(found('<button popovertarget="">Menu</button>')).toEqual([]);
  });
});

describe('popover values', () => {
  it('knows the kinds of popover', () => {
    expect([...POPOVER_VALUES].sort()).toEqual(['', 'auto', 'hint', 'manual']);
  });
  it.each(['open', 'true', 'modal', 'popup'])('fails popover="%s"', (value) => {
    const e = auditOverlays(`<div popover="${value}">x</div>`).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['popover-invalid:fail']);
    expect(e[0]?.message.en).toContain('Use auto, manual or hint.');
  });
  it('passes the real kinds in any case, and the bare attribute', () => {
    expect(found('<div popover>a</div><div popover="AUTO">b</div><div popover="manual">c</div><div popover="hint">d</div>')).toEqual([]);
  });
});

describe('aria-modal', () => {
  it('fails aria-modal on something that is not a dialog', () => {
    expect(found('<div aria-modal="true">Sign in</div>')).toEqual(['modal-not-dialog:fail']);
    expect(found('<section role="region" aria-label="x" aria-modal="true"><button>Close</button></section>')).toEqual(['modal-not-dialog:fail']);
  });
  it('passes it on a dialog element and on the dialog roles, and ignores false', () => {
    expect(found('<dialog aria-modal="true" aria-label="a"><button>Close</button></dialog>')).toEqual([]);
    expect(found('<div role="dialog" aria-modal="true" aria-label="a"><button>Close</button></div>')).toEqual([]);
    expect(found('<div role="alertdialog" aria-modal="true" aria-label="a"><button>OK</button></div>')).toEqual([]);
    expect(found('<div aria-modal="false">x</div>')).toEqual([]);
  });
});

describe('a way to close a dialog', () => {
  it('asks when no control reads as closing it', () => {
    const e = auditOverlays('<dialog aria-label="Filters"><p>Choose a day.</p><button type="button">Apply</button></dialog>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['dialog-no-close', 'unknown', 'dialog@L1']]);
    expect(found('<div role="dialog" aria-label="x"><p>Text only</p></div>')).toEqual(['dialog-no-close:unknown']);
  });
  it.each([
    '<button>Close</button>',
    '<button>Cancel</button>',
    '<button aria-label="Fermer">x</button>',
    '<button>Annuler</button>',
    '<button>×</button>',
    '<input type="button" value="Done">',
    '<a href="/back" title="Dismiss">Back</a>',
    '<button formmethod="dialog">Save</button>',
    '<button popovertargetaction="hide" popovertarget="d">Hide</button>',
    '<form method="dialog"><button>Apply</button></form>',
    '<div role="button" tabindex="0">OK</div>',
  ])('does not ask when the dialog holds %s', (control) => {
    expect(found(`<dialog id="d" popover aria-label="x"><p>Text</p>${control}</dialog>`)).toEqual([]);
  });
  it('does not ask about an empty dialog, which a script will fill', () => {
    expect(found('<dialog id="d"></dialog>')).toEqual([]);
  });
  it('does not take a word inside another word for a close button', () => {
    expect(found('<dialog aria-label="x"><button>Disclose details</button></dialog>')).toEqual(['dialog-no-close:unknown']);
    expect(found('<dialog aria-label="x"><button>Book a room</button></dialog>')).toEqual(['dialog-no-close:unknown']);
  });
});

describe('the result', () => {
  it('counts popover controls, popovers, modal marks and dialogs', () => {
    expect(auditOverlays('<button popovertarget="m">Menu</button><div id="m" popover>x</div><dialog aria-modal="true" aria-label="a"><button>Close</button></dialog><p>y</p>')).toEqual({ checked: 4, entries: [] });
    expect(auditOverlays('<p>nothing</p>')).toEqual({ checked: 0, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditOverlays('<div popover="x">a</div>\n<button popovertarget="gone">b</button>\n<div aria-modal="true">c</div>').entries;
    expect(e.map((x) => x.id)).toEqual(['div@L1', 'button@L2', 'div@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditOverlays(SAMPLE_OVERLAYS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...OVERLAY_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'dialog-no-close' ? 'unknown' : 'fail');
  });
  it('does not throw on broken or deep markup', () => {
    for (const html of ['', '<dialog', '<button popovertarget=', '<div popover="', '<dialog><dialog><dialog>']) expect(() => auditOverlays(html)).not.toThrow();
    expect(() => auditOverlays('<dialog>'.repeat(300))).not.toThrow();
  });
});
