import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditIdentifiers, IDENTIFIER_RULES, IDREF_ATTRIBUTES, idrefProblem } from './identifiers.js';
import { SAMPLE_IDENTIFIERS_HTML } from './samples.js';

const found = (html: string): string[] => auditIdentifiers(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('idrefProblem', () => {
  it.each(['q', 'a b c', ' main-text ', 'r:1:', 'été', 'a.b', '1st'])('"%s" is a list of ids', (value) => {
    expect(idrefProblem(value)).toBeNull();
  });
  it.each([['#q', 'hash'], ['a #b', 'hash'], ['a,b', 'comma'], ['a, b', 'comma'], ['.hint', 'dot'], ['a .b', 'dot'], ['#a,#b', 'hash']] as const)('"%s" has the problem %s', (value, problem) => {
    expect(idrefProblem(value)).toBe(problem);
  });
});

describe('ids', () => {
  it('fails an id with a space and shows it', () => {
    const e = auditIdentifiers('<p id="main text">Hours</p>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['id-space', 'fail', 'p@L1']]);
    expect(e[0]?.message.en).toContain('“main text”');
    expect(e[0]?.message.fr).toContain('«\u202Fmain text\u202F»');
  });
  it('fails a tab or a line break in an id too', () => {
    expect(found('<p id="a\tb">x</p>')).toEqual(['id-space:fail']);
    expect(found('<p id="a\nb">x</p>')).toEqual(['id-space:fail']);
  });
  it('asks about an empty id', () => {
    expect(found('<p id="">x</p>')).toEqual(['id-empty:unknown']);
    expect(found('<p id="  ">x</p>')).toEqual(['id-empty:unknown']);
  });
  it('asks once about ids that differ only in case, and says where the first is', () => {
    const e = auditIdentifiers('<p id="Hours">A</p>\n<p id="hours">B</p>\n<p id="HOURS">C</p>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['id-case-collision', 'unknown', 'p@L2']]);
    expect(e[0]?.message.en).toContain('“Hours” (line 1) and “hours”');
  });
  it('passes ordinary ids, and leaves an exact repeat to static-html', () => {
    expect(found('<p id="hours">A</p><p id="r:1:">B</p><p id="été">C</p><p id="1st">D</p>')).toEqual([]);
    expect(found('<p id="a">A</p><p id="a">B</p>')).toEqual([]);
  });
});

describe('references written the wrong way', () => {
  it.each([
    ['<label for="#q">Search</label>', 'for'],
    ['<button aria-labelledby="#t">x</button>', 'aria-labelledby'],
    ['<input aria-describedby="#hint" aria-label="x">', 'aria-describedby'],
    ['<button aria-controls="#panel">x</button>', 'aria-controls'],
    ['<input list="#towns" aria-label="x">', 'list'],
    ['<table><tr><td headers="#day">x</td></tr></table>', 'headers'],
  ])('fails %s', (html, attribute) => {
    const e = auditIdentifiers(html).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['idref-syntax:fail']);
    expect(e[0]?.message.en.startsWith(`${attribute} is set to`)).toBe(true);
    expect(e[0]?.message.en).toContain('starts with #');
  });
  it('gives a reason for a comma and for a class selector', () => {
    const comma = auditIdentifiers('<input aria-describedby="hint,error" aria-label="x">').entries[0];
    expect(comma?.message.en).toContain('separates ids with a comma');
    expect(comma?.message.fr).toContain('par une virgule');
    const dot = auditIdentifiers('<input aria-describedby=".hint" aria-label="x">').entries[0];
    expect(dot?.message.en).toContain('starts with a dot');
  });
  it('passes well-formed references, whether or not the target exists', () => {
    expect(found('<label for="q">Search</label><input id="q" aria-describedby="hint error"><button aria-controls="gone">x</button>')).toEqual([]);
  });
  it('does not read for, list or headers on elements where they mean something else', () => {
    expect(found('<script for="#x"></script><ol list="#a"></ol><div headers="#h"></div><button form="#f">x</button>')).toEqual(['idref-syntax:fail']);
  });
  it('covers the label, table, form and ARIA reference attributes', () => {
    for (const a of ['for', 'headers', 'list', 'form', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant']) expect(IDREF_ATTRIBUTES).toContain(a);
  });
});

describe('usemap', () => {
  it('fails a map reference with no hash and shows the fix', () => {
    const e = auditIdentifiers('<img usemap="plan" alt="Floor plan" src="p.png">').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['usemap-no-hash', 'fail', 'img@L1']]);
    expect(e[0]?.message.en).toContain('Write #plan.');
  });
  it('passes one with a hash', () => {
    expect(found('<img usemap="#plan" alt="Floor plan" src="p.png">')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts ids and references', () => {
    expect(auditIdentifiers('<p id="a">x</p><label for="b">B</label><input id="b" aria-describedby="a"><p>y</p>')).toEqual({ checked: 4, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditIdentifiers('<p id="a b">x</p>\n<label for="#q">Q</label>\n<p id="">y</p>').entries;
    expect(e.map((x) => x.id)).toEqual(['p@L1', 'label@L2', 'p@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditIdentifiers(SAMPLE_IDENTIFIERS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...IDENTIFIER_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'id-empty' || x.rule === 'id-case-collision' ? 'unknown' : 'fail');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<p id=', '<label for', '<img usemap>', '<p id="a b']) expect(() => auditIdentifiers(html)).not.toThrow();
  });
});
