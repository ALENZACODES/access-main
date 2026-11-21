import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { lintHtml } from './htmllint.js';
import { ARIA_IDREF_ATTRIBUTES, auditReferences, isFragmentLink, REFERENCE_RULES } from './references.js';
import { SAMPLE_REFERENCES_HTML } from './samples.js';

const found = (html: string): string[] => auditReferences(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('isFragmentLink', () => {
  it.each(['#hours', ' #a ', '#main-content', '#%C3%A9t%C3%A9'])('%s names a place on the page', (href) => {
    expect(isFragmentLink(href)).toBe(true);
  });
  it.each(['#', '', '#top', '#TOP', '#/map', '#!/map', '/page#hours', 'https://example.org/#a', 'hours'])('%s does not', (href) => {
    expect(isFragmentLink(href)).toBe(false);
  });
});

describe('links to a place on the page', () => {
  it('fails a link to an id that is not there and names it in both languages', () => {
    const e = auditReferences('<a href="#hours">Hours</a><h2 id="hour">Hours</h2>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['fragment-missing', 'fail', 'a@L1']]);
    expect(e[0]?.message.en).toContain('“#hours”');
    expect(e[0]?.message.fr).toContain('«\u202F#hours\u202F»');
  });
  it('passes when the id, or an old named anchor, exists', () => {
    expect(found('<a href="#hours">Hours</a><h2 id="hours">Hours</h2>')).toEqual([]);
    expect(found('<a href="#hours">Hours</a><a name="hours"></a>')).toEqual([]);
  });
  it('decodes the fragment before it looks', () => {
    expect(found('<a href="#%C3%A9t%C3%A9">Été</a><h2 id="été">Été</h2>')).toEqual([]);
    expect(found('<a href="#100%">x</a>')).toEqual(['fragment-missing:fail']);
  });
  it('leaves skip links to the bypass check, in both languages', () => {
    expect(found('<a href="#main">Skip to content</a>')).toEqual([]);
    expect(found('<a href="#contenu">Aller au contenu</a>')).toEqual([]);
    expect(found('<a href="#contenu">Passer au contenu principal</a>')).toEqual([]);
  });
  it('leaves router paths, the top of the page and other pages alone', () => {
    expect(found('<a href="#/map">Map</a><a href="#top">Top</a><a href="#">Menu</a><a href="/help#hours">Help</a>')).toEqual([]);
  });
  it('reads area links as well', () => {
    expect(found('<map name="m"><area href="#east" alt="East wing"></map>')).toEqual(['fragment-missing:fail']);
  });
});

describe('table headers', () => {
  const table = (cell: string): string => `<table><tr><th id="day">Day</th><th id="open">Open</th></tr><tr>${cell}</tr></table>`;
  it('passes when every id is a cell of the same table', () => {
    expect(found(table('<td headers="day open">Monday</td>'))).toEqual([]);
  });
  it('fails an id that does not exist', () => {
    const e = auditReferences(table('<td headers="day d9">Monday</td>')).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['headers-missing:fail']);
    expect(e[0]?.message.en).toContain('“d9”');
  });
  it('fails an id that is not a cell, is in another table, or is the cell itself', () => {
    expect(found(`<p id="note">n</p>${table('<td headers="note">Monday</td>')}`)).toEqual(['headers-missing:fail']);
    expect(found(`<table><tr><th id="other">x</th></tr></table>${table('<td headers="other">Monday</td>')}`)).toEqual(['headers-missing:fail']);
    expect(found(table('<td id="me" headers="me">Monday</td>'))).toEqual(['headers-missing:fail']);
  });
});

describe('list, form and usemap', () => {
  it('fails a field whose suggestion list is missing or is not a datalist', () => {
    expect(found('<input list="towns" aria-label="Town">')).toEqual(['list-missing:fail']);
    expect(found('<input list="towns" aria-label="Town"><ul id="towns"></ul>')).toEqual(['list-missing:fail']);
    expect(found('<input list="towns" aria-label="Town"><datalist id="towns"><option value="Ottawa"></datalist>')).toEqual([]);
  });
  it('fails a control whose form is missing or is not a form', () => {
    expect(found('<button form="signup">Send</button>')).toEqual(['form-missing:fail']);
    expect(found('<button form="signup">Send</button><div id="signup"></div>')).toEqual(['form-missing:fail']);
    expect(found('<form id="signup"></form><button form="signup">Send</button>')).toEqual([]);
  });
  it('fails an image whose map is missing, by name or by id', () => {
    expect(found('<img usemap="#plan" alt="Floor plan" src="p.png">')).toEqual(['usemap-missing:fail']);
    expect(found('<img usemap="#plan" alt="Floor plan" src="p.png"><map name="plan"></map>')).toEqual([]);
    expect(found('<img usemap="#plan" alt="Floor plan" src="p.png"><map id="plan"></map>')).toEqual([]);
  });
});

describe('ARIA relations', () => {
  it('reads the relations static-html does not', () => {
    expect(ARIA_IDREF_ATTRIBUTES).not.toContain('aria-labelledby');
    expect(ARIA_IDREF_ATTRIBUTES).not.toContain('aria-describedby');
    const html = '<button aria-labelledby="nope">x</button>';
    expect(found(html)).toEqual([]);
    expect(lintHtml(html, { fragment: true }).entries.map((e) => e.rule)).toContain('aria-ref');
  });
  it.each(['aria-activedescendant', 'aria-owns', 'aria-flowto', 'aria-details'])('fails %s that names a missing id', (a) => {
    const e = auditReferences(`<div ${a}="gone" tabindex="0">x</div>`).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['aria-idref-missing:fail']);
    expect(e[0]?.message.en.startsWith(a)).toBe(true);
    expect(found(`<div ${a}="here" tabindex="0">x</div><p id="here">y</p>`)).toEqual([]);
  });
  it('names only the ids that are missing from a list', () => {
    const e = auditReferences('<div aria-owns="a b c"></div><p id="b"></p>').entries[0];
    expect(e?.message.en).toContain('“a c”');
  });
  it('reads aria-errormessage only while the field is invalid', () => {
    expect(found('<input aria-label="Mail" aria-errormessage="err">')).toEqual([]);
    expect(found('<input aria-label="Mail" aria-invalid="false" aria-errormessage="err">')).toEqual([]);
    expect(found('<input aria-label="Mail" aria-invalid="true" aria-errormessage="err">')).toEqual(['aria-idref-missing:fail']);
    expect(found('<input aria-label="Mail" aria-invalid="true" aria-errormessage="err"><p id="err">Enter an address</p>')).toEqual([]);
  });
  it('only asks about aria-controls, and not at all while the control is closed', () => {
    expect(found('<button aria-expanded="true" aria-controls="panel">More</button>')).toEqual(['controls-missing:unknown']);
    expect(found('<button aria-controls="panel">More</button>')).toEqual(['controls-missing:unknown']);
    expect(found('<button aria-expanded="false" aria-controls="panel">More</button>')).toEqual([]);
    expect(found('<button aria-expanded="true" aria-controls="panel">More</button><div id="panel">x</div>')).toEqual([]);
  });
  it('does not ask about the panel of a tab that is not selected', () => {
    expect(found('<div role="tablist"><button role="tab" aria-selected="false" aria-controls="p2">Two</button></div>')).toEqual([]);
    expect(found('<div role="tablist"><button role="tab" aria-selected="true" aria-controls="p1">One</button></div>')).toEqual(['controls-missing:unknown']);
    expect(found('<div role="tabpanel" aria-controls="x">One</div>')).toEqual(['controls-missing:unknown']);
  });
});

