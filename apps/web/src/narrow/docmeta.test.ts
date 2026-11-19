import { describe, expect, it } from 'vitest';
import { auditDocument, DOCUMENT_RULES } from './docmeta.js';
import { noFrIssues } from './expect-fr.js';
import { SAMPLE_DOCUMENT_HTML } from './samples.js';

const page = (o: { htmlAttrs?: string; head?: string; body?: string } = {}): string =>
  `<!doctype html><html${o.htmlAttrs ?? ' lang="en"'}><head>${o.head ?? '<meta charset="utf-8"><title>Help</title>'}</head><body>${o.body ?? '<main><h1>Help</h1></main>'}</body></html>`;
const found = (html: string): string[] => auditDocument(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('text direction', () => {
  it.each(['ltr', 'rtl', 'auto', 'RTL', ' ltr '])('passes dir="%s"', (dir) => {
    expect(found(`<p dir="${dir}">x</p>`)).toEqual([]);
  });
  it.each(['left', 'right', 'lrt', 'true', ''])('fails dir="%s"', (dir) => {
    const e = auditDocument(`<p dir="${dir}">x</p>`).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['dir-invalid', 'fail', 'p@L1']]);
    expect(e[0]?.message.en).toContain('Use ltr, rtl or auto');
  });
  it('reads dir on the html element and on bdo', () => {
    expect(found(page({ htmlAttrs: ' lang="ar" dir="rtol"' }))).toEqual(['dir-invalid:fail']);
    expect(found('<bdo dir="backwards">x</bdo>')).toEqual(['dir-invalid:fail']);
  });
});

describe('two language declarations', () => {
  it('fails when lang and xml:lang name different languages, and shows both', () => {
    const e = auditDocument(page({ htmlAttrs: ' lang="en" xml:lang="fr"' })).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['xml-lang-mismatch', 'fail', 'html@L1']]);
    expect(e[0]?.message.en).toContain('lang “en” and xml:lang “fr”');
    expect(e[0]?.message.fr).toContain('lang «\u202Fen\u202F» et xml:lang «\u202Ffr\u202F»');
  });
  it('compares the language only, not the region or the case', () => {
    expect(found(page({ htmlAttrs: ' lang="fr-CA" xml:lang="fr"' }))).toEqual([]);
    expect(found(page({ htmlAttrs: ' lang="EN" xml:lang="en-ca"' }))).toEqual([]);
  });
  it('needs both attributes to compare', () => {
    expect(found(page({ htmlAttrs: ' xml:lang="fr"' }))).toEqual([]);
    expect(found(page({ htmlAttrs: ' lang="en" xml:lang=""' }))).toEqual([]);
  });
});

describe('base target', () => {
  it('asks when every link is sent to a new tab or a frame', () => {
    const e = auditDocument(page({ head: '<meta charset="utf-8"><base target="_blank"><title>t</title>' })).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['base-target:unknown']);
    expect(e[0]?.message.en).toContain('“_blank”');
    expect(found(page({ head: '<meta charset="utf-8"><base target="content"><title>t</title>' }))).toEqual(['base-target:unknown']);
  });
  it('does not ask for _self or a base with only an href', () => {
    expect(found(page({ head: '<meta charset="utf-8"><base target="_self"><base href="/app/"><title>t</title>' }))).toEqual([]);
  });
});

describe('character set', () => {
  it('asks when a document declares none', () => {
    const e = auditDocument(page({ head: '<title>t</title>' })).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['charset-missing', 'unknown', 'html@L1']]);
  });
  it('accepts either way of declaring it', () => {
    expect(found(page({ head: '<meta charset="utf-8">' }))).toEqual([]);
    expect(found(page({ head: '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">' }))).toEqual([]);
    expect(found(page({ head: '<meta http-equiv="Content-Type" content="text/html">' }))).toEqual(['charset-missing:unknown']);
  });
  it('does not ask about a fragment', () => {
    expect(found('<main><p>x</p></main>')).toEqual([]);
    expect(auditDocument('<main><p>x</p></main>').checked).toBe(0);
  });
});

describe('a page drawn by a script only', () => {
  const shell = (extra = ''): string => page({ body: `<div id="root"></div>${extra}<script type="module" src="/app.js"></script>` });
  it('asks when the markup holds no text and no fallback', () => {
    const e = auditDocument(shell()).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['script-only', 'unknown', 'body@L1']]);
  });
  it('does not ask when there is a noscript message, any text, or something to see', () => {
    expect(found(shell('<noscript>This app needs JavaScript.</noscript>'))).toEqual([]);
    expect(found(shell('<p>Loading</p>'))).toEqual([]);
    expect(found(shell('<img src="logo.png" alt="">'))).toEqual([]);
    expect(found(shell('<button aria-label="Menu"></button>'))).toEqual([]);
  });
  it('does not ask about an empty page with no script', () => {
    expect(found(page({ body: '<div id="root"></div>' }))).toEqual([]);
  });
});

describe('the result', () => {
  it('finds nothing on an ordinary page and counts what it read', () => {
    expect(auditDocument(page({ htmlAttrs: ' lang="fr-CA" dir="ltr"' }))).toEqual({ checked: 3, entries: [] });
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditDocument(SAMPLE_DOCUMENT_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...DOCUMENT_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'dir-invalid' || x.rule === 'xml-lang-mismatch' ? 'fail' : 'unknown');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<html', '<html><body>', '<p dir=', '<base target>']) expect(() => auditDocument(html)).not.toThrow();
  });
});