describe('labels', () => {
  it('fails a label that points to something that cannot take one', () => {
    const e = auditReferences('<label for="box">Name</label><div id="box" contenteditable="true"></div>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['label-not-field:fail']);
    expect(e[0]?.message.en).toContain('points to a div');
    expect(found('<label for="h">Token</label><input type="hidden" id="h">')).toEqual(['label-not-field:fail']);
  });
  it('passes real fields and custom elements, and leaves a missing id to static-html', () => {
    for (const field of ['<input id="f">', '<select id="f"></select>', '<textarea id="f"></textarea>', '<button id="f">x</button>', '<meter id="f"></meter>', '<fancy-input id="f"></fancy-input>']) {
      expect(found(`<label for="f">Name</label>${field}`), field).toEqual([]);
    }
    expect(found('<label for="gone">Name</label>')).toEqual([]);
  });
  it('asks about two labels for one field, once, on the second label', () => {
    const e = auditReferences('<label for="f">First</label>\n<label for="f">Second</label>\n<label for="f">Third</label>\n<input id="f">').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['several-labels', 'unknown', 'label@L2']]);
    expect(e[0]?.message.en.startsWith('3 labels')).toBe(true);
  });
  it('does not count an empty label', () => {
    expect(found('<label for="f">First</label><label for="f"></label><input id="f">')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts the references it followed', () => {
    const r = auditReferences('<a href="#a">a</a><h2 id="a">A</h2><input list="l" aria-label="x"><datalist id="l"></datalist><label for="q">Q</label><input id="q"><p>text</p>');
    expect(r).toEqual({ checked: 3, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditReferences('<a href="#x">a</a>\n<button form="f">b</button>\n<input list="l" aria-label="c">').entries;
    expect(e.map((x) => x.id)).toEqual(['a@L1', 'button@L2', 'input@L3']);
  });
  it('uses the first element when an id is repeated, as browsers do', () => {
    expect(found('<label for="f">Name</label><div id="f"></div><input id="f">')).toEqual(['label-not-field:fail']);
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditReferences(SAMPLE_REFERENCES_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...REFERENCE_RULES].sort());
    noFrIssues(e);
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<a href="#', '<td headers>', '<label for>', '<a href="#%E0%A4%A">x</a>', '<img usemap>']) expect(() => auditReferences(html)).not.toThrow();
  });
});
